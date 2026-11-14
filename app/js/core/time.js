// Finestre temporali dei limiti. Attenzione: la "finestra di ripristino" di un limite
// è un concetto diverso dal "tempo di utilizzo" del servizio (unità minutes).

export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export const WINDOW_TYPES = {
  session: 'Sessione a durata fissa (parte dal primo utilizzo)',
  rolling: 'Finestra scorrevole',
  daily: 'Giornaliera (mezzanotte)',
  weekly: 'Settimanale (lunedì)',
  monthly: 'Mensile (giorno 1)',
  billing: 'Ciclo di fatturazione (data di rinnovo)',
  none: 'Nessun ripristino (es. crediti prepagati)',
};

export function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
export function startOfWeek(t) {
  const d = new Date(startOfDay(t));
  const dow = (d.getDay() + 6) % 7; // lunedì = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
export function startOfMonth(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
export function addMonths(t, n) {
  const d = new Date(t);
  const day = d.getDate();
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r.getTime();
}

/** Ciclo di fatturazione corrente in base alla data di rinnovo (anniversario mensile o annuale). */
export function billingCycle(renewalDate, period, now) {
  if (!renewalDate) {
    const s = startOfMonth(now); return { start: s, end: addMonths(s, 1) };
  }
  const step = period === 'year' ? 12 : 1;
  let end = startOfDay(new Date(renewalDate).getTime());
  // porta "end" alla prima scadenza futura
  while (end <= now) end = addMonths(end, step);
  let start = addMonths(end, -step);
  while (start > now) { end = start; start = addMonths(start, -step); }
  return { start, end };
}

/**
 * Calcola la finestra corrente di un limite.
 * @returns {{start:number,end:number|null,active:boolean,kind:string}}
 *   end = istante del prossimo ripristino (null se sconosciuto / nessun ripristino)
 */
export function windowBounds(win, now, { events = [], renewalDate, period } = {}) {
  const type = win?.type ?? 'none';
  const H = (win?.hours ?? 0) * HOUR;
  switch (type) {
    case 'rolling': {
      const start = now - H;
      const inWin = events.filter(e => e.ts > start && e.ts <= now).map(e => e.ts);
      const oldest = inWin.length ? Math.min(...inWin) : null;
      return { start, end: oldest != null ? oldest + H : null, active: true, kind: type };
    }
    case 'session': {
      const ts = events.map(e => e.ts).filter(t => t <= now).sort((a, b) => a - b);
      let ws = null;
      for (const t of ts) if (ws == null || t >= ws + H) ws = t;
      if (ws != null && now < ws + H) return { start: ws, end: ws + H, active: true, kind: type };
      return { start: now, end: null, active: false, kind: type };
    }
    case 'daily': { const s = startOfDay(now); return { start: s, end: s + DAY, active: true, kind: type }; }
    case 'weekly': { const s = startOfWeek(now); return { start: s, end: s + 7 * DAY, active: true, kind: type }; }
    case 'monthly': { const s = startOfMonth(now); return { start: s, end: addMonths(s, 1), active: true, kind: type }; }
    case 'billing': { const c = billingCycle(renewalDate, period, now); return { ...c, active: true, kind: type }; }
    default: return { start: 0, end: null, active: true, kind: 'none' };
  }
}

export function daysUntil(dateLike, now) {
  if (!dateLike) return null;
  return Math.ceil((startOfDay(new Date(dateLike).getTime()) - startOfDay(now)) / DAY);
}

export function nextRenewal(renewalDate, period, now) {
  if (!renewalDate) return null;
  return billingCycle(renewalDate, period, now).end;
}

export function fmtDate(t) {
  if (t == null) return '—';
  return new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(t) {
  if (t == null) return '—';
  return new Date(t).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function isoDay(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
