import { SmartPluginSettingsTab } from 'obsidian-smart-env';

/**
 * Thin host that delegates rendering to the Smart Component layer.
 */
export class SmartTemplatesSettingTab extends SmartPluginSettingsTab {
  async render_header(container) {
    if (!container) return;
    container.empty?.();
    container.createEl('p', {
      text: 'Choose where your templates come from.',
    });
  }

  async render_plugin_settings(container) {
    if (!container) return;
    container.empty?.();

    const settings_el = await this.env.smart_components.render_component(
      'smart_templates_settings_tab',
      this,
    );
    container.appendChild(settings_el);
  }
}

export default SmartTemplatesSettingTab;
