import { esc, options, avatar } from './dom.js';
import { recommend, TASKS, COMPLEXITY, DIMENSIONS } from '../core/selector.js';
import { findProvider } from '../core/catalog.js';

let last = { task: 'quotidiane', complexity: 1, priority: 'equilibrio', includeCatalog: false };

export function renderCompare(root, ctx) {
  const { state, statuses } = ctx;
  root.innerHTML = `
    <div class="page-head"><div><h1>Confronto modelli</h1><p>Quale AI e quale modello usare per questo lavoro, bilanciando qualità e consumo.</p></div></div>
    <div class="card"><form id="sel" class="fields">
      <div class="field"><label>Attività</label><select name="task">${options(Object.entries(TASKS).map(([k, v]) => [k, v.label]), last.task)}</select></div>
      <div class="field"><label>Complessità</label><select name="complexity">${options(COMPLEXITY.map((c, i) => [i, c[0].toUpperCase() + c.slice(1)]), last.complexity)}</select></div>
      <div class="field"><label>Priorità</label><select name="priority">${options([['equilibrio', 'Equilibrio qualità/consumo'], ['qualita', 'Massima qualità'], ['risparmio', 'Risparmio di risorse']], last.priority)}</select></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="includeCatalog" ${last.includeCatalog ? 'checked' : ''}> Includi AI che non ho</label></div>
    </form></div>
    <div id="out" class="section"></div>`;
  const form = root.querySelector('#sel');
  const run = () => {
    const fd = new FormData(form);
    last = { task: fd.get('task'), complexity: Number(fd.get('complexity')), priority: fd.get('priority'), includeCatalog: fd.get('includeCatalog') === 'on' };
    root.querySelector('#out').innerHTML = result(recommend(state, statuses, last), state);
  };
  form.addEventListener('change', run);
  run();
}

function result(r, state) {
  if (!r.best) return `<div class="card empty">${esc(r.message)}</div>`;
  const b = r.best;
  const reqTxt = Object.entries(r.req).map(([k, v]) => `${DIMENSIONS[k]} ≥ ${v}`).join(' · ');
  return `
    <div class="card rec-best">
      <div class="small text2">Consigliato per: <b>${esc(r.task)}</b> (${esc(r.complexity)}) — requisiti: ${esc(reqTxt)}</div>
      <div class="row" style="margin:10px 0">${avatar(b.model.providerId, r.provider?.name ?? '')}
        <div><div class="best-name" style="font-size:1.25rem;font-weight:650">${esc(b.model.name)}</div>
        <div class="small text2">${esc(b.subStatus?.sub.name ?? r.provider?.name ?? '')}${b.owned ? '' : ' · non sottoscritto'}</div></div></div>
      <h3>Perché</h3><ul class="small" style="margin:0 0 8px;padding-left:18px">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${r.saving ? `<p class="small"><b>Risparmio potenziale:</b> circa ${r.saving.pct}% di quota rispetto a ${esc(r.saving.vs)}. <span class="muted">${esc(r.saving.note)}</span></p>` : ''}
      ${r.tradeoffs.length ? `<h3>Compromessi</h3><ul class="small" style="margin:0;padding-left:18px">${r.tradeoffs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="section card"><h2>Classifica</h2><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Modello</th><th>Servizio</th><th class="num">Adeguatezza</th><th class="num">Efficienza</th><th>Disponibilità</th><th class="num">Punteggio</th></tr></thead>
      <tbody>${r.ranking.map((x, i) => `<tr><td>${i + 1}</td><td><b>${esc(x.model.name)}</b>${x.sufficient ? '' : `<div class="small st-orange">carenze: ${esc(x.gaps.join(', '))}</div>`}</td>
        <td class="small">${esc(x.subStatus?.sub.name ?? findProvider(state.catalog, x.model.providerId)?.name ?? '')}${x.owned ? '' : ' <span class="tag">non sottoscritto</span>'}</td>
        <td class="num">${Math.round(x.quality)}</td><td class="num">${Math.round(x.efficiency)}</td><td class="small">${esc(x.availability.text)}</td><td class="num score">${Math.round(x.score)}</td></tr>`).join('')}</tbody>
    </table></div>
    <details style="margin-top:10px"><summary>Come viene calcolato</summary><div class="small text2" style="margin-top:8px">
      <p><b>Adeguatezza</b> = 100 − 22 × (somma delle carenze rispetto ai requisiti) − 10 × (carenza massima). Un modello con carenze non viene mai preferito a uno adeguato e disponibile.</p>
      <p><b>Efficienza</b> = 100 − 11 × (consumo relativo − 1): premia il modello meno oneroso <i>tra quelli adeguati</i>, così non si usa un modello sovradimensionato.</p>
      <p><b>Disponibilità</b> = quota residua del piano (limite raggiunto = fortemente penalizzato; limite non noto = 85%).</p>
      <p><b>Punteggio</b> = media pesata (equilibrio 55/25/20, qualità 70/10/20, risparmio 45/40/15), −8 se a consumo, −10 se non sottoscritto.</p>
      <p>I profili delle capacità dei modelli sono <b>stime editoriali</b> (scala 0–5), non benchmark ufficiali: aggiornali dal database dei piani quando escono nuove versioni.</p>
    </div></details></div>`;
}
