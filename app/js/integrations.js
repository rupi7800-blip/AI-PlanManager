// INTEGRAZIONI CON I FORNITORI (dati ufficiali) tramite il proxy dell'utente.
// Il browser non vede mai le chiavi API dei fornitori.

import { getState, update } from './store.js';
import { addEvent, addReading } from './core/state.js';

async function call(path) {
  const { url, token } = getState().settings.proxy;
  if (!url) throw new Error('Configura prima l\'URL del proxy');
  const res = await fetch(`${url}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Proxy: HTTP ${res.status}`);
  return res.json();
}

/**
 * Importa i consumi giornalieri ufficiali come eventi con fonte "ufficiale".
 * Ogni giorno/unità ha un id deterministico: una nuova sincronizzazione aggiorna, non duplica.
 */
export async function syncOfficial() {
  const st = getState();
  const targets = st.subscriptions.filter(s => s.active !== false && s.cost?.period === 'usage');
  if (!targets.length) return 'Nessun abbonamento "a consumo" (API) da sincronizzare.';
  const report = [];
  for (const sub of targets) {
    try {
      if (sub.providerId === 'deepseek') {
        const r = await call('/balance?provider=deepseek');
        const lim = sub.limits.find(l => l.unit === 'usd' && l.window?.type === 'none');
        if (lim && r.balance != null) update(s => addReading(s, { subId: sub.id, limitId: lim.id, remaining: Number(r.balance), source: 'ufficiale', ts: Date.now() }));
        report.push(`${sub.name}: saldo ${r.balance} ${r.currency ?? ''}`);
        continue;
      }
      if (!['openai', 'anthropic'].includes(sub.providerId)) continue;
      const r = await call(`/usage?provider=${sub.providerId}&days=31`);
      update(s => {
        for (const d of r.days ?? []) {
          const ts = new Date(`${d.date}T12:00:00`).getTime();
          const put = (unit, amount) => { if (amount > 0) addEvent(s, { id: `off_${sub.id}_${d.date}_${unit}`, subId: sub.id, ts, unit, amount, source: 'ufficiale' }); };
          put('tokens', (d.inputTokens ?? 0) + (d.outputTokens ?? 0));
          put('requests', d.requests ?? 0);
          put('usd', d.costUsd ?? 0);
        }
      });
      report.push(`${sub.name}: ${r.days?.length ?? 0} giorni`);
    } catch (e) { report.push(`${sub.name}: ${e.message}`); }
  }
  return report.join(' · ') || 'Nessun dato';
}
