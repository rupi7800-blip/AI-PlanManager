// SELETTORE INTELLIGENTE DELLA MIGLIORE AI.
// Obiettivo: il modello SUFFICIENTE con il minor consumo, non il più economico in assoluto.
// Un modello con capacità insufficienti non viene mai preferito a uno adeguato.

import { findModel, findProvider } from './catalog.js';

export const DIMENSIONS = {
  reasoning: 'Ragionamento', writing: 'Scrittura', coding: 'Programmazione', math: 'Matematica',
  research: 'Ricerca/fonti', speed: 'Velocità', vision: 'Analisi immagini/documenti', images: 'Creazione immagini',
  longContext: 'Testi lunghi', data: 'Analisi dati',
};

// Requisiti minimi (0–5) per livello di complessità: [semplice, media, complessa]
const R = (o) => o;
export const TASKS = {
  ricerca: { label: 'Ricerca e approfondimento', req: [R({ research: 3, writing: 2 }), R({ research: 4, reasoning: 3, writing: 3 }), R({ research: 5, reasoning: 4, writing: 4 })] },
  scientifica: { label: 'Analisi scientifica', req: [R({ reasoning: 3, research: 3 }), R({ reasoning: 4, research: 4, math: 3 }), R({ reasoning: 5, research: 5, math: 4, longContext: 4 })] },
  studio: { label: 'Studio universitario', req: [R({ writing: 3, reasoning: 2 }), R({ reasoning: 3, writing: 3, research: 3 }), R({ reasoning: 4, research: 4, writing: 4 })] },
  programmazione: { label: 'Programmazione', req: [R({ coding: 3 }), R({ coding: 4, reasoning: 3 }), R({ coding: 5, reasoning: 4, longContext: 4 })] },
  finanza: { label: 'Analisi finanziaria', req: [R({ data: 3, math: 3 }), R({ data: 4, math: 4, reasoning: 3 }), R({ data: 5, math: 4, reasoning: 5 })] },
  scrittura: { label: 'Scrittura', req: [R({ writing: 3 }), R({ writing: 4 }), R({ writing: 5, reasoning: 3, longContext: 3 })] },
  traduzione: { label: 'Traduzione', req: [R({ writing: 3 }), R({ writing: 4 }), R({ writing: 5, longContext: 4 })] },
  documenti: { label: 'Analisi documentale', req: [R({ longContext: 3, writing: 3 }), R({ longContext: 4, reasoning: 3, vision: 3 }), R({ longContext: 5, reasoning: 4, vision: 4 })] },
  immagini: { label: 'Creazione di immagini', req: [R({ images: 3 }), R({ images: 4 }), R({ images: 5 })] },
  dati: { label: 'Analisi di dati', req: [R({ data: 3 }), R({ data: 4, math: 3 }), R({ data: 5, math: 4, reasoning: 4 })] },
  matematica: { label: 'Ragionamento matematico', req: [R({ math: 3 }), R({ math: 4, reasoning: 4 }), R({ math: 5, reasoning: 5 })] },
  complesse: { label: 'Elaborazioni complesse', req: [R({ reasoning: 4 }), R({ reasoning: 5, longContext: 4 }), R({ reasoning: 5, longContext: 5, coding: 4, data: 4 })] },
  quotidiane: { label: 'Attività quotidiane e domande semplici', req: [R({ writing: 2 }), R({ writing: 3, reasoning: 2 }), R({ writing: 3, reasoning: 3 })] },
};
export const COMPLEXITY = ['semplice', 'media', 'complessa'];

/** Disponibilità del modello nell'abbonamento: 0..1 (1 = piena quota) e motivo. */
function availability(modelId, subStatus) {
  if (!subStatus) return { value: 1, text: 'quota non monitorata' };
  const rel = subStatus.limits.filter(l => {
    const lim = subStatus.sub.limits.find(x => x.id === l.limitId);
    return !lim?.models?.length || lim.models.includes(modelId);
  });
  const known = rel.filter(l => l.pct != null);
  if (!known.length) return { value: 0.85, text: 'consumo non misurabile (limite non noto)', unknown: true };
  const worst = Math.max(...known.map(l => l.pct));
  if (worst >= 100) return { value: 0, text: `limite raggiunto (${Math.round(worst)}%)`, blocked: true };
  return { value: Math.max(0, 1 - worst / 100), text: `${Math.round(100 - worst)}% di quota residua` };
}

/**
 * @param opts { task, complexity: 0|1|2, priority: 'equilibrio'|'qualita'|'risparmio', includeCatalog }
 * @param statuses computeAll(...)
 */
export function recommend(state, statuses, opts) {
  const task = TASKS[opts.task];
  if (!task) throw new Error('Attività sconosciuta');
  const cx = Math.max(0, Math.min(2, opts.complexity ?? 1));
  const req = task.req[cx];
  const priority = opts.priority ?? 'equilibrio';
  const catalog = state.catalog;

  // Candidati: modelli inclusi negli abbonamenti attivi dell'utente
  const cands = [];
  for (const s of statuses) {
    for (const mid of s.sub.models ?? []) {
      const model = findModel(catalog, mid);
      if (!model) continue;
      cands.push({ model, subStatus: s, owned: true, extraCost: s.sub.cost?.period === 'usage' });
    }
  }
  if (opts.includeCatalog) {
    const owned = new Set(cands.map(c => c.model.id));
    for (const model of catalog.models) if (!owned.has(model.id)) cands.push({ model, subStatus: null, owned: false, extraCost: true });
  }

  const scored = cands.map(c => {
    const caps = c.model.caps ?? {};
    let deficit = 0, maxDeficit = 0, surplus = 0;
    const gaps = [];
    for (const [dim, need] of Object.entries(req)) {
      const have = caps[dim] ?? 0;
      const d = Math.max(0, need - have);
      deficit += d; maxDeficit = Math.max(maxDeficit, d);
      surplus += Math.max(0, have - need);
      if (d) gaps.push(`${DIMENSIONS[dim]} ${have}/${need}`);
    }
    const sufficient = maxDeficit === 0;
    const quality = Math.max(0, 100 - deficit * 22 - maxDeficit * 10); // 100 = requisiti pienamente soddisfatti
    const cw = c.model.costWeight ?? 5;
    const efficiency = 100 - (cw - 1) * 11; // 100 = consumo minimo
    const av = availability(c.model.id, c.subStatus);
    const w = priority === 'qualita' ? [0.7, 0.1, 0.2] : priority === 'risparmio' ? [0.45, 0.4, 0.15] : [0.55, 0.25, 0.2];
    let score = quality * w[0] + efficiency * w[1] + av.value * 100 * w[2];
    if (c.extraCost) score -= 8;
    if (!c.owned) score -= 10;
    if (av.blocked) score -= 60;
    return { ...c, sufficient, quality, efficiency, availability: av, score, gaps, surplus, costWeight: cw };
  });

  // Regola di qualità: se esiste un modello sufficiente e disponibile, gli insufficienti vanno in coda.
  const anySufficient = scored.some(s => s.sufficient && !s.availability.blocked);
  scored.sort((a, b) => {
    if (anySufficient && a.sufficient !== b.sufficient) return a.sufficient ? -1 : 1;
    return b.score - a.score;
  });
  if (!scored.length) return { best: null, ranking: [], req, task: task.label, message: 'Nessun modello disponibile: aggiungi un abbonamento in "Le mie AI".' };

  const best = scored[0];
  const strongest = [...scored].filter(s => s.owned).sort((a, b) => b.model.tier - a.model.tier || b.costWeight - a.costWeight)[0];
  const savingPct = strongest && strongest.model.id !== best.model.id && strongest.costWeight > best.costWeight
    ? Math.round((1 - best.costWeight / strongest.costWeight) * 100) : 0;

  const provider = findProvider(catalog, best.model.providerId);
  const reasons = [];
  if (best.sufficient) reasons.push(`soddisfa tutti i requisiti per "${task.label.toLowerCase()}" (${COMPLEXITY[cx]})`);
  else reasons.push(`è il più vicino ai requisiti tra quelli disponibili (carenze: ${best.gaps.join(', ')})`);
  if (best.surplus <= 3) reasons.push('non è sovradimensionato per questo compito');
  reasons.push(`disponibilità: ${best.availability.text}`);
  if (best.extraCost) reasons.push('attenzione: consumo a pagamento (API) o servizio non sottoscritto');

  const tradeoffs = [];
  if (strongest && strongest.model.id !== best.model.id) {
    if (strongest.model.tier > best.model.tier) tradeoffs.push(`${strongest.model.name} è più potente: riservalo se il risultato non è soddisfacente o il compito si rivela più complesso.`);
  }
  if (!best.sufficient) tradeoffs.push('Nessun modello disponibile soddisfa pienamente i requisiti: valuta un servizio diverso o suddividi il compito.');
  if ((best.model.caps?.speed ?? 3) <= 2) tradeoffs.push('Modello lento: preventiva tempi di risposta più lunghi.');

  return {
    task: task.label, complexity: COMPLEXITY[cx], req,
    best, provider, reasons, tradeoffs,
    saving: savingPct > 0 ? { pct: savingPct, vs: strongest.model.name, note: 'Risparmio relativo di quota stimato dal profilo di consumo del modello (stima editoriale, non dato ufficiale).' } : null,
    ranking: scored.slice(0, 6),
  };
}
