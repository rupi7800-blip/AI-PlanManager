import { esc, status, limitBlock, avatar, stackedBars, SERIES, sourceBadge } from './dom.js';
import { openAddSubscription, openLogUsage, quickLog, openReading } from './forms.js';
import { forecastLimit } from '../core/forecast.js';
import { fmtMoney, fmtDuration, fmtNum } from '../core/units.js';
import { fmtDate } from '../core/time.js';
import { series } from '../core/history.js';
import { LEVELS } from '../core/monitor.js';

export function renderDashboard(root, ctx) {
  const { state, now, ov, alerts } = ctx;
  if (!ov.activeCount) {
    root.innerHTML = `<div class="page-head"><div><h1>Dashboard</h1><p>La situazione dei tuoi abbonamenti AI a colpo d'occhio.</p></div></div>
      <div class="card empty"><div class="big">🧭</div><h2>Inizia aggiungendo le AI che usi</h2>
      <p>Indica piattaforma, piano e data di rinnovo: in meno di un minuto vedrai consumi, limiti e consigli.</p>
      <button class="primary" id="add-first">+ Aggiungi la prima AI</button></div>`;
    root.querySelector('#add-first').onclick = openAddSubscription;
    return;
  }
  const spend = Object.entries(ov.spendByCurrency).map(([c, v]) => fmtMoney(v, c)).join(' + ') || '—';
  const nextRen = ov.renewals[0];
  const nextReset = ov.statuses.map(s => s.nextResetMs).filter(x => x != null).sort((a, b) => a - b)[0];
  const counts = { green: 0, yellow: 0, orange: 0, red: 0, unknown: 0 };
  ov.statuses.forEach(s => counts[s.level]++);

  root.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p>Aggiornata ${new Date(now).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · i dati sono tutti sul tuo dispositivo</p></div>
      <div class="row"><button id="log">+ Registra utilizzo</button><button class="primary" id="add">+ Aggiungi AI</button></div></div>

    <div class="grid kpi">
      <div class="card kpi"><div class="label">Servizi AI attivi</div><div class="value">${ov.activeCount}</div>
        <div class="sub">${['red', 'orange', 'yellow', 'green'].filter(k => counts[k]).map(k => `${counts[k]} ${LEVELS[k].label.toLowerCase()}`).join(' · ') || 'nessun limite misurato'}</div></div>
      <div class="card kpi"><div class="label">Spesa mensile</div><div class="value" style="font-size:${spend.length > 14 ? '1.15rem' : '1.6rem'}">${esc(spend)}</div><div class="sub">valute non convertite; esclusi piani a consumo</div></div>
      <div class="card kpi"><div class="label">Utilizzo medio dei limiti</div><div class="value">${ov.avgPct != null ? Math.round(ov.avgPct) + '%' : '—'}</div>
        <div class="sub">${ov.measuredLimits} di ${ov.totalLimits} limiti misurabili</div></div>
      <div class="card kpi"><div class="label">Prossimo ripristino</div><div class="value">${nextReset != null ? fmtDuration(nextReset) : '—'}</div>
        <div class="sub">${nextRen ? `Rinnovo: ${esc(nextRen.sub.name)} il ${fmtDate(nextRen.renewalAt)}` : 'nessuna data di rinnovo'}</div></div>
    </div>

    ${alerts.length ? `<div class="section card"><h2>Avvisi attivi (${alerts.length})</h2><div class="stack">${alerts.slice(0, 6).map(a => `
      <div class="alert lv-${a.level}"><div>${status(a.level, a.kind === 'previsione' ? 'Previsione' : a.kind === 'rinnovo' ? 'Rinnovo' : undefined)}</div>
      <div><b>${esc(a.title)}</b><div class="small text2">${esc(a.body)}</div></div></div>`).join('')}</div></div>` : ''}

    <div class="section"><div class="row between"><h2>I tuoi servizi</h2><span class="small muted">Ordinati per urgenza</span></div>
    <div class="grid cards">${[...ov.statuses].sort((a, b) => rank(b.level) - rank(a.level)).map(s => serviceCard(s, state, now)).join('')}</div></div>

    <div class="section card"><div class="row between"><h2 style="margin:0">Andamento degli utilizzi registrati</h2>
      <div class="seg" role="tablist">${[['7g', '7 giorni'], ['30g', '30 giorni'], ['12m', '12 mesi']].map(([k, l], i) => `<button data-range="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="small muted" style="margin-top:6px">Numero di registrazioni per servizio (unità neutra: token, messaggi e crediti non vengono sommati tra loro).</p>
      <div id="trend"></div></div>`;

  root.querySelector('#add').onclick = openAddSubscription;
  root.querySelector('#log').onclick = () => openLogUsage();
  root.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => quickLog(b.dataset.quick));
  root.querySelectorAll('[data-reading]').forEach(b => b.onclick = () => openReading(b.dataset.reading));
  const drawTrend = (range) => {
    const r = series(state.events, range, now, e => e.subId);
    const subs = state.subscriptions;
    stackedBars(root.querySelector('#trend'), {
      labels: r.buckets.map(b => b.label),
      series: subs.filter(s => r.series[s.id]).map((s, i) => ({ name: s.name, color: SERIES[subs.indexOf(s) % 8], values: r.series[s.id] })),
    }, { unit: 'registrazioni' });
  };
  root.querySelectorAll('[data-range]').forEach(b => b.onclick = () => {
    root.querySelectorAll('[data-range]').forEach(x => x.classList.toggle('on', x === b)); drawTrend(b.dataset.range);
  });
  drawTrend('7g');
}

const rank = (l) => ['unknown', 'green', 'yellow', 'orange', 'red'].indexOf(l);

function serviceCard(s, state, now) {
  const sub = s.sub;
  const hasPercent = s.limits.some(l => l.unit === 'percent');
  return `<div class="card">
    <div class="service-head">${avatar(sub.providerId, sub.name)}
      <div style="flex:1;min-width:0"><b>${esc(sub.name)}</b><div class="small muted">${s.monthlyCost != null ? fmtMoney(s.monthlyCost, sub.cost.currency) + '/mese' : 'a consumo'}${s.daysToRenewal != null ? ` · rinnovo tra ${s.daysToRenewal} g` : ''}</div></div>
      ${status(s.level)}</div>
    ${s.limits.length ? s.limits.map(l => limitBlock(l, forecastLimit(l, state, now))).join('') : '<p class="small muted">Nessun limite configurato. Aggiungine uno personale in "Le mie AI".</p>'}
    <div class="row" style="margin-top:10px">
      <button class="small" data-quick="${esc(sub.id)}" title="Registra un utilizzo">+1</button>
      ${hasPercent || s.limits.length ? `<button class="small" data-reading="${esc(sub.id)}">Aggiorna lettura</button>` : ''}
      <a class="btn small ghost" href="#/servizi/${esc(sub.id)}">Dettagli →</a>
    </div></div>`;
}
