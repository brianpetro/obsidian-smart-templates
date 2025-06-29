/**
 * @file smart_templates.js
 * @description
 * A specialized collection for managing template items, each representing a single
 * template.
 *
 * Also merges the chat_model's settings_config if present, so that UI can handle them together.
 */

import { SmartTemplates as BaseSmartTemplates } from "smart-templates-obsidian/src/collections/smart_templates.js";
import { AjsonSingleFileCollectionDataAdapter } from "smart-collections/adapters/ajson_single_file.js";
import { SmartTemplate } from "smart-templates-obsidian/src/items/smart_template.js";

/**
 * @class SmartTemplates
 * @extends BaseSmartTemplates
 */
export class SmartTemplates extends BaseSmartTemplates {

  get settings_config() {
    return {
      template_folder: {
        name: "Templates folder",
        description: "The folder where templates are stored. If empty, uses the current folder.",
        type: "folder", // folder selection
      },
      template_name: {
        name: "Naming convention",
        description: "Specifies the name of the template. You can use {{folder_name}}.",
        type: "text", // text input
        default: "",
      },
      template_heading: {
        name: "Heading convention",
        description: "If set, searches the current file for a heading with this name.",
        type: "text",
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
