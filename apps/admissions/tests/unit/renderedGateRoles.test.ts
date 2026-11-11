/**
 * Role precedence and the clipped-text rule of the rendered gate
 * (platform-simplification task 22.4, Requirement 19.7), on DOM fixtures.
 *
 * `ROLE_SOURCE` is the exact text injected into the page; here it is evaluated in jsdom.
 */
import { describe, expect, it } from 'vitest';
import { ROLE_SOURCE } from '../harness-e2e/rendered-gate/measure';
import {
  classifyClippedText,
  classifyFontSize,
  type ClippedRecord,
  type TextRecord,
} from '../../../../scripts/rendered-gate-rules';

const roleOf = new Function(`return ${ROLE_SOURCE}`)() as (el: Element) => string;

function mount(html: string): void {
  document.body.innerHTML = html;
}
const q = (s: string) => document.querySelector(s) as Element;

describe('roleOf precedence: caption > navigation > control > body > other', () => {
  it('a marked caption wins over navigation, control and body', () => {
    mount('<nav><a href="/x"><span data-text-role="caption">3</span></a></nav>');
    expect(roleOf(q('span'))).toBe('caption');
    mount('<p><button><span data-text-role="caption">new</span></button></p>');
    expect(roleOf(q('span'))).toBe('caption');
  });
  it('navigation wins over control, so the More button keeps the navigation floor', () => {
    mount('<nav><button><span>More</span></button></nav>');
    expect(roleOf(q('span'))).toBe('navigation');
  });
  it('an aria-hidden navigation label is still classified as navigation', () => {
    mount('<nav><a href="/x"><span aria-hidden="true">Home</span></a></nav>');
    expect(roleOf(q('span'))).toBe('navigation');
    const record: TextRecord = {
      kind: 'text', selector: 'span', role: 'navigation', fontSize: 10,
      rendered: true, visibilityHidden: false, area: 100, inClosedDetails: false, ariaHidden: true,
    };
    expect(classifyFontSize([record], { studentRoute: true })).toHaveLength(1);
  });
  it('control wins over body, body over other', () => {
    mount('<p><label><button>Go</button></label></p>');
    expect(roleOf(q('button'))).toBe('control');
    mount('<p>text</p>');
    expect(roleOf(q('p'))).toBe('body');
    mount('<div id="d">text</div>');
    expect(roleOf(q('#d'))).toBe('other');
  });
  it('data-text-role="control" makes a Button asChild link a control', () => {
    mount('<div><a href="/x" data-text-role="control">Continue</a></div>');
    expect(roleOf(q('a'))).toBe('control');
  });
});

describe('clipped text', () => {
  const base: ClippedRecord = {
    selector: 'span', overflowX: 'visible', scrollWidth: 120, clientWidth: 80, inNav: false,
    hasDirectText: true, rendered: true, visibilityHidden: false, area: 100, inClosedDetails: false, ariaHidden: false,
  };
  it('reports text spilling out of a fixed slot with overflow-x visible', () => {
    expect(classifyClippedText([base])).toHaveLength(1);
  });
  it('reports text cut off by truncate (hidden)', () => {
    expect(classifyClippedText([{ ...base, overflowX: 'hidden' }])).toHaveLength(1);
  });
  it('excuses auto and scroll containers and a 1 px difference', () => {
    expect(classifyClippedText([{ ...base, overflowX: 'auto' }])).toHaveLength(0);
    expect(classifyClippedText([{ ...base, overflowX: 'scroll' }])).toHaveLength(0);
    expect(classifyClippedText([{ ...base, scrollWidth: 81 }])).toHaveLength(0);
  });
});
