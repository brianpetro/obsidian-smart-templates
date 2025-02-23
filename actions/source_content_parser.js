
export async function parse_template(source_item, content=null) {
  const dynamic_template_name = source_item.env.settings.smart_templates.template_name;
  if(source_item.file_name.startsWith(dynamic_template_name)) {
    await handle_template(source_item, content);
  }
  if(source_item.metadata?.template) {
    await handle_template(source_item, content);
  }
  if(!content) content = await source_item.read();
  if(!content) return;

}

async function handle_template(source_item, content) {
  console.log("handle_template", source_item, content);
  // TEMP FOR TESTING
  if(!window.smart_templates) window.smart_templates = {};
  window.smart_templates[source_item.key] = content;
  return; // TODO: implement
  const template = await source_item.env.smart_templates.create_or_update({source_key: source_item.key});
  return template;
}



