import { build_template_completion } from './build_template_completion.js';

/**
 * run_template_completion
 * Builds a SmartCompletion and immediately initializes it to
 * generate template output.
 *
 * @param {import('obsidian-smart-env').SmartEnv} env
 * @param {import('../items/smart_template.js').SmartTemplate} template
 * @param {string} ctx_key
 * @param {string} user_message
 * @param {Object} handlers
 * @returns {Promise<import('smart-completions').SmartCompletion>}
 */
export async function run_template_completion(env, template, ctx_key, user_message, handlers = {}) {
  const completion = await build_template_completion(env, template, ctx_key, user_message);
  completion.chat_model = env?.smart_templates_plugin?.chat_model;
  await completion.init({
    stream: true,
    stream_handlers: handlers
  });
  return completion;
}
