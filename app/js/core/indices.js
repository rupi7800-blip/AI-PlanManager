// INDICI DI EFFICIENZA E VALORE — formule trasparenti, nessun valore economico arbitrario.

import { DAY, startOfDay } from './time.js';
import { countSessions } from './monitor.js';
import { weakestSource } from './units.js';

export const FORMULAS = {
  monthlyCost: 'Costo mensile = prezzo mensile, oppure prezzo annuale ÷ 12',
  costPerSession: 'Costo per sessione = costo del periodo ÷ sessioni (eventi distanti < 30 min = stessa sessione)',
  costPerTask: 'Costo per attività = costo del periodo ÷ attività con esito "completata"',
  unitsPerEuro: 'Unità per unità di valuta = consumo registrato ÷ costo del periodo',
  avgDuration: 'Tempo medio = media dei minuti indicati nelle registrazioni',
  requestsPerTask: 'Richieste per attività = (messaggi + richieste) ÷ attività completate',
  completionRate: 'Completamento = completate ÷ (completate + abbandonate)',
  regenRate: 'Rigenerazioni = Σ rigenerazioni ÷ registrazioni che le riportano',
  usedPct: '% utilizzo = consumo ÷ limite (solo limiti noti o personali)',
  regularity: 'Regolarità = 1 − (deviazione standard ÷ media) delle registrazioni giornaliere, limitata tra 0 e 1',
  qualityPerRequest: 'Rendimento qualitativo = qualità media (1–5) ÷ richieste per attività',
  minutesPerEuro: 'Minuti risparmiati per unità di valuta = Σ minuti risparmiati dichiarati ÷ costo del periodo',
  potentialValue: 'Valore potenziale = ore risparmiate × tua tariffa oraria (solo se impostata)',
};

const metric = (value, formula, extra = {}) => ({ value: value == null || !Number.isFinite(value) ? null : value, formula: FORMULAS[formula], ...extra });

export function dailySeries(events, from, days) {
  const arr = new Array(days).fill(0);
  for (const e of events) {
    const i = Math.floor((startOfDay(e.ts) - from) / DAY);
    if (i >= 0 && i < days) arr[i]++;
  }
  return arr;
}

export function regularity(series) {
  if (series.length < 2) return null;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  if (mean === 0) return null;
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
  return Math.max(0, Math.min(1, 1 - sd / mean));
}

export function computeIndices(state, statuses, now, rangeDays = 30) {
  const from = startOfDay(now) - (rangeDays - 1) * DAY;
  const hourly = state.settings?.hourlyValue ?? null;
  return statuses.map(s => {
    const sub = s.sub;
    const evs = state.events.filter(e => e.subId === sub.id && e.ts >= from && e.ts <= now);
    const cost = s.monthlyCost != null ? s.monthlyCost * (rangeDays / 30) : null;
    const sessions = countSessions(evs);
    const completed = evs.filter(e => e.outcome === 'completata').length;
    const abandoned = evs.filter(e => e.outcome === 'abbandonata').length;
    const reqs = evs.filter(e => e.unit === 'messages' || e.unit === 'requests').reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const durs = evs.filter(e => e.durationMin > 0).map(e => Number(e.durationMin));
    const regs = evs.filter(e => e.regenerations != null);
    const quals = evs.filter(e => e.quality > 0).map(e => Number(e.quality));
    const saved = evs.reduce((a, e) => a + (Number(e.minutesSaved) || 0), 0);
    const hasSaved = evs.some(e => e.minutesSaved > 0);
    const byUnit = {};
    for (const e of evs) if (e.unit && e.unit !== 'percent') byUnit[e.unit] = (byUnit[e.unit] ?? 0) + (Number(e.amount) || 0);
    const series = dailySeries(evs, from, rangeDays);
    const hours = new Array(24).fill(0);
    for (const e of evs) hours[new Date(e.ts).getHours()]++;
    const known = s.limits.filter(l => l.pct != null);
    const usedPct = known.length ? Math.max(...known.map(l => l.pct)) : null;
    const rpt = completed ? reqs / completed : null;
    const avgQ = quals.length ? quals.reduce((a, b) => a + b, 0) / quals.length : null;

    return {
      sub, currency: sub.cost?.currency ?? 'EUR', records: evs.length,
      source: weakestSource([...new Set(evs.map(e => e.source))]),
      economic: {
        monthlyCost: metric(s.monthlyCost, 'monthlyCost'),
        costPerSession: metric(cost != null && sessions ? cost / sessions : null, 'costPerSession', { n: sessions }),
        costPerTask: metric(cost != null && completed ? cost / completed : null, 'costPerTask', { n: completed }),
        unitsPerEuro: metric(null, 'unitsPerEuro', { byUnit: cost ? Object.fromEntries(Object.entries(byUnit).map(([u, v]) => [u, v / cost])) : {} }),
      },
      operational: {
        avgDuration: metric(durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null, 'avgDuration', { n: durs.length }),
        requestsPerTask: metric(rpt, 'requestsPerTask'),
        completionRate: metric(completed + abandoned ? completed / (completed + abandoned) : null, 'completionRate', { n: completed + abandoned }),
        regenRate: metric(regs.length ? regs.reduce((a, e) => a + (e.regenerations || 0), 0) / regs.length : null, 'regenRate', { n: regs.length }),
      },
      utilization: {
        usedPct: metric(usedPct, 'usedPct'),
        unusedPct: metric(usedPct != null ? Math.max(0, 100 - usedPct) : null, 'usedPct'),
        regularity: metric(regularity(series), 'regularity'),
        series, hours,
      },
      yield: {
        avgQuality: metric(avgQ, 'qualityPerRequest'),
        qualityPerRequest: metric(avgQ != null && rpt ? avgQ / rpt : null, 'qualityPerRequest'),
        minutesPerEuro: metric(cost && hasSaved ? saved / cost : null, 'minutesPerEuro', { saved }),
        potentialValue: metric(hourly && hasSaved ? (saved / 60) * hourly : null, 'potentialValue', { needsRate: !hourly }),
      },
    };
  });
}

/**
 * Riferimenti esterni (studi di settore). Mostrati SEMPRE separati dai dati dell'utente,
 * con fonte, data, metodo, campione, attendibilità e limiti.
 */
export const BENCHMARKS = [
  {
    id: 'brynjolfsson2023', title: 'Generative AI at Work',
    source: 'Brynjolfsson, Li, Raymond — NBER Working Paper 31161', url: 'https://www.nber.org/papers/w31161', date: '2023 (rev. 2024)',
    method: 'Studio osservazionale su introduzione scaglionata di un assistente AI in un call center',
    sample: '5.179 operatori di assistenza clienti', finding: 'Circa +14% di problemi risolti per ora in media; effetto maggiore per i meno esperti.',
    reliability: 'Media-alta (dati reali di produzione, working paper)', limits: 'Un solo settore e un solo strumento; non generalizzabile ad altri lavori.',
  },
  {
    id: 'noy2023', title: 'Experimental evidence on the productivity effects of generative AI',
    source: 'Noy, Zhang — Science 381(6654)', url: 'https://doi.org/10.1126/science.adh2586', date: '2023',
    method: 'Esperimento controllato randomizzato online su compiti di scrittura professionale',
    sample: '453 professionisti laureati', finding: 'Tempo ridotto di circa il 40% e qualità valutata più alta di circa il 18%.',
    reliability: 'Alta per il compito testato (RCT, rivista peer-reviewed)', limits: 'Compiti brevi e standardizzati; effetti di lungo periodo non misurati.',
  },
  {
    id: 'peng2023', title: 'The Impact of AI on Developer Productivity: Evidence from GitHub Copilot',
    source: 'Peng, Kalliamvakou, Cihon, Demirer — arXiv 2302.06590', url: 'https://arxiv.org/abs/2302.06590', date: '2023',
    method: 'Esperimento controllato: implementazione di un server HTTP in JavaScript',
    sample: '95 sviluppatori', finding: 'Il gruppo con AI ha completato il compito circa il 55,8% più velocemente.',
    reliability: 'Media (RCT, campione piccolo, preprint con autori legati al fornitore)', limits: 'Compito singolo e semplice; non misura la qualità del codice nel tempo.',
  },
  {
    id: 'dellacqua2023', title: 'Navigating the Jagged Technological Frontier',
    source: 'Dell\'Acqua et al. — Harvard Business School Working Paper 24-013', url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=64700', date: '2023',
    method: 'Esperimento controllato con consulenti su compiti realistici',
    sample: '758 consulenti BCG', finding: 'Nei compiti "dentro la frontiera" più compiti completati (~12%), più velocemente (~25%) e con qualità più alta (~40%); fuori dalla frontiera la correttezza è calata di ~19 punti.',
    reliability: 'Media-alta (esperimento preregistrato, working paper)', limits: 'Popolazione molto specifica; modello e strumenti del 2023.',
  },
];
