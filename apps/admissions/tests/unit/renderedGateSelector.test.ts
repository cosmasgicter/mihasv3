/**
 * `selectorFor` (platform-simplification task 22.2, design 12.7): the one key the
 * rendered gate gives an element, whichever tool reports it.
 */
import { describe, expect, it } from 'vitest';
import { SELECTOR_SOURCE } from '../harness-e2e/rendered-gate/selector';

const selectorFor = new Function(`return ${SELECTOR_SOURCE}`)() as (el: Element | null) => string;

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe('selectorFor', () => {
  it('prefers data-testid over an id', () => {
    mount('<main><button id="save" data-testid="save-button">Save</button></main>');
    expect(selectorFor(document.getElementById('save'))).toBe('[data-testid="save-button"]');
  });

  it('uses a stable id when there is no data-testid', () => {
    mount('<main><button id="save">Save</button></main>');
    expect(selectorFor(document.getElementById('save'))).toBe('#save');
  });

  it('skips a React-style id that contains a colon', () => {
    mount('<main><div><input id=":r1:" /></div></main>');
    const input = document.querySelector('input');
    expect(selectorFor(input)).toBe('body > main:nth-of-type(1) > div:nth-of-type(1) > input:nth-of-type(1)');
  });

  it('skips a Radix id that contains a colon', () => {
    mount('<section><button id="radix-:r1:">x</button></section>');
    expect(selectorFor(document.querySelector('button'))).toBe(
      'body > section:nth-of-type(1) > button:nth-of-type(1)',
    );
  });

  it('builds the path from the nearest ancestor with a testid or stable id', () => {
    mount('<main data-testid="shell"><ul><li>a</li><li>b</li></ul></main>');
    expect(selectorFor(document.querySelectorAll('li')[1] ?? null)).toBe(
      '[data-testid="shell"] > ul:nth-of-type(1) > li:nth-of-type(2)',
    );
    mount('<div id="root"><p>one</p><span>x</span><p>two</p></div>');
    expect(selectorFor(document.querySelectorAll('p')[1] ?? null)).toBe('#root > p:nth-of-type(2)');
  });

  it('counts only same-tag siblings and falls back to body', () => {
    mount('<h1>t</h1><div></div><div><a href="/x">x</a></div>');
    expect(selectorFor(document.querySelector('a'))).toBe('body > div:nth-of-type(2) > a:nth-of-type(1)');
    expect(selectorFor(document.body)).toBe('body');
  });

  it('escapes a double quote in a testid', () => {
    mount('<div data-testid=\'a"b\'></div>');
    expect(selectorFor(document.querySelector('div'))).toBe('[data-testid="a\\"b"]');
  });
});
