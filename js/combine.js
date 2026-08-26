/**
 * Series and parallel combination of resistors, capacitors and inductors,
 * plus a reverse solver that searches E-series pairs for a target value.
 * Pure module: no DOM, importable in Node.
 *
 * Resistors and inductors add in series and combine reciprocally in parallel;
 * capacitors do exactly the opposite. Rather than write the arithmetic three
 * times, every path reduces to one of two laws - `additive` or `reciprocal` -
 * and `lawFor()` decides which applies.
 *
 * The inductor case assumes no mutual coupling between the parts. Two coils
 * close enough to share flux do not obey these laws, and nothing here can
 * detect that - the UI says so where the values are entered.
 */

import { seriesValues } from './eseries.js';
import { formatEng } from './units.js';

export const KINDS = [
  { id: 'resistor', name: 'Resistors', unit: 'Ω', seriesLaw: 'additive' },
  { id: 'capacitor', name: 'Capacitors', unit: 'F', seriesLaw: 'reciprocal' },
  { id: 'inductor', name: 'Inductors', unit: 'H', seriesLaw: 'additive' },
];

/** A component that is 10x away from its neighbour contributes almost nothing. */
const DOMINANCE_RATIO = 10;

const tidy = (n) => Number(n.toPrecision(12));
const fail = (error) => ({ ok: false, error });

const kindById = (id) => KINDS.find((k) => k.id === id) || null;

/** The SI unit symbol for a component kind, or '' if the kind is unknown. */
export const unitFor = (id) => kindById(id)?.unit || '';

/**
 * Which combination law applies.
 * @returns {'additive'|'reciprocal'|null}
 */
export function lawFor(mode, kind = 'resistor') {
  const k = kindById(kind);
  if (!k || (mode !== 'series' && mode !== 'parallel')) return null;
  const seriesIsAdditive = k.seriesLaw === 'additive';
  const additive = mode === 'series' ? seriesIsAdditive : !seriesIsAdditive;
  return additive ? 'additive' : 'reciprocal';
}

const applyLaw = (values, law) => (law === 'additive'
  ? values.reduce((sum, v) => sum + v, 0)
  : 1 / values.reduce((sum, v) => sum + 1 / v, 0));

/**
 * Combine a list of components.
 *
 * Both laws are monotonically increasing in every component, so the worst-case
 * bounds are simply the law applied to all the minima and all the maxima.
 *
 * @param {Array<{value:number, tolerancePct?:number}>} components
 * @param {'series'|'parallel'} mode
 * @param {'resistor'|'capacitor'|'inductor'} kind
 */
export function combine(components, mode, kind = 'resistor') {
  if (!Array.isArray(components) || components.length === 0) {
    return fail('Add at least one component.');
  }
  const law = lawFor(mode, kind);
  if (!law) return fail(`Unknown combination: ${mode} ${kind}.`);

  const values = [];
  const mins = [];
  const maxes = [];
  for (let i = 0; i < components.length; i += 1) {
    const v = Number(components[i].value);
    if (!Number.isFinite(v) || v <= 0) {
      return fail(`Component ${i + 1} needs a value greater than zero.`);
    }
    const tol = Number(components[i].tolerancePct) || 0;
    values.push(v);
    mins.push(v * (1 - tol / 100));
    maxes.push(v * (1 + tol / 100));
  }

  const value = tidy(applyLaw(values, law));
  const min = tidy(applyLaw(mins, law));
  const max = tidy(applyLaw(maxes, law));

  const warnings = [];
  if (values.length > 1) {
    const smallest = Math.min(...values);
    const largest = Math.max(...values);
    if (largest / smallest >= DOMINANCE_RATIO) {
      const unit = unitFor(kind);
      const negligible = law === 'additive' ? smallest : largest;
      warnings.push({
        id: 'dominated',
        level: 'info',
        text: `${formatEng(largest, unit)} against ${formatEng(smallest, unit)} is a `
          + `${Math.round(largest / smallest)}:1 spread, so the ${formatEng(negligible, unit)} `
          + 'part barely changes the result. Check that is what you meant.',
      });
    }
  }

  return {
    ok: true,
    kind,
    mode,
    law,
    value,
    min,
    max,
    tolerancePct: tidy((Math.max(max - value, value - min) / value) * 100),
    count: values.length,
    warnings,
  };
}

/** Candidate values worth trying, given how the law moves the result. */
function candidates(target, law, series) {
  // Additive: each part must be smaller than the target. Reciprocal: larger.
  // Three decades either side is far more than enough to find a close pair.
  return law === 'additive'
    ? seriesValues(series, target / 1000, target)
    : seriesValues(series, target, target * 1000);
}

function searchPairs(target, mode, kind, series, limit) {
  const law = lawFor(mode, kind);
  const pool = candidates(target, law, series);
  const found = [];

  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i; j < pool.length; j += 1) {
      const value = tidy(applyLaw([pool[i], pool[j]], law));
      found.push({
        a: pool[i],
        b: pool[j],
        mode,
        value,
        errorPct: tidy(((value - target) / target) * 100),
      });
    }
  }

  found.sort((x, y) => Math.abs(x.errorPct) - Math.abs(y.errorPct));
  return found.slice(0, limit);
}

/**
 * Search E-series pairs for the closest series and parallel combinations
 * to a target value.
 *
 * @param {number} target
 * @param {{kind?:string, series?:string, limit?:number}} opts
 * @returns {{ok:true, target:number, series:object[], parallel:object[]} |
 *           {ok:false, error:string}}
 */
export function findCombinations(target, opts = {}) {
  const { kind = 'resistor', series = 'E24', limit = 5 } = opts;
  if (!Number.isFinite(target) || target <= 0) {
    return fail('Enter a target value greater than zero.');
  }
  if (!kindById(kind)) return fail(`Unknown component kind: ${kind}.`);

  return {
    ok: true,
    target,
    kind,
    eSeries: series,
    series: searchPairs(target, 'series', kind, series, limit),
    parallel: searchPairs(target, 'parallel', kind, series, limit),
  };
}
