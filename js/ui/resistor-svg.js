/**
 * Draws the banded resistor in the viewport.
 *
 * Every band is a focusable, keyboard-operable control, and every band carries
 * a text label underneath: colour is never the only signal.
 */

import { svg } from './dom.js';
import { colorById, bandRoles } from '../bands.js';

const W = 760;
const H = 250;
const MID = 118;

const BODY_X1 = 168;
const BODY_X2 = 592;
const BODY_Y = 72;
const BODY_H = 92;
const BAND_W = 26;

const ROLE_LABEL = {
  digit: 'Digit',
  multiplier: 'Multiplier',
  tolerance: 'Tolerance',
  tempco: 'Temp. coeff.',
};

/** What a band contributes, in a couple of characters. */
function bandMeaning(role, color) {
  switch (role) {
    case 'digit': return String(color.digit);
    case 'multiplier': return `x${color.multiplier >= 1 ? color.multiplier.toLocaleString('en') : color.multiplier}`;
    case 'tolerance': return `±${color.tolerance}%`;
    case 'tempco': return `${color.tempco} ppm`;
    default: return '';
  }
}

/**
 * Where each band sits along the body. Value bands are grouped at the left;
 * the tolerance band is set apart at the right, as it is on a real resistor.
 */
function bandPositions(roles) {
  const valueCount = roles.filter((r) => r === 'digit' || r === 'multiplier').length;
  const hasTol = roles.includes('tolerance');
  const hasTc = roles.includes('tempco');

  const xs = [];
  const startX = BODY_X1 + 32;
  for (let i = 0; i < valueCount; i += 1) xs.push(startX + i * 46);
  if (hasTol) xs.push(BODY_X2 - (hasTc ? 108 : 68));
  if (hasTc) xs.push(BODY_X2 - 62);
  return xs;
}

/**
 * @param {string[]} bands  colour ids
 * @param {object} opts
 * @param {number|null} [opts.selected] index of the band being edited
 * @param {(index:number) => void} [opts.onSelect]
 * @param {boolean} [opts.interactive] false for export and print
 */
export function renderResistor(bands, opts = {}) {
  const { selected = null, onSelect, interactive = true } = opts;
  const roles = bandRoles(bands.length);
  const xs = bandPositions(roles);

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `Resistor with ${bands.length} colour bands`,
    xmlns: 'http://www.w3.org/2000/svg',
  });

  // Leads.
  root.appendChild(svg('line', {
    x1: 16, y1: MID, x2: W - 16, y2: MID,
    stroke: 'var(--border-strong)', 'stroke-width': 7, 'stroke-linecap': 'round',
  }));

  // Body, with darker shoulders so it reads as a cylinder.
  root.appendChild(svg('rect', {
    x: BODY_X1, y: BODY_Y, width: BODY_X2 - BODY_X1, height: BODY_H,
    rx: 26, fill: '#cbb894', stroke: '#9d8b68', 'stroke-width': 1.5,
  }));
  root.appendChild(svg('rect', {
    x: BODY_X1, y: BODY_Y, width: 34, height: BODY_H,
    rx: 17, fill: '#bda884', opacity: 0.85,
  }));
  root.appendChild(svg('rect', {
    x: BODY_X2 - 34, y: BODY_Y, width: 34, height: BODY_H,
    rx: 17, fill: '#bda884', opacity: 0.85,
  }));
  // A soft highlight along the top of the barrel.
  root.appendChild(svg('rect', {
    x: BODY_X1 + 12, y: BODY_Y + 10, width: BODY_X2 - BODY_X1 - 24, height: 14,
    rx: 7, fill: '#ffffff', opacity: 0.22,
  }));

  bands.forEach((id, i) => {
    const color = colorById(id);
    if (!color) return;
    const role = roles[i];
    const x = xs[i];
    const isSelected = selected === i;

    const group = svg('g', {
      class: 'band',
      role: interactive ? 'button' : 'presentation',
      tabindex: interactive ? '0' : null,
      'aria-label': interactive
        ? `Band ${i + 1}, ${ROLE_LABEL[role]}: ${color.name} (${bandMeaning(role, color)}). Select to change.`
        : null,
      'aria-pressed': interactive ? String(isSelected) : null,
      style: interactive ? { cursor: 'pointer' } : null,
    });

    // "None" is the absence of a band, so draw only a dashed placeholder.
    if (id === 'none') {
      group.appendChild(svg('rect', {
        x, y: BODY_Y + 6, width: BAND_W, height: BODY_H - 12,
        fill: 'none', stroke: '#9d8b68', 'stroke-width': 1.5, 'stroke-dasharray': '4 4',
      }));
    } else {
      group.appendChild(svg('rect', {
        x, y: BODY_Y, width: BAND_W, height: BODY_H,
        fill: color.hex, stroke: 'rgba(0,0,0,0.28)', 'stroke-width': 1,
      }));
    }

    if (isSelected) {
      group.appendChild(svg('rect', {
        x: x - 5, y: BODY_Y - 7, width: BAND_W + 10, height: BODY_H + 14,
        rx: 6, fill: 'none', stroke: 'var(--accent-strong)', 'stroke-width': 3,
      }));
    }

    // Label stack: role, colour name, contribution.
    const cx = x + BAND_W / 2;
    group.appendChild(svg('line', {
      x1: cx, y1: BODY_Y + BODY_H + 4, x2: cx, y2: BODY_Y + BODY_H + 14,
      stroke: 'var(--border-strong)', 'stroke-width': 1,
    }));
    group.appendChild(svg('text', {
      x: cx, y: BODY_Y + BODY_H + 28, 'text-anchor': 'middle',
      'font-size': 10, 'font-weight': 700, 'letter-spacing': 0.4,
      fill: 'var(--text-faint)',
    }, [ROLE_LABEL[role].toUpperCase()]));
    group.appendChild(svg('text', {
      x: cx, y: BODY_Y + BODY_H + 43, 'text-anchor': 'middle',
      'font-size': 12, 'font-weight': 600, fill: 'var(--text)',
    }, [color.name]));
    group.appendChild(svg('text', {
      x: cx, y: BODY_Y + BODY_H + 58, 'text-anchor': 'middle',
      'font-size': 11, fill: 'var(--text-dim)',
    }, [bandMeaning(role, color)]));

    if (interactive && onSelect) {
      group.addEventListener('click', () => onSelect(i));
      group.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); }
      });
    }

    root.appendChild(group);
  });

  return root;
}

/** A compact, non-interactive version for bench-list rows and printed labels. */
export function renderResistorMini(bands) {
  const node = renderResistor(bands, { interactive: false });
  node.setAttribute('viewBox', `0 ${BODY_Y - 14} ${W} ${BODY_H + 28}`);
  for (const text of node.querySelectorAll('text')) text.remove();
  for (const line of node.querySelectorAll('.band line')) line.remove();
  return node;
}
