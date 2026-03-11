import { SmartPluginSettingsTab } from 'obsidian-smart-env';
import { render_settings_config } from 'obsidian-smart-env/src/utils/render_settings_config.js';

/**
 * @class SmartTemplatesSettingTab
 * @extends SmartPluginSettingsTab
 */
export class SmartTemplatesSettingTab extends SmartPluginSettingsTab {
  /**
   * @param {import('obsidian').App} app
   * @param {import('./main.js').default} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async render_plugin_settings(container) {
    if (!container) return;
    container.empty?.();
    if (!this.env) {
      container.createEl('p', {
        text: 'Smart Templates environment not yet initialized.',
      });
      return;
    }

    const templates_config = this.env.smart_templates?.settings_config;
    if (templates_config) {
      render_settings_config(
        templates_config,
        this.env.smart_templates,
        container,
        {
          default_group_name: 'Templates',
        },
      );
    }
  }
}
