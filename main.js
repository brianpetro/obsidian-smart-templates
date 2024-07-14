import Obsidian from "obsidian";
const {
  addIcon,
  Keymap,
  MarkdownRenderer,
  Notice,
  Plugin,
  PluginSettingTab,
  request,
  requestUrl,
  Setting,
  TAbstractFile,
  TFile,
} = Obsidian;
import { SmartTemplates } from "smart-templates";
import { MarkdownAdapter } from "smart-templates/adapters/markdown.js";
import { SmartChatModel } from "smart-chat-model";
import views from "./dist/views.json";
import ejs from "ejs";
import { SmartEnv } from "smart-environment/smart_env.js";

export default class SmartTemplatesPlugin extends Plugin {
  async onload() { this.app.workspace.onLayoutReady(this.initialize.bind(this)); } // initialize when layout is ready

  static get defaults() {
    return {
      openai: {},
      chat_model_platform_key: 'openai',
      templates_folder: "smart-templates",
      var_prompts: {
        'summary': {prompt: 'A brief summary paragraph.'},
        'notes': {prompt: 'Concise notes in list format.'},
        'mermaid': {prompt: 'A mermaid chart representing the content. Ex. graph TD\nA --> B\nB --> C'}
      },
    };
  }
  async initialize() {
    this.obsidian = Obsidian;
    console.log(this);
    await this.load_settings();
    SmartEnv.create(this, {
      ejs,
      views,
      global_ref: window,
    });
    await this.load_smart_templates();
    this.addSettingTab(new SmartTemplatesSettingsTab(this.app, this));
    this.add_commands();
  }
  async load_smart_templates() {
    await SmartTemplates.load(this.env, {
      request_adapter: requestUrl, // use obsidian's requestUrl for requests
      read_adapter: this.app.vault.adapter.read.bind(this.app.vault.adapter),
      file_type_adapters: [
        MarkdownAdapter,
      ],
    });
    await this.get_var_prompts_settings();
  }

  async load_settings() {
    this.settings = {
      ...this.constructor.defaults,
      ...(await this.loadData()),
    };
    // load var prompts from templates folder (prevents prompts from being lost when uninstalling plugin)
    this.settings = {
      ...this.settings,
      ...(await this.load_var_prompts()),
    };
    await this.ensure_templates_folder();
  }
  async load_var_prompts() {
    const var_prompts_path = `${this.settings.templates_folder}/var_prompts.json`;
    try {
      if (await this.app.vault.adapter.exists(var_prompts_path)) {
        const var_prompts_file = await this.app.vault.adapter.read(var_prompts_path);
        if (var_prompts_file) {
          return JSON.parse(var_prompts_file);
        }
      }
    } catch (error) {
      console.error(`Error loading var_prompts from ${var_prompts_path}:`, error);
    }
    return {};
  }
  async save_settings(rerender=false) {
    await this.saveData(this.settings); // Obsidian API->saveData
    await this.load_settings(); // re-load settings into memory
  }
  get_templates_from_folder() {
    const templates_folder_path = this.settings.templates_folder;
    const templates = this.app.vault
      .getFolderByPath(templates_folder_path)
      .children
      .filter(template => template instanceof TFile)
    ;
    templates.forEach(template => {
      this.env.smart_templates.add_template(template.path);
    });
    return templates;
  }
  async get_var_prompts_settings() {
    this.active_template_vars = [];
    const templates = this.get_templates_from_folder();
    for(const template of templates) {
      const template_vars = await this.env.smart_templates.get_variables(template.path);
      console.log(template_vars);
      template_vars
        .filter(({inline}) => !inline)
        .forEach(({name, prompt}) => {
          if(!this.settings.var_prompts) this.settings.var_prompts = {};
          // if prompt is not in settings, add it
          if(!this.settings.var_prompts[name]) {
            this.settings.var_prompts[name] = {prompt: prompt};
          }
          this.active_template_vars.push(name);
        })
      ;
    }
    console.log(this.settings.var_prompts);
  }
  // check if templates folder exists
  // if not, create it
  async ensure_templates_folder() {
    const templates_folder = this.app.vault.getFolderByPath(this.settings.templates_folder);
    if (!templates_folder) {
      await this.app.vault.createFolder(this.settings.templates_folder);
    }
    // check if default template exists
    const default_template = this.app.vault.getFileByPath(`${this.settings.templates_folder}/default.md`);
    if (!default_template) {
      await this.app.vault.create(
        `${this.settings.templates_folder}/default.md`,
        "\n\n# Default Smart Template\n### Summary\n{{ summary }}\n### Notes\n{{ notes }}\n### Chart\n<%- '```mermaid' %>\n{{ mermaid }}\n<%- '```' %>\n\n",
      );
    }
  }
  add_commands() {
    this.add_template_commands();
    // update templates commands
    this.addCommand({
      id: 'smart-templates-update-commands',
      name: 'Refresh Commands (adds/removes templates from commands)',
      icon: 'pencil_icon',
      editorCallback: this.add_template_commands.bind(this),
    });
  }
  add_template_commands() {
    const templates = this.get_templates_from_folder();
    for (const template of templates) {
      // exclude json files
      if(template.name.endsWith('.json')) continue;
      this.addCommand({
        id: `smart-template-${format_command_name(template.name)}`,
        name: `Generate: ${template.name.split('.md')?.[0] || template.name}`,
        icon: "pencil_icon",
        hotkeys: [],
        editorCallback: this.run_smart_template.bind(this, template.path),
      });
    }
  }

  async run_smart_template(template, editor, ctx) {
    console.log(template);
    console.log(editor);
    console.log(ctx);
    // get path of active file
    const file = this.app.workspace.getActiveFile();
    const file_path = file.path;
    let context = file_path + "\n";
    if(editor.somethingSelected()) context = editor.getSelection();
    else context = editor.getValue();
    if (!context) return new Notice("[Smart Commands] No file or selection found");
    // const template = "# Summary\n<%- summary %>\n# Notes\n<%- notes %>\n# Mermaid\n```mermaid\n<%- mermaid %>\n```";
    const resp = await this.env.smart_templates.render(template, context);
    console.log(resp);
    // get last line of editor
    const lines = editor.getValue().split("\n");
    const last_line = lines[lines.length - 1];
    console.log(last_line);
    editor.setValue(editor.getValue() + "\n" + resp);
    // const curr_pos = editor.getCursor();
    const output_pos = { line: last_line, ch: 0 };
    editor.setCursor(output_pos);
    editor.scrollIntoView({ to: output_pos, from: output_pos }, true);
  }

}

class SmartTemplatesSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.config = plugin.settings;
  }
  display() {
    this.smart_settings = new SmartTemplatesSettings(this.plugin.env, this.containerEl, "smart_templates_settings");
    return this.smart_settings.render();
  }
}
import { SmartSettings } from "smart-setting";
// Smart Templates Specific Settings
class SmartTemplatesSettings extends SmartSettings {
  get settings() { return this.env.smart_templates_plugin.settings; }
  set settings(settings) {
    this.env.smart_templates_plugin.settings = settings;
  }
  get model_config() { return this.settings[this.settings.chat_model_platform_key]; }
  async get_view_data(){
    // for each file in templates folder
    await this.env.smart_templates_plugin.get_var_prompts_settings();
    console.log(this.settings);
    // get chat platforms
    if(!this._model_settings) this.load_chat_model_settings();
    const var_prompts = Object.entries(this.settings.var_prompts)
      // map
      .map(([name, prompt]) => ({name, prompt, active: this.env.smart_templates_plugin.active_template_vars.includes(name)}))
      // sort alphabetically by name
      .sort((a, b) => a.name.localeCompare(b.name))
      // sort by whether prompt is in active template vars
      .sort((a, b) => b.active - a.active)
    ;
    return {
      // chat_platforms,
      // platform_chat_models,
      // chat_platform: smart_chat_model.platform,
      model_settings: this._model_settings || null,
      settings: this.settings,
      var_prompts,
    };
  }
  async can_import_from_smart_connections() {
    if(!(await this.main.app.vault.adapter.exists('.obsidian/plugins/smart-connections/data.json'))) return false;
    const config_file = await this.main.app.vault.adapter.read('.obsidian/plugins/smart-connections/data.json');
    if(!config_file) return false;
    const config = JSON.parse(config_file);
    // if has any api_key for SmartChatModel.platforms in smart-connections, but not in settings, return true
    if(config[this.settings.chat_model_platform_key]?.api_key.length && !this.settings[this.settings.chat_model_platform_key]?.api_key?.length) return true;
    console.log(config[this.settings.chat_model_platform_key]?.api_key);
    console.log(this.settings[this.settings.chat_model_platform_key]?.api_key);
    return false;
  }
  async load_chat_model_settings() {
    const chat_platforms = SmartChatModel.platforms;
    console.log(chat_platforms);
    console.log(this.model_config);
    const smart_chat_model = new SmartChatModel(
      this.env,
      this.settings.chat_model_platform_key || 'openai',
      this.model_config
    );
    console.log(smart_chat_model);
    const platform_chat_models = await smart_chat_model.get_models();
    console.log(platform_chat_models);
    this._model_settings = await this.env.ejs.render(
      this.env.views['smart_templates_model_settings'],
      {
        settings: this.settings,
        chat_platforms,
        platform_chat_models,
        chat_platform: smart_chat_model.platform,
        can_import_from_smart_connections: await this.can_import_from_smart_connections(),
      }
    );
    this.render();
  }

  get template (){ return this.env.views[this.template_name]; }
  async changed_smart_chat_platform(render = true){
    this._model_settings = null;
    this.env.smart_templates_plugin.load_smart_templates();
    if(render) this.render();
  }
  // import model config from smart-connections
  async import_model_config_from_smart_connections(){
    const config_file = await this.main.app.vault.adapter.read('.obsidian/plugins/smart-connections/data.json');
    if(!config_file) return new Notice("[Smart Templates] No model config found in smart-connections");
    const config = JSON.parse(config_file);
    console.log(config);
    console.log(SmartChatModel.platforms);
    const settings = this.settings;
    if(config[this.settings.chat_model_platform_key]) settings[this.settings.chat_model_platform_key] = {...config[this.settings.chat_model_platform_key]};
    console.log(settings);
    this.settings = settings;
    await this.env.smart_templates_plugin.save_settings();
    this._model_settings = null;
    this.render();
  }
  async update(setting, value) {
    await super.update(setting, value);
    // save var_prompts to smart templates folder in var_prompts.json
    await this.main.app.vault.adapter.write(
      `${this.settings.templates_folder}/var_prompts.json`,
      JSON.stringify({var_prompts: this.settings.var_prompts}, null, 2),
    );
  }
  async remove_var_prompt(setting, value, elm) {
    console.log(setting, value, elm);
    const var_prompt_name = elm.dataset.value;
    delete this.settings.var_prompts[var_prompt_name];
    await this.update('var_prompts', this.settings.var_prompts);
    this.render();
  }
}

// convert string to lowercase letters and hyphens only
function format_command_name(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/ig, '-');
}