import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine, findCombinations, KINDS, unitFor, lawFor } from '../js/combine.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const ids = (list) => list.map((w) => w.id);

test('resistors add in series', () => {
  const r = combine([{ value: 1000 }, { value: 2200 }, { value: 470 }], 'series', 'resistor');
  assert.equal(r.ok, true);
  assert.equal(r.value, 3670);
});

test('resistors combine reciprocally in parallel', () => {
  const r = combine([{ value: 1000 }, { value: 1000 }], 'parallel', 'resistor');
  assert.equal(r.value, 500);

  const r3 = combine([{ value: 100 }, { value: 200 }, { value: 300 }], 'parallel', 'resistor');
  assert.ok(close(r3.value, 1 / (1 / 100 + 1 / 200 + 1 / 300)));
});

test('capacitors do the opposite of resistors', () => {
  const p = combine([{ value: 100e-9 }, { value: 220e-9 }], 'parallel', 'capacitor');
  assert.ok(close(p.value, 320e-9, 1e-18));

  const s = combine([{ value: 100e-9 }, { value: 100e-9 }], 'series', 'capacitor');
  assert.ok(close(s.value, 50e-9, 1e-18));
});

test('the three component kinds carry their own units and laws', () => {
  assert.deepEqual(KINDS.map((k) => k.id), ['resistor', 'capacitor', 'inductor']);
  assert.equal(unitFor('resistor'), 'Ω');
  assert.equal(unitFor('capacitor'), 'F');
  assert.equal(unitFor('inductor'), 'H');
  assert.equal(unitFor('nope'), '');

  // Inductors follow the same laws as resistors; only capacitors invert.
  assert.equal(lawFor('series', 'resistor'), 'additive');
  assert.equal(lawFor('parallel', 'resistor'), 'reciprocal');
  assert.equal(lawFor('series', 'inductor'), 'additive');
  assert.equal(lawFor('parallel', 'inductor'), 'reciprocal');
  assert.equal(lawFor('series', 'capacitor'), 'reciprocal');
  assert.equal(lawFor('parallel', 'capacitor'), 'additive');
  assert.equal(lawFor('sideways', 'resistor'), null);
});

test('inductors add in series and combine reciprocally in parallel', () => {
  const s = combine([{ value: 10e-6 }, { value: 22e-6 }], 'series', 'inductor');
  assert.equal(s.ok, true);
  assert.ok(close(s.value, 32e-6, 1e-15));

  const p = combine([{ value: 10e-6 }, { value: 10e-6 }], 'parallel', 'inductor');
  assert.ok(close(p.value, 5e-6, 1e-15));
});

test('inductor tolerance bounds behave like resistor ones', () => {
  const r = combine(
    [{ value: 10e-6, tolerancePct: 10 }, { value: 10e-6, tolerancePct: 10 }],
    'series', 'inductor',
  );
  assert.ok(close(r.value, 20e-6, 1e-15));
  assert.ok(close(r.min, 18e-6, 1e-15));
  assert.ok(close(r.max, 22e-6, 1e-15));
  assert.equal(r.tolerancePct, 10);
});

test('the target solver works for inductors', () => {
  const r = findCombinations(20e-6, { kind: 'inductor', series: 'E12' });
  assert.equal(r.ok, true);
  // 10 uH + 10 uH hits 20 uH exactly in series.
  const exact = r.series.find((c) => Math.abs(c.errorPct) < 1e-9);
  assert.ok(exact, 'expected an exact series pair');
  assert.ok(close(exact.a, 10e-6, 1e-15) && close(exact.b, 10e-6, 1e-15));
});

test('a single component combines to itself', () => {
  assert.equal(combine([{ value: 4700 }], 'series', 'resistor').value, 4700);
  assert.equal(combine([{ value: 4700 }], 'parallel', 'resistor').value, 4700);
});

test('worst-case tolerance on an additive combination', () => {
  const r = combine(
    [{ value: 1000, tolerancePct: 5 }, { value: 1000, tolerancePct: 5 }],
    'series', 'resistor',
  );
  assert.equal(r.value, 2000);
  assert.equal(r.min, 1900);
  assert.equal(r.max, 2100);
  assert.equal(r.tolerancePct, 5);
});

test('worst-case tolerance on a reciprocal combination', () => {
  const r = combine(
    [{ value: 1000, tolerancePct: 10 }, { value: 1000, tolerancePct: 10 }],
    'parallel', 'resistor',
  );
  assert.equal(r.value, 500);
  assert.equal(r.min, 450, 'both at their minimum');
  assert.equal(r.max, 550, 'both at their maximum');
});

test('mixed tolerances widen the band asymmetrically in percent terms', () => {
  const r = combine(
    [{ value: 1000, tolerancePct: 1 }, { value: 1000, tolerancePct: 10 }],
    'series', 'resistor',
  );
  assert.equal(r.value, 2000);
  assert.equal(r.min, 1890, '990 + 900');
  assert.equal(r.max, 2110, '1010 + 1100');
  assert.equal(r.tolerancePct, 5.5, 'the worst-case edge, as a percentage of nominal');
});

test('flags a reciprocal combination that one component dominates', () => {
  const r = combine([{ value: 100 }, { value: 100000 }], 'parallel', 'resistor');
  assert.ok(ids(r.warnings).includes('dominated'));
  const w = r.warnings.find((x) => x.id === 'dominated');
  assert.match(w.text, /100000|barely|little/i);

  const even = combine([{ value: 100 }, { value: 150 }], 'parallel', 'resistor');
  assert.deepEqual(even.warnings, []);
});

test('rejects empty or invalid component lists', () => {
  assert.equal(combine([], 'series', 'resistor').ok, false);
  assert.equal(combine([{ value: 0 }], 'series', 'resistor').ok, false);
  assert.equal(combine([{ value: -5 }], 'series', 'resistor').ok, false);
  assert.equal(combine([{ value: 100 }], 'sideways', 'resistor').ok, false);
  assert.equal(combine([{ value: 100 }], 'series', 'memristor').ok, false);
  assert.equal(findCombinations(100, { kind: 'memristor' }).ok, false);
});

test('the target solver finds an exact pair when one exists', () => {
  // 2000 ohm is not in E24, but 1000 + 1000 hits it exactly.
  const r = findCombinations(2000, { kind: 'resistor', series: 'E24' });
  assert.equal(r.ok, true);
  const best = r.series[0];
  assert.equal(best.value, 2000);
  assert.equal(best.errorPct, 0);
  // Several E24 pairs hit 2000 exactly; 1000 + 1000 must be among those found.
  assert.ok(r.series.some((c) => c.a === 1000 && c.b === 1000), 'expected 1k + 1k in the list');
});

test('the target solver finds parallel pairs too', () => {
  // Two 1k in parallel is exactly 500 ohm.
  const r = findCombinations(500, { kind: 'resistor', series: 'E24' });
  const exact = r.parallel.find((c) => c.errorPct === 0);
  assert.ok(exact, 'expected an exact parallel pair');
  assert.equal(exact.value, 500);
  assert.ok(r.parallel.some((c) => c.a === 1000 && c.b === 1000), 'expected 1k || 1k in the list');
});

test('the target solver ranks by error and returns a bounded list', () => {
  const r = findCombinations(3141, { kind: 'resistor', series: 'E24', limit: 5 });
  assert.equal(r.ok, true);
  assert.equal(r.series.length, 5);
  assert.equal(r.parallel.length, 5);
  for (const list of [r.series, r.parallel]) {
    for (let i = 1; i < list.length; i += 1) {
      assert.ok(Math.abs(list[i].errorPct) >= Math.abs(list[i - 1].errorPct), 'not sorted by error');
    }
    // A pair from E24 should get within a fraction of a percent of any target.
    assert.ok(Math.abs(list[0].errorPct) < 1, `best was ${list[0].errorPct}% off`);
  }
});

test('the target solver works for capacitors, with the modes swapped', () => {
  const r = findCombinations(200e-9, { kind: 'capacitor', series: 'E12' });
  assert.equal(r.ok, true);
  // Capacitors add in parallel, so 100n + 100n = 200n should be the exact hit.
  const exact = r.parallel.find((c) => Math.abs(c.errorPct) < 1e-9);
  assert.ok(exact, 'expected an exact parallel pair');
  assert.ok(close(exact.a, 100e-9, 1e-18) && close(exact.b, 100e-9, 1e-18));
});

test('every returned pair really does combine to the value it claims', () => {
  const r = findCombinations(3141, { kind: 'resistor', series: 'E24', limit: 5 });
  for (const c of r.series) {
    const check = combine([{ value: c.a }, { value: c.b }], 'series', 'resistor');
    assert.ok(close(check.value, c.value, c.value * 1e-9), `${c.a} + ${c.b} != ${c.value}`);
  }
  for (const c of r.parallel) {
    const check = combine([{ value: c.a }, { value: c.b }], 'parallel', 'resistor');
    assert.ok(close(check.value, c.value, c.value * 1e-9), `${c.a} || ${c.b} != ${c.value}`);
  }
});

test('the target solver rejects a non-positive target', () => {
  assert.equal(findCombinations(0, { kind: 'resistor' }).ok, false);
  assert.equal(findCombinations(-1, { kind: 'resistor' }).ok, false);
});
