/** Collapsible sidebar sections. Each carries at most one primary call to action. */

import { el, infoIcon } from './dom.js';
import { getState, setState } from '../state.js';

const CHEVRON = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">'
  + '<path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" stroke-width="1.8" '
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Build one sidebar section.
 *
 * @param {object} spec
 * @param {string} spec.id          stable id; the open/closed state is remembered
 * @param {string} spec.title       shown uppercase
 * @param {string} [spec.summary]   right-aligned value shown while collapsed
 * @param {string} [spec.info]      tooltip text for an inline info icon
 * @param {boolean} [spec.defaultOpen]
 * @param {Node[]} spec.children
 * @param {{label:string, onClick:Function, disabled?:boolean}} [spec.cta]
 */
export function section(spec) {
  const { id, title, summary, info, children = [], cta, defaultOpen = true } = spec;

  const remembered = getState().openSections[id];
  const open = remembered === undefined ? defaultOpen : remembered;

  const body = el('div', { class: 'section__body' }, [
    ...children,
    cta ? el('button', {
      class: 'btn btn--primary',
      type: 'button',
      text: cta.label,
      disabled: cta.disabled || false,
      style: { marginTop: '4px' },
      on: { click: cta.onClick },
    }) : null,
  ]);

  const node = el('div', { class: 'section', dataset: { open: String(open), section: id } }, [
    el('button', {
      class: 'section__head',
      type: 'button',
      'aria-expanded': String(open),
      on: {
        click: (e) => {
          // Let the info icon be hovered and focused without toggling the section.
          if (e.target.closest('.info')) return;
          const next = node.dataset.open !== 'true';
          node.dataset.open = String(next);
          e.currentTarget.setAttribute('aria-expanded', String(next));
          setState({ openSections: { [id]: next } }, { silent: true });
        },
      },
    }, [
      el('span', { class: 'section__chevron', html: CHEVRON }),
      el('span', { class: 'section__title', text: title }),
      info ? infoIcon(info) : null,
      summary ? el('span', { class: 'section__summary', text: summary }) : null,
    ]),
    body,
  ]);

  return node;
}
