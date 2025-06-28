
export async function parse_template(source_item, content=null) {
  const dynamic_template_name = source_item.env.smart_templates?.settings?.template_name;
  if(dynamic_template_name && source_item.file_name.startsWith(dynamic_template_name)) {
    await handle_template(source_item, content);
  }
  if(Object.keys(source_item.metadata || {}).some(key => key.toLowerCase().includes("smart") && key.toLowerCase().includes("template"))) {
    await handle_template(source_item, content);
  }
}

async function handle_template(source_item, content) {
  const template = await source_item.env.smart_templates.create_or_update({source_key: source_item.key});
  return template;
}