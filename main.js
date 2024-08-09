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
import default_templates from "./dist/templates.json";
import default_var_prompts from "./templates/var_prompts.json";
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
    await this.load_settings();
    await this.ensure_templates_folder();
    await this.include_default_templates();
    SmartEnv.create(this, {
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
    // save var_prompts to smart templates folder in var_prompts.json
    await this.app.vault.adapter.write(
      `${this.settings.templates_folder}/var_prompts.json`,
      JSON.stringify({var_prompts: this.settings.var_prompts}, null, 2),
    );
    await this.load_settings(); // re-load settings into memory
  }
  get_templates_from_folder(templates_folder_path) {
    const templates = [];
    const folder = this.app.vault.getFolderByPath(templates_folder_path);
    if(!folder) return templates;
    folder.children
      .forEach(file_or_folder => {
        if(file_or_folder instanceof this.obsidian.TFile) {
          this.env.smart_templates.add_template(file_or_folder.path);
          templates.push(file_or_folder);
        }
        // handle subfolders
        else if(file_or_folder instanceof this.obsidian.TFolder) {
          templates.push(...this.get_templates_from_folder(file_or_folder.path));
        }
      })
    ;
    return templates;
  }
  async get_var_prompts_settings() {
    this.active_template_vars = [];
    const templates = this.get_templates_from_folder(this.settings.templates_folder);
    for(const template of templates) {
      const template_vars = await this.env.smart_templates.get_variables(template.path);
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
    const templates = this.get_templates_from_folder(this.settings.templates_folder);
    for (const template of templates) {
      // exclude json files
      if(template.name.endsWith('.json')) continue;
      this.addCommand({
        id: `${format_command_name(template.name)}-generate`,
        name: `Generate: ${template.name.split('.md')?.[0] || template.name}`,
        icon: "pencil_icon",
        hotkeys: [],
        editorCallback: this.run_smart_template.bind(this, template.path, {replace: false}),
      });
      this.addCommand({
        id: `${format_command_name(template.name)}-replace`,
        name: `Replace: ${template.name.split('.md')?.[0] || template.name}`,
        icon: "pencil_icon",
        hotkeys: [],
        editorCallback: this.run_smart_template.bind(this, template.path, {replace: true}),
      });
    }
  }

  async run_smart_template(template_path, opts={}, editor, ctx) {
    // get path of active file
    const file = this.app.workspace.getActiveFile();
    const file_path = file.path;
    let context = file_path + "\n"; // add file path to context (folder and file name)
    if(editor.somethingSelected()) context = editor.getSelection();
    else context = editor.getValue();
    if (!context) return new Notice("[Smart Commands] No file or selection found");

    const template_tfile = this.app.vault.getFileByPath(template_path);
    // get template frontmatter
    const template_content = await this.app.vault.cachedRead(template_tfile);
    const template_frontmatter = parse_frontmatter(template_content);
    if(template_frontmatter?.tags_as_context) {
      context = `${this.tags_as_context}\n${context}`;
    }
    const render_opts = {
      file_type: template_tfile.extension,
    };
    if(template_frontmatter?.system_prompt) {
      render_opts.system_prompt = template_frontmatter.system_prompt;
    }
    const resp = await this.env.smart_templates.render(this.strip_frontmatter_context_config(template_content), context, render_opts);
    // const source_entity = this.env.smart_sources.get(file_path);
    const sc_env = window.SmartSearch.plugin.env; // TEMP until SC OP using standard SmartEnv
    const source_entity = sc_env.smart_sources.get(file_path); // TEMP until SC OP using standard SmartEnv
    if(source_entity?.merge) {
      sc_env.settings.use_change_syntax = true;
      sc_env.has_obsidian = true;
      await source_entity.merge(resp, {mode: opts.replace ? 'replace_blocks' : 'append_blocks'});
    }else{
      // get last line of editor
      const lines = editor.getValue().split("\n");
      const last_line = lines[lines.length - 1];
      editor.setValue(editor.getValue() + "\n" + resp);
      const output_pos = { line: last_line, ch: 0 };
      editor.setCursor(output_pos);
      editor.scrollIntoView({ to: output_pos, from: output_pos }, true);
    }
  }
  get context_frontmatter_index() {
    return ['tags_as_context', 'system_prompt']
  }

  get all_tags() {
    return Object.entries(this.app.metadataCache.getTags())
      .filter(([name]) => !this.context_frontmatter_index.includes(name))
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count)
    ;
  }

  get tags_as_context() {
    return `Existing tags in format "tag (frequency)":\n` + this.all_tags.map(tag => `${tag.name}${tag.count > 1 ? ` (${tag.count})` : ''}`).join("\n");
  }

  strip_frontmatter_context_config(template_content) {
    const regex_pattern = this.context_frontmatter_index
      .map(tag => `^${tag}:.*\\n`)
      .join('|');
    const dynamic_regex = new RegExp(regex_pattern, 'gm');

    return template_content
      // dynamically remove lines starting with context frontmatter tags
      .replace(dynamic_regex, '')
      // remove --- delimiters if no frontmatter is present
      .replace(/^---\n---/gm, '')
    ;
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
    // get chat platforms
    if(!this._model_settings) this.load_model_settings();
    const var_prompts = Object.entries(this.settings.var_prompts)
      // map
      .map(([name, prompt]) => ({name, prompt, active: this.env.smart_templates_plugin.active_template_vars.includes(name)}))
      // sort alphabetically by name
      .sort((a, b) => a.name.localeCompare(b.name))
      // sort by whether prompt is in active template vars
      .sort((a, b) => b.active - a.active)
    ;
    return {
      model_settings: this._model_settings || null,
      settings: this.settings,
      var_prompts,
    };
  }
  async can_import_from_smart_connections() {
    if(!(await this.main.app.vault.adapter.exists(`${this.main.app.vault.configDir}/plugins/smart-connections/data.json`))) return false;
    const config_file = await this.main.app.vault.adapter.read(`${this.main.app.vault.configDir}/plugins/smart-connections/data.json`);
    if(!config_file) return false;
    const config = JSON.parse(config_file);
    // if has any api_key for SmartChatModel.platforms in smart-connections, but not in settings, return true
    if(config[this.settings.chat_model_platform_key]?.api_key?.length && !this.settings[this.settings.chat_model_platform_key]?.api_key?.length) return true;
    return false;
  }
  async load_model_settings() {
    const chat_platforms = SmartChatModel.platforms;
    const smart_chat_model = new SmartChatModel(
      this.env,
      this.settings.chat_model_platform_key || 'openai',
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
        can_import_from_smart_connections: await this.can_import_from_smart_connections(),
      }
    );
    this.render();
  }

  get template (){ return this.views[this.template_name]; }
  async changed_smart_chat_platform(render = true){
    this._model_settings = null;
    this.env.smart_templates_plugin.load_smart_templates();
    if(render) this.render();
  }
  // import model config from smart-connections
  async import_model_config_from_smart_connections(){
    const config_file = await this.main.app.vault.adapter.read(`${this.main.app.vault.configDir}/plugins/smart-connections/data.json`);
    if(!config_file) return new Notice("[Smart Templates] No model config found in smart-connections");
    const config = JSON.parse(config_file);
    const settings = this.settings;
    if(config[this.settings.chat_model_platform_key]) settings[this.settings.chat_model_platform_key] = {...config[this.settings.chat_model_platform_key]};
    this.settings = settings;
    await this.env.smart_templates_plugin.save_settings();
    this._model_settings = null;
    this.render();
  }
  async update(setting, value) {
    await super.update(setting, value);
  }
  async remove_var_prompt(setting, value, elm) {
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