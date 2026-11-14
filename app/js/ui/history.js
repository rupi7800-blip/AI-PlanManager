import { esc, stackedBars, hBars, SERIES, download, toast } from './dom.js';
import { RANGES, series, insights, eventsInRange, sumsByUnit } from '../core/history.js';
import { eventsToCSV, stateToJSON } from '../core/export.js';
import { findModel } from '../core/catalog.js';
import { TASKS } from '../core/selector.js';
import { fmtMoney, fmtNum, unitLabel } from '../core/units.js';

let range = '30g', group = 'sub';

export function renderHistory(root, ctx) {
  const { state, now, statuses } = ctx;
  const ins = insights(state, statuses, range, now);
  const evs = eventsInRange(state.events, range, now);
  const sums = sumsByUnit(evs);
  root.innerHTML = `
    <div class="page-head"><div><h1>Storico e analisi</h1><p>Come usi le tue AI nel tempo, dove sfrutti bene i piani e dove sprechi.</p></div>
      <div class="row"><button id="csv">Esporta CSV</button><button id="json">Esporta JSON</button></div></div>
    <div class="card"><div class="row between">
      <div class="seg">${Object.entries(RANGES).map(([k, v]) => `<button data-r="${k}" class="${k === range ? 'on' : ''}">${esc(v.label.replace('Ultim', '').replace(/^[ei] /, ''))}</button>`).join('')}</div>
      <div class="seg">${[['sub', 'Per servizio'], ['model', 'Per modello'], ['task', 'Per attività']].map(([k, l]) => `<button data-g="${k}" class="${k === group ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div id="chart" style="margin-top:12px"></div>
      <p class="small muted">${ins.total} registrazioni nel periodo. Totali per unità (mai sommati tra loro): ${Object.entries(sums).map(([u, v]) => `${fmtNum(v)} ${esc(unitLabel(u).toLowerCase())}`).join(' · ') || '—'}</p></div>
    <div class="section grid two">
      <div class="card"><h2>AI più usata</h2>${hBars(ins.bySub.slice(0, 6).map((x, i) => ({ label: x.name, value: x.n, color: SERIES[0] })), { unit: 'registrazioni' })}</div>
      <div class="card"><h2>Modelli più usati</h2>${hBars(ins.byModel.slice(0, 6).map(x => ({ label: x.name, value: x.n, color: SERIES[0] })), { unit: 'registrazioni' })}</div>
      <div class="card"><h2>Attività che consumano di più</h2>${hBars(ins.byTask.slice(0, 6).map(x => ({ label: x.name, value: x.n, text: `${x.n} reg.${x.minutes ? ` · ${fmtNum(x.minutes)} min` : ''}`, color: SERIES[0] })))}</div>
      <div class="card"><h2>Sfruttamento dei piani</h2>
        ${ins.best ? `<p><b>Sfruttato meglio:</b> ${esc(ins.best.s.sub.name)} (${Math.round(ins.best.pct)}% del limite di periodo)</p>` : ''}
        ${ins.worst && ins.worst !== ins.best ? `<p><b>Usato meno:</b> ${esc(ins.worst.s.sub.name)} (${Math.round(ins.worst.pct)}%)</p>` : ''}
        ${ins.waste.length ? `<h3>Possibili sprechi <span class="tag warn">stima</span></h3><ul class="small" style="padding-left:18px;margin:0">${ins.waste.slice(0, 4).map(w => `<li>${esc(w.name)}: ${Math.round(w.unusedPct)}% inutilizzato ≈ ${fmtMoney(w.unusedCost, w.currency)}/mese non sfruttati</li>`).join('')}</ul>
          <p class="hint">Stima lineare: costo × quota inutilizzata. Utile per confronto, non è un costo reale evitabile.</p>` : ''}
        ${ins.silent.length ? `<p class="small"><b>Nessuna registrazione nel periodo:</b> ${ins.silent.map(esc).join(', ')} — verifica se l'abbonamento serve davvero.</p>` : ''}
        ${!ins.best && !ins.waste.length && !ins.silent.length ? '<p class="muted small">Servono limiti mensili/settimanali noti o personali per valutare lo sfruttamento.</p>' : ''}
      </div></div>`;
  const keyFn = group === 'sub' ? e => e.subId : group === 'model' ? e => e.modelId : e => e.task;
  const nameFn = group === 'sub' ? k => state.subscriptions.find(s => s.id === k)?.name ?? k
    : group === 'model' ? k => findModel(state.catalog, k)?.name ?? (k === 'n.d.' ? 'Non specificato' : k) : k => TASKS[k]?.label ?? (k === 'n.d.' ? 'Non specificata' : k);
  const r = series(state.events, range, now, keyFn);
  const keys = Object.keys(r.series).sort((a, b) => sum(r.series[b]) - sum(r.series[a]));
  const top = keys.slice(0, 7), rest = keys.slice(7);
  const ser = top.map((k, i) => ({ name: nameFn(k), color: SERIES[i], values: r.series[k] }));
  if (rest.length) ser.push({ name: 'Altro', color: 'var(--muted)', values: r.buckets.map((_, i) => rest.reduce((t, k) => t + r.series[k][i], 0)) });
  stackedBars(root.querySelector('#chart'), { labels: r.buckets.map(b => b.label), series: ser }, { unit: 'registrazioni', height: 200 });

  root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { range = b.dataset.r; renderHistory(root, ctx); });
  root.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { group = b.dataset.g; renderHistory(root, ctx); });
  const stamp = new Date().toISOString().slice(0, 10);
  root.querySelector('#csv').onclick = () => { download(`ai-plan-manager-consumi-${stamp}.csv`, '﻿' + eventsToCSV(state), 'text/csv'); toast('CSV esportato'); };
  root.querySelector('#json').onclick = () => { download(`ai-plan-manager-backup-${stamp}.json`, stateToJSON(state), 'application/json'); toast('Backup JSON esportato'); };
}
const sum = a => a.reduce((x, y) => x + y, 0);
