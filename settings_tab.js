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
    // sets this.env
    this.plugin.env.create_env_getter(this);
  }

  /**
   * Called by Obsidian to render the settings page.
   */
  display() {
    this.containerEl.empty();
    this.render_settings();
  }
  async render_settings() {
    // Access the environment and config
    if (!this.env) {
      this.containerEl.createEl('p', {
        text: 'Smart Templates environment not yet initialized.'
      });
      return;
    }
    this.env.smart_completions.re_render_settings = () => {
      this.containerEl.empty();
      this.render_settings();
    }
  
    const smart_templates_settings_config = this.env.smart_templates?.settings_config;
    const smart_chat_model_settings_config = this.env.smart_completions?.chat_model?.settings_config;
  
    // Use env.smart_view to render. We can call its methods as needed:
    //  - render_settings_html(settings_config, options)
    //  - create_doc_fragment(html)
    //  - render_setting_components(container, { scope })
    console.log('render_settings', this.env);
    console.log('smart_view', this.env.smart_view);
  
    const settings_frag = await this.env.smart_view.render_settings(smart_templates_settings_config, {
      scope: this.env.smart_templates
    });
    const chat_model_frag = await this.env.smart_view.render_settings(smart_chat_model_settings_config, {
      scope: this.env.smart_completions?.chat_model
    });
  
    this.containerEl.appendChild(settings_frag);
    this.containerEl.appendChild(chat_model_frag);
  }
}
