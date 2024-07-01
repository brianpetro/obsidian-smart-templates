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
import { SmartTemplates } from "smart-templates/smart_templates.mjs";
import { MarkdownAdapter } from "smart-templates/adapters/markdown.mjs";
import { SmartChatModel } from "smart-chat-model/smart_chat_model.js";
import templates from "./dist/views.json";
import ejs from "ejs";

class SmartEnv {
  constructor(main, opts) {
    this.main = main;
    this.plugin = this.main; // DEPRECATED
    Object.assign(this, opts);
  }
}
class SmartCommandsSmartEnv extends SmartEnv {
  async init() {
    this.load_smart_templates();
    await this.process_templates();
  }
  load_smart_templates() {
    this.settings.smart_templates.model_config = this.model_config; // used by SmartTemplates for model selection
    const smart_templates_opts = {
      request_adapter: requestUrl, // use obsidian's requestUrl for requests
      read_adapter: this.main.app.vault.adapter.read.bind(this.main.app.vault.adapter),
      file_type_adapters: [
        MarkdownAdapter,
      ]
    };
    this.smart_templates = new SmartTemplates(this, smart_templates_opts);
  }
  get_templates_from_folder() {
    const templates_folder_path = this.settings.smart_templates.templates_folder;
    const templates = this.main.app.vault.getFolderByPath(templates_folder_path).children;
    return templates.filter(template => template instanceof TFile);
  }
  async process_templates() {
    this.active_template_vars = [];
    const templates = this.get_templates_from_folder();
    for(const template of templates) {
      const template_vars = await this.smart_templates.get_variables(template.path);
      console.log(template_vars);
      template_vars.forEach(({name, prompt}) => {
        if(!this.settings.smart_templates) this.settings.smart_templates = {};
        if(!this.settings.smart_templates.var_prompts) this.settings.smart_templates.var_prompts = {};
        // if prompt is not in settings, add it
        if(!this.settings.smart_templates.var_prompts[name]) {
          this.settings.smart_templates.var_prompts[name] = {prompt: prompt};
          this.active_template_vars.push(name);
        }
      });
    }
    console.log(this.settings.smart_templates.var_prompts);
  }
  get model_config() { return this.settings[this.settings.chat_model_platform_key]; }
}

export default class SmartCommandsPlugin extends Plugin {
  async onload() { this.app.workspace.onLayoutReady(this.initialize.bind(this)); } // initialize when layout is ready

  static get defaults() {
    return {
      chat_model_platform_key: 'openai',
      openai: {},
      smart_templates: {
        templates_folder: "smart-templates",
        var_prompts: {
          'summary': {prompt: 'A summary paragraph.'},
          'notes': {prompt: 'Concise notes.'},
          'mermaid': {prompt: 'A mermaid chart. Ex. graph TD\nA --> B\nB --> C'}
        },
      }
    };
  }
  async initialize() {
    this.obsidian = Obsidian;
    console.log(this);
    await this.load_settings();
    this.env = new SmartCommandsSmartEnv(this, {
      templates: templates,
      settings: this.settings,
      ejs: ejs,
    });
    await this.env.init();
    this.addSettingTab(new SmartCommandsSettingsTab(this.app, this));
    this.add_commands();
  }
  async load_settings() {
    this.settings = {
      ...this.constructor.defaults,
      ...(await this.loadData()),
    };
    // add model config to smart templates settings
    this.settings.smart_templates.model_config = this.model_config;
    await this.ensure_templates_folder();
  }
  async save_settings(rerender=false) {
    await this.saveData(this.settings); // Obsidian API->saveData
    await this.load_settings(); // re-load settings into memory
  }
  // check if templates folder exists
  // if not, create it
  async ensure_templates_folder() {
    const templates_folder = this.app.vault.getFolderByPath(this.settings.smart_templates.templates_folder);
    if (!templates_folder) {
      await this.app.vault.createFolder(this.settings.smart_templates.templates_folder);
    }
    // check if default template exists
    const default_template = this.app.vault.getFileByPath(`${this.settings.smart_templates.templates_folder}/default.md`);
    if (!default_template) {
      await this.app.vault.create(
        `${this.settings.smart_templates.templates_folder}/default.md`,
        "# Default Smart Template\n### Summary\n{{ summary }}\n### Notes\n{{ notes }}\n### Chart\n<%- '```mermaid' %>\n{{ mermaid }}\n<%- '```' %>",
      );
    }
  }
  add_commands() {
    const templates = this.env.get_templates_from_folder();
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

class SmartCommandsSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.config = plugin.settings;
  }
  display() {
    this.smart_settings = new SmartCommandsSettings(this.plugin.env, this.containerEl, "settings");
    return this.smart_settings.render();
  }
}
import { SmartSettings } from "smart-settings";
// Smart Commands Specific Settings
class SmartCommandsSettings extends SmartSettings {
  async get_view_data(){
    // for each file in templates folder
    await this.env.process_templates();
    // get chat platforms
    const chat_platforms = SmartChatModel.platforms;
    console.log(chat_platforms);
    console.log(this.env.model_config);
    const smart_chat_model = new SmartChatModel(
      this.env,
      this.plugin.settings.chat_model_platform_key || 'openai',
      this.env.model_config,
    )
    const platform_chat_models = await smart_chat_model.get_models();
    console.log(platform_chat_models);
    return {
      chat_platforms,
      platform_chat_models,
      chat_platform: smart_chat_model.platform,
      settings: this.plugin.settings,
    };
  }
  get template (){ return this.env.templates[this.template_name]; }
  async changed_smart_chat_platform(render = true){
    this.env.load_smart_templates();
    if(render) this.render();
  }
}

// convert string to lowercase letters and hyphens only
function format_command_name(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/ig, '-');
}