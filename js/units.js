/**
 * Engineering-notation formatting and parsing.
 * Pure module: no DOM, importable in Node.
 */

const PREFIXES = [
  { exp: 9, sym: 'G' },
  { exp: 6, sym: 'M' },
  { exp: 3, sym: 'k' },
  { exp: 0, sym: '' },
  { exp: -3, sym: 'm' },
  { exp: -6, sym: 'µ' },
  { exp: -9, sym: 'n' },
  { exp: -12, sym: 'p' },
];

/** Suffix letters accepted on input, mapped to their decade. */
const SUFFIX_EXP = {
  G: 9, g: 9,
  M: 6,
  k: 3, K: 3,
  R: 0, r: 0, E: 0, e: 0, L: 0, H: 0, h: 0,
  m: -3,
  u: -6, U: -6, µ: -6, μ: -6,
  n: -9, N: -9,
  p: -12, P: -12,
};

/**
 * Round to `sig` significant figures, then drop floating-point noise.
 * Without this, 4.7e3 / 1e3 renders as 4.700000000000001.
 */
function tidy(n, sig = 6) {
  if (n === 0) return 0;
  return Number(n.toPrecision(sig));
}

/**
 * Format a value in engineering notation with an SI prefix.
 * @param {number} value
 * @param {string} unit  e.g. 'Ω', 'F', 'W'
 * @param {number} [sig] significant figures to keep
 */
export function formatEng(value, unit = '', sig = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`.trim();

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  let chosen = PREFIXES[PREFIXES.length - 1];
  for (const p of PREFIXES) {
    if (abs >= Math.pow(10, p.exp)) { chosen = p; break; }
  }

  const scaled = tidy(abs / Math.pow(10, chosen.exp), sig);
  // Rounding can push 999.9995 up to 1000; re-scale if so.
  if (scaled >= 1000 && chosen.exp < 9) {
    return formatEng(value, unit, sig - 1 > 0 ? sig : 6);
  }
  return `${sign}${scaled} ${chosen.sym}${unit}`.trim();
}

export const formatOhms = (v, sig) => formatEng(v, 'Ω', sig);
export const formatFarads = (v, sig) => formatEng(v, 'F', sig);
export const formatWatts = (v, sig) => formatEng(v, 'W', sig);
export const formatAmps = (v, sig) => formatEng(v, 'A', sig);
export const formatVolts = (v, sig) => formatEng(v, 'V', sig);

/**
 * Parse a user-entered value. Accepts:
 *   plain      4700, 0.47
 *   suffix     4.7k, 10M, 470m, 22n
 *   infix      4k7, 0R47, 2M2   (letter stands in for the decimal point)
 *   with unit  '4.7 kΩ', '100 uF', '10 uH', '4700 ohm'
 * @returns {number|null} the value, or null if unparseable
 */
export function parseEng(input) {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  if (typeof input !== 'string') return null;

  let s = input.trim();
  if (!s) return null;

  // Strip a trailing spelled-out or symbol unit, leaving any SI prefix behind.
  s = s.replace(/\s*(ohms?|Ω|farads?|henrys?|henries|volts?|amps?|amperes?|watts?)\s*$/i, '');
  s = s.replace(/\s*([FVAWH])\s*$/, '');
  s = s.replace(/\s+/g, '');
  if (!s) return null;

  // Infix: digits, suffix letter, digits  →  4k7
  const infix = s.match(/^(\d+)([GMkKRrEeLHhmuUµμnNpP])(\d+)$/);
  if (infix) {
    const [, whole, letter, frac] = infix;
    const exp = SUFFIX_EXP[letter];
    if (exp === undefined) return null;
    return tidy(Number(`${whole}.${frac}`) * Math.pow(10, exp), 12);
  }

  // Suffix: number then optional letter  →  4.7k
  const suffix = s.match(/^(\d+(?:\.\d+)?)([GMkKRrEeLHhmuUµμnNpP])?$/);
  if (suffix) {
    const [, num, letter] = suffix;
    const exp = letter ? SUFFIX_EXP[letter] : 0;
    if (exp === undefined) return null;
    return tidy(Number(num) * Math.pow(10, exp), 12);
  }

  return null;
}
