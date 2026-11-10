/**
 * One key per element, whichever tool reports it (platform-simplification task 22.2,
 * design 12.7, Requirement 19.4).
 *
 * `selectorFor(el)` returns the first that applies:
 *   1. `[data-testid="…"]`
 *   2. `#<id>` for an id that contains no `:` (React 18 `useId` values such as `:r1:`
 *      and Radix ids such as `radix-:r1:` change with render order, so they are skipped)
 *   3. a `tag:nth-of-type(n)` path from the nearest ancestor that has (1) or (2), or
 *      from `body`.
 *
 * The function is injected into the page as source text, so it has no closure
 * dependencies. `SELECTOR_SOURCE` is that text; the jsdom unit test evaluates the same
 * text, so the test and the page run one definition.
 */
export const SELECTOR_SOURCE = `(function selectorFor(el) {
  function anchor(node) {
    if (!node || node.nodeType !== 1) return null;
    var testId = node.getAttribute('data-testid');
    if (testId) return '[data-testid="' + testId.replace(/"/g, '\\\\"') + '"]';
    var id = node.getAttribute('id');
    if (id && id.indexOf(':') === -1 && /^[A-Za-z_][\\w-]*$/.test(id)) return '#' + id;
    return null;
  }
  if (!el || el.nodeType !== 1) return 'body';
  var own = anchor(el);
  if (own) return own;
  var parts = [];
  var node = el;
  while (node && node.nodeType === 1) {
    var found = anchor(node);
    if (found) {
      parts.unshift(found);
      return parts.join(' > ');
    }
    var tag = node.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') {
      parts.unshift(tag);
      return parts.join(' > ');
    }
    var index = 1;
    var sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    parts.unshift(tag + ':nth-of-type(' + index + ')');
    node = node.parentElement;
  }
  return parts.join(' > ');
})`;
