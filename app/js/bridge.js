// Ponte con l'estensione: l'app invia un'istantanea (snapshot) e riceve gli utilizzi
// registrati dalla finestrella. Comunicazione via window.postMessage con il content script
// "bridge" dell'estensione, attivo solo sulle pagine che espongono <meta name="aipm-app">.

import { addEvent } from './core/state.js';

const ORIGIN = location.origin;
let connected = false, lastSeen = 0;
let onEvents = () => {};

export function extensionStatus() { return { connected: connected && Date.now() - lastSeen < 120e3 }; }

export function initBridge(handler) {
  onEvents = handler;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== ORIGIN) return;
    const m = e.data;
    if (!m || m.ns !== 'aipm' || m.from !== 'extension') return;
    connected = true; lastSeen = Date.now();
    if (m.type === 'events' && Array.isArray(m.events) && m.events.length) {
      const ids = onEvents(m.events);
      window.postMessage({ ns: 'aipm', from: 'app', type: 'ack', ids }, ORIGIN);
    }
  });
  window.postMessage({ ns: 'aipm', from: 'app', type: 'hello' }, ORIGIN);
}

export function pushSnapshot(snapshot) {
  window.postMessage({ ns: 'aipm', from: 'app', type: 'snapshot', snapshot }, ORIGIN);
}

/** Valida e importa gli eventi arrivati dall'estensione. Restituisce gli id accettati. */
export function ingestExtensionEvents(state, events) {
  const ok = [];
  const subIds = new Set(state.subscriptions.map(s => s.id));
  const allowedSources = new Set(['manuale', 'stima']);
  for (const raw of events.slice(0, 500)) {
    if (!raw || typeof raw.id !== 'string' || !subIds.has(raw.subId)) { if (raw?.id) ok.push(raw.id); continue; }
    if (state.events.some(e => e.id === raw.id)) { ok.push(raw.id); continue; }
    const amount = Number(raw.amount);
    if (!(amount > 0 && amount < 1e9) || typeof raw.ts !== 'number' || raw.ts > Date.now() + 60e3) { ok.push(raw.id); continue; }
    addEvent(state, {
      id: raw.id.slice(0, 64), subId: raw.subId, ts: raw.ts, amount, unit: String(raw.unit || 'messages'),
      modelId: typeof raw.modelId === 'string' ? raw.modelId.slice(0, 64) : undefined,
      source: allowedSources.has(raw.source) ? raw.source : 'manuale', origin: 'estensione',
    });
    ok.push(raw.id);
  }
  return ok;
}
