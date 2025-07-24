// SmartCompletion is provided by SmartChatThreads

/**
 * build_template_completion
 * Returns a SmartCompletion from the active SmartChatThread.
 * Creates a new chat thread if none exists and applies the context key.
 *
 * @param {import('obsidian-smart-env').SmartEnv} env
 * @param {import('../items/smart_template.js').SmartTemplate} template
 * @param {string} ctx_key
 * @param {string} user_message
 * @returns {import('smart-completions').SmartCompletion}
 */
export async function build_template_completion(env, template, ctx_key, user_message) {
  let thread = env.smart_templates?.active_thread;
  if (!thread) {
    thread = await env.smart_chat_threads.create_or_update();
    env.smart_templates.active_thread = thread;
  }
  const completion_data = {
    context_key: ctx_key,
    template_key: template.key,
    user_message
  };
  const completion = thread.init_completion(completion_data);
  return completion;
}
