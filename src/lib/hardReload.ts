export async function hardReload(): Promise<void> {
  try {
    // Unregister service workers so a stale worker doesn't keep serving an old bundle
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    // ignore
    // eslint-disable-next-line no-console
    console.warn('hardReload: failed to unregister service workers', e);
  }

  try {
    // Clear caches (if any) to avoid stale cached assets
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    // ignore
    // eslint-disable-next-line no-console
    console.warn('hardReload: failed to clear caches', e);
  }

  // Force a navigation with a cache-busting query parameter
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_t', String(Date.now()));
    // Use replace to avoid polluting session history
    window.location.replace(url.toString());
  } catch (e) {
    // fallback to simple reload
    window.location.reload();
  }
}
