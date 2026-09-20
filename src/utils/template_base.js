/** Pure configuration/path mechanisms. Base evaluation belongs to view.read(). */
export function has_template_base_config(settings = {}) {
  return Boolean(String(settings.template_base || '').trim()
    || String(settings.template_base_scopes || '').trim());
}

/** Exact vault-relative path; do not repair traversal or resolve basenames. */
export function is_vault_path(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
    && !/[\\:#|\r\n]/.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..');
}

export function parse_template_base_config(settings = {}) {
  const base_key = String(settings.template_base || '').trim();
  const view_name = String(settings.template_base_view || '').trim();
  const require_base = (key) => {
    if (!is_vault_path(key) || !key.endsWith('.base')) {
      throw new Error(`Use an exact vault-relative .base path: ${key}`);
    }
  };
  if (base_key) require_base(base_key);
  const scopes = [];
  const seen = new Set();
  for (const [index, line] of String(settings.template_base_scopes || '').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const parts = line.split('|').map((part) => part.trim());
    const [folder, scoped_base, scoped_view = ''] = parts;
    if (parts.length < 2 || parts.length > 3 || !is_vault_path(folder) || seen.has(folder)) {
      throw new Error(`Invalid or duplicate template Base scope on line ${index + 1}.`);
    }
    require_base(scoped_base);
    seen.add(folder);
    scopes.push({ folder, base_key: scoped_base, view_name: scoped_view });
  }
  scopes.sort((left, right) => right.folder.length - left.folder.length);
  return { base_key, view_name, scopes };
}

export function resolve_template_base(config, scope_source_key) {
  const scoped = typeof scope_source_key === 'string'
    ? config.scopes.find(({ folder }) => scope_source_key.startsWith(`${folder}/`))
    : null;
  return scoped || (config.base_key ? { base_key: config.base_key, view_name: config.view_name } : null);
}

/** Accept only path-bearing columns, never file.name or a display-link fallback. */
export function extract_template_base_paths(rows) {
  if (!Array.isArray(rows)) throw new Error('Template Base read must return a structured row array.');
  const keys = new Set();
  let unusable_rows = 0;
  for (const row of rows) {
    const path = row && !Array.isArray(row) && typeof row === 'object'
      ? row['file.path'] ?? row['note.file.path'] ?? row.file?.path ?? row.note?.file?.path ?? row.path ?? row['file path']
      : null;
    if (!is_vault_path(path) || !/\.(md|txt)$/i.test(path)) {
      unusable_rows += 1;
      continue;
    }
    keys.add(path);
  }
  return { keys: [...keys], unusable_rows };
}

export function get_template_event_paths(event = {}) {
  return [...new Set([event.item_key, event.path, event.new_path, event.old_path, event.from]
    .filter((path) => typeof path === 'string' && path.length))];
}

/** Quoted formula string inside a quoted YAML scalar; no contextual expressions. */
export function build_template_base_content(folder) {
  if (!is_vault_path(folder)) throw new Error('Select a valid native Templates folder first.');
  return [
    'filters:',
    '  and:',
    `    - ${JSON.stringify('file.ext == "md"')}`,
    `    - ${JSON.stringify(`file.inFolder(${JSON.stringify(folder)})`)}`,
    'views:',
    '  - type: table',
    '    name: Templates',
    '    order:',
    '      - file.path',
    '      - file.name',
    '',
  ].join('\n');
}
