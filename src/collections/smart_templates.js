/**
 * @file smart_templates.js
 * @description
 * A specialized collection for managing template items, each representing a single
 * template.
 *
 * Also merges the chat_model's settings_config if present, so that UI can handle them together.
 */

import { Collection } from "smart-collections";
import { AjsonSingleFileCollectionDataAdapter } from "smart-collections/adapters/ajson_single_file.js";
import { SmartTemplate } from "../items/smart_template.js";

/**
 * Parse a comma-separated headings string from settings into a unique array.
 * @param {Object} settings
 * @returns {string[]}
 */
export function parse_template_headings(settings = {}) {
  if (!settings || typeof settings.template_headings !== 'string') return [];
  const headings = settings.template_headings
    .split(',')
    .map(h => h.trim())
    .filter(Boolean);
  return Array.from(new Set(headings));
}

/**
 * Stringify a list of headings into comma-separated format for settings.
 * @param {string[]} headings
 * @returns {string}
 */
export function stringify_template_headings(headings = []) {
  if (!Array.isArray(headings)) return '';
  return headings
    .map(h => (typeof h === 'string' ? h.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

/**
 * Collect unique heading candidates from smart block keys.
 * @param {Array<{key?: string}>} blocks
 * @returns {string[]}
 */
export function collect_block_heading_candidates(blocks = []) {
  if (!Array.isArray(blocks)) return [];
  const headings = new Set();
  blocks.forEach(block => {
    const key = block?.key || block?.data?.key;
    if (!key) return;
    const hash_index = key.lastIndexOf('#');
    if (hash_index === -1 || hash_index === key.length - 1) return;
    const heading = key.slice(hash_index + 1);
    if (heading) headings.add(heading);
  });
  return Array.from(headings).sort();
}

/**
 * Filter blocks that end with any of the provided headings (#Heading form).
 * @param {Array<{key?: string}>} blocks
 * @param {string[]} headings
 * @returns {Array<{key?: string}>}
 */
export function filter_blocks_by_headings(blocks = [], headings = []) {
  if (!Array.isArray(blocks) || !Array.isArray(headings) || !headings.length) return [];
  const trimmed_headings = headings.map(h => h.trim()).filter(Boolean);
  if (!trimmed_headings.length) return [];
  return blocks.filter(block => {
    const key = block?.key || block?.data?.key;
    if (!key) return false;
    return trimmed_headings.some(heading => key.endsWith(`#${heading}`));
  });
}

/**
 * @class SmartTemplates
 * @extends Collection
 */
export class SmartTemplates extends Collection {
  static version = 1;
  init() {
    const try_load_templates = () => {
      if (this.env.collections?.smart_sources === 'loaded') {
        clearInterval(this._load_templates_interval);
        this.load_templates();
      }
    };
    this._load_templates_interval = setInterval(try_load_templates, 300);
    try_load_templates();
  }
  load_templates() {
    const settings = this.env.settings.smart_templates;
    const folder = settings?.template_folder
      || this.env.plugin.app.internalPlugins.plugins?.templates?.instance?.options?.folder;
    let name;
    if (settings?.template_name) {
      name = settings.template_name;
      if (!name.endsWith('.md')) {
        name += '.md';
      }
    }
    const template_headings = parse_template_headings(settings);

    const matches_template_source = source_item => {
      if (!source_item) return false;
      const source_key = source_item.key;
      if (!source_key) return false;
      if (folder && source_key.startsWith(folder)) return true;
      if (name && source_key.endsWith(name)) return true;
      if (source_item.metadata?.['smart template']) return true;
      if (template_headings.length && template_headings.some(heading => source_key.endsWith(`#${heading}`))) {
        return true;
      }
    };
    // import smart_templates
    const template_sources = this.env.smart_sources?.filter?.(matches_template_source) || [];
    const template_blocks = filter_blocks_by_headings(
      Object.values(this.env.smart_blocks?.items || {}),
      template_headings,
    );
    const processed_keys = new Set();
    [...template_sources, ...template_blocks].forEach(source => {
      if (!source?.key || processed_keys.has(source.key)) return;
      processed_keys.add(source.key);
      this.create_or_update({ source_key: source.key });
    });

    // clean-up old (no-longer matching filter) templates
    Object.values(this.items).forEach(template => {
      if (template.source && !matches_template_source(template.source)) {
        delete this.items[template.key];
      }
    });
  }

  get settings_config() {
    return {
      template_folder: {
        name: "Templates folder",
        description: "The folder where templates are stored.",
        type: "folder", // folder selection
        callback: "load_templates", // reload templates when changed
      },
      template_name: {
        name: "Naming convention",
        description: "Specifies the name of the template.",
        type: "text", // text input
        default: "",
        callback: "load_templates", // reload templates when changed
      },
      template_headings: {
        name: "Template headings",
        description: this.build_template_headings_description(),
        type: "button",
        callback: () => {
          console.log("callback called")
          this.open_template_headings_modal()
        },
      },
    };
  }

  build_template_headings_description(template_headings = this.settings?.template_headings) {
    if (!template_headings) {
      return "Select headings to import matching blocks as templates.";
    }
    return `Headings: ${template_headings}`;
  }

  async open_template_headings_modal(_, setting) {
    const on_change = (csv) => {
      if (setting) {
        setting.setDesc(this.build_template_headings_description(csv));
      }
      this.load_templates();
    };
    const { TemplateHeadingsModal } = await import('../modals/template_headings_modal.js');
    const modal = new TemplateHeadingsModal(this.env.plugin.app, {
      scope: this,
      on_change,
    });
    modal.open();
  }
}

/* default export consumed by SmartEnv */
export default {
  class          : SmartTemplates,
  collection_key : "smart_templates",
  data_adapter   : AjsonSingleFileCollectionDataAdapter,
  item_type      : SmartTemplate,
};