// CONSULENTE INTELLIGENTE DEI CONSUMI.
// Produce consigli concreti e numerici basati SOLO sui dati disponibili; quando il dato
// manca, il consiglio è di raccoglierlo, non di indovinarlo.

import { forecastLimit, rateText } from './forecast.js';
import { findModel } from './catalog.js';
import { UNITS, fmtDuration, fmtMoney, fmtNum } from './units.js';
import { fmtDateTime, DAY } from './time.js';
import { countSessions } from './monitor.js';
import { TASKS } from './selector.js';

const LIGHT_TASKS = new Set(['quotidiane', 'traduzione', 'scrittura']);

function alternatives(statuses, excludeSubId, state) {
  const out = [];
  for (const s of statuses) {
    if (s.sub.id === excludeSubId) continue;
    const known = s.limits.filter(l => l.pct != null);
    const worst = known.length ? Math.max(...known.map(l => l.pct)) : null;
    if (worst != null && worst >= 85) continue;
    const models = (s.sub.models ?? []).map(id => findModel(state.catalog, id)).filter(Boolean)
      .filter(m => (m.caps?.writing ?? 0) >= 3).sort((a, b) => a.costWeight - b.costWeight);
    if (models.length) out.push({ sub: s.sub, model: models[0], residual: worst == null ? null : 100 - worst });
  }
  return out.slice(0, 3);
}

export function advise(state, statuses, now) {
  const tips = [];
  for (const s of statuses) {
    const sub = s.sub;
    for (const st of s.limits) {
      const short = UNITS[st.unit]?.short ?? st.unit;
      const f = forecastLimit(st, state, now);

      if (!st.hasData && st.windowActive) {
        tips.push({
          subId: sub.id, priority: 1, level: 'unknown', kind: 'dati',
          title: `${sub.name} · ${st.label}: nessun dato`,
          text: st.unit === 'percent'
            ? 'Apri la pagina di utilizzo della piattaforma e registra la percentuale mostrata con l\'orario di ripristino: il monitoraggio diventerà affidabile.'
            : 'Registra i tuoi utilizzi (anche con il pulsante "+1" della finestrella) per ottenere previsioni e consigli.',
          actions: [], indicative: false,
        });
        continue;
      }
      if (!f.available) continue;

      if (f.willExceed) {
        const alts = alternatives(statuses, sub.id, state);
        const actions = [
          `Mantieni un ritmo massimo di ${rateText(f.sustainableRate, short, st.window?.type)} (oggi: ${rateText(f.rate, short, st.window?.type)}, −${Math.round(f.reductionPct)}%).`,
          'Accorpa più domande in un\'unica richiesta ben strutturata, con tutto il contesto necessario.',
          'Riserva il modello più potente alle attività complesse; usa modelli leggeri per bozze e domande semplici.',
          'Rimanda le attività non urgenti a dopo il ripristino' + (st.resetAt ? ` (${fmtDateTime(st.resetAt)}).` : '.'),
        ];
        for (const a of alts) actions.push(`Alternativa: ${a.model.name} su ${a.sub.name}` + (a.residual != null ? ` (${Math.round(a.residual)}% residuo).` : ' (quota non misurata).'));
        tips.push({
          subId: sub.id, priority: 3, level: st.pct >= 85 ? 'orange' : 'yellow', kind: 'ritmo',
          title: `${sub.name}: al ritmo attuale esaurisci "${st.label}" prima del ripristino`,
          text: `Hai usato il ${Math.round(st.pct)}% e mancano ${fmtDuration(st.msToReset)} al ripristino. ` +
            `Esaurimento stimato: ${fmtDateTime(f.exhaustAt)} (${fmtDuration(f.marginMs)} prima del ripristino).`,
          actions, indicative: f.indicative,
        });
      } else if (st.pct != null && st.pct >= 100) {
        const alts = alternatives(statuses, sub.id, state);
        tips.push({
          subId: sub.id, priority: 4, level: 'red', kind: 'limite',
          title: `${sub.name}: limite "${st.label}" raggiunto`,
          text: `Ripristino ${st.resetAt ? `tra ${fmtDuration(st.msToReset)}` : 'non noto'}.`,
          actions: alts.map(a => `Continua con ${a.model.name} su ${a.sub.name}.`), indicative: f.indicative,
        });
      }

      // Sottoutilizzo: solo su finestre lunghe con limite noto
      if (['monthly', 'billing', 'weekly'].includes(st.window?.type) && st.pct != null && st.resetAt) {
        const span = st.resetAt - st.windowStart;
        const elapsedFrac = (now - st.windowStart) / span;
        if (elapsedFrac >= 0.5 && st.pct < elapsedFrac * 100 * 0.35) {
          const proj = f.projectedPct;
          tips.push({
            subId: sub.id, priority: 2, level: 'green', kind: 'sottoutilizzo',
            title: `${sub.name}: piano sottoutilizzato`,
            text: `È trascorso il ${Math.round(elapsedFrac * 100)}% del periodo ma hai usato il ${Math.round(st.pct)}% di "${st.label}"` +
              (proj != null ? `; a fine periodo arriveresti circa al ${Math.round(proj)}% (stima).` : '.'),
            actions: [
              'Sposta su questo servizio attività che oggi svolgi su piani più carichi.',
              s.monthlyCost ? `Se il sottoutilizzo si ripete, valuta un piano inferiore: oggi paghi ${fmtMoney(s.monthlyCost, sub.cost.currency)} al mese.` : 'Valuta se il piano è adeguato alle tue esigenze.',
            ],
            indicative: true,
          });
        }
      }
    }

    // Uso di modelli sovradimensionati per attività leggere
    const recent = state.events.filter(e => e.subId === sub.id && e.ts > now - 14 * DAY && e.task && e.modelId);
    const light = recent.filter(e => LIGHT_TASKS.has(e.task));
    if (light.length >= 5) {
      const heavy = light.filter(e => (findModel(state.catalog, e.modelId)?.tier ?? 0) >= 5);
      const share = heavy.length / light.length;
      if (share >= 0.5) {
        const lighter = (sub.models ?? []).map(id => findModel(state.catalog, id)).filter(m => m && m.tier <= 3 && (m.caps?.writing ?? 0) >= 3)
          .sort((a, b) => a.costWeight - b.costWeight)[0];
        tips.push({
          subId: sub.id, priority: 2, level: 'yellow', kind: 'modello',
          title: `${sub.name}: modello potente usato per attività semplici`,
          text: `Negli ultimi 14 giorni il ${Math.round(share * 100)}% delle attività leggere (${light.length} registrate: ${[...new Set(light.map(e => TASKS[e.task]?.label.toLowerCase()))].join(', ')}) è stato svolto con un modello di fascia alta.`,
          actions: [lighter ? `Per queste attività prova ${lighter.name}: qualità adeguata con consumo stimato molto inferiore.` : 'Per queste attività usa il modello più leggero disponibile.',
            'Torna al modello potente solo se il risultato non è soddisfacente.'],
          indicative: true,
        });
      }
    }

    // Rigenerazioni frequenti = spreco
    const withReq = recent.filter(e => e.regenerations != null);
    if (withReq.length >= 5) {
      const regen = withReq.reduce((a, e) => a + (e.regenerations || 0), 0) / withReq.length;
      if (regen >= 1) tips.push({
        subId: sub.id, priority: 2, level: 'yellow', kind: 'rigenerazioni',
        title: `${sub.name}: molte rigenerazioni`,
        text: `In media ${fmtNum(regen, 1)} rigenerazioni per attività negli ultimi 14 giorni.`,
        actions: ['Specifica meglio formato, lunghezza e destinatario nella prima richiesta.', 'Fornisci un esempio del risultato atteso: riduce i tentativi.'],
        indicative: false,
      });
    }

    // Costo per sessione (solo se costo e sessioni sono noti)
    const monthEv = state.events.filter(e => e.subId === sub.id && e.ts > now - 30 * DAY);
    const sessions = countSessions(monthEv);
    if (s.monthlyCost && sessions >= 3) {
      tips.push({
        subId: sub.id, priority: 0, level: 'green', kind: 'costo',
        title: `${sub.name}: ${fmtMoney(s.monthlyCost / sessions, sub.cost.currency)} per sessione`,
        text: `${sessions} sessioni registrate negli ultimi 30 giorni per un costo di ${fmtMoney(s.monthlyCost, sub.cost.currency)}/mese.`,
        actions: [], indicative: false,
      });
    }
  }
  return tips.sort((a, b) => b.priority - a.priority);
}
