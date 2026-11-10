// Closed-loop tests: the procedural skier commits a known fault, the engine has to find it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../js/engine.js';
import { buildParams, simulate, FAULTS, PRESETS } from '../js/skier.js';

const run = (preset, faults = [], opts = {}) => analyze(simulate(buildParams(preset, faults), { noise: 0.008, ...opts }));
const ids = (r) => r.findings.map((f) => f.id);

test('levels are ordered: wedge < parallel < carving < expert', () => {
  const lv = Object.keys(PRESETS).map((k) => run(k).level);
  assert.deepEqual(lv, [...lv].sort((a, b) => a - b));
  assert.equal(lv[0], 1);
  assert.ok(lv[3] >= 5, `expert level ${lv[3]}`);
  const sc = Object.keys(PRESETS).map((k) => run(k).overall);
  assert.ok(sc[0] < sc[1] && sc[1] < sc[2], `scores ${sc}`);
});

test('a clean carver has no high-severity findings', () => {
  const r = run('carving');
  assert.ok(r.overall >= 80, `overall ${r.overall}`);
  assert.deepEqual(r.findings.filter((f) => f.sev > 0.35).map((f) => f.id), []);
});

test('wedge skier is recognised as a wedge, not as an A-frame', () => {
  const r = run('wedge');
  assert.ok(ids(r).includes('wedge'));
  assert.ok(!ids(r).includes('aframe'));
});

for (const fault of Object.keys(FAULTS)) {
  test(`fault "${fault}" is detected on a carving skier`, () => {
    const view = fault === 'backseat' ? 'side' : 'front';
    const r = run('carving', [fault], { view });
    assert.ok(r.ok);
    assert.ok(ids(r).slice(0, 3).includes(fault), `expected ${fault} in top 3, got ${ids(r)}`);
  });
  test(`fault "${fault}" lowers the score`, () => {
    const view = fault === 'backseat' ? 'side' : 'front';
    assert.ok(run('carving', [fault], { view }).overall < run('carving', [], { view }).overall);
  });
}

test('turn detection: count, alternation and timing', () => {
  const p = buildParams('carving');
  const r = analyze(simulate(p, { duration: p.period * 4 }));
  assert.ok(r.turns.length >= 7 && r.turns.length <= 9, `turns ${r.turns.length}`);
  for (let i = 1; i < r.turns.length; i++) assert.notEqual(r.turns[i].side, r.turns[i - 1].side);
  assert.ok(Math.abs(r.metrics.turnTime - p.period / 2) < 0.15, `turn time ${r.metrics.turnTime}`);
  assert.ok(Math.abs(r.metrics.edge - p.lean) < 4, `edge ${r.metrics.edge} vs ${p.lean}`);
});

test('camera view is identified and gates confidence', () => {
  assert.equal(run('carving', [], { view: 'front' }).view, 'front');
  assert.equal(run('carving', [], { view: 'back' }).view, 'back');
  const side = run('carving', [], { view: 'side' });
  assert.equal(side.view, 'side');
  assert.equal(side.dims.foreAft.conf, 'high');
  assert.equal(side.dims.edge.score, null);
  assert.equal(side.level, null);
  assert.equal(run('carving').dims.foreAft.conf, 'low');
});

test('left/right labels survive a back view and a swapped skeleton', () => {
  const p = buildParams('carving', ['asym']);
  const front = analyze(simulate(p, { view: 'front' }));
  const back = analyze(simulate(p, { view: 'back' }));
  assert.equal(front.metrics.weakSide, 'R');
  assert.equal(back.metrics.weakSide, 'R');
  // swap every left/right landmark pair, as a confused pose model would
  const swapped = simulate(p, { view: 'front' }).map((f) => {
    const sw = (arr) => { const a = arr.slice(); for (let i = 1; i < 33; i += 2) { const j = i < 11 ? null : i + 1; if (j && j < 33) [a[i], a[j]] = [a[j], a[i]]; } return a; };
    return { t: f.t, lm: sw(f.lm), world: sw(f.world) };
  });
  const r = analyze(swapped);
  assert.ok(Math.abs(r.metrics.edge - front.metrics.edge) < 1);
  assert.ok(r.metrics.foreAft > 0, 'forward axis recovered from nose and toes');
});

test('unusable input is rejected, not scored', () => {
  assert.equal(analyze([]).ok, false);
  const hidden = simulate(buildParams('carving')).map((f) => ({ ...f, lm: f.lm.map((q) => ({ ...q, visibility: 0.1 })) }));
  const r = analyze(hidden);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_skier');
});

test('tracking drop-outs do not masquerade as bad rhythm', () => {
  const p = buildParams('carving');
  const clean = simulate(p, { duration: p.period * 6, noise: 0.008 });
  // lose the skier for three stretches, as happens when they pass behind a gate or leave the frame
  const holes = [[2.0, 2.9], [6.1, 7.4], [10.2, 10.9]];
  const gappy = clean.map((f) => (holes.some(([a, b]) => f.t >= a && f.t <= b) ? { t: f.t, lm: null, world: null } : f));
  const r = analyze(gappy);
  assert.ok(r.ok);
  assert.ok(r.validRatio < 0.9);
  assert.ok(!ids(r).includes('rhythm'), `findings ${ids(r)}`);
  assert.ok(Math.abs(r.metrics.turnTime - p.period / 2) < 0.2, `turn time ${r.metrics.turnTime}`);
  assert.equal(r.dims.rhythm.conf, 'med');
});

test('a clip that is mostly untracked is refused; a patchy one is scored with lowered confidence', () => {
  const p = buildParams('carving');
  const clean = simulate(p, { duration: 12, noise: 0.008 });
  const keep = (from) => clean.map((f) => (f.t >= from ? f : { t: f.t, lm: null, world: null }));
  const mostlyLost = analyze(keep(9));      // skier visible for the last quarter only
  assert.equal(mostlyLost.ok, false);
  assert.equal(mostlyLost.reason, 'no_skier');
  const patchy = analyze(keep(5));          // ~58% tracked
  assert.ok(patchy.ok && patchy.lowTrack);
  assert.equal(patchy.dims.edge.conf, 'med');
  assert.equal(analyze(clean).dims.edge.conf, 'high');
});

test('a panning camera: lean comes from the front-on half, fore-aft from the side-on half', () => {
  const p = buildParams('carving', ['backseat']);
  const front = simulate(p, { duration: p.period * 3, view: 'front', noise: 0.008 });
  const side = simulate(p, { duration: p.period * 3, view: 'side', noise: 0.008 });
  const dt = front[1].t - front[0].t, shift = front.at(-1).t + dt;
  const clip = [...front, ...side.map((f) => ({ ...f, t: f.t + shift }))];
  const r = analyze(clip);
  assert.ok(r.ok);
  assert.ok(Math.abs(r.metrics.edge - p.lean) < 4, `edge ${r.metrics.edge}`);
  assert.equal(r.findings[0].id, 'backseat');
  assert.notEqual(r.findings[0].conf, 'low');
  assert.ok(r.turns.every((tu) => tu.t1 <= shift + 0.01), 'no turns invented from side-on frames');
});

test('a skier who is tiny in the frame is scored with lowered confidence', () => {
  const frames = simulate(buildParams('carving'), { noise: 0.008 });
  const tiny = frames.map((f) => ({ ...f, lm: f.lm.map((q) => ({ ...q, x: 0.5 + (q.x - 0.5) * 0.25, y: 0.5 + (q.y - 0.5) * 0.25 })) }));
  const r = analyze(tiny);
  assert.ok(r.ok && r.small);
  assert.equal(r.dims.edge.conf, 'med');
  assert.equal(analyze(frames).small, false);
});
