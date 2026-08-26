/** Draws an SMD chip resistor with its marking code printed on top. */

import { svg } from './dom.js';

const W = 760;
const H = 250;

/**
 * @param {string} code the marking, e.g. '473' or '68D'
 * @param {{typeName?:string, valid?:boolean, packageName?:string}} opts
 */
export function renderSmdChip(code, opts = {}) {
  const { typeName = '', valid = true, packageName = '0805' } = opts;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `Surface-mount resistor marked ${code || 'blank'}`,
    xmlns: 'http://www.w3.org/2000/svg',
  });

  const bx = 230;
  const by = 62;
  const bw = 300;
  const bh = 126;
  const term = 46;

  // Board pads under the chip.
  for (const px of [bx - 26, bx + bw - term + 26]) {
    root.appendChild(svg('rect', {
      x: px, y: by + 12, width: term, height: bh - 24, rx: 3,
      fill: 'var(--panel-3)', stroke: 'var(--border)', 'stroke-width': 1,
    }));
  }

  // Chip body, with metallised terminations at each end.
  root.appendChild(svg('rect', {
    x: bx, y: by, width: bw, height: bh, rx: 5,
    fill: '#2b3138', stroke: '#11161b', 'stroke-width': 2,
  }));
  for (const px of [bx, bx + bw - term]) {
    root.appendChild(svg('rect', {
      x: px, y: by, width: term, height: bh, rx: 5,
      fill: '#c8ccd0', stroke: '#8f979e', 'stroke-width': 1.5,
    }));
  }
  root.appendChild(svg('rect', {
    x: bx + term + 8, y: by + 10, width: bw - 2 * term - 16, height: 12,
    rx: 6, fill: '#ffffff', opacity: 0.08,
  }));

  root.appendChild(svg('text', {
    x: bx + bw / 2, y: by + bh / 2 + 13,
    'text-anchor': 'middle',
    'font-family': 'ui-monospace, Menlo, Consolas, monospace',
    'font-size': 44, 'font-weight': 700, 'letter-spacing': 4,
    fill: valid ? '#f2f3f5' : '#f08a8a',
  }, [code || '---']));

  root.appendChild(svg('text', {
    x: W / 2, y: by + bh + 34, 'text-anchor': 'middle',
    'font-size': 12, fill: 'var(--text-dim)',
  }, [typeName ? `${typeName} marking on a ${packageName} chip` : `${packageName} chip`]));

  root.appendChild(svg('text', {
    x: W / 2, y: by - 22, 'text-anchor': 'middle',
    'font-size': 11, fill: 'var(--text-faint)',
  }, ['Markings are printed on the dark side; the pale ends are the solder terminations']));

  return root;
}
