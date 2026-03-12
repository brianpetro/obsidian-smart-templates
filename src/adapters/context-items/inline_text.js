import { ContextItemAdapter } from 'smart-contexts/adapters/context-items/_adapter.js';

/**
 * Context item adapter for transient inline text payloads such as editor selections.
 */
export class InlineTextContextItemAdapter extends ContextItemAdapter {
  static order = 1;

  /**
   * @param {string} key
   * @returns {boolean|string}
   */
  static detect(key) {
    if (typeof key !== 'string') return false;
    return key.startsWith('selection:') || key.startsWith('inline:');
  }

  get exists() {
    return true;
  }

  get size() {
    if (typeof this.item?.data?.size === 'number') return this.item.data.size;
    const text = typeof this.item?.data?.content === 'string' ? this.item.data.content : '';
    return text.length;
  }

  get mtime() {
    if (typeof this.item?.data?.mtime === 'number') return this.item.data.mtime;
    return Date.now();
  }

  async get_text() {
    return typeof this.item?.data?.content === 'string'
      ? this.item.data.content
      : ''
    ;
  }

  async open() {
    // Intentionally no-op: inline selections do not have a navigable source.
  }
}

export default InlineTextContextItemAdapter;
