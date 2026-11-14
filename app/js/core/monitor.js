// MOTORE DI MONITORAGGIO: calcola, per ogni limite di ogni abbonamento, il consumo nella
// finestra corrente, la percentuale, il residuo, il ripristino e l'attendibilità del dato.

import { windowBounds, HOUR, DAY, addMonths, nextRenewal, daysUntil } from './time.js';
import { weakestSource } from './units.js';

export const DEFAULT_LEVELS = { yellow: 70, orange: 85, red: 100 };
export const LEVELS = {
  green: { label: 'Regolare', icon: '✓', color: 'var(--good)' },
  yellow: { label: 'Attenzione', icon: '!', color: 'var(--warning)' },
  orange: { label: 'Limite vicino', icon: '!!', color: 'var(--serious)' },
  red: { label: 'Limite raggiunto', icon: '✕', color: 'var(--critical)' },
  unknown: { label: 'Dato non disponibile', icon: '?', color: 'var(--muted)' },
};
const ORDER = ['unknown', 'green', 'yellow', 'orange', 'red'];

export const SESSION_GAP_MIN = 30;

export function levelFor(pct, levels = DEFAULT_LEVELS) {
  if (pct == null || !Number.isFinite(pct)) return 'unknown';
  if (pct >= levels.red) return 'red';
  if (pct >= levels.orange) return 'orange';
  if (pct >= levels.yellow) return 'yellow';
  return 'green';
}
export function worstLevel(list) {
  return list.reduce((w, l) => (ORDER.indexOf(l) > ORDER.indexOf(w) ? l : w), 'unknown');
}

/** Raggruppa eventi in sessioni (gap < SESSION_GAP_MIN minuti). */
export function countSessions(events) {
  const ts = events.map(e => e.ts).sort((a, b) => a - b);
  let n = 0, last = -Infinity;
  for (const t of ts) { if (t - last > SESSION_GAP_MIN * 60e3) n++; last = t; }
  return n;
}

function matchModels(e, models) { return !models || !models.length || (e.modelId && models.includes(e.modelId)); }

/** Somma l'uso di un'unità in [start, end). Restituisce {used, sources, count}. */
export function usageIn(events, unit, start, end, models = null) {
  const evs = events.filter(e => e.ts >= start && e.ts < end && matchModels(e, models));
  if (unit === 'sessions') {
    const n = countSessions(evs);
    return { used: n, sources: [...new Set(evs.map(e => e.source))], count: evs.length };
  }
  let used = 0; const sources = new Set(); let count = 0;
  for (const e of evs) {
    if (e.unit === unit) { used += Number(e.amount) || 0; sources.add(e.source); count++; }
    else if (unit === 'minutes' && e.durationMin) { used += Number(e.durationMin) || 0; sources.add(e.source); count++; }
  }
  return { used, sources: [...sources], count };
}

function windowFromReset(win, resetAt) {
  const H = (win?.hours ?? 0) * HOUR;
  switch (win?.type) {
    case 'session': case 'rolling': return resetAt - H;
    case 'daily': return resetAt - DAY;
    case 'weekly': return resetAt - 7 * DAY;
    case 'monthly': case 'billing': return addMonths(resetAt, -1);
    default: return 0;
  }
}

export function effectiveLimit(limit) {
  if (limit.value != null) return { value: limit.value, basis: limit.status === 'personale' ? 'personale' : 'fornitore' };
  if (limit.personalValue != null) return { value: limit.personalValue, basis: 'personale' };
  return { value: null, basis: null };
}

/**
 * Stato di un singolo limite.
 */
export function computeLimitStatus(sub, limit, state, now) {
  const subEvents = state.events.filter(e => e.subId === sub.id);
  const readings = state.readings
    .filter(r => r.subId === sub.id && r.limitId === limit.id && r.ts <= now)
    .sort((a, b) => b.ts - a.ts);
  const lastReading = readings[0] ?? null;

  // Per le finestre a sessione anche una lettura indica attività (la sessione era già in corso)
  const activity = limit.window?.type === 'session'
    ? [...subEvents, ...readings.filter(r => (r.usedPct ?? r.used ?? 0) > 0).map(r => ({ ts: r.ts }))]
    : subEvents;
  let win = windowBounds(limit.window, now, { events: activity, renewalDate: sub.renewalDate, period: sub.cost?.period });
  let resetFromReading = false;
  if (lastReading?.resetAt && lastReading.resetAt > now && limit.window?.type !== 'none') {
    win = { start: windowFromReset(limit.window, lastReading.resetAt), end: lastReading.resetAt, active: true, kind: win.kind };
    resetFromReading = true;
  }
  const readingValid = lastReading && (limit.window?.type === 'none' || lastReading.ts >= win.start)
    && !(win.end != null && lastReading.resetAt != null && lastReading.resetAt <= now);

  const { value: limitValue, basis } = effectiveLimit(limit);
  let used = null, remaining = null, sources = [], afterReadingCount = 0, notes = [];

  if (limit.unit === 'percent') {
    if (readingValid && lastReading.usedPct != null) {
      used = lastReading.usedPct; sources.push(lastReading.source);
      afterReadingCount = subEvents.filter(e => e.ts > lastReading.ts).length;
      if (afterReadingCount) notes.push(`${afterReadingCount} utilizzi registrati dopo l'ultima lettura non sono inclusi: aggiorna la lettura.`);
    } else {
      if (!win.active) notes.push('Nessuna sessione attiva registrata: la finestra parte al primo utilizzo.');
      notes.push('Questa piattaforma espone il consumo solo in percentuale: registra una lettura dalla pagina "Utilizzo".');
    }
  } else if (readingValid && (lastReading.used != null || lastReading.remaining != null)) {
    const after = usageIn(subEvents, limit.unit, lastReading.ts + 1, now + 1, limit.models);
    sources.push(lastReading.source, ...after.sources);
    if (lastReading.remaining != null) {
      remaining = lastReading.remaining - after.used;
      used = limitValue != null ? limitValue - remaining : null;
    } else used = lastReading.used + after.used;
  } else if (win.active) {
    const u = usageIn(subEvents, limit.unit, win.start, now + 1, limit.models);
    used = u.used; sources.push(...u.sources);
    if (!u.count) notes.push('Nessun consumo registrato in questa finestra.');
  } else {
    used = 0;
  }

  if (remaining == null && limitValue != null && used != null) remaining = Math.max(0, limitValue - used);
  const pct = limitValue != null && used != null && limitValue > 0 ? (used / limitValue) * 100 : null;
  const source = weakestSource(sources);
  if (limitValue == null) notes.push(limit.status === 'dinamico'
    ? 'Limite dinamico non pubblicato: imposta un limite personale per ottenere la percentuale.'
    : 'Limite non disponibile: imposta un limite personale per ottenere la percentuale.');

  return {
    subId: sub.id, limitId: limit.id, label: limit.label, unit: limit.unit, window: limit.window,
    limitValue, basis, limitStatus: limit.status, limitVerified: !!limit.verified,
    used, remaining, pct,
    level: levelFor(pct, sub.levels ?? DEFAULT_LEVELS),
    windowStart: win.start, resetAt: win.end, msToReset: win.end != null ? win.end - now : null,
    windowActive: win.active, resetFromReading,
    source, hasData: sources.length > 0, lastReading, notes,
    estimated: source === 'stima' || limit.status === 'dinamico',
  };
}

export function monthlyCost(cost) {
  if (!cost || cost.amount == null) return null;
  if (cost.period === 'year') return cost.amount / 12;
  if (cost.period === 'usage') return null;
  return cost.amount;
}

/** Stato complessivo di un abbonamento. */
export function computeSubStatus(sub, state, now) {
  const limits = (sub.limits ?? []).map(l => computeLimitStatus(sub, l, state, now));
  const known = limits.filter(l => l.pct != null);
  const main = known.length ? known.reduce((a, b) => (b.pct > a.pct ? b : a)) : (limits[0] ?? null);
  const renewalAt = nextRenewal(sub.renewalDate, sub.cost?.period, now);
  return {
    sub, limits, main,
    level: worstLevel(limits.map(l => l.level)),
    monthlyCost: monthlyCost(sub.cost),
    renewalAt, daysToRenewal: renewalAt ? daysUntil(renewalAt, now) : null,
    nextResetMs: limits.map(l => l.msToReset).filter(x => x != null && x > 0).sort((a, b) => a - b)[0] ?? null,
  };
}

export function computeAll(state, now) {
  return state.subscriptions.filter(s => s.active !== false).map(s => computeSubStatus(s, state, now));
}

/** Riepilogo per la dashboard. Le valute diverse NON vengono sommate tra loro. */
export function overview(state, now) {
  const all = computeAll(state, now);
  const spend = {};
  for (const s of all) {
    if (s.monthlyCost == null) continue;
    const c = s.sub.cost.currency || 'EUR';
    spend[c] = (spend[c] ?? 0) + s.monthlyCost;
  }
  const pcts = all.flatMap(s => s.limits.filter(l => l.pct != null).map(l => l.pct));
  return {
    statuses: all,
    activeCount: all.length,
    spendByCurrency: spend,
    avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    measuredLimits: pcts.length,
    totalLimits: all.reduce((n, s) => n + s.limits.length, 0),
    nearLimit: all.filter(s => s.level === 'orange' || s.level === 'red'),
    renewals: all.filter(s => s.renewalAt).sort((a, b) => a.renewalAt - b.renewalAt),
  };
}
