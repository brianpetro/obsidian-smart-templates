/**
 * Build a single prompt string from instructions, template, and context.
 *
 * Empty sections are omitted.
 * `{{vault_tags}}` is expanded before assembly.
 *
 * @param {import('smart-contexts').SmartContext} ctx
 * @param {import('../items/smart_template.js').SmartTemplate} template_item
 * @param {string} [instructions='']
 * @returns {Promise<string>}
 */
export async function build_prompt_text(ctx, template_item, instructions = '') {
  const env = ctx?.env || template_item?.env || null;

  const context_text = await get_context_text(ctx);
  const template_text = await get_template_text(template_item);

  const resolved_instructions = replace_vault_tags_var(
    String(instructions ?? '').trim(),
    env,
  );

  const resolved_template = replace_vault_tags_var(
    String(template_text ?? '').trim(),
    env,
  );

  const sections = [];

  if (resolved_instructions) {
    sections.push([
      '<instructions>',
      resolved_instructions,
      '</instructions>',
    ].join('\n'));
  }

  if (resolved_template) {
    sections.push([
      '<template>',
      resolved_template,
      '</template>',
    ].join('\n'));
  }

  if (context_text) {
    sections.push([
      context_text,
    ].join('\n'));
  }

  // again at the end to increase focus on the template and instructions
  if (resolved_instructions) {
    sections.push([
      '<instructions>',
      resolved_instructions,
      '</instructions>',
    ].join('\n'));
  }

  if (resolved_template) {
    sections.push([
      '<template>',
      resolved_template,
      '</template>',
    ].join('\n'));
  }

  if (!sections.length) return '';

  const system_lines = [
    'Use the provided instructions, template, and context to produce the best possible response.',
    resolved_template
      ? '- Follow the template structure when a template is provided.'
      : '- Follow the provided instructions directly.',
    context_text
      ? '- Ground the result in the supplied context.'
      : '- If no context is provided, rely only on the supplied instructions and template.',
    '- Do not repeat the context in the output.',
    '- Do not mention the wrapper tags in the final answer.',
  ];

  return [
    system_lines.join('\n'),
    '',
    sections.join('\n\n'),
  ].join('\n').trim();
}

/**
 * @param {import('smart-contexts').SmartContext} ctx
 * @returns {Promise<string>}
 */
async function get_context_text(ctx) {
  if (!ctx || typeof ctx.get_text !== 'function') return '';
  const value = await ctx.get_text();
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

/**
 * @param {import('../items/smart_template.js').SmartTemplate} template_item
 * @returns {Promise<string>}
 */
async function get_template_text(template_item) {
  if (!template_item || typeof template_item.get_template !== 'function') return '';
  const value = await template_item.get_template();
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Expand `{{vault_tags}}` using the best available environment source.
 *
 * @param {string} value
 * @param {object | null} env
 * @returns {string}
 */
function replace_vault_tags_var(value, env) {
  if (!value || !value.includes('{{vault_tags}}')) return value;

  const vault_tags = get_vault_tags(env);
  return value.replace(/{{vault_tags}}/g, vault_tags);
}

/**
 * Resolve vault tags from app metadata cache when available, else aggregate from smart_sources.
 *
 * @param {object | null} env
 * @returns {string}
 */
function get_vault_tags(env) {
  const app_tags = env?.plugin?.app?.metadataCache?.getTags?.();
  if (app_tags && typeof app_tags === 'object') {
    const tags = Object.keys(app_tags)
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
    ;
    if (tags.length) return tags.join(', ');
  }

  const tags_set = new Set();
  const source_items = Object.values(env?.smart_sources?.items || {});
  source_items.forEach((source_item) => {
    const tags = source_item?.metadata?.tags;
    if (!Array.isArray(tags)) return;
    tags.forEach((tag) => {
      const normalized_tag = String(tag ?? '').trim();
      if (normalized_tag) tags_set.add(normalized_tag);
    });
  });

  return [...tags_set].sort((left, right) => left.localeCompare(right)).join(', ');
}
