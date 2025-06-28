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
  get settings_config() {
    return {
      template_name: {
        name: "Template Name",
        description: "Specifies the name of the template. You can use {{folder_name}}.",
        type: "text", // text input
        default: "",
      },
      template_heading: {
        name: "Template Heading",
        description: "If set, searches the current file for a heading with this name.",
        type: "text",
        default: "",
      },
      merge_parent_templates: {
        name: "Merge Parent Templates",
        description: "Whether to include (concatenate) parent-folder templates from each ancestor folder.",
        type: "toggle",
        default: false,
      },
      system_prompt_heading: {
        name: "System Prompt Heading",
        description: "If set, searches the template file for a heading with this name and uses it in \"Generate\" commands.",
        type: "text",
        default: "",
      }
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
