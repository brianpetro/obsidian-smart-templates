import test from 'ava';
import { run_action_entry } from 'smart-environment/utils/action_entry.js';
import { SmartBlock as ObsidianSmartBlock } from 'obsidian-smart-env/src/items/smart_block.js';
import { create_heading_env } from '../../test_support/heading_inference.js';

const documents = { 'A.md': '# A\n## Why\nBody\n## Next\n', 'B.md': '# B\n## Why\nOther body\n## Next\n' };

test('P4-01/09/16: actual SmartBlocks proxy and shared runner preserve scope and return exact recurring structures', async (t) => {
  const { blocks, reads, templates, env } = create_heading_env(t, { documents });
  const block_data = JSON.stringify(Object.values(blocks.items).map((item) => item.data));
  const settings = JSON.stringify(env.settings);
  const result = await run_action_entry(blocks, 'smart_blocks_infer_heading_templates', { include_source_keys: true });
  t.is(result.templates[0].signature, '[[0,"why"],[0,"next"]]');
  t.is(result.templates[0].content, '## Why\n\n## Next\n');
  t.deepEqual(reads, ['A.md', 'B.md']);
  t.deepEqual(Object.keys(templates.items), []);
  t.is(JSON.stringify(Object.values(blocks.items).map((item) => item.data)), block_data);
  t.is(JSON.stringify(env.settings), settings);
  blocks.items = Object.fromEntries(Object.entries(blocks.items).reverse());
  t.deepEqual(await blocks.actions.smart_blocks_infer_heading_templates({ include_source_keys: true }), result);
});

test('P4 production-block representation: source-backed Obsidian SmartBlock data works without index changes', async (t) => {
  const { blocks, env } = create_heading_env(t, { documents, BlockClass: ObsidianSmartBlock });
  const before = JSON.stringify(Object.values(env.smart_sources.items).map((source) => source.data.blocks_data));
  const result = await blocks.actions.smart_blocks_infer_heading_templates();
  t.is(result.templates[0].support, 2);
  t.is(JSON.stringify(Object.values(env.smart_sources.items).map((source) => source.data.blocks_data)), before);
});

test('P4: exact/empty whitelist and invalid params are handled before unnecessary source reads', async (t) => {
  const { blocks, reads } = create_heading_env(t, { documents });
  await t.throwsAsync(() => blocks.actions.smart_blocks_infer_heading_templates({ min_support: -1 }));
  t.deepEqual(reads, []);
  t.is((await blocks.actions.smart_blocks_infer_heading_templates({ source_keys: [] })).inspected_source_count, 0);
  t.deepEqual(reads, []);
  const result = await blocks.actions.smart_blocks_infer_heading_templates({ source_keys: ['B.md', 'B.md'], min_support: 1 });
  t.deepEqual(reads, ['B.md']); t.is(result.inspected_source_count, 1);
});

test('P4-08: current-text/index mismatch is reported for the whole source, with no repair/import', async (t) => {
  const { blocks, content, env } = create_heading_env(t, { documents });
  content.set('A.md', '# A\n## Changed\nBody\n## Next\n');
  const before = JSON.stringify(env.smart_sources.items['A.md'].data.blocks);
  const result = await blocks.actions.smart_blocks_infer_heading_templates({ min_support: 1 });
  t.is(result.inspected_source_count, 2); t.is(result.eligible_source_count, 1);
  t.is(result.issues[0].source_key, 'A.md'); t.is(result.issues[0].code, 'source_index_mismatch');
  t.is(JSON.stringify(env.smart_sources.items['A.md'].data.blocks), before);
});

test('P4: existing source read failures/empty returns remain unchanged and become source issues', async (t) => {
  const { blocks, env } = create_heading_env(t, { documents });
  env.smart_sources.items['A.md'].use_source_adapter = async () => { throw new Error('offline fixture read error'); };
  env.smart_sources.items['B.md'].read = async () => { throw new Error('explicit read error'); };
  const result = await blocks.actions.smart_blocks_infer_heading_templates();
  t.is(result.eligible_source_count, 0);
  t.deepEqual(result.issues.map(({ code }) => code), ['source_content_unavailable', 'source_read_failed']);
  t.deepEqual(result.templates, []);
});

test('P4: source deletion while reading and unsupported sources do not contribute partial candidates', async (t) => {
  const { blocks, env } = create_heading_env(t, { documents });
  env.smart_sources.items['A.md'].read = async () => { delete env.smart_sources.items['A.md']; return documents['A.md']; };
  const result = await blocks.actions.smart_blocks_infer_heading_templates({ min_support: 1 });
  t.is(result.eligible_source_count, 1);
  t.is(result.issues[0].code, 'source_read_failed');
});

test('P4: deleted blocks are ignored, but a live orphan or malformed identity is reported', async (t) => {
  const { blocks } = create_heading_env(t, { documents });
  blocks.items.orphan = { key: 'orphan' };
  blocks.items.old = { key: 'old', deleted: true };
  const result = await blocks.actions.smart_blocks_infer_heading_templates();
  t.is(result.templates[0].support, 2);
  t.is(result.issues[0].code, 'block_source_missing');
});

test('P4-15: output limit does not sample the corpus; each of 250 sources is read once, sequentially', async (t) => {
  const documents = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [`Notes/${index}.md`, '## Why\nBody\n## Next\n']));
  const { blocks, env, reads } = create_heading_env(t, { documents });
  let active = 0; let peak = 0;
  for (const source of Object.values(env.smart_sources.items)) {
    const read = source.use_source_adapter;
    source.use_source_adapter = async (operation) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      const text = await read(operation);
      active -= 1;
      return text;
    };
  }
  const result = await blocks.actions.smart_blocks_infer_heading_templates({ max_templates: 1 });
  t.is(result.inspected_source_count, 250); t.is(result.eligible_source_count, 250);
  t.is(result.templates[0].support, 250);
  t.is(reads.length, 250); t.is(new Set(reads).size, 250); t.is(peak, 1);
});

test('TASK-14: unsupported represented file types are explicit exclusions, with unchanged eligibility and zero reads', async (t) => {
  const { create_heading_env } = await import('../../test_support/heading_inference.js');
  const { blocks, reads } = create_heading_env(t, { documents: {
    'A.md': '## Why\n## Next\n', 'B.md': '## Why\n## Next\n', 'Drawing.canvas': '## Why\n## Next\n',
  } });
  const result = await blocks.actions.smart_blocks_infer_heading_templates();
  t.is(result.inspected_source_count, 3); t.is(result.eligible_source_count, 2);
  t.is(result.templates.length, 1); t.is(result.templates[0].support, 2);
  t.deepEqual(reads, ['A.md', 'B.md']);
  t.true(result.issues.some((issue) => issue.source_key === 'Drawing.canvas' && issue.code === 'source_type_unsupported'));
});
