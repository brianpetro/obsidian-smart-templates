/**
 * Bind component cleanup both to SmartView removal and to the owning render.
 * Aborting a render also cleans never-mounted components, which removal-only
 * observation cannot see. No reads or domain state are owned by this helper.
 */
export function attach_template_disposer(smart_view, container, cleanup, signal) {
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    cleanup();
  };
  smart_view.attach_disposer(container, [dispose]);
  if (signal?.aborted) dispose();
  else signal?.addEventListener('abort', dispose, { once: true });
  return dispose;
}
