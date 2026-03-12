import { merge_env_config } from 'obsidian-smart-env';
import context_items from 'smart-contexts/context_items.js';
import { smart_env_config as compiled_config } from '../smart_env.config.js';
import { InlineTextContextItemAdapter } from './adapters/context-items/inline_text.js';
import { TemplateContextModal } from './modals/template_context_modal.js';
import { CreateFromTemplateModal } from './modals/create_from_template_modal.js';
import { TemplateFolderModal } from './modals/template_folder_modal.js';
import { TemplateHeadingsModal } from './modals/template_headings_modal.js';

const default_config = {
  collections: {
    context_items: {
      ...context_items,
      context_item_adapters: {
        ...context_items.context_item_adapters,
        InlineTextContextItemAdapter,
      },
    },
  },
  modals: {
    template_context: {
      class: TemplateContextModal,
    },
    create_from_template: {
      class: CreateFromTemplateModal,
    },
    template_folder: {
      class: TemplateFolderModal,
    },
    template_headings: {
      class: TemplateHeadingsModal,
    },
  },
};

const smart_env_config = merge_env_config(compiled_config, default_config);

export { smart_env_config };
