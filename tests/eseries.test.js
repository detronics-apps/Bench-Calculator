import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIES_NAMES, seriesBase, seriesValues, nearestE, isEValue, deviationPct,
} from '../js/eseries.js';

test('series have the right cardinality', () => {
  assert.deepEqual(SERIES_NAMES, ['E6', 'E12', 'E24', 'E48', 'E96', 'E192']);
  assert.equal(seriesBase('E6').length, 6);
  assert.equal(seriesBase('E12').length, 12);
  assert.equal(seriesBase('E24').length, 24);
  assert.equal(seriesBase('E48').length, 48);
  assert.equal(seriesBase('E96').length, 96);
  assert.equal(seriesBase('E192').length, 192);
});

test('E6 / E12 / E24 base values are the classic ones', () => {
  assert.deepEqual(seriesBase('E6'), [100, 150, 220, 330, 470, 680]);
  assert.deepEqual(seriesBase('E12'), [100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820]);
  assert.deepEqual(seriesBase('E24'), [
    100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300,
    330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910,
  ]);
});

test('nested series really are subsets', () => {
  const e24 = new Set(seriesBase('E24'));
  assert.ok(seriesBase('E12').every((v) => e24.has(v)));
  assert.ok(seriesBase('E6').every((v) => e24.has(v)));
  const e192 = new Set(seriesBase('E192'));
  assert.ok(seriesBase('E96').every((v) => e192.has(v)));
  assert.ok(seriesBase('E48').every((v) => e192.has(v)));
});

test('E48 and E96 endpoints match the standard', () => {
  const e48 = seriesBase('E48');
  assert.equal(e48[0], 100);
  assert.equal(e48[1], 105);
  assert.equal(e48[47], 953);
  const e96 = seriesBase('E96');
  assert.equal(e96[0], 100);
  assert.equal(e96[1], 102);
  assert.equal(e96[95], 976);
});

test('seriesValues spans decades within a range', () => {
  const vals = seriesValues('E6', 1, 100);
  assert.deepEqual(vals, [1, 1.5, 2.2, 3.3, 4.7, 6.8, 10, 15, 22, 33, 47, 68, 100]);
});

test('isEValue recognises members across decades', () => {
  assert.ok(isEValue(4700, 'E24'));
  assert.ok(isEValue(4.7, 'E6'));
  assert.ok(isEValue(0.22, 'E6'));
  assert.ok(isEValue(10e6, 'E24'));
  assert.ok(!isEValue(4630, 'E24'));
  assert.ok(isEValue(4640, 'E96'));
});

test('nearestE snaps to the closest member', () => {
  assert.equal(nearestE(4630, 'E24').value, 4700);
  assert.equal(nearestE(90, 'E24').value, 91);
  assert.equal(nearestE(4700, 'E24').value, 4700);
  assert.equal(nearestE(1, 'E24').value, 1);
});

test('nearestE crosses decade boundaries correctly', () => {
  // 9.6 sits between E6's 6.8 and 10 - and 10 is the nearer.
  assert.equal(nearestE(9.6, 'E6').value, 10);
  // 950 is nearer E24's 910 than its 1000.
  assert.equal(nearestE(950, 'E24').value, 910);
});

test('nearestE reports deviation and exactness', () => {
  const exact = nearestE(4700, 'E24');
  assert.equal(exact.exact, true);
  assert.equal(exact.deviationPct, 0);

  const off = nearestE(4630, 'E24');
  assert.equal(off.exact, false);
  assert.ok(Math.abs(off.deviationPct - 1.5119) < 0.001, `got ${off.deviationPct}`);
});

test('nearestE rejects non-positive input', () => {
  assert.equal(nearestE(0, 'E24'), null);
  assert.equal(nearestE(-5, 'E24'), null);
});

test('deviationPct is signed relative to the target', () => {
  assert.equal(deviationPct(110, 100), 10);
  assert.equal(deviationPct(90, 100), -10);
});
