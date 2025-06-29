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
 * @class SmartTemplates
 * @extends Collection
 */
export class SmartTemplates extends Collection {
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
      || this.app.internalPlugins.plugins?.templates?.instance?.options?.folder;
    let name;
    if (settings?.template_name) {
      name = settings.template_name;
      if (!name.endsWith('.md')) {
        name += '.md';
      }
    }

    const template_filter_fn = i => {
      if (folder && i.key.startsWith(folder)) return true;
      if (name && i.key.endsWith(name)) return true;
      if (i.metadata?.['smart template']) return true;
    };
    // import smart_templates
    const template_sources = this.env.smart_sources.filter(template_filter_fn);
    template_sources.forEach(source => {
      this.create_or_update({ source_key: source.key });
    });

    // clean-up old (no-longer matching filter) templates
    // note: useful when starting to persist templates
    Object.values(this.items).forEach(template => {
      if (!template_filter_fn(template.template_source)) {
        this.remove(template);
      }
    });
  }

  get settings_config() {
    return {
      template_folder: {
        name: "Templates folder",
        description: "The folder where templates are stored.",
        type: "folder", // folder selection
      },
      template_name: {
        name: "Naming convention",
        description: "Specifies the name of the template.",
        type: "text", // text input
        default: "",
      },
    };
  }
}

/* default export consumed by SmartEnv */
export default {
  class          : SmartTemplates,
  collection_key : "smart_templates",
  data_adapter   : AjsonSingleFileCollectionDataAdapter,
  item_type      : SmartTemplate,
};