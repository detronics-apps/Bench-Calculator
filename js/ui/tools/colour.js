/**
 * The colour-code tool.
 *
 * There is one resistor here, not two modes. Clicking a band and typing a
 * value both write `state.colour.bands`, so the picture and the number cannot
 * disagree with each other.
 */

import { el, field, select, chips } from '../dom.js';
import { section } from '../sidebar.js';
import { renderResistor } from '../resistor-svg.js';
import { getState, setState } from '../../state.js';
import {
  BAND_COUNTS, bandRoles, bandsToValue, valueToBands, colorsForRole,
  colorById, tolerancesFor, tempcosFor, sigFigsFor,
} from '../../bands.js';
import { nearestE, isEValue, SERIES_TOLERANCE } from '../../eseries.js';
import { formatOhms, parseEng } from '../../units.js';
import { encodeSmd } from '../../smd.js';

/** Which band the user is editing. Transient - never persisted or shared. */
let selectedBand = null;
/** Raw text of the value box, so a half-typed entry is not clobbered mid-keystroke. */
let valueDraft = null;
let valueError = null;

export const decode = () => bandsToValue(getState().colour.bands);

function setBands(bands) {
  setState({ colour: { bands } });
}

/** Swap one band's colour, leaving the rest alone. */
function setBand(index, colorId) {
  const bands = [...getState().colour.bands];
  bands[index] = colorId;
  valueDraft = null;
  valueError = null;
  setBands(bands);
}

/** Change band count, carrying the current value across where it fits. */
function setBandCount(count) {
  const current = decode();
  const tolerance = current.ok ? current.tolerancePct : 5;
  const tempco = current.ok && current.tempco !== null ? current.tempco : 100;

  if (current.ok) {
    const next = valueToBands(current.ohms, { bandCount: count, tolerancePct: tolerance, tempco });
    if (next.ok) {
      selectedBand = null;
      setState({ colour: { bandCount: count, bands: next.bands } });
      return;
    }
    // The value needs more digits than the new count carries: keep the digits
    // we can and let the readout show what it now means.
    const fallback = valueToBands(current.ohms, {
      bandCount: count,
      tolerancePct: tolerancesFor(count).includes(tolerance) ? tolerance : 5,
      tempco,
    });
    if (fallback.ok) {
      selectedBand = null;
      setState({ colour: { bandCount: count, bands: fallback.bands } });
      return;
    }
  }

  const defaults = {
    3: ['yellow', 'violet', 'red'],
    4: ['yellow', 'violet', 'red', 'gold'],
    5: ['yellow', 'violet', 'black', 'brown', 'brown'],
    6: ['yellow', 'violet', 'black', 'brown', 'brown', 'red'],
  };
  selectedBand = null;
  setState({ colour: { bandCount: count, bands: defaults[count] } });
}

/** Apply the typed resistance to the bands. */
function applyValue() {
  const state = getState();
  const current = decode();
  const ohms = parseEng(valueDraft ?? (current.ok ? String(current.ohms) : ''));

  if (ohms === null) {
    valueError = 'That is not a resistance. Try 4700, 4.7k or 4k7.';
    return { ok: false };
  }

  const result = valueToBands(ohms, {
    bandCount: state.colour.bandCount,
    tolerancePct: current.ok ? current.tolerancePct : 5,
    tempco: current.ok && current.tempco !== null ? current.tempco : 100,
  });

  if (!result.ok) {
    valueError = result.error;
    return result;
  }

  valueError = null;
  valueDraft = null;
  selectedBand = null;
  setBands(result.bands);
  return result;
}

/* ----------------------------------------------------------------- view */

function palette(rerender) {
  if (selectedBand === null) return null;
  const state = getState();
  const roles = bandRoles(state.colour.bandCount);
  const role = roles[selectedBand];
  const options = colorsForRole(role, selectedBand);
  const currentId = state.colour.bands[selectedBand];

  return el('div', { class: 'palette' }, [
    el('div', {
      class: 'palette__label',
      text: `Band ${selectedBand + 1} — pick a colour for the ${role === 'tempco' ? 'temperature coefficient' : role} band`,
    }),
    ...options.map((c) => el('button', {
      class: 'palette__swatch',
      type: 'button',
      title: c.name,
      'aria-label': c.name,
      'aria-pressed': String(c.id === currentId),
      style: { background: c.hex },
      on: { click: () => { setBand(selectedBand, c.id); rerender(); } },
    })),
    el('button', {
      class: 'btn btn--small',
      type: 'button',
      text: 'Done',
      on: { click: () => { selectedBand = null; rerender(); } },
    }),
  ]);
}

function stage(state, rerender) {
  const art = renderResistor(state.colour.bands, {
    selected: selectedBand,
    onSelect: (i) => { selectedBand = selectedBand === i ? null : i; rerender(); },
  });
  return el('div', {}, [art, palette(rerender)]);
}

function readout(state) {
  const r = decode();
  if (!r.ok) return { value: r.error, error: true, facts: [] };

  const eSeries = state.prefs.eSeries;
  const snap = nearestE(r.ohms, eSeries);
  const smd = encodeSmd(r.ohms, sigFigsFor(state.colour.bandCount) >= 3 ? 'd4' : 'd3');

  return {
    value: `${formatOhms(r.ohms)} ±${r.tolerancePct}%`,
    facts: [
      { label: 'Range', value: `${formatOhms(r.min)} to ${formatOhms(r.max)}` },
      { label: eSeries, value: snap.exact ? 'standard value' : `nearest ${formatOhms(snap.value)}` },
      r.tempco !== null ? { label: 'Temp. coeff.', value: `${r.tempco} ppm/K` } : null,
      smd.ok ? { label: 'SMD', value: smd.code } : null,
    ].filter(Boolean),
  };
}

function warnings(state, rerender) {
  const r = decode();
  const out = [];

  if (!r.ok) {
    out.push({ id: 'decode', level: 'error', text: r.error });
    return out;
  }

  if (valueError) {
    const suggestion = valueToBands(parseEng(valueDraft) ?? 0, {
      bandCount: state.colour.bandCount + 1,
    });
    out.push({
      id: 'value-error',
      level: 'error',
      text: valueError,
      action: suggestion.ok && state.colour.bandCount < 6 ? {
        label: `Use ${state.colour.bandCount + 1} bands`,
        onClick: () => {
          setState({ colour: { bandCount: state.colour.bandCount + 1, bands: suggestion.bands } });
          valueError = null;
          valueDraft = null;
          rerender();
        },
      } : null,
    });
  }

  const eSeries = state.prefs.eSeries;
  if (!isEValue(r.ohms, eSeries)) {
    const snap = nearestE(r.ohms, eSeries);
    const off = Math.abs(snap.deviationPct);
    out.push({
      id: 'non-standard',
      level: off > SERIES_TOLERANCE[eSeries] ? 'warn' : 'info',
      text: `${formatOhms(r.ohms)} is not an ${eSeries} preferred value, so you are unlikely to be `
        + `able to buy one. The nearest is ${formatOhms(snap.value)}, `
        + `${off.toFixed(2)}% away.`,
      action: {
        label: `Snap to ${formatOhms(snap.value)}`,
        onClick: () => {
          const next = valueToBands(snap.value, {
            bandCount: state.colour.bandCount,
            tolerancePct: r.tolerancePct,
            tempco: r.tempco ?? 100,
          });
          if (next.ok) { setBands(next.bands); rerender(); }
        },
      },
    });
  }

  if (r.tolerancePct >= 20 && state.colour.bandCount === 3) {
    out.push({
      id: 'three-band',
      level: 'info',
      text: 'A 3-band resistor carries no tolerance band, which by convention means ±20%. '
        + 'Confirm against the datasheet before relying on that.',
    });
  }

  return out;
}

function sections(state, rerender) {
  const r = decode();
  const roles = bandRoles(state.colour.bandCount);
  const tolerances = tolerancesFor(state.colour.bandCount);

  const valueInput = el('input', {
    class: 'input',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-invalid': String(Boolean(valueError)),
    value: valueDraft ?? (r.ok ? String(r.ohms) : ''),
    on: {
      input: (e) => { valueDraft = e.target.value; valueError = null; },
      keydown: (e) => { if (e.key === 'Enter') { applyValue(); rerender(); } },
    },
  });

  return [
    section({
      id: 'colour-count',
      title: 'Band count',
      summary: `${state.colour.bandCount} bands`,
      info: '3-band codes carry two digits and no tolerance band. 4-band adds tolerance. '
        + '5-band carries a third digit for 1% parts. 6-band adds a temperature coefficient.',
      children: [
        chips(
          // 3 and 4 band are the ones in a drawer. 5 and 6 carry a third digit
          // and a temperature coefficient - precision parts, so Advanced. The
          // current count is always offered, or a resistor arriving on a share
          // link would have no chip to show it selected.
          BAND_COUNTS
            .filter((c) => state.mode !== 'simple' || c <= 4 || c === state.colour.bandCount)
            .map((c) => ({
              value: c,
              label: `${c}-band`,
              title: `${sigFigsFor(c)} significant figures`,
            })),
          state.colour.bandCount,
          (v) => { setBandCount(Number(v)); rerender(); },
        ),
      ],
    }),

    section({
      id: 'colour-value',
      title: 'Value entry',
      summary: r.ok ? formatOhms(r.ohms) : 'invalid',
      info: 'Type a resistance and the bands follow. Engineering shorthand works: '
        + '4700, 4.7k and 4k7 all mean the same thing.',
      children: [
        field('Resistance (Ω)', valueInput, { hint: 'Accepts 4700, 4.7k, 4k7, 0R47' }),
        field(
          'Tolerance',
          select(
            tolerances.map((t) => ({ value: t, label: `±${t}%` })),
            r.ok ? r.tolerancePct : 5,
            (v) => {
              const next = valueToBands(r.ohms, {
                bandCount: state.colour.bandCount,
                tolerancePct: Number(v),
                tempco: r.tempco ?? 100,
              });
              if (next.ok) { setBands(next.bands); rerender(); }
            },
            { disabled: state.colour.bandCount === 3 },
          ),
          state.colour.bandCount === 3
            ? { hint: 'A 3-band code has no tolerance band; ±20% is assumed.' }
            : {},
        ),
        state.colour.bandCount === 6 ? field(
          'Temperature coefficient',
          select(
            tempcosFor().map((t) => ({ value: t, label: `${t} ppm/K` })),
            r.ok && r.tempco !== null ? r.tempco : 100,
            (v) => {
              const next = valueToBands(r.ohms, {
                bandCount: 6,
                tolerancePct: r.tolerancePct,
                tempco: Number(v),
              });
              if (next.ok) { setBands(next.bands); rerender(); }
            },
          ),
          { info: 'How far the resistance drifts per kelvin of temperature change.' },
        ) : null,
      ].filter(Boolean),
      cta: { label: 'Apply to bands', onClick: () => { applyValue(); rerender(); } },
    }),

    section({
      id: 'colour-bands',
      title: 'Band colours',
      summary: state.colour.bands.map((b) => colorById(b)?.name?.slice(0, 2)).join(' '),
      info: 'Set each band directly. This is the same data the picture edits - '
        + 'change either and the other follows.',
      children: [
        el('div', { class: 'bandgrid' }, state.colour.bands.map((id, i) => {
          const role = roles[i];
          const options = colorsForRole(role, i);
          const color = colorById(id);
          return el('div', { class: 'bandrow' }, [
            el('span', {
              class: 'bandrow__role',
              text: role === 'tempco' ? 'Temp' : role.slice(0, 1).toUpperCase() + role.slice(1),
            }),
            el('span', {
              class: 'bandrow__swatch',
              style: { background: color ? color.hex : 'transparent' },
              'aria-hidden': 'true',
            }),
            select(
              options.map((c) => ({ value: c.id, label: c.name })),
              id,
              (v) => { setBand(i, v); rerender(); },
              { 'aria-label': `Band ${i + 1} colour` },
            ),
          ]);
        })),
      ],
    }),
  ];
}

/** What "Add to bench" saves from this tool. */
function benchItem(state) {
  const r = decode();
  if (!r.ok) return null;
  return {
    kind: 'resistor',
    ohms: r.ohms,
    tolerancePct: r.tolerancePct,
    tempco: r.tempco,
    bands: [...state.colour.bands],
    label: `${formatOhms(r.ohms)} ±${r.tolerancePct}%`,
  };
}

export const colourTool = {
  id: 'colour',
  label: 'Colour Code',
  shortLabel: 'Colour',
  stage,
  readout,
  warnings,
  sections,
  benchItem,
  exportName: () => {
    const r = decode();
    return r.ok ? `resistor-${formatOhms(r.ohms).replace(/[^\w.]+/g, '')}` : 'resistor';
  },
};
