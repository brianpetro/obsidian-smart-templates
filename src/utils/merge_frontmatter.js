/**
 * @file merge_frontmatter.js
 * @description
 * Pure helper that merges two YAML front‑matter blocks.
 *   – Keys that appear only in `patch_fm` are appended.
 *   – Keys duplicated in both blocks:
 *        • If the key is `tags` both lists are combined (deduplicated).
 *        • Otherwise the value from `patch_fm` replaces the one in `base_fm`.
 *   – Comments and complex YAML are *not* supported; the parser handles only
 *     `key: value` scalars and `key:\n  - item` list syntax.
 *
 * No external dependencies.
 *
 * @param {string[]} base_fm_lines   – lines from the existing note’s FM (with ---)
 * @param {string[]} patch_fm_lines  – lines from the template output’s FM (with ---)
 * @returns {string[]}               – merged FM lines (with ---)
 */
export function merge_frontmatter(base_fm_lines = [], patch_fm_lines = []) {
  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  const strip_delims = (arr) =>
    arr.filter((l) => l.trim() !== '---');

  const parse_fm = (lines) => {
    const obj = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const key_match = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/u);
      if (!key_match) continue;

      const key = key_match[1];
      const val = key_match[2];

      // list form
      if (val === '') {
        const list = [];
        let j = i + 1;
        while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
          list.push(lines[j].replace(/^\s*-\s+/, '').trim());
          j++;
        }
        obj[key] = list;
        i = j - 1;
      }
      // scalar
      else {
        obj[key] = val.trim();
      }
    }
    return obj;
  };

  const stringify_fm = (o) => {
    const out = ['---'];
    Object.entries(o).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        if (v.length === 0) {
          out.push(`${k}: []`);
        } else {
          out.push(`${k}:`);
          v.forEach((item) => out.push(`  - ${item}`));
        }
      } else {
        out.push(`${k}: ${v}`);
      }
    });
    out.push('---');
    return out;
  };

  /* ------------------------------------------------------------------ */
  /*  Merge logic                                                        */
  /* ------------------------------------------------------------------ */

  const base_obj  = parse_fm(strip_delims(base_fm_lines));
  const patch_obj = parse_fm(strip_delims(patch_fm_lines));

  Object.keys(patch_obj).forEach((k) => {
    if (k === 'tags' && Array.isArray(base_obj.tags) && Array.isArray(patch_obj.tags)) {
      const merged = new Set([...base_obj.tags, ...patch_obj.tags]);
      base_obj.tags = [...merged];
    }
    else {
      base_obj[k] = patch_obj[k];
    }
  });

  return stringify_fm(base_obj);
}
