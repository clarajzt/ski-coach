// store.js — everything persisted lives in this browser's localStorage.

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota or private mode */ } };

export const store = {
  days: () => read('ski.days', []),
  analyses: () => read('ski.analyses', []),
  plan: () => read('ski.plan', null),
  done: () => read('ski.done', {}),

  addDay(day) { const d = store.days(); d.unshift(day); d.sort((a, b) => (a.date < b.date ? 1 : -1)); write('ski.days', d); },
  removeDay(id) { write('ski.days', store.days().filter((d) => d.id !== id)); },
  addAnalysis(a) { const list = store.analyses(); list.unshift(a); write('ski.analyses', list.slice(0, 200)); },
  removeAnalysis(id) { write('ski.analyses', store.analyses().filter((a) => a.id !== id)); },
  setPlan(p) { write('ski.plan', p); write('ski.done', {}); },
  toggleDone(id) { const d = store.done(); if (d[id]) delete d[id]; else d[id] = true; write('ski.done', d); return !!d[id]; },

  exportAll: () => ({ app: 'ski-coach', version: 1, days: store.days(), analyses: store.analyses(), plan: store.plan() }),
  importAll(data) {
    if (!data || data.app !== 'ski-coach') throw new Error('not a ski-coach export');
    if (Array.isArray(data.days)) write('ski.days', data.days);
    if (Array.isArray(data.analyses)) write('ski.analyses', data.analyses);
    if (data.plan) write('ski.plan', data.plan);
  },
  clear() { for (const k of ['ski.days', 'ski.analyses', 'ski.plan', 'ski.done']) { try { localStorage.removeItem(k); } catch { /* ignore */ } } },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
