import { useEffect } from 'react';

/**
 * Module-level registry tracking injected <style> elements by key.
 * Each entry holds the DOM element and a reference count so the style
 * is only removed when the last consumer unmounts.
 */
const styleRegistry = new Map<
  string,
  { element: HTMLStyleElement; refCount: number }
>();

/**
 * Injects a CSS string into the document <head> exactly once per unique key.
 * Multiple components sharing the same key will ref-count the single <style>
 * element. The element is removed when the last consumer unmounts.
 *
 * @param key  Unique identifier for the style block (used as `data-style-key`)
 * @param css  The CSS text to inject
 */
export function useStyleInjection(key: string, css: string): void {
  useEffect(() => {
    const existing = styleRegistry.get(key);

    if (existing) {
      existing.refCount += 1;
    } else {
      const style = document.createElement('style');
      style.setAttribute('data-style-key', key);
      style.textContent = css;
      document.head.appendChild(style);
      styleRegistry.set(key, { element: style, refCount: 1 });
    }

    return () => {
      const entry = styleRegistry.get(key);
      if (!entry) return;

      entry.refCount -= 1;

      if (entry.refCount <= 0) {
        try {
          document.head.removeChild(entry.element);
        } catch {
          // Element may have already been removed externally — safe to ignore
        }
        styleRegistry.delete(key);
      }
    };
  }, [key, css]);
}
