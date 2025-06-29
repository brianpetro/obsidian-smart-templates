import { CollectionItem } from "smart-collections";
import { extract_heading_from_string } from "../utils/extract_heading_from_string.js";
import { remove_heading_block } from "../utils/remove_heading_block.js";
import { clean_frontmatter } from "../utils/clean_frontmatter.js";

/**
 * @class SmartTemplate
 * @extends CollectionItem
 * @description
 * Represents a single template. On `get_template()`, it performs any needed extraction:
 * - If there's a 'template_heading' set, only returns that heading's content.
 * - If there's a 'system_prompt_heading' set, removes that heading block.
 */
export class SmartTemplate extends CollectionItem {
  /**
   * @static
   * @returns {Object} Default data structure
   */
  static get defaults() {
    return {
      data: {
        source_key: null
      }
    };
  }

  /**
   * Derives the unique key used by the environment to identify this template.
   * By default, it's based on data.source_key or the item key.
   * @returns {string}
   */
  get_key() {
    return this.data.key || this.data.source_key || super.get_key();
  }

  get template_source(){
    return this.data.source_key.includes('#')
      ? this.env.smart_blocks.get(this.data.source_key)
      : this.env.smart_sources.get(this.data.source_key)
    ;
  }

  /**
   * Reads the underlying file content from `source_item` in smart_sources,
   * then applies extraction logic based on settings:
   *  - If `template_heading` is present, extract only that heading.
   *  - If `system_prompt_heading` is present, remove it entirely.
   * @returns {Promise<string|null>}
   */
  async get_template() {
    if (!this.template_source) {
      console.warn(`SmartTemplate: Source item not found for key: ${this.data.source_key}`);
      return null;
    }

    let content;
    try {
      content = await this.template_source.read();
    } catch (err) {
      console.warn(`SmartTemplate: Error reading template_source_item: ${this.data.source_key}`, err);
      return null;
    }
    if (!content) return null;
    console.log('content before extraction', content);

    const settings = this.env.smart_templates?.settings || {};
    
    // If we have a template_heading, keep only that portion
    if (settings.template_heading && content.includes(settings.template_heading)) {
      const contained_template = extract_heading_from_string(content, settings.template_heading);
      content = contained_template ?? '';
    }

    // If we have a system_prompt_heading, remove that portion
    if (settings.system_prompt_heading) {
      content = remove_heading_block(content, settings.system_prompt_heading);
    }

    // Refactored: clean frontmatter, removing 'smart template' key
    content = clean_frontmatter(content, ['smart template']);

    console.log('content after extraction', content);

    return content.trim();
  }

  get name() {
    return this.data.name || this.key.replace('.md', '');
  }
}