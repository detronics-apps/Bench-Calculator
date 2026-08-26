/**
 * The SMD marking tool: 3-digit, 4-digit and EIA-96 codes, decoded and encoded.
 * Like the colour tool, the code and the value are one state, edited two ways.
 */

import { el, field, chips } from '../dom.js';
import { section } from '../sidebar.js';
import { renderSmdChip } from '../smd-svg.js';
import { getState, setState } from '../../state.js';
import { SMD_TYPES, decodeSmd, encodeSmd, detectSmdType } from '../../smd.js';
import { nearestE, isEValue } from '../../eseries.js';
import { formatOhms, parseEng } from '../../units.js';
import { valueToBands } from '../../bands.js';

let valueDraft = null;
let valueError = null;

export const decode = () => {
  const { type, code } = getState().smd;
  return decodeSmd(code, type);
};

const typeName = (id) => SMD_TYPES.find((t) => t.id === id)?.name || id;
/** 'a 3-digit marking' but 'an EIA-96 marking'. */
const aTypeName = (id) => `${/^[AEIOU]/i.test(typeName(id)) ? 'an' : 'a'} ${typeName(id)}`;

function setCode(code) {
  valueDraft = null;
  valueError = null;
  setState({ smd: { code: code.toUpperCase() } });
}

/** Re-encode the current value into a different marking system. */
function setType(type) {
  const current = decode();
  if (current.ok) {
    const next = encodeSmd(current.ohms, type);
    if (next.ok) {
      setState({ smd: { type, code: next.code } });
      return;
    }
  }
  setState({ smd: { type } });
}

function applyValue() {
  const ohms = parseEng(valueDraft ?? '');
  if (ohms === null) {
    valueError = 'That is not a resistance. Try 4700, 4.7k or 4k7.';
    return;
  }
  const next = encodeSmd(ohms, getState().smd.type);
  if (!next.ok) { valueError = next.error; return; }
  valueError = null;
  valueDraft = null;
  setState({ smd: { code: next.code } });
}

/* ----------------------------------------------------------------- view */

function stage(state) {
  const r = decode();
  return renderSmdChip(state.smd.code, {
    typeName: typeName(state.smd.type),
    valid: r.ok,
    packageName: state.smd.type === 'd4' || state.smd.type === 'eia96' ? '0805' : '0603',
  });
}

function readout(state) {
  const r = decode();
  if (!r.ok) return { value: r.error, error: true, facts: [] };

  const snap = nearestE(r.ohms, state.prefs.eSeries);
  const bands = valueToBands(r.ohms, { bandCount: 4, tolerancePct: 5 });
  const bands5 = valueToBands(r.ohms, { bandCount: 5, tolerancePct: 1 });
  const equivalent = bands.ok ? bands : bands5;

  return {
    value: formatOhms(r.ohms),
    facts: [
      { label: 'Marking', value: `${r.code} (${typeName(r.type)})` },
      { label: state.prefs.eSeries, value: snap.exact ? 'standard value' : `nearest ${formatOhms(snap.value)}` },
      equivalent.ok ? { label: 'Bands', value: equivalent.bands.join(' · ') } : null,
    ].filter(Boolean),
  };
}

function warnings(state, rerender) {
  const r = decode();
  const out = [];

  if (!r.ok) {
    // The forced marking system rejected it, but another one may accept it.
    const detected = detectSmdType(state.smd.code);
    const alternative = detected && detected !== state.smd.type
      ? decodeSmd(state.smd.code, detected)
      : null;
    out.push({
      id: 'decode',
      level: 'error',
      text: r.error,
      action: alternative?.ok ? {
        label: `Read as ${typeName(detected)}`,
        onClick: () => { setState({ smd: { type: detected } }); rerender(); },
      } : null,
    });
    return out;
  }
  if (valueError) out.push({ id: 'value-error', level: 'error', text: valueError });

  // 3-character codes ending in R are read as decimal notation, but an EIA-96
  // code can also end in R. Say so rather than silently picking one.
  const code = state.smd.code;
  if (code.length === 3 && code.endsWith('R') && /^\d\d/.test(code)) {
    const asEia = decodeSmd(code, 'eia96');
    if (asEia.ok && asEia.ohms !== r.ohms) {
      out.push({
        id: 'ambiguous',
        level: 'warn',
        text: `"${code}" is ambiguous. Read as a 3-digit marking it means ${formatOhms(r.ohms)}; `
          + `read as EIA-96 it means ${formatOhms(asEia.ohms)}. Pick the marking system explicitly `
          + 'if you are not sure which the part uses.',
        action: {
          label: 'Read as EIA-96',
          onClick: () => { setState({ smd: { type: 'eia96' } }); rerender(); },
        },
      });
    }
  }

  if (state.smd.type === 'd3' && r.ohms >= 1000) {
    out.push({
      id: 'precision',
      level: 'info',
      text: 'A 3-digit marking carries only two significant figures, so it cannot mark a 1% part. '
        + 'Precision parts use 4-digit or EIA-96 markings.',
    });
  }

  if (!isEValue(r.ohms, state.prefs.eSeries)) {
    const snap = nearestE(r.ohms, state.prefs.eSeries);
    out.push({
      id: 'non-standard',
      level: 'info',
      text: `${formatOhms(r.ohms)} is not an ${state.prefs.eSeries} preferred value. `
        + `The nearest is ${formatOhms(snap.value)}. That is normal if the part comes from `
        + 'a finer series - check Preferences.',
    });
  }

  return out;
}

function sections(state, rerender) {
  const r = decode();
  const detected = detectSmdType(state.smd.code);

  const codeInput = el('input', {
    id: 'smd-code-input',
    class: 'input input--mono',
    type: 'text',
    maxlength: '4',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-invalid': String(!r.ok),
    value: state.smd.code,
    on: {
      input: (e) => {
        const cleaned = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
        e.target.value = cleaned;
        setCode(cleaned);
        rerender({ keepFocus: 'smd-code-input', caret: cleaned.length });
      },
    },
  });

  const valueInput = el('input', {
    class: 'input',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    'aria-invalid': String(Boolean(valueError)),
    value: valueDraft ?? (r.ok ? String(r.ohms) : ''),
    on: {
      input: (e) => { valueDraft = e.target.value; valueError = null; },
      keydown: (e) => { if (e.key === 'Enter') { applyValue(); rerender(); } },
    },
  });

  return [
    section({
      id: 'smd-type',
      title: 'Marking system',
      summary: typeName(state.smd.type),
      info: SMD_TYPES.map((t) => `${t.name}: ${t.hint}`).join('\n\n'),
      children: [
        chips(
          SMD_TYPES.map((t) => ({ value: t.id, label: t.name, title: t.hint })),
          state.smd.type,
          (v) => { setType(v); rerender(); },
        ),
        el('div', {
          class: 'field__hint',
          style: { marginTop: '8px' },
          text: detected && detected !== state.smd.type
            ? `That code looks like ${aTypeName(detected)} marking.`
            : SMD_TYPES.find((t) => t.id === state.smd.type).hint,
        }),
      ],
    }),

    section({
      id: 'smd-code',
      title: 'Code entry',
      summary: state.smd.code || '—',
      info: 'Type the marking printed on the chip. Letters are accepted in either case.',
      children: [
        field('Printed marking', codeInput, {
          hint: 'Three or four characters, e.g. 473, 4R7, 4702, 68D',
        }),
      ],
    }),

    section({
      id: 'smd-value',
      title: 'Value entry',
      summary: r.ok ? formatOhms(r.ohms) : 'invalid',
      info: 'Go the other way: type a resistance and get the marking that a chip would carry.',
      children: [
        field('Resistance (Ω)', valueInput, { hint: 'Accepts 4700, 4.7k, 4k7, 0R47' }),
      ],
      cta: { label: 'Generate marking', onClick: () => { applyValue(); rerender(); } },
    }),
  ];
}

function benchItem() {
  const r = decode();
  if (!r.ok) return null;
  const bands = valueToBands(r.ohms, { bandCount: 4, tolerancePct: 5 });
  return {
    kind: 'resistor',
    ohms: r.ohms,
    tolerancePct: null,
    bands: bands.ok ? bands.bands : null,
    label: `${formatOhms(r.ohms)} (SMD ${r.code})`,
  };
}

export const smdTool = {
  id: 'smd',
  label: 'SMD Code',
  shortLabel: 'SMD',
  stage,
  readout,
  warnings,
  sections,
  benchItem,
  exportName: () => `smd-${getState().smd.code || 'code'}`,
};
