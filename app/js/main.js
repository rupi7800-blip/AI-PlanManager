import { load, getState, subscribe, update } from './store.js';
import { overview, computeAll } from './core/monitor.js';
import { evaluateAlerts, newAlerts, pruneFired } from './core/alerts.js';
import { buildSnapshot } from './core/snapshot.js';
import { deliver } from './notify.js';
import { initBridge, pushSnapshot, ingestExtensionEvents } from './bridge.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderServices } from './ui/services.js';
import { renderUsage } from './ui/usage.js';
import { renderAdvisor } from './ui/advisor.js';
import { renderCompare } from './ui/compare.js';
import { renderIndices } from './ui/indices.js';
import { renderHistory } from './ui/history.js';
import { renderSettings } from './ui/settings.js';
import { toast } from './ui/dom.js';

const ROUTES = {
  '': ['Dashboard', renderDashboard],
  servizi: ['Le mie AI', renderServices],
  consumi: ['Consumi', renderUsage],
  consulente: ['Consulente intelligente', renderAdvisor],
  confronto: ['Confronto modelli', renderCompare],
  indici: ['Indici di efficienza', renderIndices],
  storico: ['Storico', renderHistory],
  impostazioni: ['Impostazioni', renderSettings],
};

const root = document.getElementById('view');

function context() {
  const state = getState();
  const now = Date.now();
  const statuses = computeAll(state, now);
  const ov = overview(state, now);
  const alerts = evaluateAlerts(state, statuses, now);
  return { state, now, statuses, ov, alerts };
}

function route() {
  const [, name = '', param] = location.hash.replace(/^#\/?/, '#/').split('/');
  return { name: ROUTES[name] ? name : '', param };
}

let renderedRoute = null;
function render({ keepModal = false } = {}) {
  // Non ridisegnare sotto una finestra di dialogo aperta (si perderebbe l'input dell'utente)
  if (keepModal && document.querySelector('dialog[open]')) return;
  const ctx = context();
  const r = route();
  const [title, fn] = ROUTES[r.name];
  document.title = `${title} · AI Plan Manager`;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === r.name));
  const badge = document.getElementById('alert-count');
  badge.textContent = ctx.alerts.length; badge.hidden = !ctx.alerts.length;
  const scroll = renderedRoute === location.hash ? window.scrollY : 0;
  try { fn(root, ctx, r.param); }
  catch (err) { console.error(err); root.innerHTML = `<div class="card">Errore nella visualizzazione: ${String(err.message)}</div>`; }
  if (scroll) window.scrollTo(0, scroll);
  renderedRoute = location.hash;
  applyTheme(ctx.state.settings.theme);
  processAlerts(ctx);
  pushSnapshot(buildSnapshot(ctx.state, ctx.statuses, ctx.now));
}

let processing = false;
function processAlerts(ctx) {
  if (processing) return;
  const fresh = newAlerts(ctx.alerts, ctx.state.alertsFired);
  if (!fresh.length) return;
  processing = true;
  const stamp = new Date(ctx.now).toISOString();
  update(st => {
    for (const a of fresh) st.alertsFired[a.key] = stamp;
    st.alertsFired = pruneFired(st.alertsFired, ctx.now);
    st.inbox = [...fresh.map(a => ({ ...a, read: false })), ...st.inbox].slice(0, 200);
  });
  processing = false;
  for (const a of fresh) deliver(a, ctx.state.settings, ctx.state.subscriptions.find(s => s.id === a.subId));
}

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

load();
window.addEventListener('hashchange', () => render());
subscribe(() => render());
initBridge((events) => {
  let ids = [];
  update(st => { ids = ingestExtensionEvents(st, events); });
  if (ids.length) toast(`${ids.length} utilizzi ricevuti dalla finestrella`);
  return ids;
});
render();
// Aggiorna contatori, tempi di ripristino e previsioni ogni 30 secondi
setInterval(() => render({ keepModal: true }), 30_000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
