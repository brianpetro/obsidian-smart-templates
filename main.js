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
import { SmartTemplate } from "smart-templates/smart_template.js";
import { MarkdownSmartTemplateAdapter } from "smart-templates/adapters/markdown.js";
import { EjsSmartTemplateAdapter } from "smart-templates/adapters/ejs.js";
import { SmartChatModel } from "smart-chat-model";
import views from "./dist/views.json";
import default_templates from "./dist/templates.json";
import default_var_prompts from "./templates/var_prompts.json";
import { SmartEnv } from "smart-environment/smart_env.js";
import { SmartFs } from 'smart-file-system/smart_fs.js';
import { ObsidianSmartFsAdapter } from "smart-file-system/adapters/obsidian.js";
import { MultiFileSmartCollectionDataAdapter } from "smart-collections/adapters/multi_file.js";
import { SmartSettings } from "smart-setting";

class SmartPlugin extends Plugin{
  static get default_settings() {
    return {
      env_data_dir: '.smart-env',
    };
  }
  get smart_env_class(){ return SmartEnv }
  get smart_env_config() {
    return {
      global_ref: window,
      env_path: '', // scope handled by Obsidian FS methods
      env_data_dir: this.settings.env_data_dir, // used to scope SmartEnvSettings.fs
      smart_env_settings: { // careful: overrides saved settings
        is_obsidian_vault: true,
      },
      templates: views,
      // smart modules
      smart_collection_adapter_class: MultiFileSmartCollectionDataAdapter,
      smart_fs_class: SmartFs,
      smart_fs_adapter_class: ObsidianSmartFsAdapter,
    };
  }
  async load_settings() {
    if(!this.settings) this.settings = {};
    Object.assign(this.settings, this.constructor.default_settings); // set defaults
    const saved_settings = await this.loadData();
    if(!saved_settings){
      this.notices.show("fail-load-settings", "Failed to load settings. Restarting plugin...");
      this.restart_plugin();
      throw new Error("Failed to load settings. Restarting plugin...");
    }
    Object.assign(this.settings, saved_settings); // overwrites defaults with saved settings
    return this.settings;
  }
  async save_settings(settings=this.settings) {
    await this.saveData(settings); // Obsidian API->saveData
  }
  async restart_plugin() {
    await new Promise(r => setTimeout(r, 3000));
    window.restart_plugin = async (id) => {
      console.log("restarting plugin", id);
      await window.app.plugins.disablePlugin(id);
      await window.app.plugins.enablePlugin(id);
      console.log("plugin restarted", id);
    };
    await window.restart_plugin(this.manifest.id);
  }
}

export default class SmartTemplatesPlugin extends SmartPlugin {
  async onload() { this.app.workspace.onLayoutReady(this.initialize.bind(this)); } // initialize when layout is ready
  onunload() {
    console.log("unloading smart-templates plugin");
    this.env?.unload_main('smart_templates_plugin');
    this.env = null;
  }
  static get defaults() {
    return {
      smart_templates: {
        chat_model_platform_key: 'openai',
        templates_folder: "smart-templates",
        var_prompts: {
          'summary': {prompt: 'A brief summary paragraph.'},
          'notes': {prompt: 'Concise notes in list format.'},
          'mermaid': {prompt: 'A mermaid chart representing the content. Ex. graph TD\nA --> B\nB --> C'}
        },
      }
    };
  }

  async initialize() {
    // wait a second for any other plugins to finish initializing
    await new Promise(resolve => setTimeout(resolve, 2000));
    this.obsidian = Obsidian;
    await this.load_settings();
    await this.ensure_templates_folder();
    await this.include_default_templates();
    await this.smart_env_class.create(this, this.smart_env_config);

    // await this.load_smart_templates();
    this.addSettingTab(new SmartTemplatesSettingsTab(this.app, this));
    this.add_commands();
  }

  get smart_env_config() {
    return {
      ...super.smart_env_config,
      template_adapters: {
        md: MarkdownSmartTemplateAdapter,
        ejs: EjsSmartTemplateAdapter,
      },
      collections: {
        smart_templates: SmartTemplates,
      },
      item_types: {
        SmartTemplate,
      },
      // global_ref: {}, // DO: remove this (prevent sharing for now)
      global_ref: window,
      default_settings: {
        smart_templates: this.constructor.defaults,
      }
    };
  }

  // async load_smart_templates() {
  //   this.env.smart_templates = await SmartTemplates.load(this.env, this.smart_env_config);
  //   await this.get_var_prompts_settings();
  // }

  async get_var_prompts_settings() {
    if (!this.settings.var_prompts) this.settings.var_prompts = {};
    
    const templates = this.env.smart_templates.filter();
    const active_vars = {};

    for (const template of templates) {
      const template_vars = await template.parse_variables();
      template_vars.forEach(({name, prompt, inline}) => {
        if (!inline) {
          active_vars[name] = prompt || this.settings.var_prompts[name]?.prompt || '';
        }
      });
    }

    // Update settings with active variables
    for (const [name, prompt] of Object.entries(active_vars)) {
      this.settings.var_prompts[name] = { prompt };
    }

    // Remove var prompts that are no longer used in any template
    for (const name in this.settings.var_prompts) {
      if (!active_vars.hasOwnProperty(name)) {
        delete this.settings.var_prompts[name];
      }
    }

    await this.save_settings();
  }

  // check if templates folder exists
  // if not, create it
  async ensure_templates_folder() {
    const templates_folder = this.app.vault.getFolderByPath(this.settings.templates_folder);
    if (!templates_folder) {
      await this.app.vault.createFolder(this.settings.templates_folder);
    }
  }

  async include_default_templates() {
    // check if default templates folder
    const default_templates_folder = this.app.vault.getFolderByPath(`${this.settings.templates_folder}/default`);
    if (!default_templates_folder) {
      await this.app.vault.createFolder(`${this.settings.templates_folder}/default`);
    }
    for (const [name, content] of Object.entries(default_templates)) {
      const default_template = this.app.vault.getFileByPath(`${this.settings.templates_folder}/default/${name}.md`);
      if (!default_template) {
        await this.app.vault.create(
          `${this.settings.templates_folder}/default/${name}.md`,
          content
        );
      }
    }
    // check if var_prompts.json exists
    const var_prompts_path = `${this.settings.templates_folder}/var_prompts.json`;
    if (!(await this.app.vault.adapter.exists(var_prompts_path))) {
      await this.app.vault.adapter.write(var_prompts_path, "{}");
    }
    // for each default var prompt, add it to var_prompts.json if it doesn't exist
    for (const [name, prompt] of Object.entries(default_var_prompts.var_prompts)) {
      if(!this.settings.var_prompts[name]) {
        this.settings.var_prompts[name] = prompt;
      }
    }
    await this.save_settings();
  }

  add_commands() {
    this.add_template_commands();
    // update templates commands
    this.addCommand({
      id: 'update-commands',
      name: 'Refresh commands (adds/removes templates from commands)',
      icon: 'pencil_icon',
      editorCallback: this.add_template_commands.bind(this),
    });
  }

  add_template_commands() {
    const templates = Object.values(this.env.smart_templates.items);
    console.log({templates});
    for (const template of templates) {
      if (template.file_type === 'json') continue;
      this.addCommand({
        id: `${format_command_name(template.name)}-generate`,
        name: `Generate: ${template.name.split('.md')?.[0] || template.name}`,
        icon: "pencil_icon",
        hotkeys: [],
        editorCallback: this.run_smart_template.bind(this, template.key, {replace: false}),
      });
      this.addCommand({
        id: `${format_command_name(template.name)}-replace`,
        name: `Replace: ${template.name.split('.md')?.[0] || template.name}`,
        icon: "pencil_icon",
        hotkeys: [],
        editorCallback: this.run_smart_template.bind(this, template.key, {replace: true}),
      });
    }
  }

  async run_smart_template(template_key, opts={}, editor, ctx) {
    // get path of active file
    const file = this.app.workspace.getActiveFile();
    const file_path = file.path;
    let context = file_path + "\n";
    if (editor.somethingSelected()) context = editor.getSelection();
    else context = editor.getValue();
    if (!context) return new Notice("[Smart Commands] No file or selection found");

    const template = this.env.smart_templates.get(template_key);
    const template_content = await template.read();
    const template_frontmatter = parse_frontmatter(template_content);
    if(template_frontmatter?.tags_as_context) {
      context = `${this.tags_as_context}\n${context}`;
    }
    const render_opts = {
      file_type: template.file_type,
      system_prompt: template_frontmatter?.system_prompt,
    };
    const resp = await template.render({
      context,
      file_path,
      ...render_opts,
    });

    // if has smart_sources, then template.render() will handle the output
    // if no smart_sources, then output to editor
    if(!this.env.smart_sources) {
      // get last line of editor
      const lines = editor.getValue().split("\n");
      const last_line = lines[lines.length - 1];
      editor.setValue(editor.getValue() + "\n" + resp);
      const output_pos = { line: last_line, ch: 0 };
      editor.setCursor(output_pos);
      editor.scrollIntoView({ to: output_pos, from: output_pos }, true);
    }
  }

  get all_tags() {
    return Object.entries(this.app.metadataCache.getTags())
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count)
    ;
  }

  get tags_as_context() {
    return `Existing tags in format "tag (frequency)":\n` + this.all_tags.map(tag => `${tag.name}${tag.count > 1 ? ` (${tag.count})` : ''}`).join("\n");
  }

}

class SmartTemplatesSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.config = plugin.settings;
  }
  display() {
    this.smart_settings = new SmartTemplatesSettings(
      this.plugin.env,
      this.containerEl,
      {
        main: this.plugin, // fixes not saving
        template_name: "smart_templates_settings",
        views,
      }
    );
    return this.smart_settings.render();
  }
}
// Smart Templates Specific Settings
class SmartTemplatesSettings extends SmartSettings {
  // get settings() { return this.env.smart_templates_plugin.settings; }
  // set settings(settings) {
  //   this.env.smart_templates_plugin.settings = settings;
  // }
  // get model_config() { return this.settings[this.settings.chat_model_platform_key]; }
  get chat_model_platform_key() { return this.env.smart_templates.chat_model_platform_key }
  get model_config() { return this.env.smart_templates.model_config }
  async get_view_data(){
    // for each file in templates folder
    // await this.env.smart_templates_plugin.get_var_prompts_settings();
    // clear _variables object
    this.env.smart_templates._variables = {};
    await this.env.smart_templates.fs.init(); // reload all files (i.e. get new templates)
    await this.env.smart_templates.init(); // re-create template instances
    // get chat platforms
    if(!this._model_settings) this.load_model_settings();

    // Use the _variables object from SmartTemplates
    let var_prompts = Object.entries(this.env.smart_templates._variables || {})
      .map(([name, variable]) => ({
        name,
        prompt: variable.prompt || this.settings.smart_templates.var_prompts[name]?.prompt || '',
        active: true
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    ;

    // Add inactive var_prompts from settings
    const inactive_var_prompts = Object.entries(this.settings.smart_templates.var_prompts || {})
      .filter(([name, _]) => !this.env.smart_templates._variables?.[name])
      .map(([name, prompt_obj]) => ({
        name,
        prompt: prompt_obj.prompt || '',
        active: false
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    ;

    var_prompts = [...var_prompts, ...inactive_var_prompts];

    return {
      model_settings: this._model_settings || null,
      settings: this.settings,
      var_prompts,
    };
  }
  // async can_import_from_smart_connections() {
  //   if(!(await this.main.app.vault.adapter.exists(`${this.main.app.vault.configDir}/plugins/smart-connections/data.json`))) return false;
  //   const config_file = await this.main.app.vault.adapter.read(`${this.main.app.vault.configDir}/plugins/smart-connections/data.json`);
  //   if(!config_file) return false;
  //   const config = JSON.parse(config_file);
  //   // if has any api_key for SmartChatModel.platforms in smart-connections, but not in settings, return true
  //   if(config[this.chat_model_platform_key]?.api_key?.length && !this.settings[this.chat_model_platform_key]?.api_key?.length) return true;
  //   return false;
  // }
  async load_model_settings() {
    const chat_platforms = SmartChatModel.platforms;
    const smart_chat_model = new SmartChatModel(
      this.env,
      this.chat_model_platform_key,
      this.model_config
    );
    smart_chat_model._request_adapter = requestUrl;
    const platform_chat_models = await smart_chat_model.get_models();
    this._model_settings = await this.ejs.render(
      this.views['smart_templates_model_settings'],
      {
        settings: this.settings,
        chat_platforms,
        platform_chat_models,
        chat_platform: smart_chat_model.platform,
        // can_import_from_smart_connections: await this.can_import_from_smart_connections(),
      }
    );
    this.render();
  }

  get template (){ return this.templates[this.template_name]; }
  async changed_smart_chat_platform(render = true){
    this._model_settings = null;
    if(render) this.render();
  }
  // // import model config from smart-connections
  // async import_model_config_from_smart_connections(){
  //   const config_file = await this.main.app.vault.adapter.read(`${this.main.app.vault.configDir}/plugins/smart-connections/data.json`);
  //   if(!config_file) return new Notice("[Smart Templates] No model config found in smart-connections");
  //   const config = JSON.parse(config_file);
  //   const settings = this.settings;
  //   if(config[this.settings.chat_model_platform_key]) settings[this.settings.chat_model_platform_key] = {...config[this.settings.chat_model_platform_key]};
  //   this.settings = settings;
  //   await this.env.smart_templates_plugin.save_settings();
  //   this._model_settings = null;
  //   this.render();
  // }
  async update(setting, value) {
    await super.update(setting, value);
  }
  async remove_var_prompt(setting, value, elm) {
    const var_prompt_name = elm.dataset.value;
    delete this.settings.smart_templates.var_prompts[var_prompt_name];
    await this.update('smart_templates.var_prompts', this.settings.smart_templates.var_prompts);
    this.render();
  }
}

// convert string to lowercase letters and hyphens only
function format_command_name(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/ig, '-');
}
// return frontmatter object
function parse_frontmatter(content) {
    const match = content.match(/^---\n([\s\S]+?)\n---/);
    if (match) {
        const frontmatter = match[1];
        const yaml_object = {};
        const lines = frontmatter.split('\n');
        for (const line of lines) {
            const [key, ...value_parts] = line.split(':');
            if (key && value_parts.length > 0) {
                const value = value_parts.join(':').trim();
                yaml_object[key.trim()] = value;
            }
        }
        return yaml_object;
    }
    return null;
}