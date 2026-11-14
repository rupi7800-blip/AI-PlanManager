// SISTEMA DI ALERT: regole indipendenti per ogni servizio, con anti-duplicazione.

import { forecastLimit } from './forecast.js';
import { isoDay, fmtDateTime } from './time.js';
import { fmtNum, fmtDuration, unitLabel } from './units.js';

export const DEFAULT_THRESHOLDS = [50, 70, 85, 95, 100];

function windowKey(st) {
  return st.window?.type === 'rolling' ? isoDay(st.windowStart) : String(Math.floor(st.windowStart / 60000));
}

/**
 * Restituisce tutti gli alert attivi ora. Ogni alert ha una `key` stabile: il chiamante
 * confronta con state.alertsFired per sapere quali notificare.
 */
export function evaluateAlerts(state, statuses, now) {
  const out = [];
  for (const s of statuses) {
    const sub = s.sub;
    const thresholds = [...(sub.thresholds?.length ? sub.thresholds : DEFAULT_THRESHOLDS)].sort((a, b) => a - b);
    for (const st of s.limits) {
      if (st.pct == null) continue;
      const crossed = thresholds.filter(t => st.pct >= t);
      if (crossed.length) {
        const t = crossed[crossed.length - 1];
        const personal = st.basis === 'personale' ? ' (limite personale)' : '';
        out.push({
          key: `thr:${sub.id}:${st.limitId}:${t}:${windowKey(st)}`,
          subId: sub.id, limitId: st.limitId, kind: 'soglia', threshold: t, level: st.level,
          title: `${sub.name}: ${t >= 100 ? 'limite raggiunto' : `soglia ${t}% superata`}`,
          body: `${st.label}${personal}: ${Math.round(st.pct)}% usato` +
            (st.resetAt ? ` · ripristino tra ${fmtDuration(st.resetAt - now)}` : '') +
            (st.estimated ? ' · dato indicativo' : ''),
          ts: now,
        });
      }
      const f = forecastLimit(st, state, now);
      if (f.available && f.willExceed && st.pct < 100 && st.pct >= 30) {
        out.push({
          key: `fc:${sub.id}:${st.limitId}:${windowKey(st)}`,
          subId: sub.id, limitId: st.limitId, kind: 'previsione', level: 'yellow',
          title: `${sub.name}: rischio esaurimento anticipato`,
          body: `Al ritmo attuale ${st.label.toLowerCase()} si esaurisce verso ${fmtDateTime(f.exhaustAt)}, ` +
            `${fmtDuration(f.marginMs)} prima del ripristino (stima).`,
          ts: now,
        });
      }
    }
    if (s.daysToRenewal != null && s.daysToRenewal <= 3 && s.daysToRenewal >= 0 && sub.notifyRenewal !== false && (s.monthlyCost ?? 0) > 0) {
      out.push({
        key: `ren:${sub.id}:${isoDay(s.renewalAt)}`, subId: sub.id, kind: 'rinnovo', level: 'yellow',
        title: `${sub.name}: rinnovo ${s.daysToRenewal === 0 ? 'oggi' : `tra ${s.daysToRenewal} g`}`,
        body: `Importo: ${sub.cost.amount} ${sub.cost.currency}. Verifica se il piano è ancora quello giusto.`,
        ts: now,
      });
    }
  }
  return out;
}

export function newAlerts(alerts, fired) {
  return alerts.filter(a => !fired[a.key]);
}

/** Rimuove dallo storico anti-duplicazione le chiavi più vecchie di 120 giorni. */
export function pruneFired(fired, now) {
  const out = {};
  for (const [k, v] of Object.entries(fired)) if (now - new Date(v).getTime() < 120 * 864e5) out[k] = v;
  return out;
}

export function describeLimit(st) {
  if (st.unit === 'percent') return st.used != null ? `${Math.round(st.used)}% usato` : 'non disponibile';
  const u = unitLabel(st.unit).toLowerCase();
  if (st.limitValue == null) return st.used != null ? `${fmtNum(st.used)} ${u} (limite non noto)` : 'non disponibile';
  return `${fmtNum(st.used)} / ${fmtNum(st.limitValue)} ${u}`;
}
