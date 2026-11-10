import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carve, balancedBand, trackPath, G } from '../js/physics.js';
import { KEYS } from '../js/i18n.js';
import { DRILLS, buildPlan, drillsFor } from '../js/drills.js';

test('carved radius shrinks as the ski is tipped', () => {
  const r = [10, 30, 50, 70].map((edge) => carve({ kmh: 30, edge, sidecut: 16 }).radius);
  assert.deepEqual(r, [...r].sort((a, b) => b - a));
  assert.ok(Math.abs(carve({ kmh: 30, edge: 60, sidecut: 16 }).radius - 8) < 1e-9);
});

test('ideal edge angle is self-consistent: lean equals edge, no angulation', () => {
  for (const kmh of [15, 25, 35, 42]) {
    const { ideal } = carve({ kmh, edge: 0, sidecut: 16 });
    const c = carve({ kmh, edge: ideal, sidecut: 16 });
    assert.ok(Math.abs(c.ang) < 1e-6, `ang ${c.ang} at ${kmh} km/h`);
    assert.equal(c.status, 'ok');
  }
});

test('above the critical speed no balanced carve exists', () => {
  const { vCrit } = carve({ kmh: 10, edge: 10, sidecut: 16 });
  assert.ok(Math.abs(vCrit - Math.sqrt(G * 16) * 3.6) < 1e-9);
  for (const edge of [10, 40, 70]) assert.equal(carve({ kmh: vCrit + 3, edge, sidecut: 16 }).status, 'over');
  assert.equal(balancedBand(vCrit + 3, 16), null);
  assert.ok(balancedBand(vCrit - 10, 16));
});

test('status reads sensibly across the map', () => {
  assert.equal(carve({ kmh: 15, edge: 60, sidecut: 16 }).status, 'fall');   // slow, huge edge
  assert.equal(carve({ kmh: 40, edge: 15, sidecut: 16 }).status, 'under');  // fast, flat ski
  assert.equal(carve({ kmh: 36, edge: 45, sidecut: 16 }).status, 'ok');
  assert.equal(carve({ kmh: 44, edge: 78, sidecut: 16 }).status, 'heavy');
});

test('track path descends and alternates direction', () => {
  const pts = trackPath(10);
  assert.ok(pts.at(-1).y >= 69);
  const xs = pts.map((p) => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 5);
});

test('every string exists in both languages', () => {
  const en = new Set(KEYS.en), zh = new Set(KEYS.zh);
  assert.deepEqual(KEYS.en.filter((k) => !zh.has(k)), []);
  assert.deepEqual(KEYS.zh.filter((k) => !en.has(k)), []);
});

test('every finding has copy and at least one drill; every drill is bilingual', () => {
  const findings = ['backseat', 'banking', 'lowEdge', 'stiff', 'aframe', 'narrow', 'wide', 'wedge', 'handsLow', 'rotation', 'asym', 'rhythm'];
  const en = new Set(KEYS.en);
  for (const f of findings) {
    for (const part of ['title', 'saw', 'why', 'cue']) assert.ok(en.has(`f.${f}.${part}`), `f.${f}.${part}`);
    for (let level = 1; level <= 6; level++) {
      if (f === 'wedge' && level > 3) continue;
      assert.ok(drillsFor(f, level).length >= 1, `${f} @ level ${level}`);
    }
  }
  for (const d of DRILLS) {
    assert.ok(d.name.en && d.name.zh && d.feel.en && d.feel.zh);
    assert.equal(d.how.en.length, d.how.zh.length);
  }
});

test('plans are full, unique and lead with the top finding', () => {
  for (let level = 1; level <= 6; level++) {
    const plan = buildPlan(['backseat', 'rotation', 'banking'], level);
    assert.equal(plan.length, 4);
    assert.equal(new Set(plan.map((p) => p.drill.id)).size, 4);
    assert.equal(plan[0].why, 'backseat');
    assert.ok(buildPlan([], level).length >= 3);
  }
});
