import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LED_COLORS, ledColorById, POWER_RATINGS, nextPowerRating, solveLed, supplyCurrentAt,
} from '../js/led.js';

const ids = (list) => list.map((w) => w.id);

test('the LED colour table is usable as a Vf lookup', () => {
  assert.ok(LED_COLORS.length >= 10);
  assert.equal(ledColorById('red').vf, 2.0);
  assert.equal(ledColorById('blue').vf, 3.2);
  assert.equal(ledColorById('white').vf, 3.2);
  assert.equal(ledColorById('infrared').vf, 1.4);
  assert.equal(ledColorById('nope'), null);
  for (const c of LED_COLORS) {
    assert.ok(c.vfMin <= c.vf && c.vf <= c.vfMax, `${c.id} typical Vf is outside its own range`);
    assert.ok(c.hex, `${c.id} needs a swatch colour`);
  }
});

test('nextPowerRating steps up through the standard ratings', () => {
  assert.deepEqual(POWER_RATINGS, [0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 5]);
  assert.equal(nextPowerRating(0.05), 0.0625);
  assert.equal(nextPowerRating(0.1), 0.125);
  assert.equal(nextPowerRating(0.3), 0.5);
  assert.equal(nextPowerRating(6), null, 'nothing in the table covers it');
});

test('single LED: the DigiKey worked example', () => {
  // 5 V supply, blue LED at 3.2 V, 20 mA -> (5 - 3.2) / 0.02 = 90 ohm.
  const r = solveLed({ topology: 'single', supplyV: 5, vf: 3.2, ifA: 0.02, series: 'E24' });
  assert.equal(r.ok, true);
  assert.equal(r.idealR, 90);
  assert.equal(r.chosenR, 91, 'nearest E24 value');
  // Power is reported for the resistor you can actually buy: 1.8^2 / 91.
  assert.ok(Math.abs(r.powerR - (1.8 * 1.8) / 91) < 1e-12, `power was ${r.powerR}`);
  assert.equal(r.ledCount, 1);
  assert.equal(r.resistorCount, 1);
});

test('actual current is recomputed from the resistor you can actually buy', () => {
  const r = solveLed({ topology: 'single', supplyV: 5, vf: 3.2, ifA: 0.02, series: 'E24' });
  // (5 - 3.2) / 91 = 19.78 mA, not the 20 mA that was asked for.
  assert.ok(Math.abs(r.actualIfA - 1.8 / 91) < 1e-12);
  assert.ok(r.actualIfA < 0.02);
});

test('series LEDs subtract every forward drop', () => {
  const r = solveLed({ topology: 'series', supplyV: 12, vf: 2.0, ifA: 0.02, count: 4, series: 'E24' });
  assert.equal(r.ok, true);
  assert.equal(r.idealR, 200); // (12 - 8) / 0.02
  assert.equal(r.chosenR, 200);
  assert.equal(r.ledCount, 4);
  assert.equal(r.resistorCount, 1);
  assert.equal(r.supplyCurrentA, r.actualIfA, 'one string draws one LED current');
});

test('series: refuses when the supply cannot light the string', () => {
  const r = solveLed({ topology: 'series', supplyV: 5, vf: 3.2, ifA: 0.02, count: 2, series: 'E24' });
  assert.equal(r.ok, false);
  assert.match(r.error, /supply/i);
  assert.equal(r.maxCount, 1, 'should say how many LEDs the supply can drive');
});

test('parallel with one resistor per branch', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'per-led', supplyV: 12, vf: 2.0, ifA: 0.02, count: 3, series: 'E24',
  });
  assert.equal(r.ok, true);
  assert.equal(r.idealR, 500); // (12 - 2) / 0.02, per branch
  assert.equal(r.chosenR, 510);
  assert.equal(r.resistorCount, 3);
  assert.ok(Math.abs(r.supplyCurrentA - 3 * r.actualIfA) < 1e-12);
  assert.ok(!ids(r.warnings).includes('current-hogging'));
});

test('parallel with a single shared resistor always warns about current hogging', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'shared', supplyV: 12, vf: 2.0, ifA: 0.02, count: 3, series: 'E24',
  });
  assert.equal(r.ok, true);
  // (12 - 2) / (3 * 0.02) = 166.67 ohm for the whole group.
  assert.ok(Math.abs(r.idealR - 500 / 3) < 1e-9);
  assert.equal(r.resistorCount, 1);
  assert.ok(ids(r.warnings).includes('current-hogging'));
  const w = r.warnings.find((x) => x.id === 'current-hogging');
  assert.equal(w.level, 'warn');
  assert.match(w.text, /hog|unequal|mismatch/i);
});

test('warns when the resistor exceeds a quarter watt, and names a rating', () => {
  // 24 V, red LED, 100 mA -> 220 ohm dissipating 2.2 W.
  const r = solveLed({ topology: 'single', supplyV: 24, vf: 2.0, ifA: 0.1, series: 'E24' });
  const w = r.warnings.find((x) => x.id === 'power');
  assert.ok(w, 'expected a power warning');
  assert.equal(w.level, 'warn');
  assert.ok(r.recommendedRatingW >= r.powerR * 2, 'headroom of at least 2x, per the usual guidance');
});

test('warns when there is too little headroom across the resistor', () => {
  // 3.3 V supply, blue LED at 3.2 V - only 0.1 V of headroom.
  const r = solveLed({ topology: 'single', supplyV: 3.3, vf: 3.2, ifA: 0.02, series: 'E24' });
  assert.equal(r.ok, true);
  assert.ok(ids(r.warnings).includes('headroom'));
});

test('warns when the standard resistor pulls the current well off target', () => {
  const r = solveLed({ topology: 'single', supplyV: 5, vf: 3.2, ifA: 0.02, series: 'E6' });
  // E6 only offers 68 or 100 ohm near 90, so the current lands well off 20 mA.
  assert.ok(ids(r.warnings).includes('current-off-target'));
});

test('warns above 20 mA through an indicator LED', () => {
  const r = solveLed({ topology: 'single', supplyV: 12, vf: 2.0, ifA: 0.05, series: 'E24' });
  assert.ok(ids(r.warnings).includes('high-current'));
});

test('a comfortable design produces no warnings at all', () => {
  const r = solveLed({ topology: 'single', supplyV: 12, vf: 2.0, ifA: 0.02, series: 'E24' });
  assert.equal(r.ok, true);
  assert.equal(r.chosenR, 510);
  assert.deepEqual(r.warnings, []);
});

test('rejects nonsense inputs', () => {
  assert.equal(solveLed({ topology: 'single', supplyV: 0, vf: 2, ifA: 0.02 }).ok, false);
  assert.equal(solveLed({ topology: 'single', supplyV: 5, vf: 2, ifA: 0 }).ok, false);
  assert.equal(solveLed({ topology: 'single', supplyV: 2, vf: 2, ifA: 0.02 }).ok, false);
  assert.equal(solveLed({ topology: 'parallel', supplyV: 5, vf: 2, ifA: 0.02, count: 0 }).ok, false);
});


/* ---------------------------------------------- per-LED forward voltages */

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('an explicit LED list replaces the single-Vf shorthand', () => {
  const viaList = solveLed({
    topology: 'series', supplyV: 12, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 2.0 }, { vf: 2.0 }, { vf: 2.0 }],
  });
  const viaShorthand = solveLed({
    topology: 'series', supplyV: 12, vf: 2.0, ifA: 0.02, count: 4, series: 'E24',
  });
  assert.equal(viaList.ok, true);
  assert.equal(viaList.idealR, viaShorthand.idealR);
  assert.equal(viaList.ledCount, 4);
});

test('a series string adds up mismatched forward voltages', () => {
  // 2.0 + 3.2 + 2.1 = 7.3 V, leaving 4.7 V across the resistor at 10 mA.
  const r = solveLed({
    topology: 'series', supplyV: 12, ifA: 0.01, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 3.2 }, { vf: 2.1 }],
  });
  assert.equal(r.ok, true);
  assert.ok(close(r.ledVoltage, 7.3));
  assert.ok(close(r.headroomV, 4.7));
  assert.equal(r.idealR, 470);
  assert.equal(r.branches.length, 1, 'one string, one resistor');
});

test('parallel branches get their own resistor sized to their own LED', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'per-led', supplyV: 12, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 3.2 }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.branches.length, 2);
  assert.equal(r.branches[0].idealR, 500);   // (12 - 2.0) / 0.02
  assert.equal(r.branches[1].idealR, 440);   // (12 - 3.2) / 0.02
  assert.equal(r.branches[0].chosenR, 510);
  assert.equal(r.branches[1].chosenR, 430);
  assert.equal(r.uniformResistor, false, 'the branches differ, so there is no single value');
  assert.equal(r.chosenR, null);
  assert.equal(r.resistorCount, 2);
});

test('matched parallel LEDs still report one resistor value', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'per-led', supplyV: 12, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 2.0 }, { vf: 2.0 }],
  });
  assert.equal(r.uniformResistor, true);
  assert.equal(r.chosenR, 510);
  assert.equal(r.resistorCount, 3);
  assert.ok(close(r.supplyCurrentA, 3 * r.branches[0].actualIfA));
});

test('mismatched LEDs behind one shared resistor is called out as broken', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'shared', supplyV: 12, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 3.2 }],
  });
  assert.equal(r.ok, true);
  const ids = r.warnings.map((w) => w.id);
  assert.ok(ids.includes('vf-mismatch'), `expected a mismatch warning, got ${ids}`);
  const w = r.warnings.find((x) => x.id === 'vf-mismatch');
  assert.equal(w.level, 'error');
  assert.match(w.text, /2|lowest/i);
  // The node is clamped by the lowest-Vf LED, so that is what sizes the resistor.
  assert.ok(close(r.ledVoltage, 2.0));
});

test('matched LEDs behind a shared resistor warn but are not an error', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'shared', supplyV: 12, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 2.0 }],
  });
  const ids = r.warnings.map((w) => w.id);
  assert.ok(ids.includes('current-hogging'));
  assert.ok(!ids.includes('vf-mismatch'));
});

test('a series string refuses on the sum, and says how many fit', () => {
  const r = solveLed({
    topology: 'series', supplyV: 5, ifA: 0.02,
    leds: [{ vf: 3.2 }, { vf: 3.2 }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.maxCount, 1);
});

test('supplyCurrentAt tracks how the draw falls as a battery sags', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'per-led', supplyV: 6, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2.0 }, { vf: 2.0 }],
  });
  // At the design voltage the draw matches the solved figure.
  assert.ok(close(supplyCurrentAt(r, 6), r.supplyCurrentA, 1e-9));
  // Lower the supply and the draw falls with it.
  assert.ok(supplyCurrentAt(r, 4) < supplyCurrentAt(r, 6));
  // Below the forward voltage nothing conducts at all.
  assert.equal(supplyCurrentAt(r, 1.5), 0);
  assert.equal(supplyCurrentAt(r, 2.0), 0);
});

test('supplyCurrentAt handles a series string and a shared resistor', () => {
  const ser = solveLed({ topology: 'series', supplyV: 12, ifA: 0.02, series: 'E24',
    leds: [{ vf: 2 }, { vf: 2 }] });
  assert.ok(close(supplyCurrentAt(ser, 12), ser.supplyCurrentA, 1e-9));
  assert.equal(supplyCurrentAt(ser, 3), 0, 'below 4 V the string cannot light');

  const shared = solveLed({ topology: 'parallel', wiring: 'shared', supplyV: 12, ifA: 0.02,
    series: 'E24', leds: [{ vf: 2 }, { vf: 2 }] });
  assert.ok(close(supplyCurrentAt(shared, 12), shared.supplyCurrentA, 1e-9));
});

test('supplyCurrentAt is safe on an unsolved circuit', () => {
  assert.equal(supplyCurrentAt(null, 5), 0);
  assert.equal(supplyCurrentAt({ ok: false }, 5), 0);
});

test('every branch carries the detail the results table needs', () => {
  const r = solveLed({
    topology: 'parallel', wiring: 'per-led', supplyV: 9, ifA: 0.01, series: 'E24',
    leds: [{ vf: 2.0, colorId: 'red' }, { vf: 3.2, colorId: 'blue' }],
  });
  for (const b of r.branches) {
    for (const key of ['vf', 'colorId', 'idealR', 'chosenR', 'actualIfA', 'powerR']) {
      assert.ok(b[key] !== undefined, `branch is missing ${key}`);
    }
    assert.ok(b.actualIfA > 0);
    assert.ok(close(b.powerR, (9 - b.vf) * b.actualIfA, 1e-9));
  }
  assert.equal(r.branches[0].colorId, 'red');
  assert.equal(r.branches[1].colorId, 'blue');
});
