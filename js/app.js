// app.js — wires the page together: tabs, language, the stage, reports, plan and log.
import { analyze, frameMetrics, DIMS } from './engine.js';
import { buildParams, poseAt, simulate, phaseAt, PRESETS, FAULTS } from './skier.js';
import { t, pick, initLang, setLang, getLang } from './i18n.js';
import { DRILLS, drillById, drillsFor, buildPlan } from './drills.js';
import { drawScene, drawSkeleton, drawVideo, ringSVG, radarSVG, timelineSVG, sparkSVG } from './render.js';
import { store, uid } from './store.js';
import { mountLab, renderLab, tickLab } from './lab.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TABS = ['analyze', 'plan', 'lab', 'log'];
const MAX_SECONDS = 60;
const SAGITTAL = new Set(['backseat', 'stiff', 'handsLow']);
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const state = {
  tab: 'analyze', source: 'demo', skeleton: true, filter: 'all', planSource: null,
  demo: { preset: 'parallel', faults: new Set(['banking', 'rotation']), view: 'front', playing: true, t: 0, params: null, report: null, dur: 1 },
  video: { status: 'empty', name: '', frames: null, report: null, progress: 0, live: null, error: null, pct: 0, trimmed: false, abort: null, fps: 15 },
  feel: 4,
};

const canvas = $('#stage'), ctx = canvas.getContext('2d'), video = $('#video');

// ---------------------------------------------------------------- demo skier
function computeDemo() {
  const d = state.demo;
  d.params = buildParams(d.preset, [...d.faults]);
  d.dur = d.params.period * 4;
  d.report = analyze(simulate(d.params, { duration: d.dur, fps: 20, view: d.view, noise: 0.006 }));
  if (d.t >= d.dur) d.t = 0;
}

const activeReport = () => (state.source === 'demo' ? state.demo.report : state.video.report);

// ---------------------------------------------------------------- static chrome
function applyStatic() {
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const b of $$('[data-act="tab"]')) b.classList.toggle('on', b.dataset.tab === state.tab);
  for (const b of $$('[data-act="lang"]')) b.classList.toggle('on', b.dataset.lang === getLang());
  for (const b of $$('[data-act="source"]')) b.classList.toggle('on', b.dataset.source === state.source);
  for (const id of TABS) $('#tab-' + id).hidden = id !== state.tab;
  document.title = getLang() === 'zh' ? '滑雪教练 · Ski Coach' : 'Ski Coach · 滑雪教练';
}

function renderAll() {
  applyStatic();
  renderControls(); renderOverlay(); renderStageCtl(); renderTimeline(); renderReport();
  renderPlan(); renderLab(); renderLog();
}

// ---------------------------------------------------------------- analyse: controls
function chips(act, key, items, isOn) {
  return items.map(([id, label]) => `<button class="chip${isOn(id) ? ' on' : ''}" data-act="${act}" data-${key}="${id}" aria-pressed="${isOn(id)}">${esc(label)}</button>`).join('');
}

function renderControls() {
  const el = $('#controls');
  if (state.source === 'demo') {
    const d = state.demo;
    el.innerHTML = `
      <div class="ctl-row"><span class="ctl-label">${t('demo.level')}</span><div class="chips">${chips('preset', 'id', Object.keys(PRESETS).map((k) => [k, t('preset.' + k)]), (id) => id === d.preset)}</div></div>
      <div class="ctl-row"><span class="ctl-label">${t('demo.faults')}</span><div class="chips">${chips('fault', 'id', Object.keys(FAULTS).map((k) => [k, t('fault.' + k)]), (id) => d.faults.has(id))}</div></div>
      <div class="ctl-row"><span class="ctl-label">${t('demo.view')}</span><div class="chips">${chips('view', 'id', ['front', 'back', 'side'].map((k) => [k, t('view.' + k)]), (id) => id === d.view)}</div></div>
      <p class="fine">${t('demo.hint')}</p>`;
  } else {
    const v = state.video;
    el.innerHTML = `
      ${v.status !== 'empty' ? `<div class="ctl-row file-row"><span class="file-name">${esc(v.name)}</span><button class="btn ghost" data-act="choose">${t('video.replace')}</button></div>` : ''}
      ${v.trimmed && v.status === 'done' ? `<p class="fine">${t('video.trimmed', { s: MAX_SECONDS })}</p>` : ''}
      <div class="tips"><h3>${t('tips.title')}</h3><ol>${[1, 2, 3, 4].map((i) => `<li>${t('tips.' + i)}</li>`).join('')}</ol></div>
      ${v.status === 'done' || v.status === 'analyzing' ? `<p class="fine lock">${t('video.privacy')}</p>` : ''}`;
  }
}

function renderStageCtl() {
  const playable = state.source === 'demo' || state.video.status === 'done';
  const playing = state.source === 'demo' ? state.demo.playing : !video.paused;
  $('#stage-ctl').innerHTML = playable ? `
    <button class="ico" data-act="play" aria-label="${playing ? t('stage.pause') : t('stage.play')}">${playing
      ? '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>'}</button>
    <button class="pill${state.skeleton ? ' on' : ''}" data-act="skeleton" aria-pressed="${state.skeleton}">${t('stage.skeleton')}</button>` : '';
  $('#hud').hidden = !playable && state.video.status !== 'analyzing';
}

function renderOverlay() {
  const el = $('#overlay'), v = state.video;
  if (state.source === 'demo' || v.status === 'done') { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.className = 'overlay ' + v.status;
  const lock = `<p class="fine lock">${t('video.privacy')}</p>`;
  if (v.status === 'empty') {
    el.innerHTML = `<div class="drop"><svg viewBox="0 0 24 24" class="drop-ico" aria-hidden="true"><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19h14"/></svg>
      <strong>${t('video.drop.title')}</strong><span>${t('video.drop.sub')}</span>
      <button class="btn primary" data-act="choose">${t('video.choose')}</button>${lock}</div>`;
  } else if (v.status === 'loading' || v.status === 'model') {
    el.innerHTML = `<div class="drop"><div class="spinner"></div><span>${v.status === 'model' ? t('video.loading') : ''}</span></div>`;
  } else if (v.status === 'ready') {
    el.innerHTML = `<div class="drop slim"><button class="btn primary big" data-act="analyze">${t('video.analyze')}</button>${lock}</div>`;
  } else if (v.status === 'analyzing') {
    el.innerHTML = `<div class="progress"><div class="progress-top"><span id="progress-text">${t('video.progress', { pct: Math.round(v.progress * 100) })}</span>
      <button class="btn ghost light" data-act="cancel">${t('video.cancel')}</button></div><div class="bar"><i id="progress-bar" style="width:${(v.progress * 100).toFixed(1)}%"></i></div></div>`;
  } else if (v.status === 'noskier') {
    el.innerHTML = `<div class="drop"><strong>${t('video.err.noSkier.title')}</strong><span>${t('video.err.noSkier.body', { pct: v.pct })}</span>
      <button class="btn primary" data-act="choose">${t('video.replace')}</button></div>`;
  } else if (v.status === 'error') {
    el.innerHTML = `<div class="drop"><strong>${t(v.error)}</strong><button class="btn primary" data-act="choose">${t('video.choose')}</button></div>`;
  }
}

// ---------------------------------------------------------------- analyse: timeline + report
function renderTimeline() {
  const el = $('#timeline'), r = activeReport();
  if (!r?.ok) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const lateral = r.metrics.edge != null;
  const vals = lateral ? r.series.lean : r.series.foreAft;
  const span = lateral ? Math.max(12, ...vals.map((x) => Math.abs(x ?? 0))) * 1.12 : 0.18;
  const t0 = r.series.t[0], t1 = r.series.t[r.series.t.length - 1];
  const marks = r.findings.slice(0, 3).map((f, i) => `<button class="tl-mark" style="left:${(((f.t - t0) / (t1 - t0)) * 100).toFixed(2)}%" data-act="seek" data-t="${f.t}" title="${esc(findingTitle(f))}">${i + 1}</button>`).join('');
  el.innerHTML = `
    <div class="tl-head"><span>${t(lateral ? 'report.timeline.lean' : 'report.timeline.foreAft')}</span>
      ${lateral ? `<span class="tl-legend"><i class="up"></i>${t('report.legend.left')}<i class="dn"></i>${t('report.legend.right')}</span>` : ''}</div>
    <div class="tl-track ${lateral ? 'lean' : 'fa'}" data-act="scrub">${timelineSVG(r.series.t, vals, span)}${marks}<div class="tl-play" id="playhead"></div></div>`;
}

const findingTitle = (f) => t(`f.${f.id}.title`, f.id === 'asym' ? { side: t('side.' + f.data.side) + (getLang() === 'zh' ? '' : '') } : null);
const levelMarker = (lv) => `<span class="marker ${lv <= 2 ? 'green' : lv <= 4 ? 'blue' : 'black'}${lv === 6 ? ' double' : ''}"></span>`;

function dimValue(id, M) {
  const sgn = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);
  switch (id) {
    case 'edge': return t('dimv.edge', { x: Math.round(M.edge) });
    case 'angulation': return t('dimv.angulation', { x: Math.round(M.angulation) });
    case 'foreAft': return t('dimv.foreAft', { x: sgn(M.foreAft) });
    case 'flex': return t('dimv.flex', { x: Math.round(M.kneeMean), y: Math.round(M.kneeRange) });
    case 'stance': return t('dimv.stance', { x: M.stance.toFixed(1) });
    case 'upper': return M.counter == null ? '' : t('dimv.upper', { x: Math.round(M.counter) });
    case 'rhythm': return M.turnTime == null ? '' : t('dimv.rhythm', { x: M.turnTime.toFixed(1) });
  }
  return '';
}

function renderReport() {
  const el = $('#report'), r = activeReport();
  if (!r?.ok) {
    el.innerHTML = `<div class="card empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/></svg><p>${t('report.empty')}</p></div>`;
    return;
  }
  const M = r.metrics, top = r.findings.slice(0, 3);
  const headline = top.length ? t('report.headline.fix', { x: findingTitle(top[0]) }) : t(r.level == null ? 'report.headline.cleanSide' : 'report.headline.clean');
  const planLevel = r.level ?? 3;
  const meta = [t('report.meta.view', { v: t('view.' + r.view) }), r.turns.length ? t('report.meta.turns', { n: r.turns.length }) : null,
    t('report.meta.dur', { s: r.duration.toFixed(1) }), state.source === 'video' ? t('report.meta.tracked', { pct: Math.round(r.validRatio * 100) }) : null].filter(Boolean);

  const dimRows = DIMS.map((id) => {
    const d = r.dims[id];
    if (d.score == null) return `<li class="dim na"><span class="dim-name">${t('dim.' + id)}</span><span class="dim-val">${t('dim.na')}</span></li>`;
    const tone = d.score >= 80 ? 'good' : d.score >= 60 ? 'ok' : 'bad';
    return `<li class="dim"><span class="dim-name">${t('dim.' + id)}<i class="conf ${d.conf}" title="${t('conf.' + d.conf)}"></i></span>
      <span class="dim-val">${dimValue(id, M)}</span><span class="dim-bar"><i class="${tone}" style="width:${d.score}%"></i></span><b class="dim-score">${d.score}</b></li>`;
  }).join('');

  const cards = top.map((f, i) => {
    const drills = drillsFor(f.id, planLevel).slice(0, 2);
    const hint = f.conf === 'low' ? ` · ${t(SAGITTAL.has(f.id) ? 'conf.hint.side' : 'conf.hint.front')}` : '';
    return `<article class="finding">
      <header><span class="num">${i + 1}</span><h3>${esc(findingTitle(f))}</h3></header>
      <p class="conf-line"><i class="conf ${f.conf}"></i>${t('conf.' + f.conf)}${hint}</p>
      <dl><dt>${t('finding.saw')}</dt><dd>${esc(t(`f.${f.id}.saw`, f.data))}</dd>
        <dt>${t('finding.why')}</dt><dd>${t(`f.${f.id}.why`)}</dd>
        <dt>${t('finding.cue')}</dt><dd class="cue">${t(`f.${f.id}.cue`)}</dd></dl>
      <footer><span class="chips">${drills.map((d) => `<button class="chip drill-chip" data-act="drill" data-id="${d.id}">${esc(pick(d.name))}</button>`).join('')}</span>
        <button class="btn ghost" data-act="seek" data-t="${f.t}">${t('finding.show')} ›</button></footer>
    </article>`;
  }).join('');

  el.innerHTML = `
    ${r.lowTrack ? `<p class="banner">${t('report.lowTrack', { pct: Math.round(r.validRatio * 100) })}</p>` : ''}
    ${r.small ? `<p class="banner">${t('report.small', { pct: Math.round(r.size * 140) })}</p>` : ''}
    <div class="card summary">
      ${ringSVG(r.overall)}
      <div class="summary-txt">
        ${r.level == null ? `<span class="eyebrow">${t('report.overall')}</span><h2 class="na">${t('level.na')}</h2>`
          : `<span class="eyebrow">${t('report.level')} ${r.level} / 6</span><h2>${levelMarker(r.level)}${t('level.' + r.level)}</h2>`}
        <p class="lead">${esc(headline)}</p>
        <p class="meta">${meta.map((x) => `<span>${esc(x)}</span>`).join('')}</p>
      </div>
    </div>
    <div class="card">
      <h3 class="card-h">${t('report.dims')}</h3>
      <div class="profile">${radarSVG(DIMS.map((id) => ({ label: t('dims.' + id), score: r.dims[id].score })))}<ul class="dims">${dimRows}</ul></div>
    </div>
    <div class="card">
      <h3 class="card-h">${t('report.fix')}</h3>
      ${cards || `<p class="none">${t('report.none')}</p>`}
      ${r.strengths.length ? `<h3 class="card-h sub">${t('report.strengths')}</h3><p class="chips">${r.strengths.map((id) => `<span class="chip good">${t('dim.' + id)} · ${r.dims[id].score}</span>`).join('')}</p>` : ''}
      <button class="btn primary wide" data-act="tab" data-tab="plan">${t('report.toPlan')} →</button>
    </div>
    <p class="fine">${t('report.note')}</p>`;
}

// ---------------------------------------------------------------- plan
function planData() {
  const saved = store.plan();
  const src = state.planSource ?? (saved ? 'video' : 'demo');
  if (src === 'video' && saved) return { src: 'video', level: saved.level, findings: saved.findings, date: saved.date, hasVideo: true };
  const r = state.demo.report;
  return { src: 'demo', level: r.level ?? 3, findings: r.findings.slice(0, 3).map((f) => ({ id: f.id, data: f.data })), hasVideo: !!saved };
}

function drillCard(d, { check = false, why = null } = {}) {
  const done = check && store.done()[d.id];
  return `<article class="drill${done ? ' done' : ''}" id="drill-${d.id}">
    <header><span class="marker ${d.terrain}" title="${t('terrain.' + d.terrain)}"></span><h4>${esc(pick(d.name))}</h4>
      ${check ? `<label class="check"><input type="checkbox" data-act="done" data-id="${d.id}" ${done ? 'checked' : ''}><span>${t('plan.done')}</span></label>` : ''}</header>
    <p class="drill-meta">${t('terrain.' + d.terrain)} · ${t('drill.levels', { a: d.lv[0], b: d.lv[1] })}${why ? ` · ${t('plan.for')} <b>${esc(why)}</b>` : ''}</p>
    <ol>${pick(d.how).map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="feel"><b>${t('drill.feel')}</b>${esc(pick(d.feel))}</p></article>`;
}

function renderPlan() {
  const el = $('#tab-plan'), p = planData();
  const titleOf = (f) => t(`f.${f.id}.title`, f.id === 'asym' ? { side: t('side.' + f.data.side) } : null);
  const plan = buildPlan(p.findings.map((f) => f.id), p.level);
  const whyTitle = Object.fromEntries(p.findings.map((f) => [f.id, titleOf(f)]));
  const cue = p.findings.length ? t(`f.${p.findings[0].id}.cue`) : t('leveld.' + Math.min(6, p.level + 1));
  const filters = ['all', 'balance', 'edging', 'upper', 'legs', 'rhythm', 'first'];
  const lib = DRILLS.filter((d) => state.filter === 'all' || d.group === state.filter);
  el.innerHTML = `
    <div class="page-head"><h2>${t('plan.title')}</h2>
      <p>${p.src === 'video' ? t('plan.sub.video', { date: new Date(p.date).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-GB') }) : t('plan.sub.demo')}
        · ${levelMarker(p.level)}${t('level.' + p.level)}</p>
      ${p.hasVideo ? `<div class="seg small"><button class="${p.src === 'video' ? 'on' : ''}" data-act="plansrc" data-src="video">${t('src.video')}</button><button class="${p.src === 'demo' ? 'on' : ''}" data-act="plansrc" data-src="demo">${t('src.demo')}</button></div>` : ''}
    </div>
    <ol class="session">
      <li><h3>${t('plan.warm')}</h3><p>${t('plan.warm.body')}</p></li>
      <li><h3>${t('plan.block')}</h3>
        ${p.findings.length ? `<p class="chips">${p.findings.map((f) => `<span class="chip warn">${esc(titleOf(f))}</span>`).join('')}</p>` : `<p>${t('report.none')}</p>`}
        <div class="drill-grid">${plan.map((x) => drillCard(x.drill, { check: true, why: x.why ? whyTitle[x.why] : null })).join('')}</div></li>
      <li><h3>${t('plan.free')}</h3><p>${t('plan.free.body')}</p><blockquote>${cue}</blockquote></li>
      <li><h3>${t('plan.film')}</h3><p>${t('plan.film.body')}</p><button class="btn ghost" data-act="tab" data-tab="analyze">${t('plan.go')} →</button></li>
    </ol>
    <div class="page-head lib"><h2>${t('plan.library')}</h2>
      <div class="chips">${filters.map((f) => `<button class="chip${state.filter === f ? ' on' : ''}" data-act="filter" data-id="${f}">${t('filter.' + f)}</button>`).join('')}</div></div>
    <div class="drill-grid" id="library">${lib.map((d) => drillCard(d)).join('')}</div>`;
}

// ---------------------------------------------------------------- log
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function renderLog() {
  const el = $('#tab-log');
  const days = store.days(), analyses = store.analyses();
  const runs = days.reduce((s, d) => s + d.g + d.b + d.k, 0);
  const best = analyses.length ? Math.max(...analyses.map((a) => a.overall)) : '–';
  const tile = (label, v) => `<div class="tile"><span class="tile-label">${label}</span><span class="tile-num">${v}</span></div>`;
  const mix = days.reduce((m, d) => ({ g: m.g + d.g, b: m.b + d.b, k: m.k + d.k }), { g: 0, b: 0, k: 0 });
  const mixBar = (m) => { const n = m.g + m.b + m.k; return n ? `<span class="mix"><i class="green" style="flex:${m.g}"></i><i class="blue" style="flex:${m.b}"></i><i class="black" style="flex:${m.k}"></i></span>` : ''; };
  const fmt = (iso) => new Date(iso).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  const trend = analyses.slice().reverse().map((a) => a.overall);

  el.innerHTML = `
    <div class="page-head"><h2>${t('log.title')}</h2><p>${t('log.local')}</p></div>
    <div class="tiles four">${tile(t('log.days'), days.length)}${tile(t('log.runs'), runs)}${tile(t('log.analyses'), analyses.length)}${tile(t('log.best'), best)}</div>
    <div class="log-grid">
      <form class="card form" id="day-form">
        <h3 class="card-h">${t('log.add')}</h3>
        <div class="form-row two"><label>${t('log.date')}<input type="date" name="date" value="${today()}" required></label>
          <label>${t('log.resort')}<input type="text" name="resort" maxlength="60" placeholder="${t('log.resort.ph')}"></label></div>
        <div class="form-row three">
          ${[['g', 'green'], ['b', 'blue'], ['k', 'black']].map(([n, c]) => `<label><span><span class="marker ${c}"></span>${t('log.' + c)}</span><input type="number" name="${n}" min="0" max="99" value="0" inputmode="numeric"></label>`).join('')}</div>
        <div class="form-row two"><label>${t('log.snow')}<select name="snow">${['groomed', 'powder', 'ice', 'slush', 'moguls'].map((s) => `<option value="${s}">${t('snow.' + s)}</option>`).join('')}</select></label>
          <div class="field"><span>${t('log.feel')}</span><div class="feel-pick" role="radiogroup">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${n <= state.feel ? 'on' : ''}" data-act="feel" data-n="${n}" aria-label="${n}">★</button>`).join('')}</div></div></div>
        <label>${t('log.note')}<input type="text" name="note" maxlength="140" placeholder="${t('log.note.ph')}"></label>
        <button class="btn primary" type="submit">${t('log.save')}</button>
      </form>
      <div class="card">
        <h3 class="card-h">${t('log.trend')}</h3>
        ${trend.length >= 2 ? sparkSVG(trend) : `<p class="none">${t('log.empty.analyses')}</p>`}
        <h3 class="card-h sub">${t('log.mix')}</h3>
        ${runs ? `${mixBar(mix)}<p class="meta"><span>${t('log.green')} ${mix.g}</span><span>${t('log.blue')} ${mix.b}</span><span>${t('log.black')} ${mix.k}</span></p>` : `<p class="none">${t('log.empty.days')}</p>`}
      </div>
    </div>
    <div class="log-grid">
      <div class="card"><h3 class="card-h">${t('log.list.days')}</h3>
        ${days.length ? `<ul class="rows">${days.map((d) => `<li><div><b>${esc(d.resort || '—')}</b><span class="row-sub">${fmt(d.date)} · ${t('snow.' + d.snow)} · ${'★'.repeat(d.feel)}</span>${d.note ? `<span class="row-note">${esc(d.note)}</span>` : ''}${mixBar(d)}</div>
          <button class="ico small" data-act="del-day" data-id="${d.id}" aria-label="${t('log.delete')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`).join('')}</ul>` : `<p class="none">${t('log.empty.days')}</p>`}</div>
      <div class="card"><h3 class="card-h">${t('log.list.analyses')}</h3>
        ${analyses.length ? `<ul class="rows">${analyses.map((a) => `<li><div><b>${a.level ? levelMarker(a.level) : ''}${a.overall}${a.level ? ' · ' + t('level.' + a.level) : ''}</b><span class="row-sub">${fmt(a.date)} · ${esc(a.name)}</span>
          <span class="row-note">${a.findings.map((f) => t(`f.${f.id}.title`, f.id === 'asym' ? { side: t('side.' + f.data.side) } : null)).map(esc).join(' · ')}</span></div>
          <button class="ico small" data-act="del-analysis" data-id="${a.id}" aria-label="${t('log.delete')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`).join('')}</ul>` : `<p class="none">${t('log.empty.analyses')}</p>`}</div>
    </div>
    <div class="log-actions"><button class="btn ghost" data-act="export">${t('log.export')}</button><button class="btn ghost" data-act="import">${t('log.import')}</button><button class="btn ghost danger" data-act="clear">${t('log.clear')}</button></div>`;
}

// ---------------------------------------------------------------- video flow
function setVideoStatus(status, extra = {}) {
  Object.assign(state.video, { status }, extra);
  renderOverlay(); renderStageCtl(); renderControls();
}

function loadFile(file) {
  if (!file) return;
  const v = state.video;
  v.abort?.abort();
  if (video.src) URL.revokeObjectURL(video.src);
  Object.assign(v, { name: file.name, frames: null, report: null, live: null, error: null, trimmed: false });
  state.source = 'video';
  video.src = URL.createObjectURL(file);
  video.load();
  setVideoStatus('loading');
  applyStatic(); renderTimeline(); renderReport();
}
video.addEventListener('loadeddata', () => { if (state.video.status === 'loading') setVideoStatus('ready'); });
video.addEventListener('error', () => { if (video.src) setVideoStatus('error', { error: 'video.err.load' }); });
video.addEventListener('play', renderStageCtl);
video.addEventListener('pause', renderStageCtl);

async function runAnalysis() {
  const v = state.video;
  setVideoStatus('model');
  let mod;
  try { mod = await import('./video.js'); await mod.loadPose(); }
  catch (e) { console.error(e); return setVideoStatus('error', { error: 'video.err.model' }); }
  v.abort = new AbortController();
  v.progress = 0; v.trimmed = video.duration > MAX_SECONDS; v.fps = mod.sampleRate(Math.min(video.duration, MAX_SECONDS));
  setVideoStatus('analyzing');
  let frames;
  try {
    frames = await mod.analyzeVideo(video, {
      maxSeconds: MAX_SECONDS, signal: v.abort.signal,
      onFrame: (frame, p) => {
        v.live = frame; v.progress = p;
        const bar = $('#progress-bar'), txt = $('#progress-text');
        if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
        if (txt) txt.textContent = t('video.progress', { pct: Math.round(p * 100) });
      },
    });
  } catch (e) {
    if (e.name === 'AbortError') return setVideoStatus('ready');
    console.error(e); return setVideoStatus('error', { error: 'video.err.model' });
  }
  const report = analyze(frames);
  v.frames = frames; v.live = null;
  if (!report.ok) return setVideoStatus('noskier', { pct: Math.round(report.validRatio * 100) });
  v.report = report;
  const findings = report.findings.slice(0, 3).map((f) => ({ id: f.id, data: f.data }));
  const now = new Date().toISOString();
  store.addAnalysis({ id: uid(), date: now, name: v.name, overall: report.overall, level: report.level ?? 0,
    dims: Object.fromEntries(DIMS.map((id) => [id, report.dims[id].score])), findings });
  store.setPlan({ date: now, level: report.level ?? 3, findings });
  state.planSource = 'video';
  setVideoStatus('done');
  renderTimeline(); renderReport(); renderPlan(); renderLog();
  video.currentTime = 0;
  video.play().catch(() => {});
}

// ---------------------------------------------------------------- actions
function seekTo(time) {
  if (state.source === 'demo') { state.demo.t = Math.max(0, Math.min(state.demo.dur - 0.001, time)); state.demo.playing = false; }
  else if (state.video.status === 'done') { video.pause(); video.currentTime = time; }
  renderStageCtl();
  const r = $('#stage-wrap').getBoundingClientRect();
  if (r.top < 60 || r.bottom > window.innerHeight) $('#stage-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setTab(tab, push = true) {
  state.tab = TABS.includes(tab) ? tab : 'analyze';
  if (push) history.replaceState(null, '', state.tab === 'analyze' ? location.pathname : '#' + state.tab);
  applyStatic();
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const d = state.demo, a = el.dataset;
  switch (a.act) {
    case 'tab': setTab(a.tab); break;
    case 'lang': setLang(a.lang); renderAll(); break;
    case 'source': state.source = a.source; applyStatic(); renderControls(); renderOverlay(); renderStageCtl(); renderTimeline(); renderReport(); break;
    case 'preset': d.preset = a.id; refreshDemo(); break;
    case 'fault': if (d.faults.has(a.id)) d.faults.delete(a.id); else d.faults.add(a.id); refreshDemo(); break;
    case 'view': d.view = a.id; refreshDemo(); break;
    case 'skeleton': state.skeleton = !state.skeleton; renderStageCtl(); break;
    case 'play':
      if (state.source === 'demo') d.playing = !d.playing;
      else if (video.paused) video.play().catch(() => {}); else video.pause();
      renderStageCtl(); break;
    case 'seek': seekTo(Number(a.t)); break;
    case 'scrub': {
      const r = el.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const rep = activeReport(); if (rep?.ok) seekTo(rep.series.t[0] + f * (rep.series.t.at(-1) - rep.series.t[0]));
      break;
    }
    case 'choose': $('#file').click(); break;
    case 'analyze': runAnalysis(); break;
    case 'cancel': state.video.abort?.abort(); break;
    case 'drill': {
      state.filter = 'all'; setTab('plan'); renderPlan();
      const card = $('#library #drill-' + a.id);
      if (card) { card.scrollIntoView({ block: 'center' }); card.classList.add('flash'); }
      break;
    }
    case 'plansrc': state.planSource = a.src; renderPlan(); break;
    case 'filter': state.filter = a.id; renderPlan(); $('.page-head.lib').scrollIntoView({ block: 'start' }); break;
    case 'done': { const on = store.toggleDone(a.id); el.closest('.drill').classList.toggle('done', on); break; }
    case 'feel': state.feel = Number(a.n); $$('.feel-pick button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) <= state.feel)); break;
    case 'del-day': store.removeDay(a.id); renderLog(); break;
    case 'del-analysis': store.removeAnalysis(a.id); renderLog(); break;
    case 'export': {
      const url = URL.createObjectURL(new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: 'application/json' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `ski-coach-${today()}.json` });
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
    }
    case 'import': $('#import-file').click(); break;
    case 'clear': if (confirm(t('log.clear.confirm'))) { store.clear(); state.planSource = null; renderLog(); renderPlan(); } break;
  }
});

function refreshDemo() { computeDemo(); renderControls(); renderTimeline(); renderReport(); renderPlan(); }

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'day-form') return;
  e.preventDefault();
  const f = new FormData(e.target), n = (k) => Math.max(0, Math.min(99, parseInt(f.get(k), 10) || 0));
  store.addDay({ id: uid(), date: f.get('date') || today(), resort: String(f.get('resort') || '').trim(), g: n('g'), b: n('b'), k: n('k'), snow: f.get('snow'), feel: state.feel, note: String(f.get('note') || '').trim() });
  renderLog();
});

$('#file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { store.importAll(JSON.parse(await file.text())); state.planSource = null; renderLog(); renderPlan(); } catch (err) { alert(err.message); }
});

const wrap = $('#stage-wrap');
wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drag'); });
wrap.addEventListener('dragleave', () => wrap.classList.remove('drag'));
wrap.addEventListener('drop', (e) => {
  e.preventDefault(); wrap.classList.remove('drag');
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(f.name));
  if (file) loadFile(file);
});
window.addEventListener('hashchange', () => setTab(location.hash.slice(1), false));
darkQuery.addEventListener?.('change', () => {});

// ---------------------------------------------------------------- stage loop
let last = performance.now(), hudAt = 0;

function hud(m, now) {
  if (now - hudAt < 90) return;
  hudAt = now;
  const el = $('#hud');
  if (!m?.ok) { el.innerHTML = ''; return; }
  const turn = Math.abs(m.lean) < 3 || m.latConf < 0.5 ? '' : `<span class="hud-turn ${m.lean > 0 ? 'l' : 'r'}">${t(m.lean > 0 ? 'hud.left' : 'hud.right')}</span>`;
  el.innerHTML = `${m.latConf >= 0.5 ? `<span><small>${t('hud.lean')}</small>${Math.abs(Math.round(m.lean))}°</span>` : ''}
    <span><small>${t('hud.knee')}</small>${Math.round(m.knee)}°</span>
    <span><small>${t('hud.balance')}</small>${(m.foreAft >= 0 ? '+' : '') + m.foreAft.toFixed(2)}</span>${turn}`;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const dark = darkQuery.matches;
  if (state.tab === 'lab') return tickLab(dt, dark);
  if (state.tab !== 'analyze') return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
  if (!W || !H) return;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const head = $('#playhead');

  if (state.source === 'demo') {
    const d = state.demo;
    if (d.playing) d.t = (d.t + dt) % d.dur;
    const pose = poseAt(d.params, d.t, d.view, W / H);
    drawScene(ctx, W, H, pose, { view: d.view, t: d.t, dark, skeleton: state.skeleton, phase: (tau) => phaseAt(d.params, d.t - tau) });
    hud(frameMetrics({ t: d.t, lm: pose.lm, world: pose.world }), now);
    if (head) head.style.left = ((d.t / d.dur) * 100).toFixed(2) + '%';
    return;
  }

  const v = state.video;
  if (v.status === 'empty' || v.status === 'error') { ctx.fillStyle = dark ? '#0b1622' : '#e6eef5'; ctx.fillRect(0, 0, W, H); return; }
  const box = drawVideo(ctx, W, H, video);
  let f = null;
  if (v.status === 'analyzing') f = v.live;
  else if (v.frames) f = v.frames[Math.max(0, Math.min(v.frames.length - 1, Math.round(video.currentTime * v.fps)))];
  if (f?.lm) {
    if (state.skeleton || v.status === 'analyzing') drawSkeleton(ctx, f.lm, box);
    hud(frameMetrics(f), now);
  } else hud(null, now);
  if (head && v.report) {
    const ts = v.report.series.t, t0 = ts[0], t1 = ts[ts.length - 1];
    head.style.left = (Math.max(0, Math.min(1, (video.currentTime - t0) / (t1 - t0))) * 100).toFixed(2) + '%';
  }
}

// ---------------------------------------------------------------- boot
initLang();
computeDemo();
mountLab($('#tab-lab'));
state.tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'analyze';
renderAll();
requestAnimationFrame(frame);
