/**
 * IEC 60063 preferred-value (E-series) tables and lookups.
 * Pure module: no DOM, importable in Node.
 *
 * Base values are held as three-significant-figure integers (100..999) so the
 * tables are exact; `seriesValues` scales them into real decades on demand.
 */

/** E24 and its nested subsets have a different rounding lineage to E48+. */
const E24 = [
  100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300,
  330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910,
];

/** E192, the full three-digit set. E96 is every 2nd entry, E48 every 4th. */
const E192 = [
  100, 101, 102, 104, 105, 106, 107, 109, 110, 111, 113, 114, 115, 117, 118, 120,
  121, 123, 124, 126, 127, 129, 130, 132, 133, 135, 137, 138, 140, 142, 143, 145,
  147, 149, 150, 152, 154, 156, 158, 160, 162, 164, 165, 167, 169, 172, 174, 176,
  178, 180, 182, 184, 187, 189, 191, 193, 196, 198, 200, 203, 205, 208, 210, 213,
  215, 218, 221, 223, 226, 229, 232, 234, 237, 240, 243, 246, 249, 252, 255, 258,
  261, 264, 267, 271, 274, 277, 280, 284, 287, 291, 294, 298, 301, 305, 309, 312,
  316, 320, 324, 328, 332, 336, 340, 344, 348, 352, 357, 361, 365, 370, 374, 379,
  383, 388, 392, 397, 402, 407, 412, 417, 422, 427, 432, 437, 442, 448, 453, 459,
  464, 470, 475, 481, 487, 493, 499, 505, 511, 517, 523, 530, 536, 542, 549, 556,
  562, 569, 576, 583, 590, 597, 604, 612, 619, 626, 634, 642, 649, 657, 665, 673,
  681, 690, 698, 706, 715, 723, 732, 741, 750, 759, 768, 777, 787, 796, 806, 816,
  825, 835, 845, 856, 866, 876, 887, 898, 909, 920, 931, 942, 953, 965, 976, 988,
];

const everyNth = (arr, n) => arr.filter((_, i) => i % n === 0);

const SERIES = {
  E6: everyNth(E24, 4),
  E12: everyNth(E24, 2),
  E24,
  E48: everyNth(E192, 4),
  E96: everyNth(E192, 2),
  E192,
};

export const SERIES_NAMES = ['E6', 'E12', 'E24', 'E48', 'E96', 'E192'];

/** Nominal tolerance each series is intended to support, for UI hints. */
export const SERIES_TOLERANCE = {
  E6: 20, E12: 10, E24: 5, E48: 2, E96: 1, E192: 0.5,
};

/**
 * The base table for a series: 48 integers in 100..999.
 * @returns {number[]} a defensive copy
 */
export function seriesBase(name) {
  const t = SERIES[name];
  if (!t) throw new Error(`Unknown E-series: ${name}`);
  return t.slice();
}

/** Round away binary floating-point noise from decade scaling. */
const tidy = (n) => Number(n.toPrecision(10));

/**
 * Every series member in [min, max], inclusive, across all decades.
 * @param {string} name  e.g. 'E24'
 * @param {number} min   must be > 0
 * @param {number} max
 */
export function seriesValues(name, min, max) {
  const base = seriesBase(name);
  if (!(min > 0) || !(max >= min)) return [];

  const out = [];
  const startDecade = Math.floor(Math.log10(min)) - 1;
  const endDecade = Math.ceil(Math.log10(max));

  for (let d = startDecade; d <= endDecade; d += 1) {
    for (const b of base) {
      const v = tidy((b / 100) * Math.pow(10, d));
      if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(v);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Signed deviation of `actual` from `target`, as a percentage of `target`. */
export function deviationPct(actual, target) {
  if (!target) return 0;
  return tidy(((actual - target) / target) * 100);
}

/**
 * Snap a value to the nearest member of a series.
 * @returns {{value:number, exact:boolean, deviationPct:number}|null}
 *          null if `value` is not a positive finite number
 */
export function nearestE(value, name = 'E24') {
  if (!Number.isFinite(value) || value <= 0) return null;
  const base = seriesBase(name);

  // Search the decade the value sits in, plus its neighbours, so that
  // candidates on the far side of a decade boundary are still considered.
  const decade = Math.floor(Math.log10(value));
  let best = null;
  for (let d = decade - 1; d <= decade + 1; d += 1) {
    for (const b of base) {
      const cand = tidy((b / 100) * Math.pow(10, d));
      const dist = Math.abs(cand - value);
      if (best === null || dist < best.dist) best = { value: cand, dist };
    }
  }

  const dev = deviationPct(best.value, value);
  return {
    value: best.value,
    exact: Math.abs(dev) < 1e-6,
    deviationPct: Math.abs(dev) < 1e-6 ? 0 : dev,
  };
}

/** True if `value` is itself a member of the series (to within rounding). */
export function isEValue(value, name = 'E24') {
  const n = nearestE(value, name);
  return n !== null && n.exact;
}
