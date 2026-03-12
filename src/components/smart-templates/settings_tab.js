import { render_settings_config } from "obsidian-smart-env/src/utils/render_settings_config.js";
/**
 * Render Smart Templates plugin settings via Smart Components.
 *
 * Scope: SmartTemplatesSettingTab instance.
 */

/**
 * @param {import('../views/settings_tab.js').SmartTemplatesSettingTab} settings_tab
 * @param {object} [params={}]
 * @returns {string}
 */
export function build_html(settings_tab, params = {}) {
  return `<div class="smart-templates-settings-tab">
    <div class="smart-templates"></div>
  </div>`;
}

/**
 * @param {import('../views/settings_tab.js').SmartTemplatesSettingTab} settings_tab
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function render(settings_tab, params = {}) {
  const html = build_html(settings_tab, params);
  const frag = this.create_doc_fragment(html);
  const container = frag.firstElementChild;
  await post_process.call(this, settings_tab, container, params);
  return container;
}

/**
 * @param {import('../views/settings_tab.js').SmartTemplatesSettingTab} settings_tab
 * @param {HTMLElement} container
 * @param {object} [params={}]
 * @returns {Promise<HTMLElement>}
 */
export async function post_process(settings_tab, container, params = {}) {
  const env = settings_tab?.env;
  const templates_container = container.querySelector('.smart-templates');

  if (env?.smart_templates?.settings_config) {
    render_settings_config(
      env.smart_templates.settings_config,
      env.smart_templates,
      templates_container,
      {
        default_group_name: 'Smart Templates',
        heading_btn: [
          {
            label: 'Settings documentation for Smart Templates',
            btn_icon: 'help-circle',
            callback: () => window.open('https://smartconnections.app/smart-templates/settings/?utm_source=templates-settings-tab', '_external'),
          }
        ],
      },
    );
  }

  return container;
}

export const version = 1;
