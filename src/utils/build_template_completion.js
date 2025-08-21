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
 * @param {import('smart-chat-obsidian/src/items/smart_chat_thread.js').SmartChatThread} [chat_thread]
 * @returns {import('smart-completions').SmartCompletion}
 */
export async function build_template_completion(env, template, ctx_key, user_message, chat_thread = null) {
  let thread = chat_thread;
  if (!thread) {
    thread = await env.smart_chat_threads.create_or_update();
  }
  const completion_data = {
    context_key: ctx_key,
    template_key: template.key,
    user_message
  };
  const completion = thread.init_completion(completion_data);
  return completion;
}
