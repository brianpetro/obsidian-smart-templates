import { TemplateContextModal } from '../../modals/template_context_modal.js';

/**
 * Open the template context modal for the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @returns {boolean}
 */
export function context_copy_with_template() {
  const ModalClass = this?.env?.config?.modals?.template_context?.class || TemplateContextModal;
  if (typeof ModalClass?.open !== 'function') return false;

  ModalClass.open(this);
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
