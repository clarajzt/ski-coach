// physics.js — the simplified mechanics of a carved turn. Pure functions.
//
//   carved radius      r = R_sidecut · cos(edge)
//   balance (level)    tan(lean) = v² / (g · r)
//   edge angle         edge = lean + angulation
//
// A pure carve with no angulation is self-consistent when sin(edge) = v² / (g · R_sidecut),
// which has no solution above the critical speed v = √(g · R_sidecut).

export const G = 9.81;
export const ANG_MAX = 20;   // degrees of angulation a body can realistically add
export const LOAD_MAX = 3;   // × body weight
const DEG = Math.PI / 180;

export function carve({ kmh, edge, sidecut }) {
  const v = kmh / 3.6;
  const radius = sidecut * Math.cos(edge * DEG);
  const gLat = (v * v) / (G * radius);
  const lean = Math.atan(gLat) / DEG;
  const load = Math.hypot(1, gLat);
  const ang = edge - lean;
  const k = (v * v) / (G * sidecut);
  const ideal = k < 1 ? Math.asin(k) / DEG : null;
  const vCrit = Math.sqrt(G * sidecut) * 3.6;
  const status = k >= 1 ? 'over' : load > LOAD_MAX ? 'heavy' : ang > ANG_MAX ? 'fall' : ang < -2 ? 'under' : 'ok';
  return { radius, gLat, lean, load, ang, ideal, vCrit, status };
}

/** For one speed: the range of edge angles that gives a balanced carve, or null. */
export function balancedBand(kmh, sidecut, maxEdge = 80) {
  const base = carve({ kmh, edge: 0, sidecut });
  if (base.ideal == null || base.ideal > maxEdge) return null;
  let hi = base.ideal;
  for (let e = Math.ceil(base.ideal); e <= maxEdge; e += 0.5) {
    const c = carve({ kmh, edge: e, sidecut });
    if (c.ang > ANG_MAX || c.load > LOAD_MAX) break;
    hi = e;
  }
  return { lo: base.ideal, hi };
}

/** Top-down path of linked carved arcs. Returns [{x, y}] in metres, y down the hill. */
export function trackPath(radius, descent = 70, halfAngle = 55 * DEG, ds = 0.4) {
  const pts = [];
  let x = 0, y = 0, h = -halfAngle, sign = 1;
  for (let i = 0; i < 4000 && y < descent; i++) {
    pts.push({ x, y });
    h += (sign * ds) / radius;
    if (Math.abs(h) >= halfAngle) { h = Math.sign(h) * halfAngle; sign = -sign; }
    x += Math.sin(h) * ds; y += Math.cos(h) * ds;
  }
  return pts;
}
