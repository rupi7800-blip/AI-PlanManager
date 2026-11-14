import { esc, status, limitBlock, avatar, sourceBadge, toast } from './dom.js';
import { openAddSubscription, openEditSubscription, openLimitForm, openReading, openLogUsage } from './forms.js';
import { update } from '../store.js';
import { findProvider, findPlan, findModel } from '../core/catalog.js';
import { removeSubscription } from '../core/state.js';
import { forecastLimit } from '../core/forecast.js';
import { fmtMoney, LIMIT_STATUS, unitLabel } from '../core/units.js';
import { fmtDate, WINDOW_TYPES } from '../core/time.js';

export function renderServices(root, ctx, param) {
  if (param) return renderDetail(root, ctx, param);
  const { state, now } = ctx;
  const all = state.subscriptions;
  root.innerHTML = `
    <div class="page-head"><div><h1>Le mie AI</h1><p>Abbonamenti, piani, limiti e modelli disponibili.</p></div>
      <button class="primary" id="add">+ Aggiungi AI</button></div>
    ${all.length ? `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Servizio</th><th>Piano</th><th class="num">Costo</th><th>Rinnovo</th><th>Limiti</th><th>Stato</th><th></th></tr></thead>
      <tbody>${all.map(sub => {
        const s = ctx.statuses.find(x => x.sub.id === sub.id);
        const plan = findPlan(state.catalog, sub.providerId, sub.planId);
        return `<tr>
          <td><div class="row">${avatar(sub.providerId, sub.name)}<a href="#/servizi/${esc(sub.id)}"><b>${esc(sub.name)}</b></a></div></td>
          <td>${esc(plan?.name ?? 'Personalizzato')}${plan && !plan.verified ? ' <span class="tag warn">non verificato</span>' : ''}</td>
          <td class="num">${sub.cost?.period === 'usage' ? 'a consumo' : `${fmtMoney(sub.cost?.amount, sub.cost?.currency)}/${sub.cost?.period === 'year' ? 'anno' : 'mese'}`}</td>
          <td>${sub.renewalDate ? fmtDate(s?.renewalAt ?? new Date(sub.renewalDate).getTime()) : '<span class="muted">—</span>'}</td>
          <td>${sub.limits.length}</td>
          <td>${sub.active === false ? '<span class="tag">disattivato</span>' : status(s?.level ?? 'unknown')}</td>
          <td><a class="btn small" href="#/servizi/${esc(sub.id)}">Apri</a></td></tr>`;
      }).join('')}</tbody></table></div></div>` : `<div class="card empty"><p>Nessun servizio configurato.</p></div>`}

    <div class="section card"><h2>Database dei piani</h2>
      <p class="small text2">Catalogo aggiornabile (versione ${esc(state.catalog.version)}, aggiornato il ${esc(state.catalog.updatedAt)}). Ogni piattaforma ha unità di misura proprie: i limiti non sono confrontabili tra fornitori.
      Puoi importare aggiornamenti in <a href="#/impostazioni">Impostazioni</a>.</p>
      <div class="table-wrap"><table><thead><tr><th>Fornitore</th><th>Piano</th><th class="num">Prezzo</th><th>Limiti noti</th><th>Verifica</th></tr></thead><tbody>
      ${state.catalog.providers.flatMap(p => p.plans.map(pl => `<tr><td>${esc(p.name)}</td><td>${esc(pl.name)}</td>
        <td class="num">${pl.price.period === 'usage' ? 'a consumo' : `${pl.price.amount} ${esc(pl.price.currency)}/${pl.price.period === 'year' ? 'anno' : 'mese'}`}</td>
        <td class="small">${pl.limits.map(l => `${esc(l.label)}: ${l.value != null ? esc(l.value) + (l.unit === 'percent' ? '%' : '') : '<i>' + esc(LIMIT_STATUS[l.status] ?? 'n.d.') + '</i>'}`).join('<br>')}</td>
        <td class="small">${pl.verified ? `✓ ${esc(pl.source.checkedAt ?? '')}` : '<span class="tag warn">non verificato</span>'} · <a href="${esc(pl.source.url)}" target="_blank" rel="noopener">fonte</a></td></tr>`)).join('')}
      </tbody></table></div></div>`;
  root.querySelector('#add').onclick = openAddSubscription;
}

function renderDetail(root, ctx, id) {
  const { state, now } = ctx;
  const sub = state.subscriptions.find(s => s.id === id);
  if (!sub) { root.innerHTML = '<div class="card empty">Servizio non trovato. <a href="#/servizi">Torna all\'elenco</a></div>'; return; }
  const s = ctx.statuses.find(x => x.sub.id === id);
  const prov = findProvider(state.catalog, sub.providerId);
  const plan = findPlan(state.catalog, sub.providerId, sub.planId);
  const lastEvents = state.events.filter(e => e.subId === id).sort((a, b) => b.ts - a.ts).slice(0, 8);
  root.innerHTML = `
    <div class="page-head"><div><a href="#/servizi" class="small">← Le mie AI</a>
      <div class="row" style="margin-top:6px">${avatar(sub.providerId, sub.name)}<h1 style="margin:0">${esc(sub.name)}</h1>${s ? status(s.level) : '<span class="tag">disattivato</span>'}</div></div>
      <div class="row"><button id="edit">Modifica</button><button class="danger" id="del">Elimina</button></div></div>
    <div class="grid two">
      <div class="card"><h2>Limiti e contatori</h2>
        ${s?.limits.length ? s.limits.map(l => `${limitBlock(l, forecastLimit(l, state, now))}
          <div class="row" style="margin:-2px 0 6px">
            <button class="small" data-lim="${esc(l.limitId)}">Modifica limite</button>
            <button class="small" data-read="${esc(l.limitId)}">Registra lettura</button>
            ${sub.limits.find(x => x.id === l.limitId)?.status === 'personale' ? `<button class="small danger" data-dellim="${esc(l.limitId)}">Rimuovi</button>` : ''}
          </div>
          ${l.notes.length ? `<p class="hint">${l.notes.map(esc).join(' ')}</p>` : ''}`).join('') : '<p class="muted small">Nessun limite.</p>'}
        <div class="row" style="margin-top:10px"><button class="primary small" id="addlim">+ Limite personale</button><button class="small" id="log">+ Registra utilizzo</button></div>
        <p class="hint">Limiti personali: giornaliero, settimanale, mensile, budget, tempo massimo, richieste o sessioni massime.</p>
      </div>
      <div class="stack">
        <div class="card"><h2>Piano</h2>
          <table><tbody>
            <tr><th>Piattaforma</th><td>${esc(prov?.name ?? 'Servizio personalizzato')}</td></tr>
            <tr><th>Piano</th><td>${esc(plan?.name ?? '—')} ${plan ? (plan.verified ? '✓' : '<span class="tag warn">non verificato</span>') : ''}</td></tr>
            <tr><th>Costo</th><td>${sub.cost?.period === 'usage' ? 'a consumo' : `${fmtMoney(sub.cost.amount, sub.cost.currency)} / ${sub.cost.period === 'year' ? 'anno' : 'mese'}`}</td></tr>
            <tr><th>Rinnovo</th><td>${s?.renewalAt ? `${fmtDate(s.renewalAt)} (tra ${s.daysToRenewal} g)` : '—'}</td></tr>
            <tr><th>Soglie avviso</th><td>${sub.thresholds.map(t => t + '%').join(' · ')}</td></tr>
            <tr><th>Fonte</th><td>${plan ? `<a href="${esc(plan.source.url)}" target="_blank" rel="noopener">${esc(plan.source.url)}</a>` : '—'}</td></tr>
          </tbody></table></div>
        <div class="card"><h2>Modelli disponibili</h2>
          ${sub.models.length ? `<ul class="small" style="margin:0;padding-left:18px">${sub.models.map(mid => { const m = findModel(state.catalog, mid); return `<li>${esc(m?.name ?? mid)} <span class="muted">· fascia ${m?.tier ?? '?'}/5 · consumo relativo ${m?.costWeight ?? '?'}/10</span></li>`; }).join('')}</ul>
          <p class="hint">Fascia e consumo relativo sono stime editoriali modificabili, non dati del fornitore.</p>` : '<p class="muted small">Nessun modello indicato.</p>'}</div>
        <div class="card"><h2>Ultimi utilizzi</h2>
          ${lastEvents.length ? `<table><tbody>${lastEvents.map(e => `<tr><td class="small">${new Date(e.ts).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</td><td class="small">${e.amount} ${esc(unitLabel(e.unit).toLowerCase())}</td><td>${sourceBadge(e.source)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Nessuno.</p>'}</div>
      </div>
    </div>`;
  root.querySelector('#edit').onclick = () => openEditSubscription(id);
  root.querySelector('#del').onclick = () => {
    if (!confirm(`Eliminare ${sub.name} e tutti i suoi dati di consumo? L'operazione non è reversibile.`)) return;
    update(st => removeSubscription(st, id)); location.hash = '#/servizi'; toast('Servizio eliminato');
  };
  root.querySelector('#addlim').onclick = () => openLimitForm(id);
  root.querySelector('#log').onclick = () => openLogUsage(id);
  root.querySelectorAll('[data-lim]').forEach(b => b.onclick = () => openLimitForm(id, b.dataset.lim));
  root.querySelectorAll('[data-read]').forEach(b => b.onclick = () => openReading(id, b.dataset.read));
  root.querySelectorAll('[data-dellim]').forEach(b => b.onclick = () => {
    if (confirm('Rimuovere questo limite personale?')) update(st => { const x = st.subscriptions.find(y => y.id === id); x.limits = x.limits.filter(l => l.id !== b.dataset.dellim); });
  });
}
