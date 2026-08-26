/**
 * Battery cells, packs built from them, complete pack products, and how long
 * any of it lasts.
 * Pure module: no DOM, importable in Node.
 *
 * Cell figures are typical for the type at a modest discharge rate. Real
 * capacity depends heavily on how hard you draw and how cold it is, which is
 * why runtime is reported as a range wherever the load can taper.
 */

/**
 * `cutoffV` is the point where the cell is considered flat - below it there is
 * little useful energy left, and most equipment stops. `maxCurrentMa` is a
 * practical continuous draw, not a pulse rating.
 */
export const CELLS = [
  {
    id: 'aa-alkaline', name: 'AA alkaline', chemistry: 'Alkaline',
    nominalV: 1.5, cutoffV: 0.9, capacityMah: 2500, maxCurrentMa: 500,
  },
  {
    id: 'aaa-alkaline', name: 'AAA alkaline', chemistry: 'Alkaline',
    nominalV: 1.5, cutoffV: 0.9, capacityMah: 1000, maxCurrentMa: 300,
  },
  {
    id: 'aa-nimh', name: 'AA NiMH rechargeable', chemistry: 'NiMH',
    nominalV: 1.2, cutoffV: 1.0, capacityMah: 2000, maxCurrentMa: 2000,
  },
  {
    id: 'aaa-nimh', name: 'AAA NiMH rechargeable', chemistry: 'NiMH',
    nominalV: 1.2, cutoffV: 1.0, capacityMah: 800, maxCurrentMa: 800,
  },
  {
    id: 'pp3-alkaline', name: '9 V alkaline (PP3)', chemistry: 'Alkaline',
    nominalV: 9.0, cutoffV: 5.4, capacityMah: 550, maxCurrentMa: 50,
  },
  {
    id: '18650', name: 'Generic 18650 Li-ion', chemistry: 'Li-ion',
    nominalV: 3.7, cutoffV: 3.0, capacityMah: 3000, maxCurrentMa: 3000,
  },
  {
    // Manufacturer specification: 3.60 V nominal, not the generic 3.7 V.
    // 3.0 Ah at 3.6 V is 10.8 Wh per cell.
    id: 'lg-hg2', name: 'LG INR18650-HG2', chemistry: 'Li-ion (INR)',
    nominalV: 3.6, cutoffV: 2.5, maxChargeV: 4.2, capacityMah: 3000,
    maxCurrentMa: 20000, internalResistanceMohm: 24,
  },
  {
    id: 'lipo-1s', name: 'LiPo pouch (1S)', chemistry: 'LiPo',
    nominalV: 3.7, cutoffV: 3.0, capacityMah: 1000, maxCurrentMa: 1000,
  },
  {
    id: 'cr2032', name: 'CR2032 coin', chemistry: 'Lithium coin',
    nominalV: 3.0, cutoffV: 2.0, capacityMah: 220, maxCurrentMa: 3,
  },
  {
    id: 'cr2025', name: 'CR2025 coin', chemistry: 'Lithium coin',
    nominalV: 3.0, cutoffV: 2.0, capacityMah: 160, maxCurrentMa: 2,
  },
];

const BY_ID = new Map(CELLS.map((c) => [c.id, c]));

/** @returns {object|null} */
export function cellById(id) {
  return BY_ID.get(id) || null;
}

const tidy = (n) => Number(n.toPrecision(12));
const fail = (error) => ({ ok: false, error });

/**
 * Build a pack from a number of cells in series and in parallel.
 * Series multiplies voltage; parallel multiplies capacity and current.
 *
 * @param {{cellId:string, series?:number, parallel?:number, capacityMah?:number|null}} opts
 *        `capacityMah` overrides the per-cell figure, for the cells you own
 */
export function buildPack(opts = {}) {
  const { cellId, series = 1, parallel = 1, capacityMah = null } = opts;
  const cell = cellById(cellId);
  if (!cell) return fail(`Unknown cell type: ${cellId}.`);
  if (!Number.isInteger(series) || series < 1) return fail('Cells in series must be a whole number, at least one.');
  if (!Number.isInteger(parallel) || parallel < 1) return fail('Cells in parallel must be a whole number, at least one.');

  const perCellMah = Number.isFinite(capacityMah) && capacityMah > 0
    ? capacityMah
    : cell.capacityMah;

  const nominalV = tidy(cell.nominalV * series);
  const packMah = tidy(perCellMah * parallel);
  const energyWh = tidy((packMah / 1000) * nominalV);

  return {
    ok: true,
    cellId,
    cell,
    series,
    parallel,
    cellCount: series * parallel,
    nominalV,
    cutoffV: tidy(cell.cutoffV * series),
    maxChargeV: cell.maxChargeV ? tidy(cell.maxChargeV * series) : null,
    capacityMah: packMah,
    perCellMah,
    maxCurrentMa: tidy(cell.maxCurrentMa * parallel),
    limitName: cell.name,
    // A pack of loose cells has no conversion stage: what it holds is what it
    // gives, at whatever voltage the cells happen to be sitting at.
    outputV: nominalV,
    regulated: false,
    efficiency: 1,
    energyWh,
    usableWh: energyWh,
  };
}

/* -------------------------------------------------------- pack products */

/**
 * Complete battery products, as opposed to a pile of loose cells. A product
 * fixes its own cell arrangement and protection hardware, and exposes one or
 * more *outputs*.
 *
 * The distinction that matters: a raw output hands you the cell voltage as it
 * sags, while a regulated output holds its voltage steady and draws whatever
 * input current it needs to do so. Those two behave completely differently
 * over a discharge, so runtime is worked out differently for each.
 *
 * The efficiencies here are design-stage estimates, not measurements. Replace
 * them with bench figures once there are real current and voltage readings.
 */
export const PACK_PRODUCTS = [
  {
    id: 'magbot-2s-powerpack',
    name: 'MagBot 2S PowerPack',
    subtitle: '2S1P 18650 High-Power Li-ion Battery Pack',
    cellId: 'lg-hg2',
    series: 2,
    parallel: 1,
    bmsName: 'HX-2S-JH20',
    bmsMaxCurrentA: 10,
    description: 'Two matched LG INR18650-HG2 cells in series: 7.2 V nominal, 8.4 V fully '
      + 'charged, 3000 mAh, about 21.6 Wh. An HX-2S-JH20 BMS provides cell balancing plus '
      + 'overcharge, over-discharge, overcurrent and short-circuit protection, and a P-channel '
      + 'MOSFET adds reverse-polarity protection at the output. Intended as the primary '
      + 'high-power source for the MagBot rover, particularly the motor system.',
    outputs: [
      {
        id: 'raw',
        name: 'Battery OUT — 7.2 V nominal',
        regulated: false,
        efficiency: 0.95,
        note: 'Straight from the cells through the BMS and the reverse-polarity MOSFET. The '
          + '95% figure covers cell internal resistance, both sets of MOSFET losses and the '
          + 'wiring, and it falls as current rises. Voltage follows the cells from 8.4 V down '
          + 'to 5 V, so anything fed from here has to tolerate a moving supply.',
      },
    ],
  },
  {
    id: 'magbot-1s-powerhub',
    name: 'MagBot 1S PowerHub',
    subtitle: '1S 18650 Multi-Output Li-ion Battery & Power Conversion Pack',
    cellId: 'lg-hg2',
    series: 1,
    parallel: 1,
    bmsName: null,
    bmsMaxCurrentA: null,
    description: 'A single 18650 cell with three independent outputs. Raw battery voltage is '
      + 'taken straight off the cell; a Type-C boost converter generates a regulated 5 V rail; '
      + 'and a buck converter hangs off that 5 V rail to produce 3.3 V. The three are not '
      + 'equivalent, because the 3.3 V rail sits downstream of the boost and its losses multiply.',
    architecture: [
      '18650 ─┬─ Battery OUT (4.2 V to 3.0 V)',
      '       └─ Boost → 5 V OUT → Buck → 3.3 V OUT',
    ],
    outputs: [
      {
        id: 'raw',
        name: 'Battery OUT — raw cell',
        regulated: false,
        efficiency: 0.99,
        note: 'Connected directly to the cell, so there is essentially no conversion loss. '
          + 'The voltage falls from about 4.2 V charged to 3.0 V as it discharges.',
      },
      {
        id: '5v',
        name: 'Regulated 5 V',
        regulated: true,
        volts: 5,
        efficiency: 0.88,
        note: 'Cell to boost converter to 5 V. The boost draws more power from the cell than '
          + 'it delivers: a 5 W load pulls about 5.7 W from the battery at 88%. The rail holds '
          + '5 V until the cell reaches its cut-off, then drops out.',
      },
      {
        id: '3v3',
        name: 'Regulated 3.3 V',
        regulated: true,
        volts: 3.3,
        efficiency: 0.82,
        note: 'Cell to boost to 5 V to buck to 3.3 V. Two conversions in series, so the '
          + 'efficiencies multiply: roughly 0.90 x 0.92, about 0.82. Only around 82% of the '
          + 'battery energy reaches a load on this rail.',
      },
    ],
  },
];

const PRODUCT_BY_ID = new Map(PACK_PRODUCTS.map((p) => [p.id, p]));

/** @returns {object|null} */
export function productById(id) {
  return PRODUCT_BY_ID.get(id) || null;
}

/**
 * Build a pack from a named product and one of its outputs.
 *
 * @param {{productId:string, outputId?:string, capacityMah?:number|null}} opts
 *        `outputId` defaults to the product's first output
 */
export function buildProductPack(opts = {}) {
  const { productId, outputId = null, capacityMah = null } = opts;
  const product = productById(productId);
  if (!product) return fail(`Unknown battery product: ${productId}.`);

  const output = outputId
    ? product.outputs.find((o) => o.id === outputId)
    : product.outputs[0];
  if (!output) return fail(`"${outputId}" is not an output of the ${product.name}.`);

  const base = buildPack({
    cellId: product.cellId,
    series: product.series,
    parallel: product.parallel,
    capacityMah,
  });
  if (!base.ok) return base;

  // Whichever limit bites first: the cells, or the protection board.
  const bmsMa = product.bmsMaxCurrentA ? product.bmsMaxCurrentA * 1000 : Infinity;
  const maxCurrentMa = Math.min(base.maxCurrentMa, bmsMa);

  return {
    ...base,
    product,
    output,
    maxCurrentMa,
    limitName: maxCurrentMa === bmsMa
      ? `${product.name} (${product.bmsName || 'protection board'})`
      : base.cell.name,
    outputV: output.regulated ? output.volts : base.nominalV,
    regulated: Boolean(output.regulated),
    efficiency: output.efficiency,
    usableWh: tidy(base.energyWh * output.efficiency),
  };
}

/* --------------------------------------------------------------- runtime */

/**
 * How long the pack lasts.
 *
 * Two cases, and they behave nothing alike:
 *
 * - An unregulated output sags with the cells, so a resistive load draws less
 *   and less as it discharges. The answer is a range: the short bound assumes
 *   the draw never drops, the long one assumes it falls linearly to whatever
 *   it is at the cut-off voltage.
 * - A regulated output holds its voltage, and therefore its load current, until
 *   the converter drops out. There is nothing to taper, so the answer is a
 *   single figure - and it has to be worked out in energy, because the
 *   converter draws more power from the cell than it delivers.
 *
 * @param {object} pack the result of `buildPack` or `buildProductPack`
 * @param {{currentAtNominalA:number, currentAtCutoffA?:number}} load
 *        currents measured at the *output*, not at the cell
 */
export function estimateRuntime(pack, load = {}) {
  const { currentAtNominalA, currentAtCutoffA = 0 } = load;
  if (!pack?.ok) return fail('Choose a battery pack first.');
  if (!Number.isFinite(currentAtNominalA) || currentAtNominalA <= 0) {
    return fail('The circuit draws no current, so there is nothing to estimate.');
  }

  const efficiency = pack.efficiency ?? 1;
  const usableWh = pack.usableWh ?? tidy((pack.capacityMah / 1000) * pack.nominalV * efficiency);
  const outputV = pack.outputV ?? pack.nominalV;

  let shortestHours;
  let longestHours;
  let batteryPowerW;

  if (pack.regulated) {
    const loadW = outputV * currentAtNominalA;
    batteryPowerW = tidy(loadW / efficiency);
    shortestHours = tidy(usableWh / loadW);
    longestHours = shortestHours;
  } else {
    // Conduction losses come off the useful capacity.
    const capacityAh = (pack.capacityMah / 1000) * efficiency;
    const endA = Math.max(0, Number.isFinite(currentAtCutoffA) ? currentAtCutoffA : 0);
    const averageA = (currentAtNominalA + endA) / 2;
    shortestHours = tidy(capacityAh / currentAtNominalA);
    longestHours = tidy(capacityAh / averageA);
    batteryPowerW = tidy((outputV * currentAtNominalA) / efficiency);
  }

  const warnings = [];
  // A regulated rail pulls its input current from the cell, and that is what
  // the protection board actually sees.
  const cellCurrentA = pack.regulated ? batteryPowerW / pack.nominalV : currentAtNominalA;
  const drawMa = cellCurrentA * 1000;

  if (drawMa > pack.maxCurrentMa) {
    warnings.push({
      id: 'pack-current',
      level: 'warn',
      text: `This circuit pulls ${Number(drawMa.toPrecision(3))} mA from the cells, more than `
        + `the ${pack.maxCurrentMa} mA a ${pack.limitName || pack.cell.name} will hold up under. `
        + 'The voltage will sag below its nominal figure as soon as you switch on, so the LEDs '
        + 'will be dimmer than calculated and the runtime shorter. Use a larger cell, more in '
        + 'parallel, or a protection board rated for the load.',
    });
  }

  return {
    ok: true,
    regulated: Boolean(pack.regulated),
    shortestHours,
    longestHours,
    batteryPowerW,
    cellCurrentA: tidy(cellCurrentA),
    usableWh,
    capacityMah: pack.capacityMah,
    warnings,
  };
}

/** A duration in the units a person would actually say it in. */
export function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '—';

  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) {
    const rounded = Number(hours.toPrecision(2));
    return `${rounded} h`;
  }
  if (hours < 24 * 365) {
    const days = Math.floor(hours / 24);
    const rest = Math.round(hours - days * 24);
    return rest ? `${days} d ${rest} h` : `${days} d`;
  }
  return `${Number((hours / (24 * 365)).toPrecision(2))} years`;
}
