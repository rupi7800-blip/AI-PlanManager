import { esc, status, meter, sourceBadge, avatar, toast } from './dom.js';
import { openLogUsage, openReading, quickLog } from './forms.js';
import { update } from '../store.js';
import { forecastLimit, rateText } from '../core/forecast.js';
import { usageIn, countSessions } from '../core/monitor.js';
import { UNITS, fmtNum, fmtDuration, unitLabel } from '../core/units.js';
import { fmtDateTime, DAY, WINDOW_TYPES } from '../core/time.js';
import { findModel } from '../core/catalog.js';

export function renderUsage(root, ctx) {
  const { state, now, statuses } = ctx;
  if (!statuses.length) { root.innerHTML = '<div class="page-head"><h1>Consumi</h1></div><div class="card empty">Aggiungi un servizio in <a href="#/servizi">Le mie AI</a>.</div>'; return; }
  const recent = [...state.events].sort((a, b) => b.ts - a.ts).slice(0, 40);
  root.innerHTML = `
    <div class="page-head"><div><h1>Consumi</h1><p>Contatori dettagliati, previsioni e gestione del tempo.</p></div>
      <button class="primary" id="log">+ Registra utilizzo</button></div>
    <div class="card small text2" style="margin-bottom:14px">Legenda fonti: ${['ufficiale', 'integrazione', 'manuale', 'stima'].map(sourceBadge).join(' ')} — un valore combinato assume l'attendibilità più bassa.</div>
    <div class="stack">${statuses.map(s => serviceUsage(s, state, now)).join('')}</div>
    <div class="section card"><h2>Ultime registrazioni</h2>
      ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Servizio</th><th class="num">Quantità</th><th>Modello</th><th>Fonte</th><th></th></tr></thead><tbody>
      ${recent.map(e => `<tr><td>${esc(fmtDateTime(e.ts))}</td><td>${esc(state.subscriptions.find(s => s.id === e.subId)?.name ?? '—')}</td>
        <td class="num">${fmtNum(e.amount, 2)} ${esc(UNITS[e.unit]?.short ?? e.unit)}</td><td class="small">${esc(e.modelId ? findModel(state.catalog, e.modelId)?.name ?? e.modelId : '—')}</td>
        <td>${sourceBadge(e.source)}</td><td><button class="small ghost" data-delev="${esc(e.id)}" aria-label="Elimina registrazione">✕</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small">Nessuna registrazione.</p>'}</div>`;
  root.querySelector('#log').onclick = () => openLogUsage();
  root.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => quickLog(b.dataset.quick));
  root.querySelectorAll('[data-reading]').forEach(b => b.onclick = () => openReading(b.dataset.reading, b.dataset.limit));
  root.querySelectorAll('[data-delev]').forEach(b => b.onclick = () => { update(st => { st.events = st.events.filter(e => e.id !== b.dataset.delev); }); toast('Registrazione eliminata'); });
}

function serviceUsage(s, state, now) {
  const sub = s.sub;
  const evs = state.events.filter(e => e.subId === sub.id);
  const ev30 = evs.filter(e => e.ts > now - 30 * DAY);
  const days = new Set(ev30.map(e => new Date(e.ts).toDateString())).size;
  const counters = [
    ['Messaggi (30 g)', usageIn(evs, 'messages', now - 30 * DAY, now + 1).used],
    ['Richieste (30 g)', usageIn(evs, 'requests', now - 30 * DAY, now + 1).used],
    ['Token (30 g)', usageIn(evs, 'tokens', now - 30 * DAY, now + 1).used],
    ['Crediti (30 g)', usageIn(evs, 'credits', now - 30 * DAY, now + 1).used],
    ['Tempo di utilizzo (30 g)', usageIn(evs, 'minutes', now - 30 * DAY, now + 1).used, 'min'],
    ['Sessioni (30 g)', countSessions(ev30)],
    ['Frequenza', days ? `${days} giorni su 30` : null],
  ];
  return `<div class="card">
    <div class="service-head">${avatar(sub.providerId, sub.name)}<b style="flex:1">${esc(sub.name)}</b>${status(s.level)}
      <button class="small" data-quick="${esc(sub.id)}">+1</button></div>
    <div class="grid kpi" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
      ${counters.map(([l, v, u]) => `<div class="card flat kpi" style="padding:10px 12px"><div class="label">${esc(l)}</div><div class="value" style="font-size:1.15rem">${v == null || v === 0 ? '<span class="muted">—</span>' : esc(typeof v === 'number' ? fmtNum(v) + (u ? ' ' + u : '') : v)}</div></div>`).join('')}
    </div>
    <p class="hint">"—" = nessun dato registrato: non significa zero consumo.</p>
    ${s.limits.map(l => {
      const f = forecastLimit(l, state, now);
      const short = UNITS[l.unit]?.short ?? l.unit;
      return `<div class="limit"><div class="head"><span><b>${esc(l.label)}</b> <span class="small muted">· ${esc(WINDOW_TYPES[l.window?.type] ?? '')}${l.window?.hours ? ` ${l.window.hours} h` : ''}</span></span>
        <span>${l.pct != null ? `<b class="num">${Math.round(l.pct)}%</b>` : '<span class="muted small">% non disponibile</span>'}</span></div>
        ${meter(l.pct, l.level, f.available ? f.projectedPct : null)}
        <div class="table-wrap"><table class="small" style="margin-top:8px"><tbody>
          <tr><th>Usato</th><td class="num">${l.used != null && (l.hasData || l.unit !== 'percent') ? fmtNum(l.used, 1) + (l.unit === 'percent' ? '%' : ' ' + esc(short)) : '—'}</td>
              <th>Limite</th><td class="num">${l.limitValue != null ? fmtNum(l.limitValue) + (l.unit === 'percent' ? '%' : ' ' + esc(short)) + (l.basis === 'personale' ? ' (personale)' : '') : 'non noto'}</td></tr>
          <tr><th>Residuo</th><td class="num">${l.remaining != null ? fmtNum(l.remaining, 1) : '—'}</td>
              <th>Ripristino</th><td>${l.resetAt ? `${esc(fmtDateTime(l.resetAt))} (tra ${fmtDuration(l.msToReset)})` : l.window?.type === 'session' ? 'parte al primo utilizzo' : '—'}</td></tr>
          ${f.available && f.rate ? `
          <tr><th>Ritmo attuale</th><td class="num">${esc(rateText(f.rate, short, l.window?.type))}</td>
              <th>Ritmo sostenibile</th><td class="num">${f.sustainableRate != null ? esc(rateText(f.sustainableRate, short, l.window?.type)) : '—'}</td></tr>
          <tr><th>Previsione al ripristino</th><td class="num">${f.projectedPct != null ? Math.round(f.projectedPct) + '%' : '—'}</td>
              <th>Esaurimento stimato</th><td>${f.willExceed ? `<b class="st-orange">${esc(fmtDateTime(f.exhaustAt))}</b>` : f.exhaustAt && l.resetAt ? 'non prima del ripristino' : '—'}</td></tr>` : ''}
        </tbody></table></div>
        <div class="meta row" style="margin-top:6px">${sourceBadge(l.source)}${f.available && f.indicative ? '<span class="tag warn">previsione indicativa: limite dinamico o non verificato</span>' : ''}
          <button class="small" data-reading="${esc(sub.id)}" data-limit="${esc(l.limitId)}">Registra lettura</button></div>
        ${l.notes.length ? `<p class="hint">${l.notes.map(esc).join(' ')}</p>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}
