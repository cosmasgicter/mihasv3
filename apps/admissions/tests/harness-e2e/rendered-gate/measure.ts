/**
 * The in-page measurement script (platform-simplification task 22.4, design 12.7).
 *
 * It returns plain records; `scripts/rendered-gate-rules.ts` turns them into findings.
 * Both pieces of source text are injected into the page (no closure dependencies):
 *   - `ROLE_SOURCE`    the Requirement 19.7 role precedence, also evaluated by the jsdom
 *                      unit test on DOM fixtures;
 *   - `MEASURE_SOURCE` the measurement function.
 *
 * Written with `String.raw` so the regular expressions keep their backslashes.
 */

/**
 * caption > navigation > control > body > other (Requirement 19.7). Captions are
 * marked, not guessed; navigation sits before control so the bottom navigation's More
 * button keeps the 12 px navigation floor.
 */
export const ROLE_SOURCE = String.raw`(function roleOf(el) {
  if (el.closest('[data-text-role="caption"]')) return 'caption';
  if (el.closest('nav')) return 'navigation';
  if (el.closest('input,select,textarea,button,[role="button"],[data-text-role="control"]')) return 'control';
  if (el.closest('p,li,label,dd,td')) return 'body';
  return 'other';
})`;

export const MEASURE_SOURCE = String.raw`(function measure(selectorFor, roleOf, options) {
  var vw = options.viewportWidth;
  var vh = options.viewportHeight;
  var SKIP_TEXT = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TITLE: 1 };

  function presence(el) {
    var rect = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var rendered = cs.display !== 'none' && el.getClientRects().length > 0;
    // Visually hidden helpers (sr-only) are 1 x 1 px with a zero clip: not measured.
    if (rendered && rect.width <= 1 && rect.height <= 1 && /rect\(0(px)?,? ?0(px)?,? ?0(px)?,? ?0(px)?\)/.test(cs.clip)) {
      rendered = false;
    }
    var closed = false;
    var details = el.parentElement ? el.parentElement.closest('details:not([open])') : null;
    if (details) {
      var summary = details.querySelector(':scope > summary');
      closed = !(summary && summary.contains(el));
    }
    if (!closed) {
      var node = el.parentElement;
      while (node && node !== document.body) {
        var s = getComputedStyle(node);
        if (
          node.getBoundingClientRect().height === 0 &&
          (s.overflowY === 'hidden' || s.overflowY === 'clip')
        ) {
          closed = true;
          break;
        }
        node = node.parentElement;
      }
    }
    return {
      rendered: rendered,
      visibilityHidden: cs.visibility === 'hidden' || cs.visibility === 'collapse',
      area: rect.width * rect.height,
      inClosedDetails: closed,
      ariaHidden: !!el.closest('[aria-hidden="true"]'),
    };
  }

  function hasDirectText(el) {
    for (var i = 0; i < el.childNodes.length; i += 1) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return true;
    }
    return false;
  }

  function merge(a, b) {
    var out = {};
    for (var k in a) out[k] = a[k];
    for (var j in b) out[j] = b[j];
    return out;
  }

  var all = Array.prototype.slice.call(document.body.querySelectorAll('*'));
  var text = [];
  var overflow = [];
  var clipped = [];

  all.forEach(function (el) {
    if (SKIP_TEXT[el.tagName]) return;
    if (el.closest('svg')) return;
    var direct = hasDirectText(el);
    var tag = el.tagName;
    var isControl = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    var isLink = tag === 'A' || tag === 'BUTTON';
    var isImg = tag === 'IMG' && (el.getAttribute('alt') || '').trim() !== '';
    if (!direct && !isControl && !isLink && !isImg) return;
    var p = presence(el);
    var sel = selectorFor(el);
    var cs = getComputedStyle(el);
    if (direct) {
      text.push(merge(p, { kind: 'text', selector: sel, role: roleOf(el), fontSize: parseFloat(cs.fontSize), text: (el.textContent || '').trim().slice(0, 40) }));
    }
    if (isControl) {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      var textEntry = tag !== 'INPUT' || ['text','email','password','search','tel','url','number','date','datetime-local','month','time','week'].indexOf(type) !== -1;
      if (textEntry) {
        text.push(merge(p, { kind: 'control-value', selector: sel, role: 'control', fontSize: parseFloat(cs.fontSize) }));
      }
    }
    if (direct || isControl || isLink || isImg) {
      var rect = el.getBoundingClientRect();
      if (rect.right > vw + 0.1 && p.rendered) {
        var container = null;
        var anc = el.parentElement;
        while (anc && anc !== document.documentElement) {
          var ox = getComputedStyle(anc).overflowX;
          if (ox === 'auto' || ox === 'scroll') { container = anc.getBoundingClientRect().right; break; }
          anc = anc.parentElement;
        }
        overflow.push(merge(p, { selector: sel, right: rect.right, scrollContainerRight: container }));
      }
    }
    if (direct && p.rendered) {
      var ox2 = cs.overflowX;
      if (ox2 !== 'auto' && ox2 !== 'scroll' && el.scrollWidth - el.clientWidth > 1) {
        clipped.push(merge(p, { selector: sel, overflowX: ox2, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, inNav: !!el.closest('nav'), hasDirectText: true }));
      }
    }
  });

  // --- hit areas -----------------------------------------------------------
  var INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="radio"], [role="combobox"], [tabindex]';
  var candidates = Array.prototype.slice.call(document.body.querySelectorAll(INTERACTIVE)).filter(function (el) {
    if (el.disabled) return false;
    var ti = el.getAttribute('tabindex');
    if (ti !== null && parseInt(ti, 10) < 0 && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName) && !el.getAttribute('role')) return false;
    return true;
  });

  function labelsOf(el) {
    var out = [];
    if (el.labels) { for (var i = 0; i < el.labels.length; i += 1) out.push(el.labels[i]); }
    var wrap = el.closest('label');
    if (wrap && out.indexOf(wrap) === -1) out.push(wrap);
    var id = el.getAttribute('id');
    if (id && !el.labels) {
      var byFor = document.querySelectorAll('label[for="' + id.replace(/"/g, '\\"') + '"]');
      for (var j = 0; j < byFor.length; j += 1) if (out.indexOf(byFor[j]) === -1) out.push(byFor[j]);
    }
    return out;
  }

  function unionSize(el) {
    var r = el.getBoundingClientRect();
    var left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    labelsOf(el).forEach(function (l) {
      var lr = l.getBoundingClientRect();
      if (lr.width * lr.height === 0) return;
      left = Math.min(left, lr.left); top = Math.min(top, lr.top);
      right = Math.max(right, lr.right); bottom = Math.max(bottom, lr.bottom);
    });
    return { width: right - left, height: bottom - top };
  }

  function inRunningText(el) {
    if (el.tagName !== 'A') return false;
    if (getComputedStyle(el).display !== 'inline') return false;
    var block = el.parentElement;
    while (block && getComputedStyle(block).display.indexOf('inline') === 0) block = block.parentElement;
    if (!block) return false;
    for (var i = 0; i < block.childNodes.length; i += 1) {
      var n = block.childNodes[i];
      if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return true;
    }
    return false;
  }

  var hit = [];
  candidates.forEach(function (el) {
    var p = presence(el);
    var focused = false;
    var rect = el.getBoundingClientRect();
    // A skip link (or anything visible only on focus) is measured focused.
    if (el.tagName === 'A' && (rect.right <= 0 || rect.bottom <= 0 || rect.left < -500 || (rect.width <= 1 && rect.height <= 1))) {
      el.focus();
      focused = true;
      p = presence(el);
      p.rendered = p.rendered || el.getClientRects().length > 0;
    }
    var size = unionSize(el);
    hit.push(merge(p, { selector: selectorFor(el), label: ((el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)) || undefined, width: size.width, height: size.height, inRunningText: inRunningText(el), measuredFocused: focused || undefined }));
    if (focused) el.blur();
  });
  window.scrollTo(0, 0);

  // --- wizard first control and landing actions ----------------------------
  function topBarBottom() {
    var bottom = 0;
    Array.prototype.slice.call(document.querySelectorAll('header, [role="banner"]')).forEach(function (h) {
      var cs = getComputedStyle(h);
      var r = h.getBoundingClientRect();
      if ((cs.position === 'fixed' || cs.position === 'sticky') && r.top <= 1 && r.height > 0 && cs.display !== 'none') {
        bottom = Math.max(bottom, r.bottom);
      }
    });
    return bottom;
  }

  var wizardFirstControl = null;
  var region = document.querySelector('[data-wizard-form-region]');
  if (region) {
    var controls = Array.prototype.slice.call(region.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="combobox"], [role="radio"], [role="checkbox"]'));
    var first = controls.filter(function (c) { var r = c.getBoundingClientRect(); return r.width * r.height > 0 && getComputedStyle(c).visibility !== 'hidden'; })[0];
    if (first) {
      var fr = first.getBoundingClientRect();
      var bar = document.querySelector('[data-testid="wizard-action-bar"]');
      wizardFirstControl = {
        selector: selectorFor(first),
        top: fr.top, bottom: fr.bottom,
        barBottom: topBarBottom(),
        limitTop: bar ? bar.getBoundingClientRect().top : vh,
      };
    }
  }

  var landingPrimary = null;
  var landingActions = null;
  var primary = document.querySelector('[data-landing-action="primary"]');
  var secondary = document.querySelector('[data-landing-action="secondary"]');
  if (primary) {
    var pr = primary.getBoundingClientRect();
    landingPrimary = { selector: selectorFor(primary), top: pr.top, bottom: pr.bottom, barBottom: topBarBottom(), limitTop: vh, left: pr.left, right: pr.right, viewportWidth: vw };
    if (secondary) {
      landingActions = { primarySelector: selectorFor(primary), primaryWidth: pr.width, secondaryWidth: secondary.getBoundingClientRect().width };
    }
  }

  return { text: text, hit: hit, overflow: overflow, clipped: clipped, viewportWidth: vw, wizardFirstControl: wizardFirstControl, landingPrimary: landingPrimary, landingActions: landingActions };
})`;
