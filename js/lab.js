// lab.js — the carving physics lab (sliders, phase chart, top-down track, force diagram).
import { t } from './i18n.js';
import { carve, balancedBand, trackPath, ANG_MAX } from './physics.js';

const S = { kmh: 36, edge: 45, sidecut: 16 };
const SKIS = [['sl', 13], ['am', 16], ['gs', 25]];
let root = null, canvas = null, path = null, dist = 0;

const r0 = (x) => Math.round(x);
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

export function mountLab(el) {
  root = el;
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.lab;
    if (!k) return;
    S[k] = Number(e.target.value);
    update();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ski]');
    if (!b) return;
    S.sidecut = Number(b.dataset.ski);
    renderLab();
  });
  renderLab();
}

const slider = (key, label, min, max, step, unit) => `
  <label class="slider"><span class="slider-top"><span>${label}</span><output data-out="${key}">${S[key]}${unit}</output></span>
  <input type="range" data-lab="${key}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${S[key]}"></label>`;

export function renderLab() {
  if (!root) return;
  root.innerHTML = `
    <div class="page-head"><h2>${t('lab.title')}</h2><p>${t('lab.sub')}</p></div>
    <div class="lab-grid">
      <div class="panel">
        ${slider('kmh', t('lab.speed'), 10, 90, 1, ' km/h')}
        ${slider('edge', t('lab.edge'), 5, 78, 1, '°')}
        ${slider('sidecut', t('lab.sidecut'), 10, 30, 0.5, ' m')}
        <div class="chips">${SKIS.map(([id, r]) => `<button class="chip${S.sidecut === r ? ' on' : ''}" data-ski="${r}">${t('lab.ski.' + id)} · ${r} m</button>`).join('')}</div>
        <div class="tiles" id="lab-tiles"></div>
        <div class="status" id="lab-status"></div>
        <p class="fine">${t('lab.model')}</p>
      </div>
      <div class="panel">
        <figure><figcaption>${t('lab.chart.title')}</figcaption><div id="lab-chart"></div></figure>
        <div class="lab-two">
          <figure><figcaption>${t('lab.track')}</figcaption><canvas id="lab-track"></canvas></figure>
          <figure><figcaption>${t('lab.body')}</figcaption><div id="lab-force"></div></figure>
        </div>
      </div>
    </div>`;
  canvas = root.querySelector('#lab-track');
  update();
}

function update() {
  const c = carve(S);
  for (const out of root.querySelectorAll('[data-out]')) {
    const k = out.dataset.out;
    out.textContent = S[k] + root.querySelector(`[data-lab="${k}"]`).dataset.unit;
  }
  for (const b of root.querySelectorAll('[data-ski]')) b.classList.toggle('on', Number(b.dataset.ski) === S.sidecut);

  const tile = (label, value, unit) => `<div class="tile"><span class="tile-label">${label}</span><span class="tile-num">${value}${unit === '°' ? '°' : `<small>${unit}</small>`}</span></div>`;
  root.querySelector('#lab-tiles').innerHTML =
    tile(t('lab.out.radius'), r1(c.radius), ' m') + tile(t('lab.out.load'), r1(c.load), ' ' + t('lab.out.loadUnit')) +
    tile(t('lab.out.lean'), r0(c.lean), '°') + tile(t('lab.out.ang'), r0(c.ang), '°');

  const vars = { v: S.kmh, e: S.edge, l: r0(c.lean), a: r0(c.ang), s: c.ideal == null ? '' : r0(c.ideal), g: r1(c.load) };
  root.querySelector('#lab-status').className = 'status ' + c.status;
  root.querySelector('#lab-status').innerHTML = `<strong>${t(`lab.${c.status}.title`)}</strong><p>${t(`lab.${c.status}.body`, vars)}</p>`;

  root.querySelector('#lab-chart').innerHTML = chartSVG(c);
  root.querySelector('#lab-force').innerHTML = forceSVG(c);
  path = { pts: trackPath(c.radius), status: c.status };
  path.len = path.pts.length * 0.4;
}

function chartSVG(c) {
  const W = 360, H = 230, L = 34, R = 10, T = 10, B = 30;
  const vMin = 10, vMax = 90, eMax = 80;
  const X = (v) => L + ((v - vMin) / (vMax - vMin)) * (W - L - R), Y = (e) => H - B - (e / eMax) * (H - T - B);
  const lo = [], hi = [];
  for (let v = vMin; v <= vMax; v += 1) {
    const b = balancedBand(v, S.sidecut, eMax);
    if (!b) break;
    lo.push(`${X(v).toFixed(1)},${Y(b.lo).toFixed(1)}`); hi.push(`${X(v).toFixed(1)},${Y(b.hi).toFixed(1)}`);
  }
  const band = lo.length > 1 ? `<polygon points="${lo.join(' ')} ${hi.reverse().join(' ')}" class="ch-band"/>` : '';
  const xt = [10, 30, 50, 70, 90].map((v) => `<line x1="${X(v)}" y1="${T}" x2="${X(v)}" y2="${H - B}" class="ch-grid"/><text x="${X(v)}" y="${H - B + 13}" text-anchor="middle" class="ch-tick">${v}</text>`).join('');
  const yt = [0, 20, 40, 60, 80].map((e) => `<line x1="${L}" y1="${Y(e)}" x2="${W - R}" y2="${Y(e)}" class="ch-grid"/><text x="${L - 6}" y="${Y(e)}" text-anchor="end" dominant-baseline="central" class="ch-tick">${e}</text>`).join('');
  const crit = c.vCrit < vMax ? `<line x1="${X(c.vCrit)}" y1="${T}" x2="${X(c.vCrit)}" y2="${H - B}" class="ch-crit"/>
    <text x="${X(c.vCrit) + 5}" y="${T + 11}" class="ch-note warn">${t('lab.chart.crit', { v: r0(c.vCrit) })}</text>
    <text x="${Math.min(W - R - 4, X(c.vCrit) + 5)}" y="${Y(34)}" class="ch-note">${t('lab.chart.over')}</text>` : '';
  const vMid = Math.min(c.vCrit * 0.72, 62);
  const bMid = balancedBand(vMid, S.sidecut, eMax);
  const lbl = bMid ? `<text x="${X(vMid)}" y="${Y((bMid.lo + bMid.hi) / 2)}" text-anchor="middle" dominant-baseline="central" class="ch-note band">${t('lab.chart.band')}</text>` : '';
  const px = X(Math.min(vMax, Math.max(vMin, S.kmh))), py = Y(Math.min(eMax, S.edge));
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${t('lab.chart.title')}">
    ${xt}${yt}${band}${crit}${lbl}
    <text x="${X(16)}" y="${Y(62)}" class="ch-note">${t('lab.chart.fall')}</text>
    <text x="${X(Math.min(c.vCrit * 0.82, 70))}" y="${Y(6)}" text-anchor="middle" class="ch-note">${t('lab.chart.under')}</text>
    <text x="${(L + W - R) / 2}" y="${H - 3}" text-anchor="middle" class="ch-axis">${t('lab.chart.x')}</text>
    <text x="10" y="${(T + H - B) / 2}" text-anchor="middle" class="ch-axis" transform="rotate(-90 10 ${(T + H - B) / 2})">${t('lab.chart.y')}</text>
    <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="9" class="ch-halo ${c.status}"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" class="ch-dot ${c.status}"/></svg>`;
}

function forceSVG(c) {
  const D = Math.PI / 180, fx = 100, fy = 168;
  const dirOf = (a) => [Math.sin(a * D), -Math.cos(a * D)];          // angle from vertical, leaning right
  const [lx, ly] = dirOf(S.edge);
  const hip = [fx + lx * 62, fy + ly * 62];
  const torsoA = Math.max(-25, Math.min(85, S.edge - 2.4 * Math.max(-12, Math.min(ANG_MAX + 8, c.ang))));
  const [tx, ty] = dirOf(torsoA);
  const sh = [hip[0] + tx * 52, hip[1] + ty * 52];
  const [cx0, cy0] = dirOf(c.lean);
  const com = [fx + cx0 * 80, fy + cy0 * 80];
  const sx = Math.cos(S.edge * D), sy = Math.sin(S.edge * D);
  const gl = 34, cl = Math.min(70, gl * c.gLat);
  const arrow = (x1, y1, x2, y2, cls) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="fo-arrow ${cls}" marker-end="url(#ah-${cls})"/>`;
  const head = (cls) => `<marker id="ah-${cls}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="fo-head ${cls}"/></marker>`;
  return `<svg viewBox="0 0 200 200" class="force" role="img" aria-label="${t('lab.body')}">
    <defs>${head('g')}${head('c')}${head('r')}</defs>
    <line x1="10" y1="${fy + 6}" x2="190" y2="${fy + 6}" class="fo-snow"/>
    <line x1="${fx}" y1="${fy}" x2="${com[0].toFixed(1)}" y2="${com[1].toFixed(1)}" class="fo-com"/>
    <line x1="${(fx - sx * 26).toFixed(1)}" y1="${(fy - sy * 26).toFixed(1)}" x2="${(fx + sx * 26).toFixed(1)}" y2="${(fy + sy * 26).toFixed(1)}" class="fo-ski"/>
    <line x1="${fx}" y1="${fy}" x2="${hip[0].toFixed(1)}" y2="${hip[1].toFixed(1)}" class="fo-leg"/>
    <line x1="${hip[0].toFixed(1)}" y1="${hip[1].toFixed(1)}" x2="${sh[0].toFixed(1)}" y2="${sh[1].toFixed(1)}" class="fo-torso"/>
    <circle cx="${(sh[0] + tx * 13).toFixed(1)}" cy="${(sh[1] + ty * 13).toFixed(1)}" r="10" class="fo-headc"/>
    ${arrow(com[0], com[1], com[0], com[1] + gl, 'g')}
    ${arrow(com[0], com[1], com[0] - cl, com[1], 'c')}
    ${arrow(com[0], com[1], com[0] - cl, com[1] + gl, 'r')}
    <circle cx="${com[0].toFixed(1)}" cy="${com[1].toFixed(1)}" r="4" class="fo-dot"/>
    <text x="8" y="16" class="fo-text">${t('lab.edge')} ${S.edge}°</text>
    <text x="8" y="30" class="fo-text">${t('lab.out.lean')} ${r0(c.lean)}°</text>
  </svg>`;
}

/** Animate the top-down track. Call every frame while the lab is visible. */
export function tickLab(dt, dark) {
  if (!canvas || !path) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(root);
  const ink = css.getPropertyValue('--ink-2').trim() || '#567', accent = css.getPropertyValue('--accent').trim() || '#f50';
  const warn = css.getPropertyValue('--warn').trim() || '#d33';

  const pts = path.pts, xs = pts.map((p) => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const scale = Math.min((h - 16) / 70, (w - 24) / Math.max(8, maxX - minX));
  const ox = w / 2 - ((minX + maxX) / 2) * scale, oy = 8;
  const bad = path.status !== 'ok';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const off of [-0.6, 0.6]) {
    ctx.beginPath();
    pts.forEach((p, i) => { const x = ox + (p.x + off) * scale, y = oy + p.y * scale; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.strokeStyle = bad ? warn : ink; ctx.globalAlpha = bad ? 0.55 : 0.5; ctx.lineWidth = 1.5;
    ctx.setLineDash(bad ? [5, 5] : []); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  dist = (dist + dt * (S.kmh / 3.6)) % path.len;
  const i = Math.min(pts.length - 1, Math.floor(dist / 0.4));
  for (let k = 14; k >= 0; k--) {
    const p = pts[Math.max(0, i - k * 2)];
    ctx.globalAlpha = (1 - k / 15) * 0.5;
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(ox + p.x * scale, oy + p.y * scale, k === 0 ? 5 : 2.5, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const p = pts[i];
  ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(ox + p.x * scale, oy + p.y * scale, 5, 0, 7); ctx.fill();
  ctx.strokeStyle = dark ? '#0a121b' : '#fff'; ctx.lineWidth = 2; ctx.stroke();
}
