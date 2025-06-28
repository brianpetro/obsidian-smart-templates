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
