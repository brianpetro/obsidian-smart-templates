import { PluginSettingTab } from 'obsidian';

/**
 * @class SmartTemplatesSettingTab
 * @extends PluginSettingTab
 * @description
 * Obsidian Settings tab for "Smart Templates" plugin.
 * Renders settings using the plugin's `env.smart_view` instance
 * and the plugin's `settings_config` object, attaching the results
 * to the display container.
 */
export class SmartTemplatesSettingTab extends PluginSettingTab {
  /**
   * @param {import('obsidian').App} app - The current Obsidian app instance
   * @param {import('./main.js').default} plugin - The main plugin object
   */
  constructor(app, plugin) {
    super(app, plugin);
    /** @type {import('./main.js').default} */
    this.plugin = plugin;
  }

  /**
   * Called by Obsidian to render the settings page.
   */
  display() {
    const { containerEl } = this;
    containerEl.empty();

    // Access the environment and config
    const env = this.plugin.smart_env;
    if (!env) {
      containerEl.createEl('p', {
        text: 'Smart Templates environment not yet initialized.'
      });
      return;
    }

    const settings_config = env.smart_templates?.settings_config;
    if (!settings_config) {
      containerEl.createEl('p', {
        text: 'No settings_config found in env.smart_templates.'
      });
      return;
    }

    // Use env.smart_view to render. We can call its methods as needed:
    //  - render_settings_html(settings_config, options)
    //  - create_doc_fragment(html)
    //  - render_setting_components(container, { scope })

    const settings_html = env.smart_view.render_settings_html(settings_config);
    const settings_fragment = env.smart_view.create_doc_fragment(settings_html);

    containerEl.appendChild(settings_fragment);

    // Attach interactive behaviors like toggles, text fields, etc.
    env.smart_view.render_setting_components(containerEl, {
      scope: env.smart_templates
    });
  }
}
