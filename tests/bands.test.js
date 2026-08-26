import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS, colorById, BAND_COUNTS, bandRoles, colorsForRole,
  bandsToValue, valueToBands, tolerancesFor,
} from '../js/bands.js';

test('the colour table is complete and consistent', () => {
  assert.equal(COLORS.length, 13);
  const digits = COLORS.filter((c) => c.digit !== null).map((c) => c.digit);
  assert.deepEqual(digits, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(colorById('brown').multiplier, 10);
  assert.equal(colorById('gold').multiplier, 0.1);
  assert.equal(colorById('silver').multiplier, 0.01);
  assert.equal(colorById('gold').tolerance, 5);
  assert.equal(colorById('silver').tolerance, 10);
  assert.equal(colorById('none').tolerance, 20);
  assert.equal(colorById('black').tolerance, null);
  assert.equal(colorById('brown').tempco, 100);
  assert.equal(colorById('nope'), null);
});

test('band roles per band count', () => {
  assert.deepEqual(BAND_COUNTS, [3, 4, 5, 6]);
  assert.deepEqual(bandRoles(3), ['digit', 'digit', 'multiplier']);
  assert.deepEqual(bandRoles(4), ['digit', 'digit', 'multiplier', 'tolerance']);
  assert.deepEqual(bandRoles(5), ['digit', 'digit', 'digit', 'multiplier', 'tolerance']);
  assert.deepEqual(bandRoles(6), ['digit', 'digit', 'digit', 'multiplier', 'tolerance', 'tempco']);
});

test('colorsForRole only offers legal colours', () => {
  // A digit band cannot be gold, silver or none.
  const digitIds = colorsForRole('digit').map((c) => c.id);
  assert.ok(!digitIds.includes('gold'));
  assert.ok(!digitIds.includes('none'));
  assert.equal(digitIds.length, 10);

  // The first digit cannot be black - that would be a leading zero.
  const firstIds = colorsForRole('digit', 0).map((c) => c.id);
  assert.ok(!firstIds.includes('black'));
  assert.equal(firstIds.length, 9);

  // A tolerance band cannot be black or white.
  const tolIds = colorsForRole('tolerance').map((c) => c.id);
  assert.ok(!tolIds.includes('black'));
  assert.ok(!tolIds.includes('white'));
  assert.ok(tolIds.includes('gold'));
});

test('decodes the canonical 4-band 4.7k', () => {
  const r = bandsToValue(['yellow', 'violet', 'red', 'gold']);
  assert.equal(r.ok, true);
  assert.equal(r.ohms, 4700);
  assert.equal(r.tolerancePct, 5);
  assert.equal(r.min, 4465);
  assert.equal(r.max, 4935);
  assert.equal(r.tempco, null);
});

test('decodes gold and silver multipliers without float noise', () => {
  assert.equal(bandsToValue(['brown', 'black', 'gold', 'gold']).ohms, 1);
  assert.equal(bandsToValue(['yellow', 'violet', 'gold', 'gold']).ohms, 4.7);
  assert.equal(bandsToValue(['yellow', 'violet', 'silver', 'gold']).ohms, 0.47);
});

test('decodes 3, 5 and 6 band codes', () => {
  const b3 = bandsToValue(['brown', 'black', 'red']);
  assert.equal(b3.ohms, 1000);
  assert.equal(b3.tolerancePct, 20, '3-band is implicitly 20 percent');

  const b5 = bandsToValue(['yellow', 'white', 'white', 'brown', 'brown']);
  assert.equal(b5.ohms, 4990);
  assert.equal(b5.tolerancePct, 1);

  const b6 = bandsToValue(['brown', 'black', 'black', 'red', 'brown', 'red']);
  assert.equal(b6.ohms, 10000);
  assert.equal(b6.tolerancePct, 1);
  assert.equal(b6.tempco, 50);
});

test('decodes 10M', () => {
  assert.equal(bandsToValue(['brown', 'black', 'blue', 'gold']).ohms, 10e6);
});

test('rejects illegal band colours with a reason', () => {
  const badDigit = bandsToValue(['gold', 'violet', 'red', 'gold']);
  assert.equal(badDigit.ok, false);
  assert.match(badDigit.error, /digit/i);

  const badTol = bandsToValue(['yellow', 'violet', 'red', 'black']);
  assert.equal(badTol.ok, false);
  assert.match(badTol.error, /tolerance/i);

  const wrongLength = bandsToValue(['yellow', 'violet']);
  assert.equal(wrongLength.ok, false);
});

test('encodes a value into bands', () => {
  const r = valueToBands(4700, { bandCount: 4, tolerancePct: 5 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.bands, ['yellow', 'violet', 'red', 'gold']);
});

test('encodes small and large values', () => {
  assert.deepEqual(valueToBands(1, { bandCount: 4, tolerancePct: 5 }).bands,
    ['brown', 'black', 'gold', 'gold']);
  assert.deepEqual(valueToBands(0.47, { bandCount: 4, tolerancePct: 5 }).bands,
    ['yellow', 'violet', 'silver', 'gold']);
  assert.deepEqual(valueToBands(4.7, { bandCount: 4, tolerancePct: 5 }).bands,
    ['yellow', 'violet', 'gold', 'gold']);
  assert.deepEqual(valueToBands(10e6, { bandCount: 4, tolerancePct: 5 }).bands,
    ['brown', 'black', 'blue', 'gold']);
  assert.deepEqual(valueToBands(1, { bandCount: 5, tolerancePct: 1 }).bands,
    ['brown', 'black', 'black', 'silver', 'brown']);
});

test('encodes a 6-band code including temperature coefficient', () => {
  const r = valueToBands(10000, { bandCount: 6, tolerancePct: 1, tempco: 50 });
  assert.deepEqual(r.bands, ['brown', 'black', 'black', 'red', 'brown', 'red']);
});

test('refuses a value needing more significant figures, and says so', () => {
  const r = valueToBands(4990, { bandCount: 4, tolerancePct: 5 });
  assert.equal(r.ok, false);
  assert.match(r.error, /significant/i);
  assert.equal(r.suggestedBandCount, 5, 'should offer to switch to 5-band');

  const ok5 = valueToBands(4990, { bandCount: 5, tolerancePct: 1 });
  assert.equal(ok5.ok, true);
  assert.deepEqual(ok5.bands, ['yellow', 'white', 'white', 'brown', 'brown']);
});

test('refuses values outside the multiplier range', () => {
  const tiny = valueToBands(0.005, { bandCount: 4, tolerancePct: 5 });
  assert.equal(tiny.ok, false);
  assert.match(tiny.error, /range/i);

  const huge = valueToBands(1e12, { bandCount: 4, tolerancePct: 5 });
  assert.equal(huge.ok, false);
  assert.match(huge.error, /range/i);
});

test('refuses a tolerance no band colour can express', () => {
  const r = valueToBands(4700, { bandCount: 4, tolerancePct: 3 });
  assert.equal(r.ok, false);
  assert.match(r.error, /tolerance/i);
});

test('3-band ignores the requested tolerance and reports 20 percent', () => {
  const r = valueToBands(1000, { bandCount: 3, tolerancePct: 5 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.bands, ['brown', 'black', 'red']);
  assert.deepEqual(tolerancesFor(3), [20]);
});

test('round-trip: every legal band combination survives encode(decode(x))', () => {
  const firstDigits = colorsForRole('digit', 0);
  const digits = colorsForRole('digit');
  const mults = colorsForRole('multiplier');

  let checked = 0;
  for (const bandCount of [4, 5]) {
    const tolColor = 'gold';
    for (const d1 of firstDigits) {
      for (const d2 of digits) {
        for (const m of mults) {
          const mid = bandCount === 5 ? ['black'] : [];
          const bands = [d1.id, d2.id, ...mid, m.id, tolColor];
          const dec = bandsToValue(bands);
          assert.equal(dec.ok, true, `decode failed for ${bands}`);

          const enc = valueToBands(dec.ohms, { bandCount, tolerancePct: dec.tolerancePct });
          if (!enc.ok) {
            // The only acceptable failure is falling outside the multiplier range.
            assert.match(enc.error, /range/i, `${bands} -> ${dec.ohms}: ${enc.error}`);
            continue;
          }
          assert.deepEqual(enc.bands, bands, `round-trip drifted for ${bands} (${dec.ohms})`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 1000, `expected a broad sweep, only checked ${checked}`);
});
