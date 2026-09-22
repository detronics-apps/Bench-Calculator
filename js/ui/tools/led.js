/**
 * The LED series-resistor tool: one LED, a series string, or a parallel group
 * wired either per-branch or behind one shared resistor.
 *
 * Each LED is editable on its own, and the supply can be either a plain
 * voltage or a battery pack, in which case the pack also gives a runtime.
 */

import { el, field, select, chips } from '../dom.js';
import { section } from '../sidebar.js';
import { renderLedCircuit } from '../led-svg.js';
import { getState, setState, atLeast } from '../../state.js';
import { LED_COLORS, ledColorById, solveLed, supplyCurrentAt } from '../../led.js';
import {
  CELLS, cellById, buildPack, PACK_PRODUCTS, productById, buildProductPack,
  estimateRuntime, formatDuration,
} from '../../battery.js';
import { formatOhms, formatAmps, formatWatts, formatVolts } from '../../units.js';
import { valueToBands } from '../../bands.js';

const TOPOLOGIES = [
  { value: 'single', label: 'One LED' },
  { value: 'series', label: 'In series' },
  { value: 'parallel', label: 'In parallel' },
];

const WIRINGS = [
  { value: 'per-led', label: 'Resistor per LED', title: 'The correct way to wire parallel LEDs' },
  { value: 'shared', label: 'One shared resistor', title: 'Common, but the current splits unevenly' },
];

const SUPPLY_MODES = [
  { value: 'custom', label: 'Voltage', title: 'A bench supply, USB, a regulator' },
  { value: 'cells', label: 'Cells', title: 'Build a pack from loose cells' },
  { value: 'product', label: 'Pack product', title: 'A complete pack with its own outputs' },
];

const MAX_LEDS = 24;

/* --------------------------------------------------------------- helpers */

/** The pack described by the current state, or null when running off a plain voltage. */
export function packFor(state = getState()) {
  const { supplyMode, battery, product } = state.led;

  if (supplyMode === 'cells') {
    const pack = buildPack({
      cellId: battery.cellId,
      series: Number(battery.series),
      parallel: Number(battery.parallel),
      capacityMah: battery.capacityMah,
    });
    return pack.ok ? pack : null;
  }

  if (supplyMode === 'product') {
    const pack = buildProductPack({
      productId: product.productId,
      outputId: product.outputId,
      capacityMah: product.capacityMah,
    });
    return pack.ok ? pack : null;
  }

  return null;
}

/**
 * The voltage the circuit actually sees. For a regulated rail that is the
 * regulated figure, not the cell voltage behind it.
 */
export function supplyVoltage(state = getState()) {
  const pack = packFor(state);
  return pack ? pack.outputV : Number(state.led.supplyV);
}

export function solve(state = getState()) {
  const l = state.led;
  return solveLed({
    topology: l.topology,
    wiring: l.wiring,
    supplyV: supplyVoltage(state),
    leds: ledList(state),
    ifA: Number(l.ifMa) / 1000,
    series: state.prefs.eSeries,
  });
}

/** The LED list as the solver wants it, honouring the "all the same" toggle. */
export function ledList(state = getState()) {
  const { leds, matched, topology } = state.led;
  const wanted = topology === 'single' ? 1 : leds.length;
  const source = matched ? Array.from({ length: wanted }, () => leds[0]) : leds.slice(0, wanted);
  return source.map((l) => ({ colorId: l.colorId, vf: Number(l.vf) }));
}

/** Runtime for the current circuit on the current pack, or null. */
export function runtimeFor(state = getState()) {
  const pack = packFor(state);
  const solution = solve(state);
  if (!pack || !solution.ok) return null;
  // A regulated rail holds its voltage, so the draw never tapers.
  const atNominal = supplyCurrentAt(solution, pack.outputV);
  return estimateRuntime(pack, {
    currentAtNominalA: atNominal,
    currentAtCutoffA: pack.regulated ? atNominal : supplyCurrentAt(solution, pack.cutoffV),
  });
}

/** A regulated rail does not taper, so it gets one figure rather than a range. */
function runtimeText(runtime) {
  return runtime.regulated
    ? formatDuration(runtime.shortestHours)
    : `${formatDuration(runtime.shortestHours)} – ${formatDuration(runtime.longestHours)}`;
}

const patch = (p) => setState({ led: p });

function setLedCount(next) {
  const { leds } = getState().led;
  const count = Math.max(1, Math.min(MAX_LEDS, Math.round(next)));
  const out = leds.slice(0, count);
  while (out.length < count) out.push({ ...(out[out.length - 1] || leds[0]) });
  patch({ leds: out });
}

function setLed(index, changes) {
  const leds = getState().led.leds.map((l, i) => (i === index ? { ...l, ...changes } : l));
  patch({ leds });
}

/** A number input bound to one field of `state.led`. */
function numberField(key, labelText, opts = {}) {
  const state = getState();
  const input = el('input', {
    id: `led-${key}`,
    class: 'input',
    type: 'number',
    inputmode: 'decimal',
    min: opts.min ?? '0',
    step: opts.step ?? 'any',
    value: state.led[key],
    on: {
      input: (e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        patch({ [key]: v, ...(key === 'supplyV' ? { supplyMode: 'custom' } : {}) });
        opts.rerender?.({ keepFocus: `led-${key}` });
      },
    },
  });
  return field(labelText, input, { info: opts.info, hint: opts.hint });
}

/* ----------------------------------------------------------------- view */

function stage(state) {
  return renderLedCircuit(solve(state), {
    supplyV: supplyVoltage(state),
    pack: packFor(state),
    leds: ledList(state).map((l) => ({
      ...l,
      hex: ledColorById(l.colorId)?.hex || '#e02020',
    })),
  });
}

function readout(state) {
  const s = solve(state);
  if (!s.ok) return { value: s.error, error: true, facts: [] };

  const runtime = runtimeFor(state);
  const value = s.uniformResistor
    ? `${formatOhms(s.chosenR)}${s.resistorCount > 1 ? ` × ${s.resistorCount}` : ''}`
    : `${s.resistorCount} resistors, ${formatOhms(Math.min(...s.branches.map((b) => b.chosenR)))}–${formatOhms(Math.max(...s.branches.map((b) => b.chosenR)))}`;

  return {
    value,
    facts: [
      s.uniformResistor ? { label: 'Ideal', value: formatOhms(s.idealR) } : null,
      { label: 'Current', value: `${formatAmps(Math.max(...s.perLedCurrents), 3)} per LED` },
      { label: 'Resistor power', value: formatWatts(s.powerR, 3) },
      s.recommendedRatingW ? { label: 'Fit at least', value: formatWatts(s.recommendedRatingW) } : null,
      { label: 'From supply', value: formatAmps(s.supplyCurrentA, 3) },
      runtime?.ok ? { label: 'Runtime', value: runtimeText(runtime) } : null,
    ].filter(Boolean),
  };
}

function warnings(state) {
  const s = solve(state);
  if (!s.ok) {
    return [{
      id: 'unsolvable',
      level: 'error',
      text: s.error + (s.maxCount
        ? ` At this supply and forward voltage you can put at most ${s.maxCount} in series.`
        : ''),
    }];
  }

  const out = [...s.warnings];
  const pack = packFor(state);
  const runtime = runtimeFor(state);
  if (runtime?.ok) out.push(...runtime.warnings);

  // The LEDs may stop conducting long before the cells are considered flat.
  if (pack && !pack.regulated && supplyCurrentAt(s, pack.cutoffV) <= 0) {
    out.push({
      id: 'dark-before-flat',
      level: 'info',
      text: `The LEDs stop lighting once the pack falls to about `
        + `${formatVolts(s.ledVoltage)}, which happens before it reaches its `
        + `${formatVolts(pack.cutoffV)} flat point. You will not get the whole rated capacity `
        + 'out of these cells, so treat the longer runtime figure as optimistic.',
    });
  }
  return out;
}

/**
 * A pack's specifications as a single quiet panel.
 *
 * These were rows of `.result`, which carry a border and read as clickable.
 * Nothing here is clickable - it is a spec sheet, so it should look like one.
 */
const specPanel = (rows) => el('div', { class: 'specs' }, rows.filter(Boolean).map(
  ([label, value, accent]) => el('div', { class: 'specs__row' }, [
    el('span', { class: 'specs__label', text: label }),
    el('span', {
      class: `specs__value${accent ? ' specs__value--accent' : ''}`,
      text: value,
    }),
  ]),
));

/* --------------------------------------------------------------- sections */

function ledRow(index, led, rerender, { showLabel }) {
  const colorOptions = [
    ...LED_COLORS.map((c) => ({ value: c.id, label: `${c.name} — ${c.vf} V` })),
    { value: 'custom', label: 'Custom / from datasheet' },
  ];
  const known = ledColorById(led.colorId);

  const vfInput = el('input', {
    id: `led-vf-${index}`,
    class: 'input',
    type: 'number',
    inputmode: 'decimal',
    min: '0',
    step: '0.1',
    'aria-label': `LED ${index + 1} forward voltage`,
    value: led.vf,
    on: {
      input: (e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        setLed(index, { vf: v, colorId: 'custom' });
        rerender({ keepFocus: `led-vf-${index}` });
      },
    },
  });

  return el('div', { class: 'ledrow' }, [
    showLabel ? el('div', { class: 'ledrow__head' }, [
      el('span', {
        class: 'ledrow__swatch',
        style: { background: known ? known.hex : 'var(--border-strong)' },
        'aria-hidden': 'true',
      }),
      el('span', { class: 'ledrow__name', text: `LED ${index + 1}` }),
    ]) : null,
    el('div', { class: 'row' }, [
      select(colorOptions, led.colorId, (v) => {
        const c = ledColorById(v);
        setLed(index, c ? { colorId: v, vf: c.vf } : { colorId: 'custom' });
        rerender();
      }, { 'aria-label': `LED ${index + 1} colour`, style: 'flex: 2 1 0' }),
      vfInput,
    ]),
  ].filter(Boolean));
}

function ledSection(state, rerender) {
  const { leds, matched, topology } = state.led;
  const count = topology === 'single' ? 1 : leds.length;
  const perLed = !matched && count > 1;
  const first = ledColorById(leds[0].colorId);

  return section({
    id: 'led-part',
    title: count > 1 ? `LEDs (${count})` : 'LED',
    summary: matched || count === 1
      ? (first ? first.name : `${leds[0].vf} V`)
      : `${new Set(leds.slice(0, count).map((l) => l.colorId)).size} kinds`,
    info: 'Picking a colour fills in a typical forward voltage. These vary widely between '
      + 'parts, so override them from your datasheet whenever you have one. Every LED can '
      + 'differ - in parallel, each one then gets a resistor sized for its own forward voltage.',
    children: [
      numberField('ifMa', 'Forward current per LED (mA)', {
        step: '1',
        rerender,
        info: 'The current sets brightness, and it is the same target for every LED here. '
          + '20 mA is the classic indicator figure; modern high-efficiency LEDs are bright at 2–5 mA.',
      }),

      count > 1 ? el('label', { class: 'check' }, [
        el('input', {
          type: 'checkbox',
          checked: matched,
          on: { change: (e) => { patch({ matched: e.target.checked }); rerender(); } },
        }),
        el('span', { text: 'All the LEDs are the same' }),
      ]) : null,

      el('div', { class: 'ledlist' },
        (perLed ? leds.slice(0, count) : leds.slice(0, 1))
          .map((led, i) => ledRow(i, led, rerender, { showLabel: perLed }))),

      el('div', {
        class: 'field__hint',
        text: first
          ? `Typical for ${first.name.toLowerCase()}; datasheets range ${first.vfMin}–${first.vfMax} V. `
            + 'These are indicative figures for ordinary indicator LEDs, not a substitute for the datasheet.'
          : 'Taken from your datasheet.',
      }),
    ].filter(Boolean),
  });
}

function batteryFields(state, rerender) {
  const b = state.led.battery;
  const pack = packFor(state);
  const cell = cellById(b.cellId);

  const intField = (key, labelText) => {
    const input = el('input', {
      id: `bat-${key}`,
      class: 'input',
      type: 'number',
      min: '1',
      step: '1',
      value: b[key],
      on: {
        input: (e) => {
          const v = Math.max(1, Math.round(Number(e.target.value)));
          if (!Number.isFinite(v)) return;
          patch({ battery: { ...b, [key]: v } });
          rerender({ keepFocus: `bat-${key}` });
        },
      },
    });
    return field(labelText, input);
  };

  const capacityInput = el('input', {
    id: 'bat-capacity',
    class: 'input',
    type: 'number',
    min: '1',
    step: '10',
    placeholder: String(cell?.capacityMah ?? ''),
    value: b.capacityMah ?? '',
    on: {
      input: (e) => {
        const raw = e.target.value.trim();
        const v = raw === '' ? null : Number(raw);
        patch({ battery: { ...b, capacityMah: v && v > 0 ? v : null } });
        rerender({ keepFocus: 'bat-capacity' });
      },
    },
  });

  return [
    field('Cell', select(
      CELLS.map((c) => ({ value: c.id, label: `${c.name} — ${c.nominalV} V, ${c.capacityMah} mAh` })),
      b.cellId,
      (v) => { patch({ battery: { ...b, cellId: v, capacityMah: null } }); rerender(); },
    ), { info: 'Nominal voltage and capacity are typical figures for a fresh cell at a modest '
      + 'discharge rate. Series multiplies voltage; parallel multiplies capacity.' }),

    el('div', { class: 'row' }, [
      intField('series', 'Cells in series'),
      intField('parallel', 'Strings in parallel'),
    ]),

    field('Capacity per cell (mAh)', capacityInput, {
      hint: b.capacityMah ? 'Your figure, overriding the typical one.' : 'Leave blank to use the typical figure.',
    }),

    pack && atLeast('advanced') ? specPanel([
      ['Pack voltage', formatVolts(pack.nominalV), true],
      ['Flat at', formatVolts(pack.cutoffV)],
      ['Pack capacity', `${pack.capacityMah} mAh`],
      ['Cells needed', `${pack.cellCount} × ${pack.cell.name}`],
    ]) : null,

    // Simple needs one number: what this pack gives the circuit.
    pack && !atLeast('advanced')
      ? el('p', { class: 'field__hint', text: `This pack supplies ${formatVolts(pack.nominalV)}.` })
      : null,

    pack ? null : el('p', { class: 'muted', text: 'That pack arrangement is not valid.' }),
  ];
}

/** Which body the SUPPLY section shows, given the mode. */
function supplyBody(mode, state, rerender) {
  if (mode === 'cells') return batteryFields(state, rerender);
  if (mode === 'product') return productFields(state, rerender);
  return [numberField('supplyV', 'Supply voltage (V)', { step: '0.1', rerender })];
}

function productFields(state, rerender) {
  const p = state.led.product;
  const product = productById(p.productId);
  const pack = packFor(state);

  const capacityInput = el('input', {
    id: 'prod-capacity',
    class: 'input',
    type: 'number',
    min: '1',
    step: '10',
    placeholder: String(cellById(product?.cellId)?.capacityMah ?? ''),
    value: p.capacityMah ?? '',
    on: {
      input: (e) => {
        const raw = e.target.value.trim();
        const v = raw === '' ? null : Number(raw);
        patch({ product: { ...p, capacityMah: v && v > 0 ? v : null } });
        rerender({ keepFocus: 'prod-capacity' });
      },
    },
  });

  return [
    field('Pack', select(
      PACK_PRODUCTS.map((x) => ({ value: x.id, label: x.name })),
      p.productId,
      (v) => {
        const next = productById(v);
        patch({ product: { productId: v, outputId: next.outputs[0].id, capacityMah: null } });
        rerender();
      },
    )),

    // The full product write-up is background reading, not a control. It only
    // earns its space for someone who came to learn how the thing works.
    product && atLeast('expert') ? el('p', {
      class: 'field__hint',
      style: { marginBottom: '10px' },
      text: `${product.subtitle}. ${product.description}`,
    }) : null,

    product && product.outputs.length > 1 ? field('Output rail', select(
      product.outputs.map((o) => ({ value: o.id, label: o.name })),
      p.outputId,
      (v) => { patch({ product: { ...p, outputId: v } }); rerender(); },
    ), { info: 'The outputs are not equivalent. A raw output sags with the cell; a regulated '
      + 'one holds its voltage but costs conversion efficiency, and the 3.3 V rail pays for '
      + 'two conversions because it hangs off the 5 V rail.' }) : null,

    pack?.output && atLeast('expert')
      ? el('p', { class: 'field__hint', text: pack.output.note })
      : null,

    product?.architecture && atLeast('expert') ? el('pre', {
      class: 'archdiagram',
      'aria-label': 'Power architecture',
      text: product.architecture.join(String.fromCharCode(10)),
    }) : null,

    field('Capacity per cell (mAh)', capacityInput, {
      hint: p.capacityMah ? 'Your figure, overriding the cell specification.' : 'Leave blank to use the cell specification.',
    }),

    pack && atLeast('advanced') ? specPanel([
      ['Output', pack.regulated
        ? `${formatVolts(pack.outputV)} regulated`
        : `${formatVolts(pack.outputV)} nominal`, true],
      pack.maxChargeV && !pack.regulated ? ['Fully charged', formatVolts(pack.maxChargeV)] : null,
      ['Flat at', `${formatVolts(pack.cutoffV)} at the cells`],
      ['Capacity', `${pack.capacityMah} mAh`],
      ['Stored energy', `${Number(pack.energyWh.toPrecision(3))} Wh`],
      ['Usable at this output', `${Number(pack.usableWh.toPrecision(3))} Wh`],
      ['Path efficiency', `${Math.round(pack.efficiency * 100)}%`],
      ['Current limit', `${(pack.maxCurrentMa / 1000).toFixed(1)} A · ${pack.limitName}`],
      ['Cells', `${pack.cellCount} × ${pack.cell.name}`],
    ]) : null,

    pack && !atLeast('advanced')
      ? el('p', { class: 'field__hint', text: `This output supplies ${formatVolts(pack.outputV)}.` })
      : null,

    pack ? null : el('p', { class: 'muted', text: 'That pack could not be built.' }),

    atLeast('expert') ? el('div', {
      class: 'field__hint',
      text: 'Efficiencies are design-stage estimates, not measurements. Replace them with '
        + 'bench figures once you have real current and voltage readings.',
    }) : null,
  ].filter(Boolean);
}

function supplySection(state, rerender) {
  const mode = state.led.supplyMode;
  const pack = packFor(state);

  return section({
    id: 'led-supply',
    title: 'Supply',
    summary: pack
      ? (pack.product ? `${pack.product.name} · ${pack.output.name.split(' — ')[0]}` : `${pack.cellCount} × ${pack.cell.name}`)
      : formatVolts(Number(state.led.supplyV)),
    info: 'A plain voltage, a pack you build from loose cells, or one of the named pack '
      + 'products with its own outputs. Choosing a pack sets the supply voltage; typing a '
      + 'voltage switches back to a plain supply.',
    children: [
      chips(SUPPLY_MODES, mode, (v) => {
        // Carry the current voltage across so the circuit does not jump.
        patch(v === 'custom'
          ? { supplyMode: 'custom', supplyV: pack ? pack.outputV : state.led.supplyV }
          : { supplyMode: v });
        rerender();
      }),
      el('div', { style: { marginTop: '10px' } }, supplyBody(mode, state, rerender)),
    ],
  });
}

const resultRow = (label, value, opts = {}) => el('div', { class: 'result' }, [
  el('span', { text: label }),
  el('b', {
    style: { marginLeft: 'auto', color: opts.color || 'var(--text)', fontVariantNumeric: 'tabular-nums' },
    text: value,
  }),
]);

function branchTable(solution) {
  return el('div', { class: 'results' }, solution.branches.map((b, i) => {
    const color = ledColorById(b.colorId);
    return el('div', { class: 'result' }, [
      el('span', {
        class: 'ledrow__swatch',
        style: { background: color ? color.hex : 'var(--border-strong)' },
        'aria-hidden': 'true',
      }),
      el('span', { text: `LED ${i + 1} · ${formatVolts(b.vf)}` }),
      el('b', {
        style: { marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' },
        text: `${formatOhms(b.chosenR)} · ${formatAmps(b.actualIfA, 3)}`,
      }),
    ]);
  }));
}

function resultSection(state) {
  const s = solve(state);
  const runtime = runtimeFor(state);
  const pack = packFor(state);

  if (!s.ok) {
    return section({
      id: 'led-results',
      title: 'Result',
      summary: 'no solution',
      children: [el('p', { class: 'muted', text: s.error })],
    });
  }

  const rows = [];
  if (s.uniformResistor) {
    rows.push(resultRow('Resistor', `${formatOhms(s.chosenR)} × ${s.resistorCount}`));
    rows.push(resultRow('Ideal value', formatOhms(s.idealR)));
  }
  rows.push(resultRow('Across resistor', formatVolts(s.headroomV, 3)));
  rows.push(resultRow('Power per resistor', formatWatts(s.powerR, 3)));
  rows.push(resultRow(
    'Minimum rating',
    s.recommendedRatingW ? formatWatts(s.recommendedRatingW) : 'above 5 W — rethink the design',
  ));
  rows.push(resultRow('Supply current', formatAmps(s.supplyCurrentA, 3)));
  rows.push(resultRow('Total power', formatWatts(s.totalPowerW, 3)));

  return section({
    id: 'led-results',
    title: 'Result',
    summary: s.uniformResistor ? formatOhms(s.chosenR) : `${s.resistorCount} values`,
    info: `The ideal value is snapped to the nearest ${state.prefs.eSeries} preferred value, `
      + 'then every figure below is recomputed from that real part.',
    children: [
      !s.uniformResistor ? el('div', { style: { marginBottom: '10px' } }, [
        el('div', { class: 'field__label', text: 'One resistor per LED' }),
        branchTable(s),
      ]) : null,
      el('div', { class: 'results' }, rows),

      runtime?.ok ? el('div', { style: { marginTop: '12px' } }, [
        el('div', { class: 'field__label' }, [
          'Battery runtime',
          el('span', {
            class: 'muted',
            text: ` · ${Number(pack.usableWh.toPrecision(3))} Wh usable`,
          }),
        ]),
        el('div', { class: 'results' }, [
          resultRow('Expected', runtimeText(runtime)),
          resultRow('Load draw', formatAmps(supplyCurrentAt(s, pack.outputV), 3)),
          pack.regulated
            ? resultRow('From the cell', formatWatts(runtime.batteryPowerW, 3))
            : resultRow('Draw when flat', formatAmps(supplyCurrentAt(s, pack.cutoffV), 3)),
        ]),
        el('div', {
          class: 'field__hint',
          text: pack.regulated
            ? 'A regulated rail holds its voltage, so the load current does not taper and the '
              + 'answer is a single figure worked out in watt-hours. The converter draws more '
              + 'power from the cell than it delivers, which is what the efficiency accounts for.'
            : 'The short figure assumes the draw never drops; the long one assumes it falls '
              + 'steadily as the pack sags. Rated capacity assumes a gentle discharge, so treat '
              + 'both as an estimate rather than a promise.',
        }),
      ]) : null,
    ].filter(Boolean),
    cta: {
      label: s.uniformResistor ? `Add ${formatOhms(s.chosenR)} to bench` : 'Add resistors to bench',
      onClick: () => document.dispatchEvent(new CustomEvent('bench:add')),
    },
  });
}

function sections(state, rerender) {
  const count = state.led.topology === 'single' ? 1 : state.led.leds.length;

  return [
    section({
      id: 'led-topology',
      title: 'Topology',
      summary: TOPOLOGIES.find((t) => t.value === state.led.topology)?.label,
      info: 'LEDs in series share one current and one resistor. LEDs in parallel each need '
        + 'their own resistor, because forward voltage varies part to part.',
      children: [
        chips(TOPOLOGIES, state.led.topology, (v) => { patch({ topology: v }); rerender(); }),
        state.led.topology === 'parallel' ? el('div', { style: { marginTop: '10px' } }, [
          el('div', { class: 'field__label', text: 'Wiring' }),
          chips(WIRINGS, state.led.wiring, (v) => { patch({ wiring: v }); rerender(); }),
        ]) : null,
        state.led.topology !== 'single' ? el('div', { style: { marginTop: '10px' } }, [
          field('How many LEDs', el('input', {
            id: 'led-count',
            class: 'input',
            type: 'number',
            min: '1',
            max: String(MAX_LEDS),
            step: '1',
            value: count,
            on: {
              input: (e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || v < 1) return;
                setLedCount(v);
                rerender({ keepFocus: 'led-count' });
              },
            },
          })),
        ]) : null,
      ].filter(Boolean),
    }),

    ledSection(state, rerender),
    supplySection(state, rerender),
    resultSection(state),
  ];
}

function benchItem(state) {
  const s = solve(state);
  if (!s.ok) return null;

  const primary = s.uniformResistor ? s.chosenR : s.branches[0].chosenR;
  const bands = valueToBands(primary, { bandCount: 4, tolerancePct: 5 });
  const pack = packFor(state);
  const names = ledList(state)
    .map((l) => ledColorById(l.colorId)?.name || `${l.vf} V`);
  const uniqueNames = [...new Set(names)];

  return {
    kind: 'resistor',
    ohms: primary,
    tolerancePct: 5,
    bands: bands.ok ? bands.bands : null,
    label: s.uniformResistor
      ? `${formatOhms(s.chosenR)} × ${s.resistorCount} · ${formatWatts(s.recommendedRatingW || s.powerR)}`
      : s.branches.map((b) => formatOhms(b.chosenR)).join(' + '),
    note: `${pack ? `${pack.cellCount}× ${pack.cell.name}` : formatVolts(supplyVoltage(state))}`
      + ` → ${uniqueNames.join(', ')} @ ${state.led.ifMa} mA`,
  };
}

export const ledTool = {
  id: 'led',
  label: 'LED Resistor',
  shortLabel: 'LED',
  stage,
  readout,
  warnings,
  sections,
  benchItem,
  exportName: (state) => {
    const s = solve(state);
    if (!s.ok) return 'led-resistor';
    const r = s.uniformResistor ? s.chosenR : s.branches[0].chosenR;
    return `led-resistor-${formatOhms(r).replace(/[^\w.]+/g, '')}`;
  },
};
