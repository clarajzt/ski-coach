// skier.js — a procedural skier. A small kinematic model produces the same 33 body
// landmarks a pose-estimation network would, so the coach can be demonstrated (and
// unit-tested) without any video: dial a fault in, and the analysis has to find it.

const DEG = Math.PI / 180;
export const SCALE = 0.36;      // image heights per metre
export const FOOT_Y = 0.83;     // where the feet sit in the frame
const PITCH = 16 * DEG, COS_P = Math.cos(PITCH), SIN_P = Math.sin(PITCH);
const BODY = { hipW: 0.22, shW: 0.38, shin: 0.43, thigh: 0.43, torso: 0.5, upperArm: 0.28, foreArm: 0.26, ankleH: 0.1 };

/** Technique presets: what a typical skier at each stage looks like. */
export const PRESETS = {
  wedge:    { period: 3.8, lean: 5,  angRatio: 0.15, stance: 2.7,  toeIn: 22, kneeIn: 0.25, flexBase: 0.035, flexAmp: 0.008, torsoFwd: 16, backseat: 0.3,  rot: 9,  heading: 28 },
  parallel: { period: 2.9, lean: 19, angRatio: 0.3,  stance: 1.15, toeIn: 0,  kneeIn: 0.05, flexBase: 0.05,  flexAmp: 0.04,  torsoFwd: 24, backseat: 0.1,  rot: 1,  heading: 34 },
  carving:  { period: 2.4, lean: 31, angRatio: 0.42, stance: 1.4,  toeIn: 0,  kneeIn: 0,    flexBase: 0.07,  flexAmp: 0.075, torsoFwd: 28, backseat: 0,    rot: -5, heading: 38 },
  expert:   { period: 1.9, lean: 54, angRatio: 0.44, stance: 1.65, toeIn: 0,  kneeIn: 0,    flexBase: 0.07,  flexAmp: 0.11,  torsoFwd: 30, backseat: 0,    rot: -8, heading: 42 },
};
const BASE = { asym: 0, jitter: 0, handDrop: 0.3, handFwd: 0.32, handOut: 0.12 };

/** Faults that can be layered on top of any preset. */
export const FAULTS = {
  backseat: (p) => { p.backseat = 0.85; },
  banking:  (p) => { p.angRatio = -0.08; p.lean = Math.max(p.lean, 16); },
  aframe:   (p) => { p.kneeIn = 0.7; p.stance = Math.max(p.stance, 1.3); },
  rotation: (p) => { p.rot = 24; },
  stiff:    (p) => { p.flexBase = 0.008; p.flexAmp = 0.003; p.lean = Math.min(p.lean, 16); p.stance = Math.min(p.stance, 1.15); },
  handsLow: (p) => { p.handDrop = 0.55; p.handFwd = -0.02; p.handOut = 0.03; },
  asym:     (p) => { p.asym = 0.45; },
  rhythm:   (p) => { p.jitter = 1; },
};

export function buildParams(preset = 'carving', faults = []) {
  const p = { ...BASE, ...PRESETS[preset] };
  for (const f of faults) FAULTS[f]?.(p);
  return p;
}

// ---------- vector helpers ----------
const V = (x, y, z) => ({ x, y, z });
const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, k) => V(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const unit = (a) => mul(a, 1 / (len(a) || 1e-9));

/** Two-bone IK: joint position between `root` and `end`, bending toward `pole`. */
function bend(root, end, a, b, pole) {
  const d = sub(end, root);
  const c = Math.min(len(d), (a + b) * 0.999);
  const dir = unit(d);
  const cosA = (a * a + c * c - b * b) / (2 * a * c);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const perp = unit(sub(pole, mul(dir, dot(pole, dir))));
  return add(root, add(mul(dir, a * cosA), mul(perp, a * sinA)));
}

/**
 * Skier pose at time t.
 * Body frame: x = skier's left, y = up, z = forward. Returns MediaPipe-style landmarks plus
 * ski / pole segments for drawing.
 * @param view 'front' (skiing toward camera) | 'back' | 'side'
 */
export function poseAt(p, t, view = 'front', aspect = 16 / 9) {
  const w = (2 * Math.PI) / p.period;
  const th = w * t + p.jitter * 1.2 * Math.sin(0.31 * w * t);
  const s = Math.sin(th), c = Math.cos(th);
  const amp = s < 0 ? 1 - p.asym : 1;
  const phi = p.lean * DEG * s * amp;          // inclination, + = left turn
  const psi = -p.heading * DEG * c;            // direction of travel vs fall line
  const flex = p.flexBase + p.flexAmp * (0.5 + 0.5 * Math.cos(2 * th)) + 0.1 * p.backseat;

  // feet
  const st = p.stance * BODY.hipW;
  const lead = 0.04 * s;
  const LA = V(st / 2, BODY.ankleH, lead), RA = V(-st / 2, BODY.ankleH, -lead);
  const ankMid = V(0, BODY.ankleH, 0);

  // pelvis
  const legMax = BODY.shin + BODY.thigh;
  const zHip = -0.03 - 0.28 * p.backseat;
  const rho = phi * 0.6 * (1 - Math.max(0, p.angRatio));
  const hipAxis = V(Math.cos(rho), -Math.sin(rho), 0);
  let d = legMax * (1 - flex), hipC, LH, RH;
  for (let k = 0; k < 4; k++) {
    hipC = add(ankMid, V(d * Math.sin(phi), d * Math.cos(phi), zHip));
    LH = add(hipC, mul(hipAxis, BODY.hipW / 2));
    RH = sub(hipC, mul(hipAxis, BODY.hipW / 2));
    const far = Math.max(len(sub(LH, LA)), len(sub(RH, RA)));
    if (far <= legMax * 0.985) break;
    d *= (legMax * 0.98) / far;
  }
  const kIn = p.kneeIn * 0.9;
  const LK = bend(LH, LA, BODY.thigh, BODY.shin, V(-kIn, 0, 1));
  const RK = bend(RH, RA, BODY.thigh, BODY.shin, V(kIn, 0, 1));

  // torso & shoulders
  const tl = phi * (1 - p.angRatio);
  const tau = (p.torsoFwd + 8 * p.backseat) * DEG;
  const torsoDir = V(Math.sin(tl) * Math.cos(tau), Math.cos(tl) * Math.cos(tau), Math.sin(tau));
  const shC = add(hipC, mul(torsoDir, BODY.torso));
  const beta = p.rot * DEG * s * amp;          // + = shoulders turn into the turn
  const tilt = tl * 0.7;
  const shAxis = V(Math.cos(beta) * Math.cos(tilt), -Math.sin(tilt), -Math.sin(beta) * Math.cos(tilt));
  const LS = add(shC, mul(shAxis, BODY.shW / 2)), RS = sub(shC, mul(shAxis, BODY.shW / 2));
  const face = V(Math.sin(beta), 0, Math.cos(beta));
  const side = V(Math.cos(beta), 0, -Math.sin(beta));
  const up = V(0, 1, 0);

  // arms
  const wrist = (S, sgn) => add(S, add(add(mul(side, sgn * p.handOut), V(0, -p.handDrop, 0)), mul(face, p.handFwd)));
  const LW = wrist(LS, 1), RW = wrist(RS, -1);
  const elbowPole = (sgn) => add(add(mul(side, sgn), V(0, -0.6, 0)), mul(face, -0.5));
  const LE = bend(LS, LW, BODY.upperArm, BODY.foreArm, elbowPole(1));
  const RE = bend(RS, RW, BODY.upperArm, BODY.foreArm, elbowPole(-1));

  // head
  const headC = add(shC, add(mul(up, 0.2), mul(face, 0.03)));
  const nose = add(headC, mul(face, 0.1));

  // feet & gear
  const footDir = (sgn) => { const a = -sgn * p.toeIn * DEG; return V(Math.sin(a), 0, Math.cos(a)); };
  const fL = footDir(1), fR = footDir(-1);
  const heel = (A, f) => add(A, add(mul(f, -0.06), V(0, -0.07, 0)));
  const toe = (A, f) => add(A, add(mul(f, 0.2), V(0, -0.08, 0)));
  const ski = (A, f) => [add(V(A.x, 0.01, A.z), mul(f, -0.78)), add(V(A.x, 0.01, A.z), mul(f, 0.9))];
  const pole = (W, sgn) => {
    const dir = unit(add(add(mul(side, sgn * 0.18), V(0, -0.78, 0)), mul(face, -0.6)));
    const L = Math.min(1.12, (W.y - 0.02) / Math.max(0.2, -dir.y));
    return [W, add(W, mul(dir, L))];
  };

  const pts = new Array(33);
  pts[0] = nose;
  pts[1] = pts[2] = pts[3] = add(headC, add(mul(side, 0.03), add(mul(face, 0.085), mul(up, 0.035))));
  pts[4] = pts[5] = pts[6] = add(headC, add(mul(side, -0.03), add(mul(face, 0.085), mul(up, 0.035))));
  pts[7] = add(headC, mul(side, 0.075)); pts[8] = add(headC, mul(side, -0.075));
  pts[9] = add(headC, add(mul(side, 0.025), add(mul(face, 0.085), mul(up, -0.045))));
  pts[10] = add(headC, add(mul(side, -0.025), add(mul(face, 0.085), mul(up, -0.045))));
  pts[11] = LS; pts[12] = RS; pts[13] = LE; pts[14] = RE; pts[15] = LW; pts[16] = RW;
  pts[17] = add(LW, mul(face, 0.07)); pts[18] = add(RW, mul(face, 0.07));
  pts[19] = add(LW, add(mul(face, 0.08), mul(up, 0.02))); pts[20] = add(RW, add(mul(face, 0.08), mul(up, 0.02)));
  pts[21] = add(LW, add(mul(face, 0.04), mul(up, 0.03))); pts[22] = add(RW, add(mul(face, 0.04), mul(up, 0.03)));
  pts[23] = LH; pts[24] = RH; pts[25] = LK; pts[26] = RK; pts[27] = LA; pts[28] = RA;
  pts[29] = heel(LA, fL); pts[30] = heel(RA, fR); pts[31] = toe(LA, fL); pts[32] = toe(RA, fR);

  // body frame → slope frame (heading) → camera frame (x right, y down, z away)
  const cs = Math.cos(psi), sn = Math.sin(psi);
  const toCam = (q) => {
    const x = q.x * cs + q.z * sn, z = -q.x * sn + q.z * cs, y = q.y;
    if (view === 'back') return V(-x, -y, z);
    if (view === 'side') return V(z, -y, x);
    return V(x, -y, -z);
  };
  // The picture is taken from slightly above (PITCH) so skis and tracks read in depth;
  // `world` stays gravity-aligned, which is what the engine measures.
  const sway = view === 'side' ? 0 : (view === 'back' ? 1 : -1) * 0.2 * s;
  const project = (q) => ({ x: 0.5 + (q.x * SCALE + sway) / aspect, y: FOOT_Y + (q.y * COS_P - q.z * SIN_P) * SCALE, z: q.z * SCALE });

  const cam = pts.map(toCam);
  const origin = toCam(hipC);
  const seg = (pair) => pair.map((q) => project(toCam(q)));
  return {
    lm: cam.map((q) => ({ ...project(q), visibility: 1 })),
    world: cam.map((q) => sub(q, origin)),
    gear: { skis: [seg(ski(LA, fL)), seg(ski(RA, fR))], poles: [seg(pole(LW, 1)), seg(pole(RW, -1))], head: project(toCam(headC)) },
    phase: { s, lean: phi / DEG, sway, heading: psi / DEG },
  };
}

/** Turn phase only (sin of the turn cycle) — cheap, for drawing the track behind the skier. */
export function phaseAt(p, t) {
  const w = (2 * Math.PI) / p.period;
  return Math.sin(w * t + p.jitter * 1.2 * Math.sin(0.31 * w * t));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/** Sample a whole run as pose frames, optionally with landmark noise (metres, 1σ). */
export function simulate(p, { duration = p.period * 4, fps = 20, view = 'front', aspect = 16 / 9, noise = 0, seed = 7 } = {}) {
  const rnd = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const frames = [];
  for (let i = 0; i <= Math.round(duration * fps); i++) {
    const t = i / fps;
    const pose = poseAt(p, t, view, aspect);
    if (noise > 0) for (const q of pose.world) { q.x += gauss() * noise; q.y += gauss() * noise; q.z += gauss() * noise * 2; }
    frames.push({ t, lm: pose.lm, world: pose.world });
  }
  return frames;
}
