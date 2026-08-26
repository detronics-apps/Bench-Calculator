import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SMD_TYPES, decodeSmd, encodeSmd, EIA96_MULTIPLIERS, eia96Index,
} from '../js/smd.js';

test('exposes the three marking systems', () => {
  assert.deepEqual(SMD_TYPES.map((t) => t.id), ['d3', 'd4', 'eia96']);
});

test('decodes 3-digit codes', () => {
  assert.equal(decodeSmd('473', 'd3').ohms, 47000);
  assert.equal(decodeSmd('100', 'd3').ohms, 10);
  assert.equal(decodeSmd('101', 'd3').ohms, 100);
  assert.equal(decodeSmd('105', 'd3').ohms, 1e6);
  assert.equal(decodeSmd('000', 'd3').ohms, 0);
});

test('decodes 3-digit codes with R as the decimal point', () => {
  assert.equal(decodeSmd('4R7', 'd3').ohms, 4.7);
  assert.equal(decodeSmd('R47', 'd3').ohms, 0.47);
  assert.equal(decodeSmd('47R', 'd3').ohms, 47);
  assert.equal(decodeSmd('0R5', 'd3').ohms, 0.5);
});

test('decodes 4-digit codes', () => {
  assert.equal(decodeSmd('4702', 'd4').ohms, 47000);
  assert.equal(decodeSmd('1000', 'd4').ohms, 100);
  assert.equal(decodeSmd('1001', 'd4').ohms, 1000);
  assert.equal(decodeSmd('4991', 'd4').ohms, 4990);
  assert.equal(decodeSmd('10R0', 'd4').ohms, 10);
  assert.equal(decodeSmd('4R70', 'd4').ohms, 4.7);
  assert.equal(decodeSmd('0000', 'd4').ohms, 0);
});

test('the EIA-96 index table matches the E96 series', () => {
  assert.equal(eia96Index(1), 100);
  assert.equal(eia96Index(2), 102);
  assert.equal(eia96Index(10), 124);
  assert.equal(eia96Index(68), 499);
  assert.equal(eia96Index(96), 976);
  assert.equal(eia96Index(0), null);
  assert.equal(eia96Index(97), null);
});

test('the EIA-96 multiplier letters cover both spellings', () => {
  assert.equal(EIA96_MULTIPLIERS.Z, 0.001);
  assert.equal(EIA96_MULTIPLIERS.Y, 0.01);
  assert.equal(EIA96_MULTIPLIERS.R, 0.01);
  assert.equal(EIA96_MULTIPLIERS.X, 0.1);
  assert.equal(EIA96_MULTIPLIERS.S, 0.1);
  assert.equal(EIA96_MULTIPLIERS.A, 1);
  assert.equal(EIA96_MULTIPLIERS.B, 10);
  assert.equal(EIA96_MULTIPLIERS.H, 10);
  assert.equal(EIA96_MULTIPLIERS.C, 100);
  assert.equal(EIA96_MULTIPLIERS.D, 1000);
  assert.equal(EIA96_MULTIPLIERS.E, 10000);
  assert.equal(EIA96_MULTIPLIERS.F, 100000);
});

test('decodes EIA-96 codes', () => {
  assert.equal(decodeSmd('01A', 'eia96').ohms, 1);
  assert.equal(decodeSmd('01C', 'eia96').ohms, 100);
  assert.equal(decodeSmd('01E', 'eia96').ohms, 10000);
  assert.equal(decodeSmd('10C', 'eia96').ohms, 124);
  assert.equal(decodeSmd('68D', 'eia96').ohms, 4990);
  assert.equal(decodeSmd('96A', 'eia96').ohms, 9.76);
  assert.equal(decodeSmd('96Z', 'eia96').ohms, 0.00976);
});

test('EIA-96 decoding is case-insensitive on the letter', () => {
  assert.equal(decodeSmd('68d', 'eia96').ohms, 4990);
});

test('auto-detects the marking system when none is given', () => {
  assert.equal(decodeSmd('473').type, 'd3');
  assert.equal(decodeSmd('4702').type, 'd4');
  assert.equal(decodeSmd('68D').type, 'eia96');
  assert.equal(decodeSmd('68D').ohms, 4990);
});

test('rejects malformed codes with a reason', () => {
  assert.equal(decodeSmd('', 'd3').ok, false);
  assert.equal(decodeSmd('47', 'd3').ok, false);
  assert.equal(decodeSmd('47X', 'd3').ok, false);
  assert.equal(decodeSmd('99A', 'eia96').ok, false, 'index 99 is out of the 01-96 range');
  assert.equal(decodeSmd('00A', 'eia96').ok, false);
  assert.equal(decodeSmd('01Q', 'eia96').ok, false, 'Q is not a multiplier letter');
  assert.match(decodeSmd('01Q', 'eia96').error, /multiplier/i);
});

test('encodes into 3-digit codes', () => {
  assert.equal(encodeSmd(47000, 'd3').code, '473');
  assert.equal(encodeSmd(10, 'd3').code, '100');
  assert.equal(encodeSmd(4.7, 'd3').code, '4R7');
  assert.equal(encodeSmd(0.47, 'd3').code, 'R47');
  assert.equal(encodeSmd(0, 'd3').code, '000');
});

test('encodes into 4-digit codes', () => {
  assert.equal(encodeSmd(47000, 'd4').code, '4702');
  assert.equal(encodeSmd(4990, 'd4').code, '4991');
  assert.equal(encodeSmd(4.7, 'd4').code, '4R70');
  assert.equal(encodeSmd(0, 'd4').code, '0000');
});

test('encodes into EIA-96 codes', () => {
  assert.equal(encodeSmd(4990, 'eia96').code, '68D');
  assert.equal(encodeSmd(100, 'eia96').code, '01C');
  assert.equal(encodeSmd(124, 'eia96').code, '10C');
});

test('encoding flags values the system cannot express exactly', () => {
  const inexact = encodeSmd(4630, 'd3');
  assert.equal(inexact.ok, true);
  assert.equal(inexact.exact, false, '3-digit carries only 2 significant figures');
  assert.equal(inexact.code, '462');
  assert.equal(inexact.ohms, 4600, 'reports what the code actually means, not what was asked for');

  const exact = encodeSmd(4700, 'd3');
  assert.equal(exact.exact, true);
});

test('encode/decode round-trip across all three systems', () => {
  for (const type of ['d3', 'd4', 'eia96']) {
    for (const ohms of [1, 4.7, 47, 100, 1000, 4990, 47000, 1e6]) {
      const enc = encodeSmd(ohms, type);
      if (!enc.ok || !enc.exact) continue;
      const dec = decodeSmd(enc.code, type);
      assert.equal(dec.ok, true, `${type} ${enc.code} failed to decode`);
      assert.equal(dec.ohms, ohms, `${type}: ${ohms} -> ${enc.code} -> ${dec.ohms}`);
    }
  }
});
