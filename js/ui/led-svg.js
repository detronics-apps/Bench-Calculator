/**
 * Schematic of the LED circuit being sized: a single LED, a series string, or
 * a parallel group wired either per-branch or behind one shared resistor.
 *
 * Series circuits are drawn as one horizontal loop. Parallel circuits rotate
 * ninety degrees: the branches hang vertically between a top and a bottom
 * rail, with the resistor and LED in each branch drawn the way the current
 * runs through them.
 *
 * The canvas is sized to the circuit rather than fixed, and the circuit is
 * centred within it, so nothing is stranded behind a long dead lead and
 * nothing runs off the edge when the drawing is exported.
 */

import { svg } from './dom.js';
import { formatOhms, formatAmps, formatVolts, formatWatts } from '../units.js';

const WIRE = { stroke: 'var(--text-dim)', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' };
const INK = 'var(--text)';
const DIM = 'var(--text-dim)';

/** Widest the drawing is allowed to get before it starts compressing. */
const MAX_WIDTH = 900;
const MIN_WIDTH = 380;
/** Rough width of one character at font-size 11, for sizing the caption line. */
const CHAR_W = 5.6;

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

/**
 * Battery symbol on a vertical rail, drawn around (x, y).
 *
 * Only the "+" and the voltage sit to the left, and both are short. The pack's
 * name goes in the caption instead - hung off the side it would run past the
 * left edge of the canvas and be cut off on export.
 */
function supplySymbol(group, x, y, volts) {
  const plates = [[-16, 14], [-8, 7], [0, 14], [8, 7]];
  for (const [dy, half] of plates) {
    group.appendChild(line(x - half, y + dy, x + half, y + dy));
  }
  group.appendChild(line(x, y - 34, x, y - 16));
  group.appendChild(line(x, y + 8, x, y + 34));
  group.appendChild(label(x - 20, y - 12, '+', { anchor: 'end', size: 13, fill: INK, weight: 700 }));
  group.appendChild(label(x - 20, y + 26, formatVolts(volts), { anchor: 'end', fill: INK, weight: 600 }));
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
  return { ledTop, railBottom, height: railBottom + 56 };
}

/** How wide the caption needs the canvas to be. */
const captionWidth = (text) => (text ? text.length * CHAR_W + 48 : 0);

/**
 * Wrap the drawing in a group and shift it right, so a circuit narrower than
 * its caption still sits in the middle rather than hugging the left edge.
 */
function centred(group, drawnWidth, width) {
  const dx = Math.max(0, (width - drawnWidth) / 2);
  if (dx > 0.5) group.setAttribute('transform', `translate(${dx.toFixed(1)}, 0)`);
  return group;
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
      ? `${pack.product.name} — ${pack.output.name.split(' — ')[0]}`
      : `${pack.cellCount} × ${pack.cell.name}`)
    : null;

  if (!solution?.ok) {
    const root = svg('svg', {
      viewBox: '0 0 640 200', role: 'img', xmlns: 'http://www.w3.org/2000/svg',
      'aria-label': 'LED circuit could not be solved',
    });
    root.appendChild(label(320, 100, solution?.error || 'Enter the supply and LED details.', {
      size: 15, fill: 'var(--danger)', weight: 600,
    }));
    return root;
  }

  return solution.topology === 'parallel'
    ? parallelCircuit(solution, { supplyV, hexAt, packLabel })
    : seriesCircuit(solution, { supplyV, hexAt, packLabel });
}

/* --------------------------------------------- one LED, or a series string */

function seriesCircuit(solution, { supplyV, hexAt, packLabel }) {
  const y = 96;
  const left = 90;
  const rText = formatOhms(solution.chosenR ?? solution.branches[0].chosenR);
  const iText = formatAmps(Math.max(...solution.perLedCurrents), 3);
  const count = solution.ledCount;
  const shown = Math.min(count, 5);

  const caption = [
    packLabel,
    count > 1
      ? `${count} LEDs in series — ${formatVolts(solution.ledVoltage)} of forward drop, `
        + `${formatVolts(solution.headroomV)} across the resistor`
      : null,
  ].filter(Boolean).join('  ·  ');

  const art = svg('g', {});

  supplySymbol(art, left, y + 46, supplyV);
  art.appendChild(line(left, y + 12, left, y));
  art.appendChild(line(left, y, left + 30, y));

  let x = left + 30;
  x += resistorSymbol(art, x, y, rText, formatWatts(solution.powerR, 3));

  for (let i = 0; i < shown; i += 1) {
    art.appendChild(line(x, y, x + 12, y));
    x += 12;
    x += ledSymbol(art, x, y, hexAt(i), i === 0 ? iText : null);
  }
  if (count > shown) {
    art.appendChild(label(x + 24, y - 6, `+${count - shown} more`, { size: 10 }));
    x += 52;
  }

  const right = x + 40;
  art.appendChild(line(x, y, right, y));
  art.appendChild(line(right, y, right, y + 92));
  art.appendChild(line(right, y + 92, left, y + 92));
  art.appendChild(line(left, y + 80, left, y + 92));

  const drawnWidth = right + 24;
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(drawnWidth, captionWidth(caption))));
  const height = 236;

  const root = svg('svg', {
    viewBox: `0 0 ${Math.round(width)} ${height}`,
    role: 'img',
    'aria-label': caption || `One LED with a ${rText} series resistor`,
    xmlns: 'http://www.w3.org/2000/svg',
  });
  root.appendChild(centred(art, drawnWidth, width));
  if (caption) root.appendChild(label(width / 2, y + 124, caption, { size: 11 }));
  return root;
}

/* ------------------------------------------------------ parallel branches */

function parallelCircuit(solution, { supplyV, hexAt, packLabel }) {
  const shared = solution.wiring === 'shared';
  const branches = Math.min(solution.ledCount, 6);
  const { ledTop, railBottom, height } = parallelGeometry(shared);

  const rText = formatOhms(solution.chosenR ?? solution.branches[0].chosenR);
  const iText = formatAmps(Math.max(...solution.perLedCurrents), 3);

  const railLeft = 78;
  const branchAreaLeft = railLeft + (shared ? 176 : 120);
  const rightPad = 70;

  // Derive the spacing from the width budget rather than the other way round,
  // so six branches compress instead of pushing the canvas off the screen.
  const budget = MAX_WIDTH - branchAreaLeft - rightPad;
  const step = branches > 1 ? Math.min(MAX_BRANCH_STEP, budget / (branches - 1)) : 0;
  const lastBranchX = branchAreaLeft + step * (branches - 1);
  const railRight = lastBranchX + 46;

  const summary = shared
    ? `${solution.ledCount} LEDs sharing one ${rText} resistor — `
      + `${formatAmps(solution.supplyCurrentA, 3)} total`
    : solution.uniformResistor
      ? `${solution.resistorCount} × ${rText}, one per LED — ${iText} each, `
        + `${formatAmps(solution.supplyCurrentA, 3)} from the supply`
      : `${solution.resistorCount} resistors, one sized per LED — `
        + `${formatAmps(solution.supplyCurrentA, 3)} from the supply`;
  const caption = [packLabel, summary].filter(Boolean).join('  ·  ');

  const art = svg('g', {});
  const midY = (RAIL_TOP + railBottom) / 2;

  supplySymbol(art, railLeft, midY, supplyV);
  art.appendChild(line(railLeft, RAIL_TOP, railLeft, midY - 34));
  art.appendChild(line(railLeft, midY + 34, railLeft, railBottom));
  art.appendChild(line(railLeft, railBottom, railRight, railBottom));

  if (shared) {
    const resX = railLeft + 60;
    art.appendChild(line(railLeft, RAIL_TOP, resX, RAIL_TOP));
    resistorSymbol(art, resX, RAIL_TOP, rText, null);
    art.appendChild(label(resX + 30, RAIL_TOP - 34, `${formatWatts(solution.powerR, 3)} total`, { size: 10 }));
    art.appendChild(line(resX + 60, RAIL_TOP, railRight, RAIL_TOP));
  } else {
    art.appendChild(line(railLeft, RAIL_TOP, railRight, RAIL_TOP));
  }

  for (let i = 0; i < branches; i += 1) {
    const bx = branchAreaLeft + i * step;
    const branch = shared ? solution.branches[0] : solution.branches[i];

    let y = RAIL_TOP;
    art.appendChild(line(bx, y, bx, y + BRANCH_GAP));
    y += BRANCH_GAP;

    if (!shared) {
      resistorSymbolV(art, bx, y, formatOhms(branch.chosenR));
      y += RESISTOR_V_H;
      art.appendChild(line(bx, y, bx, y + RESISTOR_GAP));
      y += RESISTOR_GAP;
    }

    ledSymbolV(art, bx, ledTop, hexAt(i),
      shared ? (i === 0 ? iText : null) : formatAmps(branch.actualIfA, 3));
    art.appendChild(line(bx, ledTop + LED_V_H, bx, railBottom));

    art.appendChild(dot(bx, RAIL_TOP));
    art.appendChild(dot(bx, railBottom));
    art.appendChild(label(bx, RAIL_TOP - 12, `${i + 1}`, { size: 11, fill: INK, weight: 600 }));
  }

  if (solution.ledCount > branches) {
    art.appendChild(label(lastBranchX + 46, midY, `+${solution.ledCount - branches}`,
      { size: 11, weight: 600 }));
  }

  const drawnWidth = railRight + 24;
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(drawnWidth, captionWidth(caption))));

  const root = svg('svg', {
    viewBox: `0 0 ${Math.round(width)} ${height}`,
    role: 'img',
    'aria-label': caption,
    xmlns: 'http://www.w3.org/2000/svg',
  });
  root.appendChild(centred(art, drawnWidth, width));
  root.appendChild(label(width / 2, railBottom + 34, caption, { size: 11 }));
  return root;
}
