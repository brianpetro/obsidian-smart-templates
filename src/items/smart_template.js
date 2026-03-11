import { CollectionItem } from 'smart-collections';
import { extract_heading_from_string } from '../utils/extract_heading_from_string.js';
import { remove_heading_block } from '../utils/remove_heading_block.js';
import { clean_frontmatter } from '../utils/clean_frontmatter.js';
import { parse_frontmatter } from 'smart-sources/utils/parse_frontmatter.js';

/**
 * @class SmartTemplate
 * @extends CollectionItem
 */
export class SmartTemplate extends CollectionItem {
  static get defaults() {
    return {
      data: {
        source_key: null,
      },
    };
  }

  get_key() {
    return this.data.key || this.data.source_key || super.get_key();
  }

  get source() {
    if (!this.data.source_key) return null;
    return this.data.source_key.includes('#')
      ? this.env.smart_blocks.get(this.data.source_key)
      : this.env.smart_sources.get(this.data.source_key)
    ;
  }

  async read() {
    if (this.data.content) return this.data.content;
    return await this.source?.read() || null;
  }

  async get_template() {
    if (!this.source && !this.data.content) {
      console.warn(`SmartTemplate: Source item not found for key: ${this.data.source_key}`);
      return null;
    }

    let content;
    try {
      content = await this.read();
    } catch (error) {
      console.warn(`SmartTemplate: Error reading template source item: ${this.data.source_key}`, error);
      return null;
    }

    if (!content) return null;

    const settings = this.env.smart_templates?.settings || {};

    if (settings.template_heading && content.includes(settings.template_heading)) {
      const contained_template = extract_heading_from_string(content, settings.template_heading);
      content = contained_template ?? '';
    }

    if (settings.system_prompt_heading) {
      content = remove_heading_block(content, settings.system_prompt_heading);
    }

    content = clean_frontmatter(content, ['smart template', 'prompt']);

    return content.trim();
  }

  get metadata() {
    if (this.source) return this.source.metadata;
    const { frontmatter } = parse_frontmatter(this.data.content);
    return frontmatter || {};
  }
}
