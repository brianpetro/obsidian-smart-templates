import { SmartPluginSettingsTab } from 'obsidian-smart-env';

/**
 * @class SmartTemplatesSettingTab
 * @extends SmartPluginSettingsTab
 * @description
 * Obsidian Settings tab for "Smart Templates" plugin.
 * Renders settings using the plugin's `env.smart_view` instance
 * and the plugin's `settings_config` object, attaching the results
 * to the display container.
 */
export class SmartTemplatesSettingTab extends SmartPluginSettingsTab {
  /**
   * @param {import('obsidian').App} app - The current Obsidian app instance
   * @param {import('./main.js').default} plugin - The main plugin object
   */
  constructor(app, plugin) {
    super(app, plugin);
    /** @type {import('./main.js').default} */
    this.plugin = plugin;
  }

  async render_plugin_settings(container) {
    if (!container) return;
    container.empty?.();
    if (!this.env) {
      container.createEl('p', {
        text: 'Smart Templates environment not yet initialized.'
      });
      return;
    }

    this.env.smart_completions.re_render_settings = () => {
      container.empty?.();
      this.render_plugin_settings(container);
    };

    const templates_config = this.env.smart_templates?.settings_config;
    if (templates_config) {
      const templates_fragment = await this.env.smart_view.render_settings(templates_config, {
        scope: this.env.smart_templates,
      });
      if (templates_fragment) container.appendChild(templates_fragment);
    }

    const chat_model_config = this.plugin.chat_model?.settings_config;
    if (chat_model_config) {
      const chat_fragment = await this.env.smart_view.render_settings(chat_model_config, {
        scope: this.plugin.chat_model,
      });
      if (chat_fragment) container.appendChild(chat_fragment);
    }
  }
}
