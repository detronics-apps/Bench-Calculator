/**
 * Contextual warning banners.
 *
 * These render live under the viewport as soon as a value crosses a
 * problematic threshold - never deferred until export.
 */

import { el, clear } from './dom.js';

const ICON = { info: 'i', warn: '!', error: '!' };

/**
 * @param {HTMLElement} container
 * @param {Array<{id:string, level:'info'|'warn'|'error', text:string,
 *                action?:{label:string, onClick:Function}}>} warnings
 */
export function renderBanners(container, warnings = []) {
  clear(container);
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...warnings].sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));

  for (const w of sorted) {
    container.appendChild(el('div', {
      class: `banner banner--${w.level}`,
      role: w.level === 'error' ? 'alert' : 'status',
    }, [
      el('span', { class: 'banner__icon', 'aria-hidden': 'true', text: ICON[w.level] || 'i' }),
      el('div', { class: 'banner__body', text: w.text }),
      w.action ? el('button', {
        class: 'btn btn--small banner__action',
        type: 'button',
        text: w.action.label,
        on: { click: w.action.onClick },
      }) : null,
    ]));
  }
  container.hidden = sorted.length === 0;
}
