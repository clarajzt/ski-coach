// render.js — canvas drawing (skier scene, skeleton overlay) and small SVG chart builders.
import { SCALE, FOOT_Y } from './skier.js';

const PALETTE = {
  light: { skyTop: '#bcd9f0', skyBot: '#e9f3fa', ridgeFar: '#c6d9e9', ridgeNear: '#d8e6f1', snowTop: '#f6fafd', snowBot: '#dde9f2',
           line: 'rgba(40,80,120,0.10)', track: 'rgba(52,96,140,0.30)', shadow: 'rgba(20,50,80,0.16)',
           pants: '#1b3552', helmet: '#15263a', ski: '#101c2a', pole: '#6f8091' },
  dark:  { skyTop: '#060f1a', skyBot: '#12263a', ridgeFar: '#14283c', ridgeNear: '#193149', snowTop: '#23405b', snowBot: '#0e1e2e',
           line: 'rgba(200,225,255,0.07)', track: 'rgba(190,220,255,0.24)', shadow: 'rgba(0,0,0,0.38)',
           pants: '#44688f', helmet: '#e9eff5', ski: '#e2eaf2', pole: '#90a2b4' },
};
const JACKET = '#ff5a1f', GLOVE = '#0f1c2b', GOGGLE = '#ffb648';
const SK = { left: '#35c2ff', right: '#ffb13d', mid: '#ffffff', measure: '#ffe14d' };

const RIDGE = [0.62, 0.5, 0.58, 0.36, 0.48, 0.3, 0.44, 0.52, 0.34, 0.5, 0.4, 0.56, 0.46, 0.6];

function ridge(ctx, W, horizon, amp, shift, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  const n = RIDGE.length - 1;
  for (let i = 0; i <= n; i++) ctx.lineTo((i / n) * W * 1.2 - W * 0.1 + shift, horizon - RIDGE[i] * amp);
  ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();
}

/**
 * Draw the simulated skier on a slope.
 * @param o { view, t, dark, skeleton, phase(tau) → turn phase tau seconds ago }
 */
export function drawScene(ctx, W, H, pose, o) {
  const c = o.dark ? PALETTE.dark : PALETTE.light;
  const horizon = H * 0.26, footY = FOOT_Y * H;
  const m = SCALE * H; // pixels per metre at the skier
  const dir = o.view === 'back' ? 1 : o.view === 'side' ? 0 : -1;

  // sky, ridges, snow
  let g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, c.skyTop); g.addColorStop(1, c.skyBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 1);
  const par = pose.phase.sway * H;
  ridge(ctx, W, horizon, H * 0.34, -par * 0.05, c.ridgeFar);
  ridge(ctx, W, horizon, H * 0.2, W * 0.07 - par * 0.1, c.ridgeNear);
  g = ctx.createLinearGradient(0, horizon, 0, H);
  g.addColorStop(0, c.snowTop); g.addColorStop(1, c.snowBot);
  ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);

  // grooming lines sliding past, to give a sense of speed
  ctx.strokeStyle = c.line; ctx.lineWidth = Math.max(1, H * 0.003);
  const N = 9;
  if (o.view === 'side') {
    for (let i = 0; i < 26; i++) {
      const u = ((i / 26 - o.t * 0.5) % 1 + 1) % 1, y = horizon + (H - horizon) * (0.12 + 0.88 * ((i * 7) % 26) / 26);
      ctx.beginPath(); ctx.moveTo(u * W * 1.2 - W * 0.1, y); ctx.lineTo(u * W * 1.2 - W * 0.1 + W * 0.06, y); ctx.stroke();
    }
  } else {
    for (let i = 0; i < N; i++) {
      const u = ((i / N + dir * -o.t * 0.22) % 1 + 1) % 1;
      const k = 1 / (1 + 7 * (1 - u));
      const y = horizon + (H - horizon) * k * 1.05;
      ctx.globalAlpha = Math.min(1, u * 4, (1 - u) * 6 + 0.2);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // the track left in the snow
  const lm = pose.lm, px = (q) => ({ x: q.x * W, y: q.y * H, z: q.z });
  const footX = ((lm[27].x + lm[28].x) / 2) * W;
  ctx.strokeStyle = c.track; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const off of [-0.09, 0.09]) {
    ctx.beginPath();
    for (let i = 0; i <= 44; i++) {
      const tau = i * 0.07, s = o.phase(tau);
      let x, y, k;
      if (o.view === 'side') { k = 1; x = footX - tau * W * 0.42; y = footY + off * m * 0.5 + (s - pose.phase.s) * H * 0.03; }
      else {
        k = o.view === 'back' ? 1 + 1.3 * tau : 1 / (1 + 0.85 * tau);
        x = W / 2 + (dir * 0.2 * s * H + off * m) * k; y = horizon + (footY - horizon) * k;
      }
      ctx.lineWidth = Math.max(1, m * 0.035 * k);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (y > H * 1.3 || x < -W || x > 2 * W) break;
    }
    ctx.stroke();
  }

  // shadow
  ctx.fillStyle = c.shadow;
  ctx.beginPath(); ctx.ellipse(footX + m * 0.12, footY + m * 0.02, m * 0.55, m * 0.09, 0, 0, Math.PI * 2); ctx.fill();

  // figure: depth-sorted capsules
  const P = lm.map(px);
  const cap = (a, b, w, color) => ({ z: (a.z + b.z) / 2, draw() { ctx.strokeStyle = color; ctx.lineWidth = w * m; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } });
  const parts = [];
  for (const [hipI, kneeI, ankI, toeI] of [[23, 25, 27, 31], [24, 26, 28, 32]]) {
    parts.push(cap(P[hipI], P[kneeI], 0.17, c.pants), cap(P[kneeI], P[ankI], 0.125, c.pants));
    const boot = cap(P[ankI], P[toeI], 0.13, GLOVE); boot.z -= 0.001; parts.push(boot);
  }
  for (const [sI, eI, wI] of [[11, 13, 15], [12, 14, 16]]) {
    parts.push(cap(P[sI], P[eI], 0.105, JACKET), cap(P[eI], P[wI], 0.09, JACKET));
    parts.push({ z: P[wI].z - 0.002, draw() { ctx.fillStyle = GLOVE; ctx.beginPath(); ctx.arc(P[wI].x, P[wI].y, 0.055 * m, 0, 7); ctx.fill(); } });
  }
  pose.gear.poles.forEach((seg, i) => {
    const a = px(seg[0]), b = px(seg[1]);
    parts.push({ z: (a.z + b.z) / 2 + 0.002, draw() { ctx.strokeStyle = c.pole; ctx.lineWidth = Math.max(1.5, 0.018 * m); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } });
  });
  parts.push({ z: (P[11].z + P[12].z + P[23].z + P[24].z) / 4, draw() {
    ctx.fillStyle = JACKET; ctx.strokeStyle = JACKET; ctx.lineWidth = 0.13 * m;
    ctx.beginPath(); ctx.moveTo(P[11].x, P[11].y); ctx.lineTo(P[12].x, P[12].y); ctx.lineTo(P[24].x, P[24].y); ctx.lineTo(P[23].x, P[23].y); ctx.closePath();
    ctx.fill(); ctx.stroke();
  } });
  const head = px(pose.gear.head), nose = P[0];
  parts.push({ z: head.z - 0.004, draw() {
    ctx.fillStyle = c.helmet; ctx.beginPath(); ctx.arc(head.x, head.y, 0.118 * m, 0, 7); ctx.fill();
    const facing = nose.z < head.z - 0.008;       // nose closer to the camera than the head centre
    const gx = head.x + (nose.x - head.x) * 0.75, gy = head.y + (nose.y - head.y) * 0.75 - 0.012 * m;
    ctx.fillStyle = GOGGLE;
    if (facing) { ctx.beginPath(); ctx.roundRect(gx - 0.085 * m, gy - 0.036 * m, 0.17 * m, 0.072 * m, 0.03 * m); ctx.fill(); }
    else if (Math.abs(nose.x - head.x) > 0.04 * m) { ctx.beginPath(); ctx.roundRect(gx - 0.03 * m, gy - 0.036 * m, 0.07 * m, 0.072 * m, 0.02 * m); ctx.fill(); }
  } });

  // skis go down first, then everything else far-to-near
  ctx.strokeStyle = c.ski; ctx.lineWidth = Math.max(2, 0.05 * m);
  for (const seg of pose.gear.skis) {
    const a = px(seg[0]), b = px(seg[1]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  parts.sort((a, b) => b.z - a.z).forEach((p) => p.draw());

  if (o.skeleton) drawSkeleton(ctx, lm, { x: 0, y: 0, w: W, h: H });
}

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32]];
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/** Skeleton overlay with the measured lean line. `box` maps normalised landmarks to pixels. */
export function drawSkeleton(ctx, lm, box) {
  const P = (i) => ({ x: box.x + lm[i].x * box.w, y: box.y + lm[i].y * box.h, v: lm[i].visibility ?? 1 });
  const lw = Math.max(2, box.h * 0.0065);
  ctx.lineCap = 'round';
  const line = (a, b, color, w) => {
    ctx.strokeStyle = 'rgba(6,16,28,0.55)'; ctx.lineWidth = w + 2.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  for (const [a, b] of BONES) {
    const p = P(a), q = P(b);
    if (Math.min(p.v, q.v) < 0.3) continue;
    const la = a % 2 === 1, lb = b % 2 === 1;
    line(p, q, la && lb ? SK.left : !la && !lb ? SK.right : SK.mid, lw);
  }
  for (const i of JOINTS) {
    const p = P(i);
    if (p.v < 0.3) continue;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(6,16,28,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, lw * 1.15, 0, 7); ctx.fill(); ctx.stroke();
  }
  // lean measurement: plumb line vs feet→hips line
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const ank = mid(P(27), P(28)), hip = mid(P(23), P(24));
  ctx.setLineDash([lw * 2, lw * 2]);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, lw * 0.5);
  ctx.beginPath(); ctx.moveTo(ank.x, ank.y); ctx.lineTo(ank.x, hip.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = SK.measure; ctx.lineWidth = Math.max(1.5, lw * 0.7);
  ctx.beginPath(); ctx.moveTo(ank.x, ank.y); ctx.lineTo(hip.x, hip.y); ctx.stroke();
}

/** Letterbox a video frame into the canvas; returns the pixel box it occupies. */
export function drawVideo(ctx, W, H, video) {
  ctx.fillStyle = '#05090f'; ctx.fillRect(0, 0, W, H);
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return { x: 0, y: 0, w: W, h: H };
  const s = Math.min(W / vw, H / vh), w = vw * s, h = vh * s;
  const box = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  try { ctx.drawImage(video, box.x, box.y, w, h); } catch { /* frame not ready */ }
  return box;
}

// ---------- SVG builders ----------
export function ringSVG(score) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return `<svg class="ring" viewBox="0 0 128 128" role="img" aria-label="${score}">
    <circle cx="64" cy="64" r="${r}" class="ring-bg"/>
    <circle cx="64" cy="64" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 64 64)"/>
    <text x="64" y="64" class="ring-num" text-anchor="middle" dominant-baseline="central">${score}</text></svg>`;
}

/** Radar chart. items = [{label, score|null}] */
export function radarSVG(items) {
  const cx = 190, cy = 142, R = 100, n = items.length;
  const pt = (i, f) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
  const poly = (f) => items.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${poly(f)}" class="radar-ring"/>`).join('');
  const axes = items.map((it, i) => { const [x, y] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-axis${it.score == null ? ' na' : ''}"/>`; }).join('');
  const shape = items.map((it, i) => pt(i, Math.max(0.04, (it.score ?? 0) / 100)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const dots = items.map((it, i) => { if (it.score == null) return ''; const [x, y] = pt(i, it.score / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" class="radar-dot"/>`; }).join('');
  const labels = items.map((it, i) => {
    const [x, y] = pt(i, 1.16), a = -Math.PI / 2 + (i * 2 * Math.PI) / n, cs = Math.cos(a);
    const anchor = Math.abs(cs) < 0.3 ? 'middle' : cs > 0 ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" class="radar-label${it.score == null ? ' na' : ''}">${it.label}</text>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 380 284" role="img">${rings}${axes}<polygon points="${shape}" class="radar-shape"/>${dots}${labels}</svg>`;
}

/** Timeline of a signed series: areas above zero in one colour, below in another. */
export function timelineSVG(tArr, vals, span) {
  const W = 1000, H = 120, t0 = tArr[0], t1 = tArr[tArr.length - 1];
  const X = (t) => ((t - t0) / (t1 - t0 || 1)) * W, Y = (v) => H / 2 - (v / span) * (H / 2 - 6);
  let d = '';
  let started = false;
  tArr.forEach((t, i) => { if (vals[i] == null) return; d += `${started ? 'L' : 'M'}${X(t).toFixed(1)},${Y(vals[i]).toFixed(1)} `; started = true; });
  const area = `${d}L${W},${H / 2} L0,${H / 2} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tl-svg" aria-hidden="true">
    <defs><clipPath id="tl-up"><rect x="0" y="0" width="${W}" height="${H / 2}"/></clipPath><clipPath id="tl-dn"><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}"/></clipPath></defs>
    <path d="${area}" class="tl-area up" clip-path="url(#tl-up)"/><path d="${area}" class="tl-area dn" clip-path="url(#tl-dn)"/>
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="tl-zero"/>
    <path d="${d}" class="tl-line"/></svg>`;
}

/** Tiny sparkline for the log. */
export function sparkSVG(values) {
  if (values.length < 2) return '';
  const W = 300, H = 56, lo = Math.min(...values, 40), hi = Math.max(...values, 90);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 12) + 6, H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" class="spark-line"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" class="spark-dot"/></svg>`;
}
