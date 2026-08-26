/**
 * Draws the component network being combined, in series or in parallel.
 *
 * The viewBox is sized to the network rather than fixed, so a two-component
 * chain is not marooned in the middle of a wide canvas behind long dead leads.
 * The stage caps the drawing at its natural size, so a narrow canvas simply
 * takes up less of the panel rather than being magnified to fill it.
 */

import { svg } from './dom.js';
import { formatEng } from '../units.js';
import { unitFor } from '../combine.js';

const WIRE = { stroke: 'var(--text-dim)', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' };

const BODY_W = 60;
const MAX_WIDTH = 780;
const MIN_WIDTH = 380;
const LEAD = 46;
const MAX_PITCH = 132;
const MAX_SHOWN = 6;

const line = (x1, y1, x2, y2) => svg('line', { x1, y1, x2, y2, ...WIRE });
const terminal = (cx, cy) => svg('circle', { cx, cy, r: 4, fill: 'var(--text-dim)' });

const label = (x, y, text, opts = {}) => svg('text', {
  x, y, 'text-anchor': opts.anchor || 'middle',
  'font-size': opts.size || 11,
  'font-weight': opts.weight || 400,
  fill: opts.fill || 'var(--text-dim)',
}, [text]);

/* -------------------------------------------------------------- symbols */

/** IEC resistor rectangle, 60 wide, left edge at (x, y). */
function resistorBody(group, x, y) {
  group.appendChild(line(x, y, x + 8, y));
  group.appendChild(svg('rect', {
    x: x + 8, y: y - 12, width: 44, height: 24, rx: 2,
    fill: 'var(--panel)', stroke: 'var(--text-dim)', 'stroke-width': 2,
  }));
  group.appendChild(line(x + 52, y, x + BODY_W, y));
}

/** Non-polarised capacitor: two parallel plates, 60 wide, left edge at (x, y). */
function capacitorBody(group, x, y) {
  group.appendChild(line(x, y, x + 24, y));
  group.appendChild(line(x + 24, y - 15, x + 24, y + 15));
  group.appendChild(line(x + 36, y - 15, x + 36, y + 15));
  group.appendChild(line(x + 36, y, x + BODY_W, y));
}

/** Inductor: four half-turns, 60 wide, left edge at (x, y). */
function inductorBody(group, x, y) {
  group.appendChild(line(x, y, x + 8, y));
  const humps = Array.from({ length: 4 }, () => 'a 5.5 5.5 0 0 1 11 0').join(' ');
  group.appendChild(svg('path', { d: `M ${x + 8} ${y} ${humps}`, ...WIRE }));
  group.appendChild(line(x + 52, y, x + BODY_W, y));
}

const BODIES = {
  resistor: resistorBody,
  capacitor: capacitorBody,
  inductor: inductorBody,
};

const drawBody = (group, x, y, kind) => (BODIES[kind] || resistorBody)(group, x, y);

/* ----------------------------------------------------------------- draw */

/**
 * @param {Array<{value:number, tolerancePct?:number}>} components
 * @param {'series'|'parallel'} mode
 * @param {'resistor'|'capacitor'|'inductor'} kind
 * @param {object} result the output of `combine`
 */
export function renderNetwork(components, mode, kind, result) {
  const unit = unitFor(kind);
  const shown = components.slice(0, MAX_SHOWN);
  const isSeries = mode === 'series';
  const noun = shown.length === 1 ? kind : `${kind}s`;

  if (!shown.length) {
    const root = svg('svg', { viewBox: '0 0 400 120', role: 'img', xmlns: 'http://www.w3.org/2000/svg' });
    root.appendChild(label(200, 60, 'Add components to see the network.', { size: 14 }));
    return root;
  }

  const summary = result?.ok
    ? `${components.length} ${components.length === 1 ? kind : `${kind}s`} in ${mode} `
      + `= ${formatEng(result.value, unit)}`
    : null;

  const root = isSeries
    ? seriesNetwork(shown, kind, unit)
    : parallelNetwork(shown, kind, unit);

  const [, , width, height] = root.getAttribute('viewBox').split(' ').map(Number);

  if (components.length > shown.length) {
    root.appendChild(label(width / 2, height - 30,
      `+${components.length - shown.length} more not drawn`, { size: 10 }));
  }
  if (summary) {
    root.appendChild(label(width / 2, height - 10, summary,
      { size: 12, fill: 'var(--text)', weight: 600 }));
  }
  root.setAttribute('aria-label', summary || `${shown.length} ${noun} in ${mode}`);
  return root;
}

function seriesNetwork(shown, kind, unit) {
  // Give each component an equal slot, shrinking the pitch only once the chain
  // would outgrow the canvas. The leads left over at each end stay short.
  const pitch = Math.min(MAX_PITCH, (MAX_WIDTH - LEAD * 2) / shown.length);
  const chain = pitch * shown.length;
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, chain + LEAD * 2));
  const height = 152;
  const y = 66;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`, role: 'img', xmlns: 'http://www.w3.org/2000/svg',
  });

  const startX = (width - chain) / 2;
  const bodyX = (i) => startX + i * pitch + (pitch - BODY_W) / 2;
  const left = 14;
  const right = width - 14;

  // Lead in to the first body, then body-to-body, then out to the terminal.
  root.appendChild(line(left, y, bodyX(0), y));
  shown.forEach((c, i) => {
    const x = bodyX(i);
    if (i > 0) root.appendChild(line(bodyX(i - 1) + BODY_W, y, x, y));
    drawBody(root, x, y, kind);
    root.appendChild(label(x + BODY_W / 2, y - 22, formatEng(c.value, unit),
      { fill: 'var(--text)', weight: 600 }));
    if (c.tolerancePct) {
      root.appendChild(label(x + BODY_W / 2, y + 32, `±${c.tolerancePct}%`, { size: 10 }));
    }
  });
  root.appendChild(line(bodyX(shown.length - 1) + BODY_W, y, right, y));
  root.appendChild(terminal(left, y));
  root.appendChild(terminal(right, y));

  return root;
}

function parallelNetwork(shown, kind, unit) {
  const width = Math.max(MIN_WIDTH, 470);
  const rowStep = 62;
  const top = 46;
  const lastY = top + (shown.length - 1) * rowStep;
  const height = lastY + 74;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`, role: 'img', xmlns: 'http://www.w3.org/2000/svg',
  });

  const left = 84;
  const right = width - 84;
  const nodeX1 = 154;
  const nodeX2 = width - 154;
  const midY = (top + lastY) / 2;

  shown.forEach((c, i) => {
    const y = top + i * rowStep;
    const x = (nodeX1 + nodeX2) / 2 - BODY_W / 2;
    root.appendChild(line(nodeX1, y, x, y));
    drawBody(root, x, y, kind);
    root.appendChild(line(x + BODY_W, y, nodeX2, y));
    root.appendChild(label(x + BODY_W / 2, y - 18, formatEng(c.value, unit),
      { fill: 'var(--text)', weight: 600 }));
    if (c.tolerancePct) {
      root.appendChild(label(nodeX2 + 26, y + 4, `±${c.tolerancePct}%`, { size: 10, anchor: 'start' }));
    }
  });

  // The two bus bars joining every branch, and the leads out to the terminals.
  if (shown.length > 1) {
    root.appendChild(line(nodeX1, top, nodeX1, lastY));
    root.appendChild(line(nodeX2, top, nodeX2, lastY));
    for (let i = 1; i < shown.length - 1; i += 1) {
      const y = top + i * rowStep;
      root.appendChild(svg('circle', { cx: nodeX1, cy: y, r: 3.5, fill: 'var(--text-dim)' }));
      root.appendChild(svg('circle', { cx: nodeX2, cy: y, r: 3.5, fill: 'var(--text-dim)' }));
    }
  }
  root.appendChild(line(left, midY, nodeX1, midY));
  root.appendChild(line(nodeX2, midY, right, midY));
  root.appendChild(terminal(left, midY));
  root.appendChild(terminal(right, midY));

  return root;
}
