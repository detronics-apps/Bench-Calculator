/**
 * The combination tool: N resistors or capacitors in series or parallel, plus
 * a reverse solver that searches E-series pairs for a target value.
 */

import { el, field, chips, select } from '../dom.js';
import { section } from '../sidebar.js';
import { renderNetwork } from '../combine-svg.js';
import { getState, setState } from '../../state.js';
import { KINDS, combine, findCombinations, unitFor } from '../../combine.js';
import { formatEng, parseEng } from '../../units.js';

const MODES = [
  { value: 'series', label: 'Series' },
  { value: 'parallel', label: 'Parallel' },
];

const TOLERANCES = [0, 0.1, 0.5, 1, 2, 5, 10, 20];

/**
 * Sensible starting values per kind. Switching kind resets the list, because
 * 1 kOhm and 1 kH are not the same sort of number and carrying values across
 * decades produces nonsense.
 */
const KIND_DEFAULTS = {
  resistor: {
    components: [{ value: 1000, tolerancePct: 5 }, { value: 2200, tolerancePct: 5 }],
    target: 3141,
    hint: 'Values in ohms: 4k7, 220, 1M',
  },
  capacitor: {
    components: [{ value: 100e-9, tolerancePct: 10 }, { value: 220e-9, tolerancePct: 10 }],
    target: 320e-9,
    hint: 'Values in farads: 100n, 4u7, 220p',
  },
  inductor: {
    components: [{ value: 10e-6, tolerancePct: 10 }, { value: 22e-6, tolerancePct: 10 }],
    target: 33e-6,
    hint: 'Values in henries: 10u, 100uH, 4m7. Assumes the coils share no flux — '
      + 'mutual coupling between inductors mounted close together changes the result, '
      + 'and this calculator cannot see it.',
  },
};

let targetDraft = null;

export function result(state = getState()) {
  const c = state.combine;
  return combine(c.components, c.mode, c.kind);
}

const patch = (p) => setState({ combine: p });

function setComponent(index, changes) {
  const components = getState().combine.components.map(
    (c, i) => (i === index ? { ...c, ...changes } : c),
  );
  patch({ components });
}

function addComponent() {
  const { components } = getState().combine;
  const last = components[components.length - 1];
  patch({ components: [...components, { ...(last || { value: 1000, tolerancePct: 5 }) }] });
}

function removeComponent(index) {
  const { components } = getState().combine;
  if (components.length <= 1) return;
  patch({ components: components.filter((_, i) => i !== index) });
}

/* ----------------------------------------------------------------- view */

function stage(state) {
  const c = state.combine;
  return renderNetwork(c.components, c.mode, c.kind, result(state));
}

function readout(state) {
  const r = result(state);
  const unit = unitFor(state.combine.kind);
  if (!r.ok) return { value: r.error, error: true, facts: [] };

  return {
    value: formatEng(r.value, unit),
    facts: [
      { label: 'Worst case', value: `${formatEng(r.min, unit)} to ${formatEng(r.max, unit)}` },
      { label: 'Combined tolerance', value: `±${r.tolerancePct.toFixed(2)}%` },
      { label: 'Components', value: `${r.count} in ${r.mode}` },
    ],
  };
}

function warnings(state) {
  const r = result(state);
  if (!r.ok) return [{ id: 'combine', level: 'error', text: r.error }];

  const out = [...r.warnings];
  const target = Number(state.combine.target);
  if (Number.isFinite(target) && target > 0) {
    const errorPct = ((r.value - target) / target) * 100;
    if (Math.abs(errorPct) > 0.001) {
      out.push({
        id: 'off-target',
        level: 'info',
        text: `This network gives ${formatEng(r.value, unitFor(state.combine.kind))}, `
          + `${Math.abs(errorPct).toFixed(2)}% ${errorPct > 0 ? 'above' : 'below'} your `
          + `${formatEng(target, unitFor(state.combine.kind))} target. The solver below lists closer pairs.`,
      });
    }
  }
  return out;
}

function componentRow(comp, index, kind, rerender) {
  const unit = unitFor(kind);
  const input = el('input', {
    id: `comb-${index}`,
    class: 'input',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    'aria-label': `Component ${index + 1} value`,
    value: formatEng(comp.value, '').trim(),
    on: {
      change: (e) => {
        const v = parseEng(e.target.value);
        if (v !== null && v > 0) setComponent(index, { value: v });
        rerender();
      },
    },
  });

  return el('div', { class: 'complist__row' }, [
    input,
    select(
      TOLERANCES.map((t) => ({ value: t, label: t ? `±${t}%` : 'exact' })),
      comp.tolerancePct ?? 0,
      (v) => { setComponent(index, { tolerancePct: Number(v) }); rerender(); },
      { 'aria-label': `Component ${index + 1} tolerance` },
    ),
    el('button', {
      class: 'btn btn--small',
      type: 'button',
      text: '×',
      'aria-label': `Remove component ${index + 1}`,
      title: 'Remove',
      on: { click: () => { removeComponent(index); rerender(); } },
    }),
  ]);
}

function solverResults(state, rerender) {
  const target = parseEng(targetDraft ?? String(state.combine.target));
  if (target === null || target <= 0) {
    return [el('p', { class: 'muted', text: 'Enter a target value to search.' })];
  }

  const found = findCombinations(target, {
    kind: state.combine.kind,
    series: state.prefs.eSeries,
    limit: 5,
  });
  if (!found.ok) return [el('p', { class: 'muted', text: found.error })];

  const unit = unitFor(state.combine.kind);
  const list = (title, rows) => el('div', { style: { marginBottom: '12px' } }, [
    el('div', { class: 'field__label', text: title }),
    el('div', { class: 'results' }, rows.map((c) => el('button', {
      class: 'result',
      type: 'button',
      style: { textAlign: 'left', cursor: 'pointer', width: '100%' },
      title: 'Use this pair',
      on: {
        click: () => {
          patch({
            mode: c.mode,
            components: [
              { value: c.a, tolerancePct: 1 },
              { value: c.b, tolerancePct: 1 },
            ],
          });
          rerender();
        },
      },
    }, [
      el('span', { class: 'result__pair', text: `${formatEng(c.a, unit)} + ${formatEng(c.b, unit)}` }),
      el('b', { text: formatEng(c.value, unit) }),
      el('span', {
        class: `result__err${Math.abs(c.errorPct) < 1e-9 ? ' result__err--exact' : ''}`,
        text: Math.abs(c.errorPct) < 1e-9 ? 'exact' : `${c.errorPct > 0 ? '+' : ''}${c.errorPct.toFixed(2)}%`,
      }),
    ]))),
  ]);

  return [
    list('Closest in series', found.series),
    list('Closest in parallel', found.parallel),
  ];
}

function sections(state, rerender) {
  const r = result(state);
  const c = state.combine;
  const unit = unitFor(c.kind);

  const targetInput = el('input', {
    id: 'combine-target',
    class: 'input',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    value: targetDraft ?? formatEng(c.target, '').trim(),
    on: {
      change: (e) => {
        targetDraft = e.target.value;
        const v = parseEng(e.target.value);
        if (v !== null && v > 0) { targetDraft = null; patch({ target: v }); }
        rerender();
      },
    },
  });

  return [
    section({
      id: 'combine-kind',
      title: 'Component type',
      summary: `${KINDS.find((k) => k.id === c.kind).name} · ${c.mode}`,
      info: 'Resistors and inductors add in series and combine reciprocally in parallel. '
        + 'Capacitors do exactly the opposite, which is why all three share one calculator.',
      children: [
        chips(KINDS.map((k) => ({ value: k.id, label: k.name })), c.kind, (v) => {
          const defaults = KIND_DEFAULTS[v] || KIND_DEFAULTS.resistor;
          patch({ kind: v, components: defaults.components, target: defaults.target });
          targetDraft = null;
          rerender();
        }),
        el('div', { style: { marginTop: '10px' } }, [
          el('div', { class: 'field__label', text: 'Connection' }),
          chips(MODES, c.mode, (v) => { patch({ mode: v }); rerender(); }),
        ]),
      ],
    }),

    section({
      id: 'combine-components',
      title: 'Components',
      summary: r.ok ? formatEng(r.value, unit) : 'invalid',
      info: 'Engineering shorthand works throughout: 4k7, 100n, 2M2.',
      children: [
        el('div', { class: 'complist' },
          c.components.map((comp, i) => componentRow(comp, i, c.kind, rerender))),
        el('div', {
          class: 'field__hint',
          text: (KIND_DEFAULTS[c.kind] || KIND_DEFAULTS.resistor).hint,
        }),
      ],
      cta: { label: 'Add another component', onClick: () => { addComponent(); rerender(); } },
    }),

    section({
      id: 'combine-solver',
      title: 'Target solver',
      summary: formatEng(c.target, unit),
      info: `Searches every pair of ${state.prefs.eSeries} values for the closest series and `
        + 'parallel combination. Click a result to load it above.',
      children: [
        field(`Target (${unit})`, targetInput, {
          hint: `Searching ${state.prefs.eSeries} pairs. Change the series in Preferences.`,
        }),
        ...solverResults(state, rerender),
      ],
    }),
  ];
}

function benchItem(state) {
  const r = result(state);
  if (!r.ok) return null;
  const unit = unitFor(state.combine.kind);
  return {
    kind: state.combine.kind,
    value: r.value,
    unit,
    ohms: state.combine.kind === 'resistor' ? r.value : null,
    tolerancePct: r.tolerancePct,
    bands: null,
    label: `${formatEng(r.value, unit)} ±${r.tolerancePct.toFixed(1)}%`,
    note: `${state.combine.components.map((x) => formatEng(x.value, unit)).join(state.combine.mode === 'series' ? ' + ' : ' ∥ ')}`,
  };
}

export const combineTool = {
  id: 'combine',
  label: 'Combinations',
  shortLabel: 'Combine',
  stage,
  readout,
  warnings,
  sections,
  benchItem,
  exportName: (state) => `${state.combine.kind}s-in-${state.combine.mode}`,
};
