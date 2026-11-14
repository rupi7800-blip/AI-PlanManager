import { esc, status, avatar } from './dom.js';
import { advise } from '../core/advisor.js';

export function renderAdvisor(root, ctx) {
  const { state, now, statuses } = ctx;
  const tips = advise(state, statuses, now);
  root.innerHTML = `
    <div class="page-head"><div><h1>Consulente intelligente</h1><p>Consigli concreti basati sui tuoi consumi reali: ritmo, residui, tempo al ripristino e al rinnovo.</p></div></div>
    ${!statuses.length ? '<div class="card empty">Aggiungi un servizio per ricevere consigli.</div>' : !tips.length
      ? '<div class="card empty"><div class="big">✓</div><p>Nessuna criticità: i consumi registrati sono in linea con i limiti.</p><p class="small muted">Più dati registri, più i consigli diventano precisi.</p></div>'
      : `<div class="stack">${tips.map(t => {
        const sub = state.subscriptions.find(s => s.id === t.subId);
        return `<div class="card tip"><div class="row between"><div class="row">${sub ? avatar(sub.providerId, sub.name) : ''}<h3 style="margin:0">${esc(t.title)}</h3></div>
          <div class="row">${t.indicative ? '<span class="tag warn">stima indicativa</span>' : ''}${status(t.level, kindLabel(t.kind))}</div></div>
          <p style="margin-top:8px">${esc(t.text)}</p>
          ${t.actions.length ? `<ul>${t.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>`;
      }).join('')}</div>`}
    <div class="section card small text2"><h3>Come ragiona il consulente</h3>
      <ul style="margin:0;padding-left:18px">
        <li>Confronta il ritmo di consumo nella finestra corrente con il tempo che manca al ripristino.</li>
        <li>Calcola il ritmo massimo sostenibile = residuo ÷ tempo al ripristino.</li>
        <li>Suggerisce alternative solo tra i servizi che hai e che non sono vicini al limite.</li>
        <li>Se un limite non è pubblicato o non hai dati, ti chiede di raccoglierli invece di indovinare.</li>
        <li>Non consiglia mai un modello solo perché costa meno: vedi <a href="#/confronto">Confronto modelli</a>.</li>
      </ul></div>`;
}

function kindLabel(k) {
  return { ritmo: 'Ritmo', limite: 'Limite', sottoutilizzo: 'Sottoutilizzo', modello: 'Modello', rigenerazioni: 'Sprechi', costo: 'Costo', dati: 'Dati mancanti' }[k];
}
