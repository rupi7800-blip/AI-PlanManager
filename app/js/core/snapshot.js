// Istantanea compatta inviata all'estensione per la finestrella flottante.
// L'estensione NON ricalcola nulla: mostra questi dati e registra utilizzi manuali.

import { findProvider, findModel } from './catalog.js';
import { forecastLimit } from './forecast.js';
import { advise } from './advisor.js';
import { evaluateAlerts, describeLimit } from './alerts.js';
import { recommend } from './selector.js';
import { dailySeries } from './indices.js';
import { startOfDay, DAY } from './time.js';

export function buildSnapshot(state, statuses, now) {
  const tips = advise(state, statuses, now);
  const alerts = evaluateAlerts(state, statuses, now);
  let alt = null;
  try { alt = recommend(state, statuses, { task: 'quotidiane', complexity: 1 }); } catch { /* nessun modello */ }
  return {
    v: 1, at: now,
    widget: state.settings?.widget ?? {},
    desktop: !!state.settings?.notifications?.desktop,
    services: statuses.map(s => {
      const p = findProvider(state.catalog, s.sub.providerId);
      return {
        subId: s.sub.id, name: s.sub.name, providerId: s.sub.providerId,
        domains: p?.domains ?? s.sub.domains ?? [],
        level: s.level,
        desktop: s.sub.notify?.desktop !== false,
        spark: dailySeries(state.events.filter(e => e.subId === s.sub.id), startOfDay(now) - 6 * DAY, 7),
        planUsage: s.sub.cost?.period === 'usage',
        models: (s.sub.models ?? []).map(id => ({ id, name: findModel(state.catalog, id)?.name ?? id })),
        defaultUnit: s.sub.quickUnit ?? 'messages',
        limits: s.limits.map(l => {
          const f = forecastLimit(l, state, now);
          return {
            id: l.limitId, label: l.label, unit: l.unit, pct: l.pct, used: l.used, limitValue: l.limitValue,
            remaining: l.remaining, resetAt: l.resetAt, level: l.level, source: l.source, basis: l.basis,
            text: describeLimit(l), estimated: l.estimated,
            willExceed: !!f.willExceed, exhaustAt: f.exhaustAt ?? null,
          };
        }),
        tips: tips.filter(t => t.subId === s.sub.id).slice(0, 3).map(t => ({ title: t.title, text: t.text, actions: t.actions.slice(0, 3), indicative: t.indicative })),
        alerts: alerts.filter(a => a.subId === s.sub.id).map(a => ({ key: a.key, title: a.title, body: a.body, level: a.level })),
        alternatives: (alt?.ranking ?? []).filter(r => r.subStatus?.sub.id !== s.sub.id).slice(0, 3)
          .map(r => ({ model: r.model.name, service: r.subStatus?.sub.name ?? '', availability: r.availability.text })),
      };
    }),
  };
}
