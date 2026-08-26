/**
 * The bench list: components you have saved this session, and the printable
 * label sheet built from them.
 */

import { el, clear, toast } from './dom.js';
import { section } from './sidebar.js';
import { getState, setState } from '../state.js';
import { colorById } from '../bands.js';
import { renderResistorMini } from './resistor-svg.js';

export function addToBench(item) {
  if (!item) { toast('Nothing to add - fix the errors first'); return; }
  const bench = [...getState().bench, { ...item, id: `b${Date.now()}${Math.random().toString(36).slice(2, 6)}` }];
  setState({ bench });
  toast(`Added ${item.label} to the bench`);
}

const removeFromBench = (id) => setState({ bench: getState().bench.filter((b) => b.id !== id) });

function benchRow(item, rerender) {
  return el('div', { class: 'bench__item' }, [
    item.bands ? el('span', { class: 'bench__swatches', 'aria-hidden': 'true' },
      item.bands.map((b) => el('span', {
        class: 'bench__swatch',
        style: { background: colorById(b)?.hex || 'transparent' },
      }))) : null,
    el('span', { class: 'bench__label' }, [
      el('b', { text: item.label }),
      item.note ? el('span', { class: 'bench__note', text: item.note }) : null,
    ]),
    el('button', {
      class: 'btn btn--small',
      type: 'button',
      text: '×',
      title: 'Remove',
      'aria-label': `Remove ${item.label} from the bench`,
      on: { click: () => { removeFromBench(item.id); rerender(); } },
    }),
  ]);
}

export function benchSection(state, rerender, onAdd) {
  const { bench } = state;

  return section({
    id: 'bench',
    title: 'Bench list',
    summary: bench.length ? `${bench.length} saved` : 'empty',
    info: 'A scratch list of components you have worked out. It is saved in this browser '
      + 'only, and it is what the printable label sheet and the project file contain.',
    defaultOpen: bench.length > 0,
    children: [
      bench.length
        ? el('div', { class: 'bench' }, bench.map((item) => benchRow(item, rerender)))
        : el('p', { class: 'bench__empty', text: 'Nothing saved yet. Add the component you are looking at.' }),
      bench.length ? el('button', {
        class: 'btn btn--small',
        type: 'button',
        text: 'Clear the list',
        on: {
          click: () => {
            if (window.confirm(`Remove all ${bench.length} saved components?`)) {
              setState({ bench: [] });
              rerender();
            }
          },
        },
      }) : null,
    ].filter(Boolean),
    cta: { label: 'Add current component', onClick: onAdd },
  });
}

/** Rebuild the print sheet from the bench list. Called before printing. */
export function buildPrintSheet(container) {
  const { bench } = getState();
  clear(container);

  container.appendChild(el('div', { class: 'print-sheet__head' }, [
    el('h1', { class: 'print-sheet__title', text: 'Detronics — component labels' }),
    el('span', {
      class: 'print-sheet__meta',
      text: `${bench.length} label${bench.length === 1 ? '' : 's'} · ${new Date().toLocaleDateString()}`,
    }),
  ]));

  if (!bench.length) {
    container.appendChild(el('p', { text: 'The bench list is empty, so there is nothing to print.' }));
    return;
  }

  container.appendChild(el('div', { class: 'print-sheet__grid' }, bench.map((item) => el('div', { class: 'label' }, [
    el('div', { class: 'label__value', text: item.label }),
    item.note ? el('div', { class: 'label__sub', text: item.note }) : null,
    item.bands ? renderResistorMini(item.bands) : null,
  ].filter(Boolean)))));
}
