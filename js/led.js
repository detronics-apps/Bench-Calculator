/**
 * LED series-resistor sizing, for a single LED, a series string, or a
 * parallel group wired either way.
 * Pure module: no DOM, importable in Node.
 *
 * Every LED carries its own forward voltage. That matters most in a parallel
 * group: two LEDs with different forward voltages need *different* resistors,
 * so the solver returns a branch per LED rather than one value times N.
 */

import { nearestE } from './eseries.js';
import { formatWatts, formatAmps, formatVolts, formatOhms } from './units.js';

/**
 * Typical forward voltages by LED colour. These are indicative figures for
 * ordinary indicator LEDs and vary widely between parts - the UI presents
 * them as an editable starting point, never as an answer.
 */
export const LED_COLORS = [
  { id: 'infrared', name: 'Infrared', hex: '#8b1a1a', vf: 1.4, vfMin: 1.2, vfMax: 1.6 },
  { id: 'red', name: 'Red', hex: '#e02020', vf: 2.0, vfMin: 1.8, vfMax: 2.2 },
  { id: 'orange', name: 'Orange', hex: '#f07818', vf: 2.0, vfMin: 1.9, vfMax: 2.1 },
  { id: 'amber', name: 'Amber', hex: '#f5a623', vf: 2.1, vfMin: 2.0, vfMax: 2.2 },
  { id: 'yellow', name: 'Yellow', hex: '#f2d648', vf: 2.1, vfMin: 2.0, vfMax: 2.2 },
  { id: 'green-std', name: 'Green (standard, GaP)', hex: '#4caf50', vf: 2.2, vfMin: 2.0, vfMax: 2.4 },
  { id: 'green-pure', name: 'Green (pure, InGaN)', hex: '#1fbf5a', vf: 3.2, vfMin: 3.0, vfMax: 3.4 },
  { id: 'blue', name: 'Blue', hex: '#2f7fe0', vf: 3.2, vfMin: 3.0, vfMax: 3.7 },
  { id: 'white', name: 'White', hex: '#f4f6f8', vf: 3.2, vfMin: 3.0, vfMax: 3.6 },
  { id: 'violet', name: 'Violet', hex: '#8b5cf6', vf: 3.3, vfMin: 3.0, vfMax: 3.6 },
  { id: 'pink', name: 'Pink', hex: '#f472b6', vf: 3.3, vfMin: 3.0, vfMax: 3.6 },
  { id: 'uv', name: 'Ultraviolet', hex: '#7c4dff', vf: 3.6, vfMin: 3.1, vfMax: 4.4 },
];

const LED_BY_ID = new Map(LED_COLORS.map((c) => [c.id, c]));

/** @returns {object|null} */
export function ledColorById(id) {
  return LED_BY_ID.get(id) || null;
}

/** Common through-hole resistor power ratings, in watts. */
export const POWER_RATINGS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 5];

/** The smallest standard rating that covers `watts`, or null if none does. */
export function nextPowerRating(watts) {
  return POWER_RATINGS.find((r) => r >= watts - 1e-12) ?? null;
}

/** Below this fraction of the supply, the resistor cannot hold current steady. */
const MIN_HEADROOM_FRACTION = 0.2;
/** Above this, an ordinary indicator LED is being pushed hard. */
const INDICATOR_CURRENT_LIMIT = 0.02;
/** Snapping to a standard value may shift current by at most this fraction. */
const CURRENT_TOLERANCE = 0.05;
/** The rating everyone reaches for by default. */
const DEFAULT_RATING = 0.25;
/** Forward voltages closer than this count as matched for wiring purposes. */
const VF_MATCH_TOLERANCE = 0.05;

const tidy = (n) => Number(n.toPrecision(12));
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

/**
 * Normalise the LED list. Accepts an explicit `leds` array, or the older
 * `vf` + `count` shorthand for a set of identical LEDs.
 */
function resolveLeds(opts) {
  if (Array.isArray(opts.leds) && opts.leds.length) {
    return opts.leds.map((led) => ({
      vf: Number(led.vf),
      colorId: led.colorId ?? null,
    }));
  }
  const count = opts.topology === 'single' ? 1 : Number(opts.count ?? 1);
  if (!Number.isInteger(count) || count < 1) return null;
  return Array.from({ length: count }, () => ({
    vf: Number(opts.vf),
    colorId: opts.colorId ?? null,
  }));
}

/**
 * Size the series resistor for an LED arrangement.
 *
 * @param {object} opts
 * @param {'single'|'series'|'parallel'} opts.topology
 * @param {'per-led'|'shared'} [opts.wiring]  parallel only; defaults to per-led
 * @param {number} opts.supplyV
 * @param {Array<{vf:number, colorId?:string}>} [opts.leds] one entry per LED
 * @param {number} [opts.vf]     shorthand: one forward voltage for all
 * @param {number} [opts.count]  shorthand: how many identical LEDs
 * @param {number} opts.ifA      target forward current per LED, in amps
 * @param {string} [opts.series] E-series to snap to; defaults to E24
 */
export function solveLed(opts = {}) {
  const { topology = 'single', wiring = 'per-led', supplyV, ifA, series = 'E24' } = opts;

  if (!Number.isFinite(supplyV) || supplyV <= 0) return fail('Enter a supply voltage greater than zero.');
  if (!Number.isFinite(ifA) || ifA <= 0) return fail('Enter a forward current greater than zero.');

  let leds = resolveLeds(opts);
  if (!leds) return fail('Enter a whole number of LEDs, at least one.');
  if (topology === 'single') leds = leds.slice(0, 1);
  if (leds.some((l) => !Number.isFinite(l.vf) || l.vf <= 0)) {
    return fail('Every LED needs a forward voltage greater than zero.');
  }

  const count = leds.length;
  const sharedParallel = topology === 'parallel' && wiring === 'shared';
  const vfs = leds.map((l) => l.vf);
  const vfMin = Math.min(...vfs);
  const vfSpread = tidy(Math.max(...vfs) - vfMin);

  // What the LEDs take off the supply before the resistor sees anything.
  // A series string stacks; a parallel group is clamped by its lowest-Vf LED.
  const ledVoltage = topology === 'series'
    ? tidy(vfs.reduce((sum, v) => sum + v, 0))
    : (sharedParallel ? vfMin : null);

  if (topology === 'series' || sharedParallel) {
    const drop = ledVoltage;
    if (supplyV - drop <= 0) {
      const maxCount = topology === 'series' ? countThatFits(vfs, supplyV) : 0;
      return fail(
        topology === 'series'
          ? `A ${formatVolts(supplyV)} supply cannot drive ${count} LEDs in series - `
            + `they need ${formatVolts(drop)} between them before any resistor.`
          : `A ${formatVolts(supplyV)} supply cannot drive an LED with a `
            + `${formatVolts(drop)} forward voltage.`,
        { maxCount },
      );
    }
  } else if (supplyV - Math.max(...vfs) <= 0) {
    const tooBig = leds.filter((l) => supplyV - l.vf <= 0);
    return fail(
      `A ${formatVolts(supplyV)} supply cannot drive `
      + `${tooBig.length === 1 ? 'an LED' : `${tooBig.length} of these LEDs`} - `
      + `${formatVolts(Math.max(...vfs))} of forward voltage leaves nothing for a resistor.`,
      { maxCount: 0 },
    );
  }

  const branches = sharedParallel
    ? [solveBranch({ supplyV, vf: vfMin, ifA: tidy(ifA * count), series, colorId: null, ledCount: count })]
    : topology === 'series'
      ? [solveBranch({ supplyV, vf: ledVoltage, ifA, series, colorId: leds[0].colorId, ledCount: count })]
      : leds.map((led) => solveBranch({ supplyV, vf: led.vf, ifA, series, colorId: led.colorId, ledCount: 1 }));

  const resistorCount = branches.length;
  const uniformResistor = branches.every((b) => b.chosenR === branches[0].chosenR);
  const chosenR = uniformResistor ? branches[0].chosenR : null;

  // Per-LED current. A shared resistor splits its one current across the group.
  const perLedCurrents = sharedParallel
    ? Array.from({ length: count }, () => tidy(branches[0].branchCurrentA / count))
    : branches.map((b) => b.branchCurrentA);

  const supplyCurrentA = tidy(branches.reduce((sum, b) => sum + b.branchCurrentA, 0));
  const powerR = tidy(Math.max(...branches.map((b) => b.powerR)));
  const recommendedRatingW = nextPowerRating(powerR * 2);
  const headroomV = tidy(Math.min(...branches.map((b) => b.headroomV)));

  const warnings = buildWarnings({
    topology, sharedParallel, count, supplyV, ifA, series,
    branches, perLedCurrents, vfSpread, vfs, headroomV,
    powerR, recommendedRatingW, uniformResistor,
  });

  return {
    ok: true,
    topology,
    wiring: topology === 'parallel' ? wiring : 'per-led',
    leds: leds.map((led, i) => ({ ...led, actualIfA: perLedCurrents[i] })),
    ledCount: count,
    resistorCount,
    branches,
    uniformResistor,
    ledVoltage: ledVoltage ?? tidy(Math.max(...vfs)),
    vfSpread,
    headroomV,
    idealR: uniformResistor ? branches[0].idealR : null,
    chosenR,
    series,
    exact: branches.every((b) => b.exact),
    actualIfA: perLedCurrents[0],
    perLedCurrents,
    supplyCurrentA,
    powerR,
    totalPowerW: tidy(supplyV * supplyCurrentA),
    recommendedRatingW,
    warnings,
  };
}

/** How many of these LEDs a supply can carry in series. */
function countThatFits(vfs, supplyV) {
  let used = 0;
  let n = 0;
  for (const vf of vfs) {
    if (used + vf >= supplyV) break;
    used += vf;
    n += 1;
  }
  return n;
}

/** One resistor, sized for the voltage it has to drop at the current it must pass. */
function solveBranch({ supplyV, vf, ifA, series, colorId, ledCount }) {
  const headroomV = tidy(supplyV - vf);
  const idealR = tidy(headroomV / ifA);
  const snap = nearestE(idealR, series);
  const chosenR = snap.value;
  const branchCurrentA = tidy(headroomV / chosenR);

  return {
    vf,
    colorId,
    ledCount,
    headroomV,
    idealR,
    chosenR,
    exact: snap.exact,
    deviationPct: snap.deviationPct,
    branchCurrentA,
    actualIfA: tidy(branchCurrentA / ledCount),
    powerR: tidy(headroomV * branchCurrentA),
  };
}

function buildWarnings(ctx) {
  const {
    sharedParallel, count, supplyV, ifA, series, branches, perLedCurrents,
    vfSpread, vfs, headroomV, powerR, recommendedRatingW, uniformResistor,
  } = ctx;
  const warnings = [];

  if (sharedParallel && vfSpread > VF_MATCH_TOLERANCE) {
    const lowest = Math.min(...vfs);
    const highest = Math.max(...vfs);
    warnings.push({
      id: 'vf-mismatch',
      level: 'error',
      text: `These LEDs do not share a forward voltage - they range from `
        + `${formatVolts(lowest)} to ${formatVolts(highest)} - and one shared resistor cannot `
        + `divide current between them. The ${formatVolts(lowest)} LED clamps the node and takes `
        + `essentially all of it, while the ${formatVolts(highest)} one will be dim or completely `
        + 'dark. The per-LED currents below are a design target, not what this circuit will do. '
        + 'Give each LED its own resistor.',
    });
  } else if (sharedParallel) {
    warnings.push({
      id: 'current-hogging',
      level: 'warn',
      text: `One resistor shared by ${count} parallel LEDs splits current by forward-voltage `
        + 'mismatch, not equally. Even LEDs marked identical vary part to part, so the lowest-Vf '
        + 'one runs hottest and brightest. Give each LED its own resistor unless they are a '
        + 'matched set.',
    });
  }

  if (headroomV < supplyV * MIN_HEADROOM_FRACTION) {
    warnings.push({
      id: 'headroom',
      level: 'warn',
      text: `Only ${formatVolts(headroomV, 3)} of the ${formatVolts(supplyV, 3)} supply falls across `
        + `the resistor (${Math.round((headroomV / supplyV) * 100)}%). With so little headroom, `
        + 'normal part-to-part spread in forward voltage will swing the current badly. Raise the '
        + 'supply, or drive the LED from a constant-current source.',
    });
  }

  if (powerR > DEFAULT_RATING) {
    warnings.push({
      id: 'power',
      level: 'warn',
      text: `${uniformResistor ? 'Each resistor dissipates' : 'The hardest-working resistor dissipates'} `
        + `${formatWatts(powerR, 3)}, more than the ${formatWatts(DEFAULT_RATING)} part most people `
        + 'reach for. Fit a resistor rated two to ten times the dissipation'
        + (recommendedRatingW ? ` - ${formatWatts(recommendedRatingW)} or higher.` : '.'),
    });
  }

  const worstError = Math.max(...perLedCurrents.map((i) => Math.abs(i - ifA) / ifA));
  if (worstError > CURRENT_TOLERANCE) {
    const worst = perLedCurrents.reduce((a, b) => (Math.abs(b - ifA) > Math.abs(a - ifA) ? b : a));
    warnings.push({
      id: 'current-off-target',
      level: 'info',
      text: `The nearest ${series} value${uniformResistor ? '' : 's'} `
        + `${uniformResistor ? `of ${formatOhms(branches[0].chosenR)} gives` : 'give as much as'} `
        + `${formatAmps(worst, 3)} rather than the ${formatAmps(ifA, 3)} you asked for `
        + `(${Math.round(worstError * 100)}% off). Pick a finer E-series in Preferences for a closer match.`,
    });
  }

  if (ifA > INDICATOR_CURRENT_LIMIT * 1.001) {
    warnings.push({
      id: 'high-current',
      level: 'info',
      text: `${formatAmps(ifA, 3)} is above the 20 mA that ordinary indicator LEDs are rated for. `
        + 'Check the datasheet maximum before building this.',
    });
  }

  return warnings;
}

/**
 * Total current the circuit draws from a supply of `volts`, using the
 * resistors already chosen. Branches whose LEDs cannot conduct at that
 * voltage contribute nothing.
 *
 * This is what lets the battery estimate follow the draw down as a pack sags.
 */
export function supplyCurrentAt(solution, volts) {
  if (!solution?.ok || !Number.isFinite(volts)) return 0;
  const total = solution.branches.reduce((sum, b) => {
    const across = volts - b.vf;
    return sum + (across > 0 ? across / b.chosenR : 0);
  }, 0);
  return tidy(total);
}
