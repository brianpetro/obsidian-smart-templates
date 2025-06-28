import { ContextSelectorModal } from 'smart-context-obsidian/src/views/context_selector_modal.js';

export function build_html(ctx) {
  return `<div class="st-template-context-builder" data-context-key="${ctx.data.key}">
    <button class="st-edit-context">Edit</button>
    <div class="st-context-container"></div>
  </div>`;
}

export async function render(ctx, opts = {}) {
  const html = build_html.call(this, ctx, opts);
  const frag = this.create_doc_fragment(html);
  const container = frag.querySelector('.st-template-context-builder');
  const ctx_container = container.querySelector('.st-context-container');
  const ctx_builder = await ctx.env.render_component('template_context_builder', ctx, opts);
  ctx_container.appendChild(ctx_builder);
  container.querySelector('.st-edit-context').addEventListener('click', async () => {
    ContextSelectorModal.open(ctx.env, { ctx, update_callback: opts.update_callback });
  });
  return container;
}
