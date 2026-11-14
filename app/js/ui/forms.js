// Moduli condivisi: abbonamento, registrazione utilizzo, lettura contatore, limite personale.
import { esc, openModal, options, toast, toLocalInput } from './dom.js';
import { update, getState } from '../store.js';
import { findProvider, findPlan, findModel } from '../core/catalog.js';
import { newSubscription, addEvent, addReading, uid } from '../core/state.js';
import { UNITS, LIMIT_STATUS } from '../core/units.js';
import { WINDOW_TYPES } from '../core/time.js';
import { TASKS } from '../core/selector.js';

const PERIODS = [['month', 'Mensile'], ['year', 'Annuale'], ['usage', 'A consumo']];
const CURR = [['EUR', 'EUR'], ['USD', 'USD'], ['GBP', 'GBP'], ['CHF', 'CHF']];
const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

/* ---------- Abbonamento: procedura guidata semplice ---------- */
export function openAddSubscription() {
  const st = getState();
  const provs = st.catalog.providers;
  const body = `
    <div class="field"><label for="f-prov">Piattaforma</label>
      <select id="f-prov" name="provider">${options([...provs.map(p => [p.id, p.name]), ['custom', 'Altro servizio AI…']], provs[0].id)}</select></div>
    <div class="field" id="f-plan-wrap"><label for="f-plan">Piano sottoscritto</label><select id="f-plan" name="plan"></select>
      <div class="hint" id="f-plan-hint"></div></div>
    <div class="field" id="f-custom" hidden><label for="f-cname">Nome del servizio</label><input id="f-cname" name="customName" placeholder="Es. Poe, You.com…">
      <label for="f-cdom" style="margin-top:8px">Dominio del sito (per la finestrella)</label><input id="f-cdom" name="customDomain" placeholder="es. poe.com"></div>
    <div class="fields">
      <div class="field"><label for="f-amt">Costo</label><input id="f-amt" name="amount" inputmode="decimal"></div>
      <div class="field"><label for="f-cur">Valuta</label><select id="f-cur" name="currency">${options(CURR, 'EUR')}</select></div>
      <div class="field"><label for="f-per">Periodicità</label><select id="f-per" name="period">${options(PERIODS, 'month')}</select></div>
      <div class="field"><label for="f-ren">Prossimo rinnovo</label><input id="f-ren" type="date" name="renewal"></div>
    </div>
    <p class="hint">I prezzi del database sono indicativi e <b>non verificati</b>: controlla l'importo che paghi davvero.</p>`;
  const dlg = openModal({
    title: 'Aggiungi un servizio AI', body, submitLabel: 'Aggiungi',
    onSubmit: (fd) => {
      const providerId = fd.get('provider');
      let sub;
      if (providerId === 'custom') {
        const name = String(fd.get('customName') || '').trim();
        if (!name) throw new Error('Inserisci il nome del servizio');
        sub = newSubscription(getState().catalog, 'custom', null, { name, domains: String(fd.get('customDomain') || '').split(',').map(s => s.trim()).filter(Boolean) });
        sub.limits = [];
      } else sub = newSubscription(getState().catalog, providerId, fd.get('plan'));
      sub.cost = { amount: num(fd.get('amount')) ?? 0, currency: fd.get('currency'), period: fd.get('period') };
      sub.renewalDate = fd.get('renewal') || null;
      update(s => s.subscriptions.push(sub));
      toast(`${sub.name} aggiunto. Ora puoi registrare consumi o impostare limiti personali.`);
    },
  });
  const $p = dlg.querySelector('#f-prov'), $pl = dlg.querySelector('#f-plan');
  const fillPlans = () => {
    const custom = $p.value === 'custom';
    dlg.querySelector('#f-custom').hidden = !custom;
    dlg.querySelector('#f-plan-wrap').hidden = custom;
    if (custom) return;
    const prov = findProvider(st.catalog, $p.value);
    $pl.innerHTML = options(prov.plans.map(p => [p.id, `${p.name} — ${p.price.period === 'usage' ? 'a consumo' : `${p.price.amount} ${p.price.currency}/${p.price.period === 'year' ? 'anno' : 'mese'}`}`]), prov.plans[0]?.id);
    fillPrice();
  };
  const fillPrice = () => {
    const plan = findPlan(st.catalog, $p.value, $pl.value);
    if (!plan) return;
    dlg.querySelector('#f-amt').value = plan.price.amount;
    dlg.querySelector('#f-cur').value = plan.price.currency;
    dlg.querySelector('#f-per').value = plan.price.period;
    dlg.querySelector('#f-plan-hint').innerHTML = `${plan.verified ? '✓ verificato' : '⚠ dati non verificati'} · <a href="${esc(plan.source.url)}" target="_blank" rel="noopener">fonte ufficiale</a>`;
  };
  $p.addEventListener('change', fillPlans);
  $pl.addEventListener('change', fillPrice);
  fillPlans();
}

/* ---------- Modifica abbonamento ---------- */
export function openEditSubscription(subId) {
  const st = getState();
  const sub = st.subscriptions.find(s => s.id === subId);
  const allModels = st.catalog.models.filter(m => m.providerId === sub.providerId);
  const body = `
    <div class="fields">
      <div class="field"><label>Nome</label><input name="name" value="${esc(sub.name)}" required></div>
      <div class="field"><label>Costo</label><input name="amount" inputmode="decimal" value="${esc(sub.cost?.amount ?? 0)}"></div>
      <div class="field"><label>Valuta</label><select name="currency">${options(CURR, sub.cost?.currency)}</select></div>
      <div class="field"><label>Periodicità</label><select name="period">${options(PERIODS, sub.cost?.period)}</select></div>
      <div class="field"><label>Rinnovo</label><input type="date" name="renewal" value="${esc(sub.renewalDate ?? '')}"></div>
      <div class="field"><label>Unità del pulsante "+1"</label><select name="quickUnit">${options(Object.entries(UNITS).filter(([k]) => k !== 'percent').map(([k, v]) => [k, v.label]), sub.quickUnit)}</select></div>
    </div>
    <h3>Modelli disponibili</h3>
    <div class="fields">${allModels.map(m => `<label class="check"><input type="checkbox" name="models" value="${esc(m.id)}" ${sub.models.includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('') || '<p class="muted small">Nessun modello in catalogo per questo servizio.</p>'}</div>
    <h3>Colori di stato (% del limite)</h3>
    <div class="fields">
      <div class="field"><label>Giallo da</label><input name="yellow" type="number" min="1" max="200" value="${sub.levels.yellow}"></div>
      <div class="field"><label>Arancione da</label><input name="orange" type="number" min="1" max="200" value="${sub.levels.orange}"></div>
      <div class="field"><label>Rosso da</label><input name="red" type="number" min="1" max="300" value="${sub.levels.red}"></div>
    </div>
    <h3>Soglie di avviso</h3>
    <div class="field"><input name="thresholds" value="${esc(sub.thresholds.join(', '))}"><div class="hint">Percentuali separate da virgola, es. 50, 70, 85, 95, 100</div></div>
    <h3>Notifiche per questo servizio</h3>
    <div class="fields">
      ${[['inapp', 'Interne'], ['browser', 'Browser'], ['desktop', 'Desktop (estensione)'], ['push', 'Push']].map(([k, l]) => `<label class="check"><input type="checkbox" name="n_${k}" ${sub.notify?.[k] !== false ? 'checked' : ''}> ${l}</label>`).join('')}
      <label class="check"><input type="checkbox" name="notifyRenewal" ${sub.notifyRenewal !== false ? 'checked' : ''}> Avviso di rinnovo (3 giorni prima)</label>
    </div>
    <label class="check"><input type="checkbox" name="active" ${sub.active !== false ? 'checked' : ''}> Servizio attivo</label>`;
  openModal({
    title: `Modifica ${sub.name}`, body, wide: true,
    onSubmit: (fd) => {
      const thr = String(fd.get('thresholds')).split(/[,;\s]+/).map(Number).filter(n => n > 0 && n <= 300);
      const lv = { yellow: Number(fd.get('yellow')), orange: Number(fd.get('orange')), red: Number(fd.get('red')) };
      if (!(lv.yellow < lv.orange && lv.orange <= lv.red)) throw new Error('Le soglie colore devono essere crescenti (giallo < arancione ≤ rosso)');
      update(s => {
        const x = s.subscriptions.find(y => y.id === subId);
        x.name = String(fd.get('name')).trim() || x.name;
        x.cost = { amount: num(fd.get('amount')) ?? 0, currency: fd.get('currency'), period: fd.get('period') };
        x.renewalDate = fd.get('renewal') || null;
        x.quickUnit = fd.get('quickUnit');
        x.models = fd.getAll('models');
        x.levels = lv;
        x.thresholds = [...new Set(thr)].sort((a, b) => a - b);
        x.notify = Object.fromEntries(['inapp', 'browser', 'desktop', 'push'].map(k => [k, fd.get(`n_${k}`) === 'on']));
        x.notifyRenewal = fd.get('notifyRenewal') === 'on';
        x.active = fd.get('active') === 'on';
      });
      toast('Modifiche salvate');
    },
  });
}

/* ---------- Limite (nuovo personale o modifica) ---------- */
export function openLimitForm(subId, limitId = null) {
  const st = getState();
  const sub = st.subscriptions.find(s => s.id === subId);
  const lim = limitId ? sub.limits.find(l => l.id === limitId) : null;
  const isProvider = lim && lim.status !== 'personale';
  const body = `
    ${isProvider ? `<p class="small text2">Limite del fornitore — stato: <b>${esc(LIMIT_STATUS[lim.status] ?? lim.status)}</b>${lim.verified ? '' : ' · <span class="tag warn">non verificato</span>'}</p>
      ${lim.note ? `<p class="small muted">${esc(lim.note)}</p>` : ''}` : ''}
    <div class="fields">
      <div class="field"><label>Nome</label><input name="label" value="${esc(lim?.label ?? '')}" placeholder="Es. Limite giornaliero personale" required></div>
      <div class="field"><label>Unità</label><select name="unit" ${isProvider ? 'disabled' : ''}>${options(Object.entries(UNITS).map(([k, v]) => [k, v.label]), lim?.unit ?? sub.quickUnit)}</select></div>
      <div class="field"><label>Finestra di ripristino</label><select name="wtype" ${isProvider ? 'disabled' : ''}>${options(Object.entries(WINDOW_TYPES), lim?.window?.type ?? 'daily')}</select></div>
      <div class="field"><label>Ore (per finestre a sessione/scorrevoli)</label><input name="hours" type="number" min="1" max="720" value="${esc(lim?.window?.hours ?? 5)}" ${isProvider ? 'disabled' : ''}></div>
    </div>
    ${isProvider ? `
      <div class="fields">
        <div class="field"><label>Valore ufficiale del fornitore</label><input name="value" inputmode="decimal" value="${esc(lim.value ?? '')}" placeholder="Lascia vuoto se non pubblicato">
          <div class="hint">Inseriscilo solo se l'hai verificato sulla fonte ufficiale.</div></div>
        <div class="field"><label>Tuo limite personale</label><input name="personal" inputmode="decimal" value="${esc(lim.personalValue ?? '')}">
          <div class="hint">Usato per la percentuale quando il valore ufficiale non è noto.</div></div>
      </div>
      <label class="check"><input type="checkbox" name="verified" ${lim.verified ? 'checked' : ''}> Ho verificato il valore sulla fonte ufficiale</label>`
    : `<div class="field"><label>Valore massimo</label><input name="value" inputmode="decimal" value="${esc(lim?.value ?? '')}" required>
        <div class="hint">Esempi: budget mensile (unità Spesa), tempo massimo (Minuti), richieste/sessioni massime al giorno.</div></div>`}
    <div class="field"><label>Si applica ai modelli</label>
      <div class="fields">${(sub.models ?? []).map(id => `<label class="check"><input type="checkbox" name="models" value="${esc(id)}" ${lim?.models?.includes(id) ? 'checked' : ''}> ${esc(findModel(st.catalog, id)?.name ?? id)}</label>`).join('')}</div>
      <div class="hint">Nessuna selezione = tutti i modelli.</div></div>`;
  openModal({
    title: lim ? `Limite: ${lim.label}` : 'Nuovo limite personale', body, wide: true,
    onSubmit: (fd) => {
      const models = fd.getAll('models');
      update(s => {
        const x = s.subscriptions.find(y => y.id === subId);
        if (isProvider) {
          const l = x.limits.find(y => y.id === limitId);
          l.label = String(fd.get('label')).trim() || l.label;
          l.value = num(fd.get('value'));
          l.personalValue = num(fd.get('personal'));
          l.verified = fd.get('verified') === 'on';
          l.models = models.length ? models : l.models;
          if (l.value != null && l.status === 'non_pubblicato') l.status = 'pubblicato';
        } else {
          const v = num(fd.get('value'));
          if (!(v > 0)) throw new Error('Inserisci un valore maggiore di zero');
          const data = {
            id: lim?.id ?? uid('lim'), label: String(fd.get('label')).trim() || 'Limite personale', unit: fd.get('unit'),
            value: v, window: { type: fd.get('wtype'), hours: Number(fd.get('hours')) || undefined },
            models: models.length ? models : null, status: 'personale', verified: true, note: '',
          };
          const i = x.limits.findIndex(y => y.id === data.id);
          if (i >= 0) x.limits[i] = data; else x.limits.push(data);
        }
      });
      toast('Limite salvato');
    },
  });
}

/* ---------- Registrazione di un utilizzo ---------- */
export function openLogUsage(subId = null) {
  const st = getState();
  const subs = st.subscriptions.filter(s => s.active !== false);
  if (!subs.length) { toast('Aggiungi prima un servizio in "Le mie AI"'); return; }
  const cur = subs.find(s => s.id === subId) ?? subs[0];
  const modelOpts = (sub) => options([['', '— non specificato —'], ...sub.models.map(id => [id, findModel(st.catalog, id)?.name ?? id])], '');
  const body = `
    <div class="fields">
      <div class="field"><label for="u-sub">Servizio</label><select id="u-sub" name="subId">${options(subs.map(s => [s.id, s.name]), cur.id)}</select></div>
      <div class="field"><label for="u-model">Modello</label><select id="u-model" name="modelId">${modelOpts(cur)}</select></div>
      <div class="field"><label>Quantità</label><input name="amount" inputmode="decimal" value="1" required></div>
      <div class="field"><label>Unità</label><select name="unit" id="u-unit">${options(Object.entries(UNITS).filter(([k]) => k !== 'percent').map(([k, v]) => [k, v.label]), cur.quickUnit)}</select></div>
      <div class="field"><label>Data e ora</label><input type="datetime-local" name="ts" value="${toLocalInput(Date.now())}"></div>
      <div class="field"><label>Attività</label><select name="task">${options([['', '—'], ...Object.entries(TASKS).map(([k, v]) => [k, v.label])], '')}</select></div>
    </div>
    <details><summary>Dettagli facoltativi per gli indici di efficienza</summary>
      <div class="fields" style="margin-top:10px">
        <div class="field"><label>Durata (min)</label><input name="durationMin" inputmode="decimal"></div>
        <div class="field"><label>Esito</label><select name="outcome">${options([['', '—'], ['completata', 'Completata'], ['abbandonata', 'Abbandonata']], '')}</select></div>
        <div class="field"><label>Rigenerazioni/correzioni</label><input name="regenerations" type="number" min="0"></div>
        <div class="field"><label>Qualità (1–5)</label><input name="quality" type="number" min="1" max="5"></div>
        <div class="field"><label>Minuti risparmiati (tua stima)</label><input name="minutesSaved" inputmode="decimal"></div>
      </div>
      <div class="field"><label>Nota</label><input name="note" maxlength="200"></div>
    </details>
    <p class="hint">Fonte: <b>manuale</b>. I dati inseriti manualmente sono mostrati sempre come tali.</p>`;
  const dlg = openModal({
    title: 'Registra un utilizzo', body, submitLabel: 'Registra',
    onSubmit: (fd) => {
      const ev = {
        subId: fd.get('subId'), modelId: fd.get('modelId') || undefined, amount: num(fd.get('amount')), unit: fd.get('unit'),
        ts: fd.get('ts') ? new Date(fd.get('ts')).getTime() : Date.now(), task: fd.get('task') || undefined, source: 'manuale',
        durationMin: num(fd.get('durationMin')) ?? undefined, outcome: fd.get('outcome') || undefined,
        regenerations: num(fd.get('regenerations')) ?? undefined, quality: num(fd.get('quality')) ?? undefined,
        minutesSaved: num(fd.get('minutesSaved')) ?? undefined, note: String(fd.get('note') || '').trim() || undefined,
      };
      if (ev.ts > Date.now() + 60e3) throw new Error('La data non può essere nel futuro');
      if (ev.quality != null && (ev.quality < 1 || ev.quality > 5)) throw new Error('Qualità tra 1 e 5');
      update(s => addEvent(s, ev));
      toast('Utilizzo registrato');
    },
  });
  dlg.querySelector('#u-sub').addEventListener('change', (e) => {
    const s = subs.find(x => x.id === e.target.value);
    dlg.querySelector('#u-model').innerHTML = modelOpts(s);
    dlg.querySelector('#u-unit').value = s.quickUnit;
  });
}

/** Registrazione rapida (+1) senza modale. */
export function quickLog(subId) {
  const sub = getState().subscriptions.find(s => s.id === subId);
  update(s => addEvent(s, { subId, unit: sub.quickUnit ?? 'messages', amount: 1, source: 'manuale' }));
  toast(`+1 ${UNITS[sub.quickUnit]?.label.toLowerCase() ?? ''} su ${sub.name}`, 1800);
}

/* ---------- Lettura del contatore del fornitore ---------- */
export function openReading(subId, limitId = null) {
  const st = getState();
  const sub = st.subscriptions.find(s => s.id === subId);
  if (!sub.limits.length) { toast('Questo servizio non ha limiti: aggiungine uno'); return; }
  const lim = sub.limits.find(l => l.id === limitId) ?? sub.limits[0];
  const prov = findProvider(st.catalog, sub.providerId);
  const body = `
    <p class="small text2">Copia qui il valore che la piattaforma mostra nella sua pagina di utilizzo${prov ? ` (<a href="${esc(prov.url)}" target="_blank" rel="noopener">${esc(prov.name)}</a>)` : ''}. Verrà marcato come <b>integrazione</b> con data e ora.</p>
    <div class="fields">
      <div class="field"><label>Limite</label><select name="limitId" id="r-lim">${options(sub.limits.map(l => [l.id, l.label]), lim.id)}</select></div>
      <div class="field" data-k="pct"><label>Percentuale usata (%)</label><input name="usedPct" inputmode="decimal"></div>
      <div class="field" data-k="used"><label>Quantità usata</label><input name="used" inputmode="decimal"></div>
      <div class="field" data-k="rem"><label>Oppure residuo</label><input name="remaining" inputmode="decimal"></div>
      <div class="field"><label>Ripristino indicato dalla piattaforma</label><input type="datetime-local" name="resetAt"></div>
      <div class="field"><label>Rilevato il</label><input type="datetime-local" name="ts" value="${toLocalInput(Date.now())}"></div>
    </div>`;
  const dlg = openModal({
    title: `Lettura contatore · ${sub.name}`, body, submitLabel: 'Salva lettura',
    onSubmit: (fd) => {
      const l = sub.limits.find(x => x.id === fd.get('limitId'));
      const r = { subId, limitId: l.id, ts: fd.get('ts') ? new Date(fd.get('ts')).getTime() : Date.now(), source: 'integrazione' };
      if (fd.get('resetAt')) r.resetAt = new Date(fd.get('resetAt')).getTime();
      if (l.unit === 'percent') { r.usedPct = num(fd.get('usedPct')); if (r.usedPct == null) throw new Error('Inserisci la percentuale'); }
      else {
        r.used = num(fd.get('used')); r.remaining = num(fd.get('remaining'));
        if (r.used == null && r.remaining == null) throw new Error('Inserisci la quantità usata o il residuo');
        if (r.used == null) delete r.used; if (r.remaining == null) delete r.remaining;
      }
      update(s => addReading(s, r));
      toast('Lettura salvata');
    },
  });
  const sync = () => {
    const l = sub.limits.find(x => x.id === dlg.querySelector('#r-lim').value);
    const pct = l.unit === 'percent';
    dlg.querySelector('[data-k=pct]').hidden = !pct;
    dlg.querySelector('[data-k=used]').hidden = pct;
    dlg.querySelector('[data-k=rem]').hidden = pct;
  };
  dlg.querySelector('#r-lim').addEventListener('change', sync); sync();
}
