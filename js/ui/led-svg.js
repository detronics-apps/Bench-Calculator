/**
 * Schematic of the LED circuit being sized: a single LED, a series string, or
 * a parallel group wired either per-branch or behind one shared resistor.
 *
 * Series circuits are drawn as one horizontal loop. Parallel circuits rotate
 * ninety degrees: the branches hang vertically between a top and a bottom
 * rail, with the resistor and LED in each branch drawn the way the current
 * runs through them.
 */

import { svg } from './dom.js';
import { formatOhms, formatAmps, formatVolts, formatWatts } from '../units.js';

const W = 760;
const WIRE = { stroke: 'var(--text-dim)', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' };
const INK = 'var(--text)';
const DIM = 'var(--text-dim)';

const line = (x1, y1, x2, y2) => svg('line', { x1, y1, x2, y2, ...WIRE });
const path = (d) => svg('path', { d, ...WIRE });
const dot = (cx, cy) => svg('circle', { cx, cy, r: 3.5, fill: 'var(--text-dim)' });

/**
 * The pair of arrows that make a diode an LED. Both point away from the
 * junction, up and to the right; the barbs trail back from the tip, so the
 * head reads as pointing outwards rather than into the device.
 *
 * The two arrows are offset along (1, 1), which is perpendicular to their
 * (1, -1) direction, so they sit parallel and side by side.
 *
 * @param {number} x  base of the first arrow's shaft
 * @param {number} y  base of the first arrow's shaft
 */
function emissionArrows(group, x, y) {
  for (const offset of [0, 10]) {
    const x0 = x + offset;
    const y0 = y + offset;
    const tipX = x0 + 11;
    const tipY = y0 - 11;
    group.appendChild(path(`M ${x0} ${y0} L ${tipX} ${tipY}`));
    group.appendChild(path(`M ${tipX - 2} ${tipY + 6} L ${tipX} ${tipY} L ${tipX - 6} ${tipY + 2}`));
  }
}

const label = (x, y, text, opts = {}) => svg('text', {
  x, y, 'text-anchor': opts.anchor || 'middle',
  'font-size': opts.size || 11,
  'font-weight': opts.weight || 400,
  fill: opts.fill || DIM,
}, [text]);

/* ------------------------------------------------------- horizontal parts */

/** IEC rectangular resistor, 60 wide, centred on (x, y). Returns its width. */
function resistorSymbol(group, x, y, textAbove, textBelow) {
  group.appendChild(line(x, y, x + 8, y));
  group.appendChild(svg('rect', {
    x: x + 8, y: y - 12, width: 44, height: 24, rx: 2,
    fill: 'var(--panel)', stroke: 'var(--text-dim)', 'stroke-width': 2,
  }));
  group.appendChild(line(x + 52, y, x + 60, y));
  if (textAbove) group.appendChild(label(x + 30, y - 20, textAbove, { fill: INK, weight: 600 }));
  if (textBelow) group.appendChild(label(x + 30, y + 30, textBelow));
  return 60;
}

/** LED pointing right (anode on the left), 54 wide, centred on (x, y). */
function ledSymbol(group, x, y, hex, text) {
  group.appendChild(line(x, y, x + 12, y));
  group.appendChild(svg('polygon', {
    points: `${x + 12},${y - 13} ${x + 12},${y + 13} ${x + 36},${y}`,
    fill: hex, stroke: 'var(--text-dim)', 'stroke-width': 1.5,
  }));
  group.appendChild(line(x + 36, y - 13, x + 36, y + 13));
  group.appendChild(line(x + 36, y, x + 54, y));
  emissionArrows(group, x + 14, y - 22);
  if (text) group.appendChild(label(x + 27, y + 30, text));
  return 54;
}

/* --------------------------------------------------------- vertical parts */

const RESISTOR_V_H = 60;
const LED_V_H = 54;

/** IEC rectangular resistor drawn vertically, 60 tall, top edge at (x, y). */
function resistorSymbolV(group, x, y, textRight) {
  group.appendChild(line(x, y, x, y + 8));
  group.appendChild(svg('rect', {
    x: x - 12, y: y + 8, width: 24, height: 44, rx: 2,
    fill: 'var(--panel)', stroke: 'var(--text-dim)', 'stroke-width': 2,
  }));
  group.appendChild(line(x, y + 52, x, y + RESISTOR_V_H));
  if (textRight) {
    group.appendChild(label(x + 19, y + 34, textRight, { anchor: 'start', fill: INK, weight: 600, size: 10.5 }));
  }
  return RESISTOR_V_H;
}

/** LED pointing down (anode at the top), 54 tall, top edge at (x, y). */
function ledSymbolV(group, x, y, hex, text) {
  group.appendChild(line(x, y, x, y + 12));
  group.appendChild(svg('polygon', {
    points: `${x - 13},${y + 12} ${x + 13},${y + 12} ${x},${y + 36}`,
    fill: hex, stroke: 'var(--text-dim)', 'stroke-width': 1.5,
  }));
  group.appendChild(line(x - 13, y + 36, x + 13, y + 36));
  group.appendChild(line(x, y + 36, x, y + LED_V_H));
  emissionArrows(group, x + 15, y + 28);
  if (text) group.appendChild(label(x + 19, y + 50, text, { anchor: 'start', size: 10.5 }));
  return LED_V_H;
}

/** Battery symbol on a vertical rail, drawn around (x, y). */
function supplySymbol(group, x, y, volts, packLabel) {
  const plates = [[-16, 14], [-8, 7], [0, 14], [8, 7]];
  for (const [dy, half] of plates) {
    group.appendChild(line(x - half, y + dy, x + half, y + dy));
  }
  group.appendChild(line(x, y - 34, x, y - 16));
  group.appendChild(line(x, y + 8, x, y + 34));
  group.appendChild(label(x - 22, y - 12, '+', { anchor: 'end', size: 13, fill: INK, weight: 700 }));
  group.appendChild(label(x - 22, y + 26, formatVolts(volts), { anchor: 'end', fill: INK, weight: 600 }));
  if (packLabel) group.appendChild(label(x - 22, y + 41, packLabel, { anchor: 'end', size: 10 }));
}

/* ------------------------------------------------------------------ draw */

const RAIL_TOP = 66;
const BRANCH_GAP = 22;
const RESISTOR_GAP = 12;
const MAX_BRANCH_STEP = 150;

/** Vertical geometry of the parallel layout - needed before the viewBox is set. */
function parallelGeometry(shared) {
  const ledTop = RAIL_TOP + BRANCH_GAP + (shared ? 0 : RESISTOR_V_H + RESISTOR_GAP);
  const railBottom = ledTop + LED_V_H + BRANCH_GAP;
  return { ledTop, railBottom, height: railBottom + 50 };
}

/**
 * @param {object} solution the result of `solveLed`
 * @param {object} inputs   { supplyV, pack, leds: [{ hex, vf }] }
 */
export function renderLedCircuit(solution, inputs = {}) {
  const { supplyV = 0, pack = null, leds = [] } = inputs;
  const hexAt = (i) => leds[i]?.hex || '#e02020';
  const packLabel = pack
    ? (pack.product
      ? `${pack.product.name} · ${pack.output.name.split(' — ')[0]}`
      : `${pack.cellCount} × ${pack.cell.name}`)
    : null;
  const parallel = solution?.ok && solution.topology === 'parallel';
  const shared = parallel && solution.wiring === 'shared';
  const branches = parallel ? Math.min(solution.ledCount, 6) : 1;
  const geo = parallelGeometry(shared);
  const height = parallel ? geo.height : 240;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${height}`,
    role: 'img',
    'aria-label': 'LED circuit schematic',
    xmlns: 'http://www.w3.org/2000/svg',
  });

  if (!solution?.ok) {
    root.appendChild(label(W / 2, height / 2, solution?.error || 'Enter the supply and LED details.', {
      size: 15, fill: 'var(--danger)', weight: 600,
    }));
    return root;
  }

  const rText = formatOhms(solution.chosenR ?? solution.branches[0].chosenR);
  const iText = formatAmps(Math.max(...solution.perLedCurrents), 3);

  /* ------------------------------------------- one LED, or a series string */

  if (!parallel) {
    const y = 96;
    const left = 90;
    const right = W - 60;

    supplySymbol(root, left, y + 46, supplyV, packLabel);
    root.appendChild(line(left, y + 12, left, y));
    root.appendChild(line(left, y, left + 30, y));

    let x = left + 30;
    x += resistorSymbol(root, x, y, rText, formatWatts(solution.powerR, 3));

    const count = solution.ledCount;
    const shown = Math.min(count, 5);
    for (let i = 0; i < shown; i += 1) {
      root.appendChild(line(x, y, x + 12, y));
      x += 12;
      x += ledSymbol(root, x, y, hexAt(i), i === 0 ? iText : null);
    }
    if (count > shown) {
      root.appendChild(label(x + 20, y - 6, `+${count - shown} more`, { size: 10 }));
      x += 46;
    }

    root.appendChild(line(x, y, right, y));
    root.appendChild(line(right, y, right, y + 92));
    root.appendChild(line(right, y + 92, left, y + 92));
    root.appendChild(line(left, y + 80, left, y + 92));

    if (count > 1) {
      root.appendChild(label((left + right) / 2, y + 116,
        `${count} LEDs in series - ${formatVolts(solution.ledVoltage)} of forward drop, `
        + `${formatVolts(solution.headroomV)} across the resistor`, { size: 11 }));
    }
    return root;
  }

  /* ------------------------------------------------------ parallel branches */

  const { ledTop, railBottom } = geo;
  const railLeft = 78;
  const railRight = W - 56;
  const midY = (RAIL_TOP + railBottom) / 2;

  // Supply, sitting on the left-hand rail.
  supplySymbol(root, railLeft, midY, supplyV, packLabel);
  root.appendChild(line(railLeft, RAIL_TOP, railLeft, midY - 34));
  root.appendChild(line(railLeft, midY + 34, railLeft, railBottom));

  // The return rail runs unbroken along the bottom.
  root.appendChild(line(railLeft, railBottom, railRight, railBottom));

  // The supply rail is broken only to seat a shared resistor.
  let branchAreaLeft = railLeft + 120;
  if (shared) {
    const resX = railLeft + 52;
    root.appendChild(line(railLeft, RAIL_TOP, resX, RAIL_TOP));
    resistorSymbol(root, resX, RAIL_TOP, rText, null);
    root.appendChild(label(resX + 30, RAIL_TOP - 34, `${formatWatts(solution.powerR, 3)} total`, { size: 10 }));
    root.appendChild(line(resX + 60, RAIL_TOP, railRight, RAIL_TOP));
    branchAreaLeft = resX + 110;
  } else {
    root.appendChild(line(railLeft, RAIL_TOP, railRight, RAIL_TOP));
  }

  // Spread the branches out, but only up to a comfortable spacing - two
  // branches flung to opposite ends of the rail read as a much bigger circuit
  // than it is. Whatever the count, the group sits centred in the area.
  const branchAreaRight = railRight - 46;
  const available = branchAreaRight - branchAreaLeft;
  const step = branches > 1 ? Math.min(MAX_BRANCH_STEP, available / (branches - 1)) : 0;
  const startX = branchAreaLeft + (available - step * (branches - 1)) / 2;

  for (let i = 0; i < branches; i += 1) {
    const bx = startX + i * step;

    let y = RAIL_TOP;
    root.appendChild(line(bx, y, bx, y + BRANCH_GAP));
    y += BRANCH_GAP;

    const branch = shared ? solution.branches[0] : solution.branches[i];
    if (!shared) {
      resistorSymbolV(root, bx, y, formatOhms(branch.chosenR));
      y += RESISTOR_V_H;
      root.appendChild(line(bx, y, bx, y + RESISTOR_GAP));
      y += RESISTOR_GAP;
    }

    ledSymbolV(root, bx, ledTop, hexAt(i),
      shared ? (i === 0 ? iText : null) : formatAmps(branch.actualIfA, 3));
    y = ledTop + LED_V_H;
    root.appendChild(line(bx, y, bx, railBottom));

    root.appendChild(dot(bx, RAIL_TOP));
    root.appendChild(dot(bx, railBottom));
    root.appendChild(label(bx, RAIL_TOP - 12, `${i + 1}`, { size: 11, fill: INK, weight: 600 }));
  }

  if (solution.ledCount > branches) {
    root.appendChild(label(startX + step * (branches - 1) + 46, midY,
      `+${solution.ledCount - branches}`, { size: 11, weight: 600 }));
  }

  const parallelSummary = shared
    ? `${solution.ledCount} LEDs sharing one ${rText} resistor - `
      + `${formatAmps(solution.supplyCurrentA, 3)} total`
    : solution.uniformResistor
      ? `${solution.resistorCount} x ${rText}, one per LED - ${iText} each, `
        + `${formatAmps(solution.supplyCurrentA, 3)} from the supply`
      : `${solution.resistorCount} resistors, one sized per LED - `
        + `${formatAmps(solution.supplyCurrentA, 3)} from the supply`;
  root.appendChild(label(W / 2, railBottom + 32, parallelSummary, { size: 11 }));

  return root;
}
