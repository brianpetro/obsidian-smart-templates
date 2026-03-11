import { TemplateContextModal } from './template_context_modal.js';

/**
 * Backward-compatible alias for the legacy create-from-template modal identity.
 *
 * The implementation now delegates to the shared context-first template modal.
 */
export class CreateFromTemplateModal extends TemplateContextModal {
  static get modal_type() { return 'create_from_template'; }
  static get display_text() { return 'Create from template'; }
  static get event_domain() { return 'create_from_template'; }
  static get command_id() { return this.modal_type; }
  static get modal_key() { return 'create_from_template'; }
  get modal_key() { return 'create_from_template'; }
}

export default CreateFromTemplateModal;
