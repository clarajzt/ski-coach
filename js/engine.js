// engine.js — turns a sequence of body-pose frames into ski-technique metrics.
// Pure functions, no DOM: runs in the browser and under `node --test`.
//
// Frame format (MediaPipe Pose layout, 33 landmarks):
//   { t: seconds,
//     lm:    [{x, y, z, visibility}]  normalised image coordinates,
//     world: [{x, y, z}]              metres, hip-centred, x right / y down / z away from camera }

export const LM = {
  NOSE: 0, L_EAR: 7, R_EAR: 8, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24, L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28, L_HEEL: 29, R_HEEL: 30, L_TOE: 31, R_TOE: 32,
};

export const DIMS = ['edge', 'angulation', 'foreAft', 'flex', 'stance', 'upper', 'rhythm'];
const DIM_WEIGHT = { edge: 1.2, angulation: 1, foreAft: 1.3, flex: 1, stance: 0.9, upper: 0.9, rhythm: 0.8 };
const CONF_WEIGHT = { high: 1, med: 0.75, low: 0.45 };

// ---------- small vector / stats helpers ----------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => { const l = len(a) || 1e-9; return mul(a, 1 / l); };
const mid = (a, b) => mul(add(a, b), 0.5);
const dist = (a, b) => len(sub(a, b));
const flat = (a) => ({ x: a.x, y: 0, z: a.z });
const deg = (r) => (r * 180) / Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const UP = { x: 0, y: -1, z: 0 };

const angleAt = (a, b, c) => {
  const u = unit(sub(a, b)), w = unit(sub(c, b));
  return deg(Math.acos(clamp(dot(u, w), -1, 1)));
};
const present = (arr) => arr.filter((x) => x != null && Number.isFinite(x));
const mean = (arr) => { const a = present(arr); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; };
function quantile(arr, q) {
  const a = present(arr).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const median = (arr) => quantile(arr, 0.5);

/** Piecewise-linear lookup: pts = [[x, y], ...] sorted by x. */
export function curve(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

function smooth(vals, half) {
  if (half < 1) return vals.slice();
  return vals.map((_, i) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(vals.length - 1, i + half); j++) {
      if (vals[j] != null) { s += vals[j]; n++; }
    }
    return n ? s / n : null;
  });
}

// ---------- per-frame measurement ----------
const KEY = [11, 12, 23, 24, 25, 26, 27, 28];

/** Measure one frame. All angles in degrees; lateral angles are positive toward the skier's left. */
export function frameMetrics(frame) {
  const out = { t: frame.t, ok: false };
  const w = frame.world, lm = frame.lm;
  if (!w || !lm || w.length < 33) return out;
  const vis = KEY.map((i) => lm[i].visibility ?? 1);
  out.vis = vis.reduce((s, x) => s + x, 0) / vis.length;
  if (out.vis < 0.5 || Math.min(...vis) < 0.15) return out;

  const P = (i) => w[i];
  const hip = mid(P(23), P(24)), sh = mid(P(11), P(12));
  const knee = mid(P(25), P(26)), ank = mid(P(27), P(28));

  // Body axes. L points to the skier's left, F is the direction they face; both horizontal.
  // Everything lateral is measured in the pelvis frame, so a rotated chest cannot leak into it.
  let L = unit(flat(sub(P(23), P(24))));
  let F = cross(L, UP);
  // The model occasionally swaps left/right (bulky clothing, back views): let nose and toes vote.
  const hint = add(flat(sub(P(0), sh)), flat(add(sub(P(31), P(29)), sub(P(32), P(30)))));
  let flip = 1;
  if (dot(F, hint) < -0.02) { flip = -1; F = mul(F, -1); L = mul(L, -1); }

  out.latConf = Math.abs(L.x);   // 1 = filmed from the front / behind
  out.sagConf = Math.abs(L.z);   // 1 = filmed from the side
  out.toward = F.z < 0;          // skier faces the camera

  const lateral = (vec) => deg(Math.atan2(dot(vec, L), dot(vec, UP)));
  const leg = sub(hip, ank), torso = sub(sh, hip);
  out.lean = lateral(leg);
  out.torso = lateral(torso);

  const bodyLen = len(torso) + dist(hip, knee) + dist(knee, ank);
  const hipW = dist(P(23), P(24)) || 1e-6;
  const ankW = dist(P(27), P(28)), kneeW = dist(P(25), P(26));
  out.stance = ankW / hipW;
  out.kneeIn = 1 - kneeW / ((hipW + ankW) / 2);
  const heelW = dist(P(29), P(30));
  out.toeIn = heelW > 1e-6 ? dist(P(31), P(32)) / heelW : 1;
  out.knee = (angleAt(P(23), P(25), P(27)) + angleAt(P(24), P(26), P(28))) / 2;

  // Fore-aft: where the centre of mass sits relative to the ankles, in body lengths.
  const com = add(add(mul(sh, 0.35), mul(hip, 0.45)), mul(knee, 0.2));
  out.foreAft = dot(sub(com, ank), F) / bodyLen;

  const wristVis = Math.min(lm[15].visibility ?? 1, lm[16].visibility ?? 1);
  if (wristVis >= 0.3) {
    const wr = mid(P(15), P(16));
    out.handsH = dot(sub(wr, sh), unit(sub(hip, sh))) / (len(torso) || 1e-6);
    out.handsFwd = dot(sub(wr, sh), F) / bodyLen;
  } else { out.handsH = null; out.handsFwd = null; }

  // Shoulder rotation relative to the hips about the vertical axis; positive = turned to the left.
  const Ls = mul(sub(P(11), P(12)), flip);
  out.rot = deg(Math.atan2(-dot(Ls, F), dot(Ls, L)));
  out.ok = true;
  return out;
}

// ---------- turn detection ----------
function detectTurns(t, lean) {
  const p90 = quantile(lean.map((x) => (x == null ? null : Math.abs(x))), 0.9) ?? 0;
  const thr = Math.max(2.5, 0.3 * p90);
  const raw = [];
  let state = 0, start = 0, tStart = t[0];
  const n = lean.length;
  const steps = []; for (let i = 1; i < n; i++) steps.push(t[i] - t[i - 1]);
  const gap = 2.5 * (median(steps) || 0.1);
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const x = lean[i];
    if (x == null) continue;
    const last = prev; prev = i;
    if (last >= 0 && t[i] - t[last] > gap) {
      // the skier was lost for a while: close the turn in progress and start afresh
      if (state !== 0) raw.push({ side: state, i0: start, i1: last, ta: tStart, tb: t[last], partial: true });
      state = 0; start = i; tStart = t[i];
      if (raw.length) raw[raw.length - 1].partial = true;
      raw.push({ side: 0 });   // marks that the next turn starts mid-air
    }
    const s = x > thr ? 1 : x < -thr ? -1 : 0;
    if (s !== 0 && s !== state) {
      let b = i;
      while (b > start && lean[b - 1] != null && Math.sign(lean[b - 1]) === s) b--;
      // place the edge change between samples, so a low frame rate does not quantise turn length
      let tc = t[b];
      if (b > 0 && lean[b - 1] != null && Math.sign(lean[b - 1]) === -s) {
        const u = Math.abs(lean[b - 1]) / (Math.abs(lean[b - 1]) + Math.abs(lean[b]) || 1);
        tc = t[b - 1] + (t[b] - t[b - 1]) * u;
      }
      if (state !== 0) raw.push({ side: state, i0: start, i1: b, ta: tStart, tb: tc, partial: raw.length === 0 || raw[raw.length - 1].side === 0 });
      start = b; state = s; tStart = tc;
    }
  }
  if (state !== 0) raw.push({ side: state, i0: start, i1: n - 1, ta: tStart, tb: t[n - 1], partial: true });
  if (raw.length) raw[0].partial = true;

  const turns = [];
  for (const r of raw) {
    if (r.side === 0) continue;
    let peak = 0, iPeak = r.i0;
    for (let i = r.i0; i <= r.i1; i++) {
      if (lean[i] != null && Math.abs(lean[i]) > peak) { peak = Math.abs(lean[i]); iPeak = i; }
    }
    const dur = r.tb - r.ta;
    if (dur < 0.3 || peak < thr) continue;
    // Was the apex actually captured, or does the lean just run off the edge of what we saw?
    let before = false, after = false;
    for (let i = r.i0; i < iPeak; i++) if (lean[i] != null && Math.abs(lean[i]) < 0.85 * peak) before = true;
    for (let i = iPeak + 1; i <= r.i1; i++) if (lean[i] != null && Math.abs(lean[i]) < 0.85 * peak) after = true;
    turns.push({ apex: before && after, side: r.side > 0 ? 'L' : 'R', sign: r.side, i0: r.i0, i1: r.i1, iPeak, t0: r.ta, t1: r.tb, tPeak: t[iPeak], peak, dur, partial: r.partial });
  }
  return turns;
}

// ---------- scoring curves ----------
const S = {
  edge: [[0, 10], [8, 30], [15, 50], [25, 70], [35, 85], [45, 95], [55, 100]],
  angRatio: [[-0.6, 12], [0, 40], [0.5, 70], [1, 100]],
  foreAft: [[-0.14, 5], [-0.1, 20], [-0.05, 45], [0, 72], [0.04, 92], [0.07, 100], [0.15, 100], [0.22, 80]],
  kneeMean: [[95, 60], [115, 90], [125, 100], [148, 100], [158, 75], [166, 45], [175, 20]],
  kneeRange: [[0, 30], [6, 50], [12, 70], [20, 90], [28, 100]],
  stance: [[0.3, 30], [0.6, 60], [0.85, 95], [1.0, 100], [1.8, 100], [2.2, 75], [2.6, 45], [3.2, 25]],
  kneeIn: [[0.12, 100], [0.22, 75], [0.32, 45], [0.45, 20]],
  handsH: [[-0.1, 60], [0.1, 100], [0.8, 100], [0.95, 70], [1.1, 40], [1.3, 20]],
  handsFwd: [[-0.05, 15], [0.03, 40], [0.1, 75], [0.17, 100]],
  counter: [[-20, 10], [-10, 40], [-4, 68], [0, 80], [4, 95], [8, 100], [25, 100], [40, 80]],
  rhythmCV: [[0, 100], [0.1, 95], [0.2, 80], [0.35, 55], [0.6, 25]],
  asym: [[0, 100], [0.1, 92], [0.25, 70], [0.45, 40], [0.7, 15]],
};

const confOf = (x, hi, lo) => (x >= hi ? 'high' : x >= lo ? 'med' : 'low');

/**
 * Analyse a clip.
 * @param {Array} frames  pose frames (see top of file)
 * @returns report object; `ok:false` with a `reason` when the skier could not be measured.
 */
export function analyze(frames) {
  const all = frames.map(frameMetrics);
  const m = all.filter((f) => f.ok);
  const duration = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;
  const validRatio = frames.length ? m.length / frames.length : 0;
  // Refuse to score a clip the pose model could barely follow: a confident number built on
  // a handful of frames would be worse than no number.
  const validSeconds = duration > 0 ? (m.length / frames.length) * duration : 0;
  if (m.length < 12 || validSeconds < 2 || validRatio < 0.4) {
    return { ok: false, reason: 'no_skier', duration, frames: frames.length, validRatio };
  }
  const lowTrack = validRatio < 0.7;
  const down = { high: 'med', med: 'low', low: 'low' };
  const q = (c) => (lowTrack ? down[c] : c);

  const t = m.map((f) => f.t);
  const fps = (m.length - 1) / (t[t.length - 1] - t[0]);
  const half = Math.max(1, Math.round(0.14 * fps));
  const col = (k) => smooth(m.map((f) => f[k]), half);
  // A panning camera sees the skier from the front, then the side, then behind. Lateral angles
  // are only read from frames where the view supports them; the rest become gaps.
  const lat = (k) => smooth(m.map((f) => (f.latConf >= 0.55 ? f[k] : null)), half);
  const series = {
    t, lean: lat('lean'), torso: lat('torso'), foreAft: col('foreAft'), knee: col('knee'),
    stance: col('stance'), kneeIn: col('kneeIn'), toeIn: col('toeIn'),
    handsH: col('handsH'), handsFwd: col('handsFwd'), rot: col('rot'),
  };

  const latConf = mean(m.map((f) => f.latConf)), sagConf = mean(m.map((f) => f.sagConf));
  const toward = mean(m.map((f) => (f.toward ? 1 : 0))) >= 0.5;
  const view = latConf >= 0.75 ? (toward ? 'front' : 'back') : sagConf >= 0.75 ? 'side' : 'angled';
  const turns = present(series.lean).length >= 12 ? detectTurns(t, series.lean) : [];
  const seen = turns.filter((x) => x.apex);       // turns whose apex was observed
  const lateralOK = seen.length > 0;
  const argBest = (arr, better) => {
    let bi = -1;
    arr.forEach((x, i) => { if (x != null && (bi < 0 || better(x, arr[bi]))) bi = i; });
    return bi < 0 ? t[0] : t[bi];
  };

  // ----- aggregate metrics -----
  const M = {};
  M.turns = seen.length;
  M.edge = lateralOK ? mean(seen.map((x) => x.peak)) : null;

  for (const tu of turns) {
    const vals = [];
    for (let i = tu.i0; i <= tu.i1; i++) {
      if (series.lean[i] != null && Math.abs(series.lean[i]) >= 0.7 * tu.peak) vals.push((series.lean[i] - series.torso[i]) * tu.sign);
    }
    tu.ang = mean(vals);
  }
  M.angulation = lateralOK ? mean(seen.map((x) => x.ang)) : null;
  M.angTarget = M.edge != null ? clamp(0.35 * M.edge, 4, 18) : null;

  // Fore-aft is read from side-on frames when the clip has enough of them.
  const sideOn = series.foreAft.map((x, i) => (m[i].sagConf >= 0.6 ? x : null));
  const sideCount = present(sideOn).length;
  const useSide = sideCount >= Math.max(10, 0.2 * m.length);
  const fa = useSide ? sideOn : series.foreAft;
  M.foreAft = median(fa);
  M.backPct = Math.round(100 * mean(fa.map((x) => (x == null ? null : x < 0 ? 1 : 0))));
  M.kneeMean = median(series.knee);
  M.kneeRange = quantile(series.knee, 0.9) - quantile(series.knee, 0.1);
  M.stance = median(series.stance);
  M.kneeIn = median(series.kneeIn);
  M.wedgePct = Math.round(100 * mean(m.map((f) => (f.stance > 1.9 && f.toeIn < 0.9 ? 1 : 0))));
  M.wedge = M.wedgePct >= 50;
  M.handsH = median(series.handsH);
  M.handsFwd = median(series.handsFwd);

  // Counter (+) vs rotation (-): do the shoulders turn into the turn ahead of the hips?
  if (lateralOK) {
    let s = 0, wsum = 0;
    for (const tu of seen) for (let i = tu.i0; i <= tu.i1; i++) {
      if (series.rot[i] == null || series.lean[i] == null) continue;
      const wgt = Math.abs(series.lean[i]) / tu.peak;
      s += -series.rot[i] * tu.sign * wgt; wsum += wgt;
    }
    M.counter = wsum ? s / wsum : null;
  } else M.counter = null;

  const full = turns.filter((x) => !x.partial);
  const rhythmSet = full.length >= 4 ? full : [];
  if (rhythmSet.length >= 4) {
    // median / MAD rather than mean / SD: one missed edge change should not read as bad rhythm
    const d = rhythmSet.map((x) => x.dur), med = median(d);
    M.turnTime = med;
    M.rhythmCV = (1.4826 * median(d.map((x) => Math.abs(x - med)))) / med;
  } else { M.turnTime = turns.length ? mean(turns.map((x) => x.dur)) : null; M.rhythmCV = null; }
  const Ls = seen.filter((x) => x.side === 'L'), Rs = seen.filter((x) => x.side === 'R');
  if (Ls.length && Rs.length && seen.length >= 3) {
    M.peakL = mean(Ls.map((x) => x.peak)); M.peakR = mean(Rs.map((x) => x.peak));
    M.asym = Math.abs(M.peakL - M.peakR) / Math.max(M.peakL, M.peakR, 10);
    M.weakSide = M.peakL < M.peakR ? 'L' : 'R';
  } else M.asym = null;

  // ----- dimension scores -----
  const frontOn = mean(m.map((f) => (f.latConf >= 0.55 ? 1 : 0)));
  const latC = frontOn >= 0.6 ? confOf(latConf, 0.75, 0.6) : 'med';
  const sagC = useSide ? (sideCount >= 0.5 * m.length ? 'high' : 'med') : confOf(sagConf, 0.7, 0.5);
  const depthC = sagC === 'low' ? 'med' : 'high';
  const dims = {};
  const set = (id, score, conf) => { dims[id] = { id, score: score == null ? null : Math.round(clamp(score, 0, 100)), conf: q(conf) }; };

  set('edge', M.edge == null ? null : curve(M.edge, S.edge), latC);
  set('angulation', M.angulation == null ? null : curve(M.angulation / M.angTarget, S.angRatio), M.edge != null && M.edge < 8 ? 'low' : latC);
  set('foreAft', curve(M.foreAft, S.foreAft), sagC);
  set('flex', 0.5 * curve(M.kneeMean, S.kneeMean) + 0.5 * curve(M.kneeRange, S.kneeRange), depthC);
  set('stance', M.wedge ? 45 : 0.5 * curve(M.stance, S.stance) + 0.5 * curve(M.kneeIn, S.kneeIn), latC);
  const handsScore = M.handsH == null ? null : 0.5 * curve(M.handsH, S.handsH) + 0.5 * curve(M.handsFwd, S.handsFwd);
  const counterScore = M.counter == null ? null : curve(M.counter, S.counter);
  M.handsScore = handsScore;
  set('upper', handsScore == null ? counterScore : counterScore == null ? handsScore : 0.5 * handsScore + 0.5 * counterScore, 'med');
  const rParts = [M.rhythmCV == null ? null : curve(M.rhythmCV, S.rhythmCV), M.asym == null ? null : curve(M.asym, S.asym)];
  const rhythmC = validRatio >= 0.9 ? latC : down[latC];
  set('rhythm', mean(rParts), rhythmC);

  let ws = 0, wsum = 0;
  for (const id of DIMS) {
    const d = dims[id];
    if (d.score == null) continue;
    const wgt = DIM_WEIGHT[id] * CONF_WEIGHT[d.conf];
    ws += d.score * wgt; wsum += wgt;
  }
  const overall = Math.round(ws / wsum);

  // ----- level estimate (1 wedge … 6 expert; null when the view cannot show it) -----
  let level;
  if (M.wedge) level = M.wedgePct >= 80 ? 1 : 2;
  else if (M.edge == null) level = null;   // edging is the yardstick, and it cannot be seen from the side
  else {
    level = M.edge < 12 ? 2 : M.edge < 22 ? 3 : M.edge < 33 ? 4 : M.edge < 45 ? 5 : 6;
    if (level === 6 && overall < 78) level = 5;
    if (dims.foreAft.score < 40 && dims.foreAft.conf !== 'low') level = Math.min(level, 3);
  }

  // ----- findings -----
  const findings = [];
  const push = (id, sev, conf, time, data) => {
    sev = clamp(sev, 0, 1); conf = q(conf);
    const rank = sev * CONF_WEIGHT[conf];
    if (rank >= 0.15) findings.push({ id, sev, conf, rank, t: time, data });
  };
  const r1 = (x) => Math.round(x * 10) / 10;
  const weakest = (list, key, lowIsBad = true) => list.slice().sort((a, b) => (lowIsBad ? a[key] - b[key] : b[key] - a[key]))[0];

  if (M.foreAft < 0.02) {
    push('backseat', (0.02 - M.foreAft) / 0.14, sagC, argBest(fa, (a, b) => a < b),
      { pct: M.backPct, val: (M.foreAft >= 0 ? '+' : '') + M.foreAft.toFixed(2) });
  }
  if (M.wedge) {
    push('wedge', 0.55, latC, argBest(series.stance, (a, b) => a > b), { pct: M.wedgePct });
  }
  if (M.angulation != null && M.edge >= 10) {
    const r = M.angulation / M.angTarget;
    if (r < 0.6) push('banking', (0.6 - r) / 1.1 + 0.25, latC, weakest(seen, 'ang').tPeak,
      { lean: Math.round(M.edge), ang: r1(M.angulation), target: Math.round(M.angTarget) });
  }
  if (!M.wedge && M.edge != null && M.edge < 18) {
    push('lowEdge', ((18 - M.edge) / 18) * 0.7 + 0.1, latC, weakest(seen, 'peak').tPeak, { lean: Math.round(M.edge) });
  }
  if (M.kneeMean > 152 || M.kneeRange < 10) {
    const sev = Math.max((M.kneeMean - 146) / 22, ((12 - M.kneeRange) / 12) * 0.6);
    push('stiff', sev, depthC, argBest(series.knee, (a, b) => a > b), { knee: Math.round(M.kneeMean), range: Math.round(M.kneeRange) });
  }
  if (!M.wedge && M.kneeIn > 0.2 && M.stance >= 0.9) {
    push('aframe', (M.kneeIn - 0.15) / 0.3, latC, argBest(series.kneeIn, (a, b) => a > b), { pct: Math.round(M.kneeIn * 100) });
  }
  if (M.stance < 0.7) push('narrow', (0.75 - M.stance) / 0.5, latC, argBest(series.stance, (a, b) => a < b), { r: r1(M.stance) });
  if (!M.wedge && M.stance > 2.1) push('wide', (M.stance - 2.0) / 0.8, latC, argBest(series.stance, (a, b) => a > b), { r: r1(M.stance) });
  if (handsScore != null && handsScore < 70) {
    push('handsLow', (75 - handsScore) / 60, 'med', argBest(series.handsFwd, (a, b) => a < b), { f: M.handsFwd.toFixed(2) });
  }
  if (M.counter != null && M.counter < -8) {
    let bi = 0, bv = -Infinity;
    for (const tu of seen) for (let i = tu.i0; i <= tu.i1; i++) {
      const x = series.rot[i] == null ? -Infinity : series.rot[i] * tu.sign;
      if (x > bv) { bv = x; bi = i; }
    }
    push('rotation', (-M.counter - 5) / 16, 'med', t[bi], { deg: Math.round(-M.counter) });
  }
  if (M.asym != null && M.asym > 0.2) {
    const weak = weakest(M.weakSide === 'L' ? Ls : Rs, 'peak');
    push('asym', (M.asym - 0.1) / 0.5, rhythmC, weak.tPeak, { side: M.weakSide, l: Math.round(M.peakL), r: Math.round(M.peakR), pct: Math.round(M.asym * 100) });
  }
  if (M.rhythmCV != null && M.rhythmCV > 0.18) {
    push('rhythm', (M.rhythmCV - 0.12) / 0.4, rhythmC, weakest(rhythmSet, 'dur', false).t0, { pct: Math.round(M.rhythmCV * 100), avg: M.turnTime.toFixed(1) });
  }
  findings.sort((a, b) => b.rank - a.rank);

  const strengths = DIMS.filter((id) => dims[id].score != null && dims[id].score >= 80 && dims[id].conf !== 'low')
    .sort((a, b) => dims[b].score - dims[a].score).slice(0, 3);

  return {
    ok: true, duration, frames: frames.length, validRatio, lowTrack, fps,
    view, latConf, sagConf, series, turns: seen, metrics: M, dims, overall, level,
    findings, strengths, perFrame: all,
  };
}
