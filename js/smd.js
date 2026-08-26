/**
 * Surface-mount resistor marking codes: 3-digit, 4-digit and EIA-96.
 * Pure module: no DOM, importable in Node.
 */

import { seriesBase } from './eseries.js';

export const SMD_TYPES = [
  { id: 'd3', name: '3-digit', hint: 'Two significant figures plus a decade, e.g. 473 = 47 kΩ. R marks a decimal point: 4R7 = 4.7 Ω.' },
  { id: 'd4', name: '4-digit', hint: 'Three significant figures plus a decade, e.g. 4702 = 47 kΩ. Used on 1% parts.' },
  { id: 'eia96', name: 'EIA-96', hint: 'Two digits index the E96 series, a letter gives the decade, e.g. 68D = 4.99 kΩ.' },
];

/** The EIA-96 index table is, by definition, the E96 series - reuse it rather than restating it. */
const E96 = seriesBase('E96');

/**
 * The E96 significant value for an EIA-96 index (1..96), as an integer 100..976.
 * @returns {number|null} null if the index is out of range
 */
export function eia96Index(n) {
  if (!Number.isInteger(n) || n < 1 || n > 96) return null;
  return E96[n - 1];
}

/**
 * EIA-96 multiplier letters. Several decades have two accepted spellings
 * (Y/R, X/S, B/H); both are decoded, and the first is used when encoding.
 */
export const EIA96_MULTIPLIERS = {
  Z: 0.001,
  Y: 0.01, R: 0.01,
  X: 0.1, S: 0.1,
  A: 1,
  B: 10, H: 10,
  C: 100,
  D: 1000,
  E: 10000,
  F: 100000,
};

/** Preferred letter per decade, for encoding. */
const CANONICAL_LETTERS = [
  ['Z', 0.001], ['Y', 0.01], ['X', 0.1], ['A', 1],
  ['B', 10], ['C', 100], ['D', 1000], ['E', 10000], ['F', 100000],
];

const tidy = (n) => Number(n.toPrecision(12));
const fail = (error) => ({ ok: false, error });

/**
 * Guess which marking system a code belongs to.
 * Codes containing R are read as decimal notation, because that convention is
 * far more common than an EIA-96 code that happens to end in R.
 * @returns {'d3'|'d4'|'eia96'|null}
 */
export function detectSmdType(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (code.length === 4) return 'd4';
  if (code.length !== 3) return null;

  const letter = code[2];
  const isEiaLetter = letter !== 'R' && Object.hasOwn(EIA96_MULTIPLIERS, letter);
  if (isEiaLetter && /^\d\d$/.test(code.slice(0, 2))) return 'eia96';
  return 'd3';
}

function decodeDigits(code, sigChars) {
  // Decimal notation: R stands in for the decimal point.
  if (code.includes('R')) {
    const asDecimal = code.replace('R', '.');
    if (!/^\d*\.\d*$/.test(asDecimal) || asDecimal === '.') {
      return fail(`"${code}" is not a valid decimal marking.`);
    }
    return { ok: true, ohms: tidy(Number(asDecimal)) };
  }

  if (!/^\d+$/.test(code)) {
    return fail(`"${code}" must be digits only, or use R as a decimal point.`);
  }
  const digits = Number(code.slice(0, sigChars));
  const decade = Number(code.slice(sigChars));
  return { ok: true, ohms: tidy(digits * Math.pow(10, decade)) };
}

function decodeEia96(code) {
  const index = Number(code.slice(0, 2));
  const letter = code[2];

  const base = eia96Index(index);
  if (base === null) {
    return fail(`"${code.slice(0, 2)}" is not an EIA-96 index - it must be 01 to 96.`);
  }
  const multiplier = EIA96_MULTIPLIERS[letter];
  if (multiplier === undefined) {
    return fail(`"${letter}" is not an EIA-96 multiplier letter.`);
  }
  return { ok: true, ohms: tidy((base / 100) * multiplier) };
}

/**
 * Decode an SMD marking.
 * @param {string} raw   the printed code, e.g. '473', '4R7', '4702', '68D'
 * @param {string} [type] force a marking system; omit to auto-detect
 * @returns {{ok:true, ohms:number, type:string, code:string} | {ok:false, error:string}}
 */
export function decodeSmd(raw, type) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return fail('Enter an SMD marking code.');

  const kind = type || detectSmdType(code);
  if (!kind) return fail(`"${code}" is not a recognised marking length - expected 3 or 4 characters.`);

  let result;
  if (kind === 'eia96') {
    if (code.length !== 3) return fail('An EIA-96 code is exactly three characters, e.g. 68D.');
    result = decodeEia96(code);
  } else if (kind === 'd3') {
    if (code.length !== 3) return fail('A 3-digit code is exactly three characters, e.g. 473.');
    result = decodeDigits(code, 2);
  } else if (kind === 'd4') {
    if (code.length !== 4) return fail('A 4-digit code is exactly four characters, e.g. 4702.');
    result = decodeDigits(code, 3);
  } else {
    return fail(`Unknown marking system: ${kind}.`);
  }

  return result.ok ? { ...result, type: kind, code } : result;
}

/** Encode into decimal (R) notation, padded to `width` characters. */
function encodeDecimal(ohms, width) {
  const digits = width - 1; // one character is spent on the R
  const intPart = Math.floor(ohms);
  const intLen = intPart > 0 ? String(intPart).length : 0;
  const fracLen = digits - intLen;
  if (fracLen < 0) return null;

  const frac = Math.round((ohms - intPart) * Math.pow(10, fracLen));
  const intStr = intPart > 0 ? String(intPart) : '';
  const fracStr = String(frac).padStart(fracLen, '0');
  if (fracStr.length !== fracLen) return null; // rounding overflowed
  return `${intStr}R${fracStr}`;
}

function encodeDigits(ohms, sigChars, width) {
  const exponent = Math.floor(Math.log10(ohms));
  let digits = Math.round(ohms / Math.pow(10, exponent - (sigChars - 1)));
  let decade = exponent - (sigChars - 1);
  if (digits >= Math.pow(10, sigChars)) {
    digits = Math.round(digits / 10);
    decade += 1;
  }
  if (decade < 0 || decade > 9) return null;
  const code = `${digits}${decade}`;
  return code.length === width ? code : null;
}

/**
 * Encode a resistance into an SMD marking.
 * @param {number} ohms
 * @param {'d3'|'d4'|'eia96'} type
 * @returns {{ok:true, code:string, ohms:number, exact:boolean, type:string} |
 *           {ok:false, error:string}}
 */
export function encodeSmd(ohms, type = 'd3') {
  if (!Number.isFinite(ohms) || ohms < 0) return fail('Enter a resistance of zero or more.');

  if (ohms === 0) {
    if (type === 'eia96') return fail('EIA-96 has no code for a zero-ohm jumper.');
    const code = type === 'd4' ? '0000' : '000';
    return { ok: true, code, ohms: 0, exact: true, type };
  }

  if (type === 'eia96') return encodeEia96(ohms);

  const width = type === 'd4' ? 4 : 3;
  const sigChars = type === 'd4' ? 3 : 2;
  // Below the decade where a plain digit code would need a negative exponent,
  // the marking switches to decimal (R) notation.
  const threshold = type === 'd4' ? 100 : 10;

  const code = ohms < threshold
    ? encodeDecimal(ohms, width)
    : encodeDigits(ohms, sigChars, width);

  if (!code) {
    return fail(`${ohms} Ω cannot be written as a ${width}-character ${type === 'd4' ? '4-digit' : '3-digit'} code.`);
  }

  const back = decodeSmd(code, type);
  return {
    ok: true,
    code,
    ohms: back.ok ? back.ohms : ohms,
    exact: back.ok && Math.abs(back.ohms - ohms) < Math.abs(ohms) * 1e-9,
    type,
  };
}

function encodeEia96(ohms) {
  const exponent = Math.floor(Math.log10(ohms));
  let base = Math.round(ohms / Math.pow(10, exponent - 2)); // 100..999
  let decadeExp = exponent - 2;
  if (base >= 1000) { base = Math.round(base / 10); decadeExp += 1; }

  // Snap the significant part to the nearest E96 entry.
  let index = -1;
  let bestDist = Infinity;
  for (let i = 0; i < E96.length; i += 1) {
    const d = Math.abs(E96[i] - base);
    if (d < bestDist) { bestDist = d; index = i; }
  }
  const snapped = E96[index];

  // The letter multiplies the value/100, so factor out that hundred.
  const factor = tidy(Math.pow(10, decadeExp) * 100);
  const entry = CANONICAL_LETTERS.find(([, f]) => Math.abs(f - factor) < factor * 1e-9);
  if (!entry) {
    return fail(`${ohms} Ω is outside the EIA-96 range (9.76 mΩ to 976 kΩ).`);
  }

  const code = `${String(index + 1).padStart(2, '0')}${entry[0]}`;
  const back = decodeSmd(code, 'eia96');
  return {
    ok: true,
    code,
    ohms: back.ohms,
    exact: snapped === base && Math.abs(back.ohms - ohms) < Math.abs(ohms) * 1e-9,
    type: 'eia96',
  };
}
