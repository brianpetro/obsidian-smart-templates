/**
 * @module concat_templates
 * @description
 * Provides a helper to merge multiple template contents into one string.
 * If you need to combine multiple partial templates, call `concat_templates(contents)`
 * to produce a single aggregated result.
 */

/**
 * @function concat_templates
 * @param {string[]} contents - An array of template strings to merge.
 * @returns {string} The merged content, separated by double newlines.
 */
export async function concat_templates(contents) {
  for(let i=0; i<contents.length; i++) {
    const content = contents[i];
    if(typeof content !== 'string' && typeof content.get_template === 'function') {
      contents[i] = await content.get_template();
    }
  }
  return contents.join('\n\n');
}
