/**
 * Format one request from already-read context, template text, and instructions.
 * Empty sections are omitted. `{{vault_tags}}` expands only in instructions
 * and template text, never in source evidence.
 *
 * @param {object} params
 * @param {string} [params.context_text='']
 * @param {string} [params.template_text='']
 * @param {string} [params.user_message='']
 * @param {string} [params.vault_tags='']
 * @returns {string}
 */
export function build_prompt_text({
  context_text = '',
  template_text = '',
  user_message = '',
  vault_tags = '',
} = {}) {
  const normalized_context = String(context_text ?? '').trim();
  const resolved_instructions = String(user_message ?? '').trim()
    .replace(/{{vault_tags}}/g, () => vault_tags);
  const resolved_template = String(template_text ?? '').trim()
    .replace(/{{vault_tags}}/g, () => vault_tags);

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

  if (normalized_context) {
    sections.push([
      normalized_context,
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
    '- Follow the template structure and any specific instructions provided.',
    '- Ground the result in the supplied context.',
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
 * Resolve vault tags from the host cache, falling back to indexed source metadata.
 * The action calls this only when a template or instructions requests expansion.
 *
 * @param {object} env
 * @returns {string}
 */
export function get_vault_tags(env) {
  const app = env?.plugin?.app || env?.main?.app;
  const app_tags = app?.metadataCache?.getTags?.();
  if (app_tags && Object.keys(app_tags).length) {
    return Object.keys(app_tags).map((tag) => tag.trim()).filter(Boolean)
      .sort((left, right) => left.localeCompare(right)).join(', ');
  }
  const tags = new Set();
  for (const source of Object.values(env?.smart_sources?.items || {})) {
    if (!Array.isArray(source?.metadata?.tags)) continue;
    for (const tag of source.metadata.tags) {
      const normalized_tag = String(tag ?? '').trim();
      if (normalized_tag) tags.add(normalized_tag);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right)).join(', ');
}
