// GESTIONE INTELLIGENTE DEL TEMPO: stima del consumo futuro e del tempo di esaurimento.
// Tutte le previsioni sono STIME e vengono etichettate come tali.

import { HOUR, DAY } from './time.js';
import { usageIn } from './monitor.js';

/**
 * @param status risultato di computeLimitStatus
 * @returns previsione o null se non calcolabile
 */
export function forecastLimit(status, state, now) {
  if (status.used == null || status.limitValue == null) {
    return { available: false, reason: status.limitValue == null ? 'Limite sconosciuto' : 'Consumo sconosciuto' };
  }
  const elapsed = Math.max(now - status.windowStart, 0);
  const remainingTime = status.resetAt != null ? Math.max(status.resetAt - now, 0) : null;

  // Ritmo nella finestra corrente (unità/ora)
  let rate = elapsed > 5 * 60e3 ? status.used / (elapsed / HOUR) : null;

  // Ritmo recente (ultime 24h) dagli eventi, se l'unità lo permette
  let recentRate = null;
  if (status.unit !== 'percent') {
    const subEvents = state.events.filter(e => e.subId === status.subId);
    const r = usageIn(subEvents, status.unit, now - DAY, now + 1);
    if (r.count) recentRate = r.used / 24;
  }
  // Per finestre lunghe (settimana/mese) il ritmo medio è più stabile di quello delle ultime ore
  const useRate = rate ?? recentRate;
  if (useRate == null || useRate <= 0) {
    return { available: true, rate: 0, projected: status.used, projectedPct: status.pct, exhaustAt: null,
      willExceed: false, remainingTime, sustainableRate: remainingTime ? (status.limitValue - status.used) / (remainingTime / HOUR) : null,
      indicative: status.limitStatus === 'dinamico' || !status.limitVerified, reason: 'Ritmo di consumo non ancora misurabile' };
  }
  const left = Math.max(status.limitValue - status.used, 0);
  const hoursToExhaust = left / useRate;
  const exhaustAt = now + hoursToExhaust * HOUR;
  const projected = remainingTime != null ? status.used + useRate * (remainingTime / HOUR) : null;
  const sustainableRate = remainingTime ? left / (remainingTime / HOUR) : null;
  const willExceed = status.resetAt != null ? exhaustAt < status.resetAt : false;

  return {
    available: true,
    rate: useRate, recentRate,
    projected, projectedPct: projected != null ? (projected / status.limitValue) * 100 : null,
    exhaustAt, hoursToExhaust, willExceed,
    marginMs: status.resetAt != null ? status.resetAt - exhaustAt : null,
    remainingTime, sustainableRate,
    reductionPct: willExceed && sustainableRate != null ? Math.max(0, (1 - sustainableRate / useRate) * 100) : 0,
    indicative: status.limitStatus === 'dinamico' || !status.limitVerified || status.source === 'stima',
  };
}

/** Converte un ritmo orario in una frase sensata (per ora / giorno). */
export function rateText(ratePerHour, unitShort, windowType) {
  if (ratePerHour == null) return '—';
  const perDay = ['weekly', 'monthly', 'billing', 'none'].includes(windowType);
  const v = perDay ? ratePerHour * 24 : ratePerHour;
  const n = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n.toLocaleString('it-IT')} ${unitShort}/${perDay ? 'giorno' : 'ora'}`;
}
