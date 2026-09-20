import { TemplateContextModal } from '../../modals/template_context_modal.js';

/**
 * Open the template context modal for the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {Promise<boolean>}
 */
export async function context_copy_with_template(params = {}) {
  const ModalClass = this?.env?.config?.modals?.template_context?.class || TemplateContextModal;
  if (typeof ModalClass?.open !== 'function') return false;

  const app = this.env.plugin?.app || this.env.main?.app;
  const request_params = {
    ...params,
    scope_source_key: params.scope_source_key ?? params.source_key ?? app?.workspace?.getActiveFile?.()?.path ?? null,
  };
  await this.env.smart_templates.prepare_templates(request_params);
  if (this.env.smart_templates.unloaded) return false;
  ModalClass.open(this, request_params);
  return true;
}

export const menus = {
  'smart_context:copy_menu': {
    title: 'Copy with Template',
    icon: 'file-plus',
    order: 2,
    when() {
      return Number(this.scope?.item_count || 0) > 0;
    },
  },
};
