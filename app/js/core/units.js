// Unità di misura e fonti dei dati. Le unità NON sono mai convertite tra loro:
// token, messaggi, richieste e crediti restano grandezze distinte.

export const UNITS = {
  messages: { label: 'Messaggi', short: 'msg' },
  requests: { label: 'Richieste', short: 'rich.' },
  tokens: { label: 'Token', short: 'tok' },
  credits: { label: 'Crediti', short: 'cred.' },
  searches: { label: 'Ricerche', short: 'ric.' },
  images: { label: 'Immagini', short: 'img' },
  minutes: { label: 'Minuti di utilizzo', short: 'min' },
  sessions: { label: 'Sessioni', short: 'sess.' },
  usd: { label: 'Spesa (USD)', short: '$' },
  percent: { label: 'Percentuale del limite', short: '%' },
};

export const SOURCES = {
  ufficiale: { rank: 4, label: 'Ufficiale', icon: '●', desc: 'Dato fornito dall\'API o dalla piattaforma' },
  integrazione: { rank: 3, label: 'Integrazione', icon: '◐', desc: 'Lettura del contatore del fornitore trascritta dall\'utente o da integrazione autorizzata' },
  manuale: { rank: 2, label: 'Manuale', icon: '○', desc: 'Inserito manualmente dall\'utente' },
  stima: { rank: 1, label: 'Stima', icon: '◌', desc: 'Valore stimato dall\'applicazione' },
};

export const LIMIT_STATUS = {
  pubblicato: 'Pubblicato dal fornitore',
  dinamico: 'Dinamico (varia con il carico)',
  non_pubblicato: 'Non pubblicato',
  personale: 'Limite personale impostato da te',
};

/** Restituisce la fonte meno attendibile fra quelle date. */
export function weakestSource(sources) {
  const list = sources.filter(Boolean);
  if (!list.length) return null;
  return list.reduce((a, b) => (SOURCES[a].rank <= SOURCES[b].rank ? a : b));
}

export function unitLabel(u) { return UNITS[u]?.label ?? u; }

export function fmtNum(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' M';
  if (abs >= 1e4) return (n / 1e3).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' k';
  return n.toLocaleString('it-IT', { maximumFractionDigits: digits });
}

export function fmtMoney(amount, currency = 'EUR') {
  if (amount == null || Number.isNaN(amount)) return '—';
  return amount.toLocaleString('it-IT', { style: 'currency', currency, maximumFractionDigits: 2 });
}

export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'ora';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} g ${hh} h` : `${d} g`;
}
