import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellById, buildPack, PACK_PRODUCTS, productById, buildProductPack, estimateRuntime,
} from '../js/battery.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/* ------------------------------------------------------- the LG HG2 cell */

test('the LG INR18650-HG2 carries its own specification, not the generic one', () => {
  const hg2 = cellById('lg-hg2');
  assert.ok(hg2, 'the HG2 should be selectable as a cell in its own right');
  assert.equal(hg2.nominalV, 3.6, 'the HG2 is a 3.60 V cell, not 3.7 V');
  assert.equal(hg2.capacityMah, 3000);
  assert.equal(hg2.cutoffV, 2.5);
  assert.equal(hg2.maxChargeV, 4.2);
  // 3.0 Ah x 3.6 V = 10.8 Wh per cell.
  assert.ok(close(hg2.capacityMah / 1000 * hg2.nominalV, 10.8, 1e-9));
});

test('the generic 18650 is still there, and is labelled as generic', () => {
  const generic = cellById('18650');
  assert.ok(generic);
  assert.match(generic.name, /generic/i);
  assert.equal(generic.nominalV, 3.7, 'the generic figure stays 3.7 V');
});

/* ------------------------------------------------------------- products */

test('both MagBot products are offered', () => {
  assert.deepEqual(PACK_PRODUCTS.map((p) => p.id), ['magbot-2s-powerpack', 'magbot-1s-powerhub']);
  assert.equal(productById('nope'), null);
});

test('every product is internally consistent', () => {
  for (const p of PACK_PRODUCTS) {
    assert.ok(cellById(p.cellId), `${p.id}: unknown cell ${p.cellId}`);
    assert.ok(p.name && p.subtitle && p.description, `${p.id}: needs its blurb`);
    assert.ok(p.outputs.length >= 1, `${p.id}: needs at least one output`);
    for (const o of p.outputs) {
      assert.ok(o.efficiency > 0 && o.efficiency <= 1, `${p.id}/${o.id}: efficiency out of range`);
      if (o.regulated) assert.ok(o.volts > 0, `${p.id}/${o.id}: a regulated output needs a voltage`);
    }
  }
});

test('the 2S PowerPack is two HG2 cells in series', () => {
  const pack = buildProductPack({ productId: 'magbot-2s-powerpack' });
  assert.equal(pack.ok, true);
  assert.equal(pack.series, 2);
  assert.equal(pack.parallel, 1);
  assert.equal(pack.cellCount, 2);
  assert.ok(close(pack.nominalV, 7.2), `nominal was ${pack.nominalV}`);
  assert.ok(close(pack.maxChargeV, 8.4), `full charge was ${pack.maxChargeV}`);
  assert.ok(close(pack.cutoffV, 5.0));
  assert.equal(pack.capacityMah, 3000, 'series does not add capacity');
});

test('the 2S PowerPack carries 21.6 Wh, of which 20.52 Wh is usable', () => {
  const pack = buildProductPack({ productId: 'magbot-2s-powerpack' });
  assert.ok(close(pack.energyWh, 21.6, 1e-9), `energy was ${pack.energyWh}`);
  assert.equal(pack.efficiency, 0.95);
  assert.ok(close(pack.usableWh, 20.52, 1e-9), `usable was ${pack.usableWh}`);
  assert.equal(pack.regulated, false, 'the pack output follows the cells');
  assert.ok(close(pack.outputV, 7.2));
});

test('the BMS limit caps the pack current below what the cells could give', () => {
  const pack = buildProductPack({ productId: 'magbot-2s-powerpack' });
  // Two HG2 in series could pass 20 A; the HX-2S-JH20 is the limit at 10 A.
  assert.equal(pack.maxCurrentMa, 10000);
  assert.match(pack.limitName, /HX-2S-JH20|BMS|PowerPack/i);
});

test('the 1S PowerHub offers three outputs with different efficiencies', () => {
  const hub = productById('magbot-1s-powerhub');
  assert.deepEqual(hub.outputs.map((o) => o.id), ['raw', '5v', '3v3']);

  const raw = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: 'raw' });
  assert.equal(raw.regulated, false);
  assert.ok(close(raw.outputV, 3.6), 'raw output follows the cell');
  assert.ok(raw.efficiency >= 0.98, 'almost nothing is lost on the raw path');

  const v5 = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: '5v' });
  assert.equal(v5.regulated, true);
  assert.equal(v5.outputV, 5);
  assert.equal(v5.efficiency, 0.88);

  const v33 = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: '3v3' });
  assert.equal(v33.regulated, true);
  assert.equal(v33.outputV, 3.3);
  assert.equal(v33.efficiency, 0.82, 'boost then buck, so the losses multiply');
  assert.ok(v33.efficiency < v5.efficiency, '3.3 V sits downstream of the 5 V rail');
});

test('a 1S pack is one cell, so it holds 10.8 Wh', () => {
  const raw = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: 'raw' });
  assert.equal(raw.cellCount, 1);
  assert.ok(close(raw.energyWh, 10.8, 1e-9));
});

test('buildProductPack defaults to the first output and rejects bad ids', () => {
  const dflt = buildProductPack({ productId: 'magbot-1s-powerhub' });
  assert.equal(dflt.output.id, 'raw');
  assert.equal(buildProductPack({ productId: 'nope' }).ok, false);
  assert.equal(buildProductPack({ productId: 'magbot-1s-powerhub', outputId: '12v' }).ok, false);
});

test('capacity can be overridden on a product too', () => {
  const pack = buildProductPack({ productId: 'magbot-2s-powerpack', capacityMah: 3500 });
  assert.equal(pack.capacityMah, 3500);
  assert.ok(close(pack.energyWh, 3.5 * 7.2, 1e-9));
});

/* -------------------------------------------------------------- runtime */

test('a regulated output holds its current, so runtime is one figure not a range', () => {
  const v5 = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: '5v' });
  // 5 V x 1 A = 5 W of load; 10.8 Wh x 0.88 = 9.504 Wh usable.
  const r = estimateRuntime(v5, { currentAtNominalA: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.regulated, true);
  assert.equal(r.shortestHours, r.longestHours, 'a regulator does not let the draw taper');
  assert.ok(close(r.shortestHours, 9.504 / 5, 1e-9), `got ${r.shortestHours}`);
  // The battery has to supply more than the load takes.
  assert.ok(close(r.batteryPowerW, 5 / 0.88, 1e-9), `got ${r.batteryPowerW}`);
});

test('the 3.3 V rail runs down faster than the 5 V rail for the same load power', () => {
  const v5 = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: '5v' });
  const v33 = buildProductPack({ productId: 'magbot-1s-powerhub', outputId: '3v3' });
  // Same 1 W load on each rail.
  const a5 = estimateRuntime(v5, { currentAtNominalA: 1 / 5 });
  const a33 = estimateRuntime(v33, { currentAtNominalA: 1 / 3.3 });
  assert.ok(a33.shortestHours < a5.shortestHours, 'the extra buck stage costs runtime');
});

test('an unregulated product output still gives a tapering range', () => {
  const pack = buildProductPack({ productId: 'magbot-2s-powerpack' });
  const r = estimateRuntime(pack, { currentAtNominalA: 0.5, currentAtCutoffA: 0.3 });
  assert.equal(r.regulated, false);
  assert.ok(r.longestHours > r.shortestHours);
  // Efficiency trims the usable capacity: 3000 mAh x 0.95 = 2850 mAh.
  assert.ok(close(r.shortestHours, 2.85 / 0.5, 1e-9), `got ${r.shortestHours}`);
});

test('the pack-current warning names the BMS, not just the cell', () => {
  const pack = buildProductPack({ productId: 'magbot-2s-powerpack' });
  const r = estimateRuntime(pack, { currentAtNominalA: 12, currentAtCutoffA: 11 });
  const w = r.warnings.find((x) => x.id === 'pack-current');
  assert.ok(w, 'drawing 12 A through a 10 A BMS should warn');
  assert.match(w.text, /HX-2S-JH20|PowerPack/i);
});

test('packs built from loose cells are unaffected by any of this', () => {
  const pack = buildPack({ cellId: 'aa-alkaline', series: 4, parallel: 1 });
  assert.equal(pack.efficiency, 1);
  assert.equal(pack.regulated, false);
  assert.ok(close(pack.outputV, 6));
  const r = estimateRuntime(pack, { currentAtNominalA: 0.02, currentAtCutoffA: 0.01 });
  assert.ok(close(r.shortestHours, 125, 1e-6));
});
