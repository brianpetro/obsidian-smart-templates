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
import { MarkdownAdapter } from "smart-templates/adapters/markdown.mjs";
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
        'summary': {prompt: 'A summary paragraph.'},
        'notes': {prompt: 'Concise notes.'},
        'mermaid': {prompt: 'A mermaid chart. Ex. graph TD\nA --> B\nB --> C'}
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
    await this.ensure_templates_folder();
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
      template_vars.forEach(({name, prompt}) => {
        if(!this.settings.var_prompts) this.settings.var_prompts = {};
        // if prompt is not in settings, add it
        if(!this.settings.var_prompts[name]) {
          this.settings.var_prompts[name] = {prompt: prompt};
          this.active_template_vars.push(name);
        }
      });
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
        "# Default Smart Template\n### Summary\n{{ summary }}\n### Notes\n{{ notes }}\n### Chart\n<%- '```mermaid' %>\n{{ mermaid }}\n<%- '```' %>",
      );
    }
  }
  add_commands() {
    const templates = this.get_templates_from_folder();
    for(const template of templates) {
      this.addCommand({
        id: `smart-template-${format_command_name(template.name)}`,
        name: `Smart Template: ${template.name}`,
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
    this.smart_settings = new SmartTemplatesSettings(this.plugin.env, this.containerEl, "settings");
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
    const chat_platforms = SmartChatModel.platforms;
    console.log(chat_platforms);
    console.log(this.model_config);
    const smart_chat_model = new SmartChatModel(
      this.env,
      this.settings.chat_model_platform_key || 'openai',
      this.model_config,
    );
    console.log(smart_chat_model);
    const platform_chat_models = await smart_chat_model.get_models();
    console.log(platform_chat_models);
    return {
      chat_platforms,
      platform_chat_models,
      chat_platform: smart_chat_model.platform,
      settings: this.settings,
    };
  }
  get template (){ return this.env.views[this.template_name]; }
  async changed_smart_chat_platform(render = true){
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
    SmartChatModel.platforms.forEach(platform => {
      if(config[platform.key]) settings[platform.key] = config[platform.key];
    });
    if(config.chat_model_platform_key) settings.chat_model_platform_key = config.chat_model_platform_key;
    console.log(settings);
    this.settings = settings;
    await this.env.smart_templates_plugin.save_settings();
    this.render();
  }
}

// convert string to lowercase letters and hyphens only
function format_command_name(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/ig, '-');
}