/**
 * Resistor colour-band encoding and decoding (IEC 60062).
 * Pure module: no DOM, importable in Node.
 *
 * A resistor is modelled as an array of colour ids whose length is the band
 * count. `bandRoles(count)` says what each position means.
 */

/**
 * The thirteen band colours. `digit`, `multiplier`, `tolerance` and `tempco`
 * are null where that colour cannot occupy the corresponding role.
 * `hex` and `ink` are here so that the SVG renderer has a single source of
 * truth for band appearance; they carry no arithmetic meaning.
 */
export const COLORS = [
  { id: 'black',  name: 'Black',  hex: '#1a1a1a', ink: '#ffffff', digit: 0,    multiplier: 1,    tolerance: null, tempco: 250 },
  { id: 'brown',  name: 'Brown',  hex: '#7b4a20', ink: '#ffffff', digit: 1,    multiplier: 10,   tolerance: 1,    tempco: 100 },
  { id: 'red',    name: 'Red',    hex: '#cc2229', ink: '#ffffff', digit: 2,    multiplier: 100,  tolerance: 2,    tempco: 50 },
  { id: 'orange', name: 'Orange', hex: '#e8722a', ink: '#1a1a1a', digit: 3,    multiplier: 1e3,  tolerance: 0.05, tempco: 15 },
  { id: 'yellow', name: 'Yellow', hex: '#f2c437', ink: '#1a1a1a', digit: 4,    multiplier: 1e4,  tolerance: 0.02, tempco: 25 },
  { id: 'green',  name: 'Green',  hex: '#2f8f44', ink: '#ffffff', digit: 5,    multiplier: 1e5,  tolerance: 0.5,  tempco: 20 },
  { id: 'blue',   name: 'Blue',   hex: '#2166ac', ink: '#ffffff', digit: 6,    multiplier: 1e6,  tolerance: 0.25, tempco: 10 },
  { id: 'violet', name: 'Violet', hex: '#7b4ea3', ink: '#ffffff', digit: 7,    multiplier: 1e7,  tolerance: 0.1,  tempco: 5 },
  { id: 'grey',   name: 'Grey',   hex: '#8a8f94', ink: '#ffffff', digit: 8,    multiplier: 1e8,  tolerance: 0.01, tempco: 1 },
  { id: 'white',  name: 'White',  hex: '#f2f3f5', ink: '#1a1a1a', digit: 9,    multiplier: 1e9,  tolerance: null, tempco: null },
  { id: 'gold',   name: 'Gold',   hex: '#c9a227', ink: '#1a1a1a', digit: null, multiplier: 0.1,  tolerance: 5,    tempco: null },
  { id: 'silver', name: 'Silver', hex: '#b9bcc0', ink: '#1a1a1a', digit: null, multiplier: 0.01, tolerance: 10,   tempco: null },
  { id: 'none',   name: 'None',   hex: '#d8c9a3', ink: '#1a1a1a', digit: null, multiplier: null, tolerance: 20,   tempco: null },
];

const BY_ID = new Map(COLORS.map((c) => [c.id, c]));

/** @returns {object|null} the colour record, or null if the id is unknown */
export function colorById(id) {
  return BY_ID.get(id) || null;
}

export const BAND_COUNTS = [3, 4, 5, 6];

const ROLES = {
  3: ['digit', 'digit', 'multiplier'],
  4: ['digit', 'digit', 'multiplier', 'tolerance'],
  5: ['digit', 'digit', 'digit', 'multiplier', 'tolerance'],
  6: ['digit', 'digit', 'digit', 'multiplier', 'tolerance', 'tempco'],
};

/** What each band position means, for a given band count. */
export function bandRoles(count) {
  const r = ROLES[count];
  if (!r) throw new Error(`Unsupported band count: ${count}`);
  return r.slice();
}

/** How many significant digits a band count encodes. */
export const sigFigsFor = (count) => (count >= 5 ? 3 : 2);

/**
 * Colours legal in a given role.
 * @param {'digit'|'multiplier'|'tolerance'|'tempco'} role
 * @param {number} [bandIndex] pass 0 for the first digit, which cannot be
 *                             black - a leading zero is not a valid code
 */
export function colorsForRole(role, bandIndex) {
  const key = role === 'digit' ? 'digit' : role;
  let out = COLORS.filter((c) => c[key] !== null && c[key] !== undefined);
  if (role === 'digit' && bandIndex === 0) out = out.filter((c) => c.digit !== 0);
  return out;
}

/** The tolerances expressible at a given band count, ascending. */
export function tolerancesFor(count) {
  if (count === 3) return [20];
  return colorsForRole('tolerance')
    .map((c) => c.tolerance)
    .sort((a, b) => a - b);
}

/** The temperature coefficients expressible by a 6th band, ascending. */
export function tempcosFor() {
  return colorsForRole('tempco')
    .map((c) => c.tempco)
    .sort((a, b) => a - b);
}

/** Strip binary floating-point noise, e.g. 47 * 0.01 -> 0.47 not 0.47000000000000003. */
const tidy = (n) => Number(n.toPrecision(12));

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

/**
 * Decode an array of colour ids into a resistance.
 * @param {string[]} bands  length must be 3, 4, 5 or 6
 * @returns {{ok:true, ohms:number, tolerancePct:number, tempco:number|null,
 *            min:number, max:number} | {ok:false, error:string}}
 */
export function bandsToValue(bands) {
  if (!Array.isArray(bands) || !ROLES[bands.length]) {
    return fail(`A resistor code needs 3, 4, 5 or 6 bands; got ${Array.isArray(bands) ? bands.length : 0}.`);
  }
  const roles = bandRoles(bands.length);

  let digits = '';
  let multiplier = null;
  let tolerancePct = bands.length === 3 ? 20 : null;
  let tempco = null;

  for (let i = 0; i < roles.length; i += 1) {
    const color = colorById(bands[i]);
    if (!color) return fail(`Band ${i + 1} is not a known colour ("${bands[i]}").`);

    switch (roles[i]) {
      case 'digit':
        if (color.digit === null) {
          return fail(`${color.name} cannot be a digit band - it has no digit value.`);
        }
        digits += String(color.digit);
        break;
      case 'multiplier':
        if (color.multiplier === null) {
          return fail(`${color.name} cannot be the multiplier band.`);
        }
        multiplier = color.multiplier;
        break;
      case 'tolerance':
        if (color.tolerance === null) {
          return fail(`${color.name} cannot be the tolerance band.`);
        }
        tolerancePct = color.tolerance;
        break;
      case 'tempco':
        if (color.tempco === null) {
          return fail(`${color.name} cannot be the temperature-coefficient band.`);
        }
        tempco = color.tempco;
        break;
      default:
        break;
    }
  }

  const ohms = tidy(Number(digits) * multiplier);
  return {
    ok: true,
    ohms,
    tolerancePct,
    tempco,
    min: tidy(ohms * (1 - tolerancePct / 100)),
    max: tidy(ohms * (1 + tolerancePct / 100)),
  };
}

const MULTIPLIER_COLORS = colorsForRole('multiplier');
const MIN_MULTIPLIER = Math.min(...MULTIPLIER_COLORS.map((c) => c.multiplier));
const MAX_MULTIPLIER = Math.max(...MULTIPLIER_COLORS.map((c) => c.multiplier));

const colorForMultiplier = (m) =>
  MULTIPLIER_COLORS.find((c) => Math.abs(c.multiplier - m) < Math.abs(m) * 1e-9) || null;

const colorForDigit = (d) => COLORS.find((c) => c.digit === d);
const colorForTolerance = (t) => colorsForRole('tolerance').find((c) => c.tolerance === t) || null;
const colorForTempco = (t) => colorsForRole('tempco').find((c) => c.tempco === t) || null;

/**
 * Encode a resistance into colour bands.
 * @param {number} ohms
 * @param {{bandCount:number, tolerancePct?:number, tempco?:number}} opts
 * @returns {{ok:true, bands:string[]} |
 *           {ok:false, error:string, suggestedBandCount?:number}}
 */
export function valueToBands(ohms, opts = {}) {
  const { bandCount = 4, tolerancePct = 5, tempco = 100 } = opts;
  if (!ROLES[bandCount]) return fail(`Unsupported band count: ${bandCount}.`);
  if (!Number.isFinite(ohms) || ohms <= 0) {
    return fail('Enter a resistance greater than zero.');
  }

  const sig = sigFigsFor(bandCount);

  // Split the value into `sig` significant digits and a power-of-ten multiplier.
  let exponent = Math.floor(Math.log10(ohms));
  let digits = Math.round(ohms / Math.pow(10, exponent - (sig - 1)));
  if (digits >= Math.pow(10, sig)) { // rounding rolled 999.6 up to 1000
    digits = Math.round(digits / 10);
    exponent += 1;
  }
  const multiplier = tidy(Math.pow(10, exponent - (sig - 1)));

  if (multiplier < MIN_MULTIPLIER * (1 - 1e-9) || multiplier > MAX_MULTIPLIER * (1 + 1e-9)) {
    const low = tidy(Math.pow(10, sig - 1) * MIN_MULTIPLIER);
    const high = tidy((Math.pow(10, sig) - 1) * MAX_MULTIPLIER);
    return fail(
      `${ohms} Ω is outside the range a ${bandCount}-band code can express `
      + `(${low} Ω to ${high} Ω).`,
    );
  }

  const multiplierColor = colorForMultiplier(multiplier);
  if (!multiplierColor) {
    return fail(`No multiplier band matches ×${multiplier}.`);
  }

  // Reject values the digit bands cannot represent exactly.
  if (Math.abs(tidy(digits * multiplier) - ohms) > Math.abs(ohms) * 1e-9) {
    const wider = BAND_COUNTS.find((c) => sigFigsFor(c) > sig);
    return fail(
      `A ${bandCount}-band code carries only ${sig} significant figures, `
      + `so it cannot express ${ohms} Ω exactly.`,
      wider ? { suggestedBandCount: wider } : {},
    );
  }

  const bands = String(digits).split('').map((d) => colorForDigit(Number(d)).id);
  bands.push(multiplierColor.id);

  if (bandCount >= 4) {
    const tolColor = colorForTolerance(tolerancePct);
    if (!tolColor) {
      const available = tolerancesFor(bandCount).join('%, ');
      return fail(`No band colour expresses a tolerance of ±${tolerancePct}%. Available: ±${available}%.`);
    }
    bands.push(tolColor.id);
  }

  if (bandCount === 6) {
    const tcColor = colorForTempco(tempco);
    if (!tcColor) {
      return fail(`No band colour expresses a temperature coefficient of ${tempco} ppm/K.`);
    }
    bands.push(tcColor.id);
  }

  return { ok: true, bands };
}
