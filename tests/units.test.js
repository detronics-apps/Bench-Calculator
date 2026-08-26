import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEng, parseEng, formatOhms, formatFarads, formatWatts, formatAmps } from '../js/units.js';

test('formatEng picks the right SI prefix', () => {
  assert.equal(formatEng(4700, 'Ω'), '4.7 kΩ');
  assert.equal(formatEng(1, 'Ω'), '1 Ω');
  assert.equal(formatEng(0.47, 'Ω'), '470 mΩ');
  assert.equal(formatEng(10e6, 'Ω'), '10 MΩ');
  assert.equal(formatEng(1e9, 'Ω'), '1 GΩ');
  assert.equal(formatEng(0, 'Ω'), '0 Ω');
});

test('formatEng trims trailing zeros but keeps significance', () => {
  assert.equal(formatEng(4700, 'Ω'), '4.7 kΩ');
  assert.equal(formatEng(4750, 'Ω'), '4.75 kΩ');
  assert.equal(formatEng(4753, 'Ω'), '4.753 kΩ');
});

test('parseEng accepts plain numbers', () => {
  assert.equal(parseEng('4700'), 4700);
  assert.equal(parseEng('0.47'), 0.47);
  assert.equal(parseEng(' 12 '), 12);
});

test('parseEng accepts suffix notation', () => {
  assert.equal(parseEng('4.7k'), 4700);
  assert.equal(parseEng('4.7K'), 4700);
  assert.equal(parseEng('10M'), 10e6);
  assert.equal(parseEng('470m'), 0.47);
  assert.equal(parseEng('2G'), 2e9);
  assert.equal(parseEng('100u'), 100e-6);
  assert.equal(parseEng('22n'), 22e-9);
  assert.equal(parseEng('4p7'), 4.7e-12);
});

test('parseEng accepts infix notation (4k7, 0R47, 1R0)', () => {
  assert.equal(parseEng('4k7'), 4700);
  assert.equal(parseEng('0R47'), 0.47);
  assert.equal(parseEng('1R0'), 1);
  assert.equal(parseEng('2M2'), 2.2e6);
  assert.equal(parseEng('4R7'), 4.7);
});

test('parseEng strips a trailing unit', () => {
  assert.equal(parseEng('4.7 kΩ'), 4700);
  assert.equal(parseEng('4700 ohm'), 4700);
  assert.equal(parseEng('100 uF'), 100e-6);
});

test('parseEng handles henries, including the H infix', () => {
  assert.equal(parseEng('10uH'), 10e-6);
  assert.equal(parseEng('100 uH'), 100e-6);
  assert.equal(parseEng('4m7'), 4.7e-3);
  assert.equal(parseEng('10H'), 10);
  assert.equal(parseEng('4H7'), 4.7);
  assert.equal(parseEng('2.2 mH'), 2.2e-3);
  assert.equal(parseEng('470 henries'), 470);
});

test('parseEng rejects garbage', () => {
  assert.equal(parseEng(''), null);
  assert.equal(parseEng('abc'), null);
  assert.equal(parseEng('4.7.7k'), null);
  assert.equal(parseEng('-5'), null);
});

test('parse/format round-trip', () => {
  for (const s of ['4k7', '4.7k', '4700', '0R47', '2M2', '100n']) {
    const v = parseEng(s);
    assert.equal(parseEng(formatEng(v, 'Ω')), v, `round-trip failed for ${s}`);
  }
});

test('unit-specific helpers', () => {
  assert.equal(formatOhms(4700), '4.7 kΩ');
  assert.equal(formatFarads(100e-6), '100 µF');
  assert.equal(formatWatts(0.25), '250 mW');
  assert.equal(formatEng(10e-6, 'H'), '10 µH');
  assert.equal(formatEng(2.2e-3, 'H'), '2.2 mH');
  assert.equal(formatAmps(0.02), '20 mA');
});
