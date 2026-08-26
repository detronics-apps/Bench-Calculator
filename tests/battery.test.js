import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CELLS, cellById, buildPack, estimateRuntime, formatDuration,
} from '../js/battery.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('the cell table covers every chemistry we offer', () => {
  const ids = CELLS.map((c) => c.id);
  for (const id of ['aa-alkaline', 'aaa-alkaline', 'aa-nimh', 'aaa-nimh',
    'pp3-alkaline', '18650', 'lipo-1s', 'cr2032', 'cr2025']) {
    assert.ok(ids.includes(id), `missing cell ${id}`);
  }
  assert.equal(cellById('nope'), null);
});

test('every cell is internally consistent', () => {
  for (const c of CELLS) {
    assert.ok(c.nominalV > c.cutoffV, `${c.id}: cut-off must be below nominal`);
    assert.ok(c.capacityMah > 0, `${c.id}: needs a capacity`);
    assert.ok(c.maxCurrentMa > 0, `${c.id}: needs a current limit`);
    assert.ok(c.name && c.chemistry, `${c.id}: needs a name and chemistry`);
  }
});

test('NiMH sits at a lower nominal voltage than alkaline', () => {
  assert.equal(cellById('aa-alkaline').nominalV, 1.5);
  assert.equal(cellById('aa-nimh').nominalV, 1.2);
});

test('coin cells carry a low current limit, which is the point of having one', () => {
  assert.ok(cellById('cr2032').maxCurrentMa <= 5);
  assert.ok(cellById('aa-alkaline').maxCurrentMa >= 100);
});

test('cells in series multiply voltage, not capacity', () => {
  const p = buildPack({ cellId: 'aa-alkaline', series: 4, parallel: 1 });
  assert.equal(p.ok, true);
  assert.equal(p.nominalV, 6);
  assert.ok(close(p.cutoffV, 3.6));
  assert.equal(p.capacityMah, 2500);
  assert.equal(p.cellCount, 4);
});

test('cells in parallel multiply capacity and current, not voltage', () => {
  const p = buildPack({ cellId: 'aa-alkaline', series: 1, parallel: 3 });
  assert.equal(p.nominalV, 1.5);
  assert.equal(p.capacityMah, 7500);
  assert.equal(p.maxCurrentMa, cellById('aa-alkaline').maxCurrentMa * 3);
  assert.equal(p.cellCount, 3);
});

test('a series-parallel pack multiplies both', () => {
  const p = buildPack({ cellId: '18650', series: 3, parallel: 2 });
  assert.ok(close(p.nominalV, 11.1));
  assert.equal(p.capacityMah, 6000);
  assert.equal(p.cellCount, 6);
});

test('capacity can be overridden for the cells people actually buy', () => {
  const p = buildPack({ cellId: 'lipo-1s', series: 1, parallel: 2, capacityMah: 2200 });
  assert.equal(p.capacityMah, 4400);
});

test('buildPack rejects nonsense arrangements', () => {
  assert.equal(buildPack({ cellId: 'nope' }).ok, false);
  assert.equal(buildPack({ cellId: 'aa-alkaline', series: 0 }).ok, false);
  assert.equal(buildPack({ cellId: 'aa-alkaline', series: 1, parallel: 0 }).ok, false);
  assert.equal(buildPack({ cellId: 'aa-alkaline', series: 1.5 }).ok, false);
});

test('runtime brackets the answer between a constant draw and a linear taper', () => {
  const pack = buildPack({ cellId: 'aa-alkaline', series: 4, parallel: 1 });
  // 2500 mAh at a steady 20 mA is 125 h; tapering to 10 mA averages 15 mA -> 166.7 h.
  const r = estimateRuntime(pack, { currentAtNominalA: 0.02, currentAtCutoffA: 0.01 });
  assert.equal(r.ok, true);
  assert.ok(close(r.shortestHours, 125, 1e-6), `got ${r.shortestHours}`);
  assert.ok(close(r.longestHours, 2500 / 15, 1e-6), `got ${r.longestHours}`);
  assert.ok(r.longestHours > r.shortestHours);
});

test('a load that dies at cut-off still gives a bounded range', () => {
  const pack = buildPack({ cellId: 'aa-alkaline', series: 2, parallel: 1 });
  const r = estimateRuntime(pack, { currentAtNominalA: 0.02, currentAtCutoffA: 0 });
  assert.ok(close(r.shortestHours, 125, 1e-6));
  // Averaging 20 mA down to nothing is 10 mA, so at most twice the short figure.
  assert.ok(close(r.longestHours, 250, 1e-6));
});

test('runtime warns when the load exceeds what the cell can deliver', () => {
  const pack = buildPack({ cellId: 'cr2032', series: 1, parallel: 1 });
  const r = estimateRuntime(pack, { currentAtNominalA: 0.02, currentAtCutoffA: 0.015 });
  const ids = r.warnings.map((w) => w.id);
  assert.ok(ids.includes('pack-current'), `expected a current warning, got ${ids}`);
  const w = r.warnings.find((x) => x.id === 'pack-current');
  assert.equal(w.level, 'warn');
  assert.match(w.text, /CR2032/i);
});

test('a comfortable load raises no battery warnings', () => {
  const pack = buildPack({ cellId: 'aa-alkaline', series: 4, parallel: 1 });
  const r = estimateRuntime(pack, { currentAtNominalA: 0.02, currentAtCutoffA: 0.01 });
  assert.deepEqual(r.warnings, []);
});

test('runtime rejects a dead load', () => {
  const pack = buildPack({ cellId: 'aa-alkaline', series: 4 });
  assert.equal(estimateRuntime(pack, { currentAtNominalA: 0 }).ok, false);
  assert.equal(estimateRuntime(null, { currentAtNominalA: 0.02 }).ok, false);
});

test('formatDuration reads in the units a person would use', () => {
  assert.equal(formatDuration(0.25), '15 min');
  assert.equal(formatDuration(1), '1 h');
  assert.equal(formatDuration(5.5), '5.5 h');
  assert.equal(formatDuration(36), '1 d 12 h');
  assert.equal(formatDuration(24 * 400), '1.1 years');
  assert.equal(formatDuration(0), '—');
});
