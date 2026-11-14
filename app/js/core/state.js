// Modello dati e operazioni pure sullo stato (senza accesso al DOM o allo storage).

import { DEFAULT_CATALOG, findPlan, findProvider } from './catalog.js';
import { DEFAULT_LEVELS } from './monitor.js';
import { DEFAULT_THRESHOLDS } from './alerts.js';

export const SCHEMA_VERSION = 1;

export function uid(prefix = 'id') {
  const r = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  return `${prefix}_${r.replace(/-/g, '').slice(0, 12)}`;
}

export function defaultSettings() {
  return {
    currency: 'EUR',
    hourlyValue: null,
    notifications: { inapp: true, browser: false, desktop: false, push: false },
    proxy: { url: '', token: '' },
    widget: { opacity: 0.95, fields: ['model', 'pct', 'remaining', 'reset', 'alerts'], autoCount: false },
    theme: 'auto',
  };
}

export function createState() {
  return {
    version: SCHEMA_VERSION,
    catalog: structuredClone(DEFAULT_CATALOG),
    subscriptions: [], events: [], readings: [],
    alertsFired: {}, inbox: [],
    settings: defaultSettings(),
  };
}

/** Migra / completa uno stato letto dallo storage. */
export function normalizeState(raw) {
  const base = createState();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings ?? {}) };
  s.settings.notifications = { ...base.settings.notifications, ...(raw.settings?.notifications ?? {}) };
  s.settings.widget = { ...base.settings.widget, ...(raw.settings?.widget ?? {}) };
  s.settings.proxy = { ...base.settings.proxy, ...(raw.settings?.proxy ?? {}) };
  if (!raw.catalog?.providers) s.catalog = base.catalog;
  for (const k of ['subscriptions', 'events', 'readings', 'inbox']) if (!Array.isArray(s[k])) s[k] = [];
  if (typeof s.alertsFired !== 'object' || !s.alertsFired) s.alertsFired = {};
  s.version = SCHEMA_VERSION;
  return s;
}

/** Crea un abbonamento a partire da un piano del catalogo (i limiti vengono copiati e restano modificabili). */
export function newSubscription(catalog, providerId, planId, over = {}) {
  const provider = findProvider(catalog, providerId);
  const plan = findPlan(catalog, providerId, planId);
  return {
    id: uid('sub'),
    providerId, planId: plan?.id ?? null,
    name: over.name ?? `${provider?.name.split(' /')[0] ?? 'AI'}${plan ? ' ' + plan.name : ''}`,
    cost: over.cost ?? (plan ? { ...plan.price } : { amount: 0, currency: 'EUR', period: 'month' }),
    renewalDate: over.renewalDate ?? null,
    startedAt: over.startedAt ?? new Date().toISOString().slice(0, 10),
    models: over.models ?? [...(plan?.models ?? [])],
    limits: over.limits ?? structuredClone(plan?.limits ?? []).map(l => ({ ...l, personalValue: null })),
    levels: { ...DEFAULT_LEVELS, ...(over.levels ?? {}) },
    thresholds: over.thresholds ?? [...DEFAULT_THRESHOLDS],
    notify: { inapp: true, browser: true, desktop: true, push: true, ...(over.notify ?? {}) },
    notifyRenewal: true,
    quickUnit: over.quickUnit ?? (plan?.limits?.find(l => l.unit !== 'percent' && l.unit !== 'usd')?.unit ?? 'messages'),
    active: true,
    domains: over.domains ?? [],
    priceVerified: !!plan?.verified,
  };
}

export function addEvent(state, e) {
  const ev = { id: e.id ?? uid('ev'), ts: e.ts ?? Date.now(), amount: 1, unit: 'messages', source: 'manuale', ...e };
  if (!ev.subId) throw new Error('Evento senza servizio');
  if (!(Number(ev.amount) >= 0)) throw new Error('Quantità non valida');
  ev.amount = Number(ev.amount);
  const i = state.events.findIndex(x => x.id === ev.id);
  if (i >= 0) state.events[i] = ev; else state.events.push(ev);
  return ev;
}

export function addReading(state, r) {
  if (r.usedPct != null && (r.usedPct < 0 || r.usedPct > 1000)) throw new Error('Percentuale non valida');
  const rd = { id: uid('rd'), ts: Date.now(), source: 'integrazione', ...r };
  state.readings.push(rd);
  return rd;
}

export function removeSubscription(state, id) {
  state.subscriptions = state.subscriptions.filter(s => s.id !== id);
  state.events = state.events.filter(e => e.subId !== id);
  state.readings = state.readings.filter(r => r.subId !== id);
}
