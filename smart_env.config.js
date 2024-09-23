import { SmartCollectionMultiFileDataAdapter } from "smart-collections/adapters.js";
import { SmartTemplateMarkdownAdapter } from "smart-templates/adapters/markdown.js";
import { SmartTemplateEjsAdapter } from "smart-templates/adapters/ejs.js";
import { SmartTemplates } from "smart-templates";
import { SmartTemplate } from "smart-templates";
import { SmartFs } from 'smart-file-system';
import { SmartFsObsidianAdapter } from 'smart-file-system/adapters/obsidian.js';
export const smart_env_config = {
  global_ref: window,
  env_path: '',
  collections: {
    smart_templates: {
      class: SmartTemplates,
      data_adapter: SmartCollectionMultiFileDataAdapter,
      template_adapters: {
        md: SmartTemplateMarkdownAdapter,
        ejs: SmartTemplateEjsAdapter,
      },
    },
  },
  item_types: {
    SmartTemplate,
  },
  modules: {
    smart_fs: {
      class: SmartFs,
      adapter: SmartFsObsidianAdapter,
    },
  },
};