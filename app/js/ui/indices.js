import { esc, avatar, sourceBadge, hBars, SERIES } from './dom.js';
import { computeIndices, BENCHMARKS, FORMULAS } from '../core/indices.js';
import { fmtMoney, fmtNum, unitLabel } from '../core/units.js';

let range = 30;

export function renderIndices(root, ctx) {
  const { state, now, statuses } = ctx;
  const idx = computeIndices(state, statuses, now, range);
  const money = (m, c) => m.value != null ? fmtMoney(m.value, c) : null;
  const pct = (m) => m.value != null ? Math.round(m.value * (m.value <= 1 ? 100 : 1)) + '%' : null;
  const cell = (v, m, extra = '') => `<td class="num" title="${esc(m.formula)}">${v ?? '<span class="muted">n.d.</span>'}${extra}</td>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>Indici di efficienza</h1><p>Indicatori calcolati sui tuoi dati con formule trasparenti (passa il mouse su un valore per vedere la formula).</p></div>
      <div class="seg">${[7, 30, 90].map(d => `<button data-r="${d}" class="${d === range ? 'on' : ''}">${d} giorni</button>`).join('')}</div></div>
    ${!idx.length ? '<div class="card empty">Aggiungi un servizio per calcolare gli indici.</div>' : `
    <div class="card"><h2>Efficienza economica</h2><div class="table-wrap"><table>
      <thead><tr><th>Servizio</th><th class="num">Costo mensile</th><th class="num">Costo/sessione</th><th class="num">Costo/attività completata</th><th>Unità per unità di valuta</th></tr></thead>
      <tbody>${idx.map(i => `<tr><td><div class="row">${avatar(i.sub.providerId, i.sub.name)}${esc(i.sub.name)}</div></td>
        ${cell(money(i.economic.monthlyCost, i.currency), i.economic.monthlyCost)}
        ${cell(money(i.economic.costPerSession, i.currency), i.economic.costPerSession, i.economic.costPerSession.n ? `<div class="small muted">${i.economic.costPerSession.n} sessioni</div>` : '')}
        ${cell(money(i.economic.costPerTask, i.currency), i.economic.costPerTask)}
        <td class="small" title="${esc(i.economic.unitsPerEuro.formula)}">${Object.entries(i.economic.unitsPerEuro.byUnit).map(([u, v]) => `${fmtNum(v, 1)} ${esc(unitLabel(u).toLowerCase())}`).join('<br>') || '<span class="muted">n.d.</span>'}</td></tr>`).join('')}</tbody></table></div></div>

    <div class="section card"><h2>Efficienza operativa</h2><div class="table-wrap"><table>
      <thead><tr><th>Servizio</th><th class="num">Tempo medio/attività</th><th class="num">Richieste/attività</th><th class="num">Completamento</th><th class="num">Rigenerazioni</th></tr></thead>
      <tbody>${idx.map(i => `<tr><td>${esc(i.sub.name)}</td>
        ${cell(i.operational.avgDuration.value != null ? fmtNum(i.operational.avgDuration.value, 1) + ' min' : null, i.operational.avgDuration)}
        ${cell(i.operational.requestsPerTask.value != null ? fmtNum(i.operational.requestsPerTask.value, 1) : null, i.operational.requestsPerTask)}
        ${cell(pct(i.operational.completionRate), i.operational.completionRate)}
        ${cell(i.operational.regenRate.value != null ? fmtNum(i.operational.regenRate.value, 2) : null, i.operational.regenRate)}</tr>`).join('')}</tbody></table></div>
      <p class="hint">Per questi indici registra durata, esito e rigenerazioni nei "dettagli facoltativi" di un utilizzo.</p></div>

    <div class="section grid two">
      <div class="card"><h2>Indice di utilizzo</h2><div class="table-wrap"><table>
        <thead><tr><th>Servizio</th><th class="num">Usato</th><th class="num">Inutilizzato</th><th class="num">Regolarità</th></tr></thead>
        <tbody>${idx.map(i => `<tr><td>${esc(i.sub.name)}</td>${cell(i.utilization.usedPct.value != null ? Math.round(i.utilization.usedPct.value) + '%' : null, i.utilization.usedPct)}
          ${cell(i.utilization.unusedPct.value != null ? Math.round(i.utilization.unusedPct.value) + '%' : null, i.utilization.unusedPct)}
          ${cell(i.utilization.regularity.value != null ? Math.round(i.utilization.regularity.value * 100) + '/100' : null, i.utilization.regularity)}</tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h2>Distribuzione oraria delle richieste</h2>
        ${hBars(hourBands(idx), { unit: 'registrazioni' })}</div>
    </div>

    <div class="section card"><h2>Indice di rendimento</h2><div class="table-wrap"><table>
      <thead><tr><th>Servizio</th><th class="num">Qualità media</th><th class="num">Qualità/richiesta</th><th class="num">Minuti risparmiati/unità valuta</th><th class="num">Valore potenziale</th></tr></thead>
      <tbody>${idx.map(i => `<tr><td>${esc(i.sub.name)}</td>
        ${cell(i.yield.avgQuality.value != null ? fmtNum(i.yield.avgQuality.value, 1) + '/5' : null, i.yield.avgQuality)}
        ${cell(i.yield.qualityPerRequest.value != null ? fmtNum(i.yield.qualityPerRequest.value, 2) : null, i.yield.qualityPerRequest)}
        ${cell(i.yield.minutesPerEuro.value != null ? fmtNum(i.yield.minutesPerEuro.value, 1) : null, i.yield.minutesPerEuro)}
        ${cell(i.yield.potentialValue.value != null ? fmtMoney(i.yield.potentialValue.value, state.settings.currency) : null, i.yield.potentialValue, i.yield.potentialValue.needsRate ? '<div class="small muted">imposta tariffa oraria</div>' : '')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">Il valore economico è calcolato <b>solo</b> con la tua tariffa oraria (Impostazioni) e i minuti risparmiati che dichiari: l'app non attribuisce valori arbitrari alla produttività.</p></div>`}

    <div class="section card"><h2>Formule</h2><ul class="small text2" style="margin:0;padding-left:18px">${[...new Set(Object.values(FORMULAS))].map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>

    <div class="section card"><h2>Riferimenti esterni (benchmark)</h2>
      <p class="small text2">Studi indipendenti per contestualizzare i tuoi indicatori. <b>Non</b> sono dati tuoi né previsioni sul tuo lavoro: valgono per i compiti e le popolazioni studiate.</p>
      <div class="stack">${BENCHMARKS.map(b => `<div class="card flat"><div class="row between"><b>${esc(b.title)}</b><span class="tag">Benchmark</span></div>
        <div class="small text2">${esc(b.source)} · ${esc(b.date)} · <a href="${esc(b.url)}" target="_blank" rel="noopener">fonte</a></div>
        <p class="small" style="margin-top:6px">${esc(b.finding)}</p>
        <table class="small"><tbody><tr><th>Metodo</th><td>${esc(b.method)}</td></tr><tr><th>Campione</th><td>${esc(b.sample)}</td></tr>
        <tr><th>Attendibilità</th><td>${esc(b.reliability)}</td></tr><tr><th>Limiti</th><td>${esc(b.limits)}</td></tr></tbody></table></div>`).join('')}</div></div>`;
  root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { range = Number(b.dataset.r); renderIndices(root, ctx); });
}

function hourBands(idx) {
  const bands = [['Notte (0–6)', 0, 6], ['Mattina (6–12)', 6, 12], ['Pomeriggio (12–18)', 12, 18], ['Sera (18–24)', 18, 24]];
  return bands.map(([label, a, b], i) => ({
    label, value: idx.reduce((t, x) => t + x.utilization.hours.slice(a, b).reduce((p, q) => p + q, 0), 0), color: SERIES[0],
  }));
}
