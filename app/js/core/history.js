// STORICO E ANALISI. Il confronto tra piattaforme usa il NUMERO DI UTILIZZI REGISTRATI
// (unità neutra) e le somme per unità separate: token, messaggi e crediti non si sommano mai.

import { DAY, HOUR, startOfDay, startOfMonth, addMonths } from './time.js';
import { findModel } from './catalog.js';
import { TASKS } from './selector.js';

export const RANGES = {
  '24h': { label: 'Ultime 24 ore', bucket: 'hour', n: 24 },
  '7g': { label: 'Ultimi 7 giorni', bucket: 'day', n: 7 },
  '30g': { label: 'Ultimi 30 giorni', bucket: 'day', n: 30 },
  '90g': { label: 'Ultimi 90 giorni', bucket: 'week', n: 13 },
  '12m': { label: 'Ultimi 12 mesi', bucket: 'month', n: 12 },
};

export function buckets(range, now) {
  const r = RANGES[range];
  const out = [];
  if (r.bucket === 'hour') {
    const end = Math.floor(now / HOUR) * HOUR + HOUR;
    for (let i = r.n; i > 0; i--) out.push({ start: end - i * HOUR, end: end - (i - 1) * HOUR });
  } else if (r.bucket === 'day' || r.bucket === 'week') {
    const step = r.bucket === 'day' ? DAY : 7 * DAY;
    const end = startOfDay(now) + DAY;
    for (let i = r.n; i > 0; i--) out.push({ start: end - i * step, end: end - (i - 1) * step });
  } else {
    const end = addMonths(startOfMonth(now), 1);
    for (let i = r.n; i > 0; i--) out.push({ start: addMonths(end, -i), end: addMonths(end, -(i - 1)) });
  }
  return out.map(b => ({ ...b, label: bucketLabel(b.start, r.bucket) }));
}

function bucketLabel(t, kind) {
  const d = new Date(t);
  if (kind === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`;
  if (kind === 'month') return d.toLocaleDateString('it-IT', { month: 'short' });
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

export function eventsInRange(events, range, now) {
  const b = buckets(range, now);
  return events.filter(e => e.ts >= b[0].start && e.ts < b[b.length - 1].end);
}

/** Serie per chiave (abbonamento/modello/attività) del numero di utilizzi registrati. */
export function series(events, range, now, keyFn) {
  const b = buckets(range, now);
  const out = {};
  for (const e of events) {
    const i = b.findIndex(x => e.ts >= x.start && e.ts < x.end);
    if (i < 0) continue;
    const k = keyFn(e) ?? 'n.d.';
    (out[k] ??= new Array(b.length).fill(0))[i]++;
  }
  return { buckets: b, series: out };
}

export function sumsByUnit(events) {
  const out = {};
  for (const e of events) if (e.unit && e.unit !== 'percent') out[e.unit] = (out[e.unit] ?? 0) + (Number(e.amount) || 0);
  return out;
}

export function insights(state, statuses, range, now) {
  const evs = eventsInRange(state.events, range, now);
  const count = (fn) => {
    const m = {};
    for (const e of evs) { const k = fn(e); if (k) m[k] = (m[k] ?? 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const subName = id => state.subscriptions.find(s => s.id === id)?.name ?? id;
  const bySub = count(e => e.subId).map(([k, v]) => ({ name: subName(k), n: v }));
  const byModel = count(e => e.modelId).map(([k, v]) => ({ name: findModel(state.catalog, k)?.name ?? k, n: v }));
  const byTask = count(e => e.task).map(([k, v]) => {
    const te = evs.filter(e => e.task === k);
    return { name: TASKS[k]?.label ?? k, n: v, minutes: te.reduce((a, e) => a + (Number(e.durationMin) || 0), 0) };
  });
  const util = statuses.map(s => {
    const k = s.limits.filter(l => l.pct != null && ['monthly', 'billing', 'weekly'].includes(l.window?.type));
    const pct = k.length ? Math.max(...k.map(l => l.pct)) : null;
    return { s, pct };
  }).filter(x => x.pct != null);
  const best = util.length ? util.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
  const worst = util.length ? util.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
  const waste = util.filter(x => x.s.monthlyCost).map(x => ({
    name: x.s.sub.name, currency: x.s.sub.cost.currency, unusedPct: 100 - Math.min(100, x.pct),
    unusedCost: x.s.monthlyCost * (1 - Math.min(100, x.pct) / 100),
  })).sort((a, b) => b.unusedCost - a.unusedCost);
  const silent = statuses.filter(s => !evs.some(e => e.subId === s.sub.id) && (s.monthlyCost ?? 0) > 0).map(s => s.sub.name);
  return { total: evs.length, bySub, byModel, byTask, best, worst, waste, silent };
}
