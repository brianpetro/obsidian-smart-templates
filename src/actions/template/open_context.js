/**
 * Open the shared Smart Templates context modal.
 *
 * @this {object} Smart Environment scope
 * @param {object} [params={}]
 * @param {object} [params.plugin]
 * @returns {object|boolean}
 */
export function template_open_context(params = {}) {
  const plugin = params.plugin || this?.smart_templates_plugin;
  if (typeof plugin?.open_template_context_modal !== 'function') return false;

  return plugin.open_template_context_modal();
}

export const display_name = 'Open template context';

export const commands = {
  'open-template-context': {
    name: 'Open template context',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-templates';
    },

    params({ plugin }) {
      return { plugin };
    },

    get_scope({ env }) {
      return env;
    },

    when({ scope }) {
      return Boolean(scope.smart_templates && scope.smart_contexts);
    },
  },
};

export const ribbon_icons = {
  open_template_context: {
    icon_name: 'file-plus',
    description: 'Smart Templates: Open template context',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-templates';
    },

    params({ plugin }) {
      return { plugin };
    },

    get_scope({ env }) {
      return env;
    },
  },
};
