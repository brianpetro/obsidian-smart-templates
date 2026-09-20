import { AjsonSingleFileCollectionDataAdapter } from 'smart-collections/adapters/ajson_single_file.js';
import { AjsonMultiFileItemDataAdapter } from 'smart-collections/adapters/ajson_multi_file.js';

/**
 * Preserve the parent's item-adapter factory/load behavior; suppress only writes
 * for transient catalog records, including forced saves and deletion markers.
 */
export class TransientAjsonItemDataAdapter extends AjsonMultiFileItemDataAdapter {
  async save(...args) {
    if (this.item.data.transient === true) {
      this.item._queue_save = false;
      return;
    }
    return await super.save(...args);
  }
}

/** Templates-only single-file persistence. Every durable path is inherited. */
export class TransientAjsonSingleFileCollectionDataAdapter extends AjsonSingleFileCollectionDataAdapter {
  ItemDataAdapter = TransientAjsonItemDataAdapter;
}
