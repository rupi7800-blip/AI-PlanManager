import { esc, options, toast, download } from './dom.js';
import { update, getState, replace } from '../store.js';
import { requestBrowserPermission, browserPermission } from '../notify.js';
import { extensionStatus } from '../bridge.js';
import { syncOfficial } from '../integrations.js';
import { mergeCatalog, validateCatalog, DEFAULT_CATALOG } from '../core/catalog.js';
import { parseBackup, stateToJSON } from '../core/export.js';
import { createState } from '../core/state.js';

const WIDGET_FIELDS = [['model', 'Modello'], ['pct', 'Percentuale di consumo'], ['remaining', 'Risorse residue'], ['reset', 'Tempo al ripristino'], ['alerts', 'Avvisi'], ['tips', 'Suggerimenti (vista espansa)'], ['alternatives', 'Modelli alternativi (vista espansa)']];

export function renderSettings(root, ctx) {
  const s = ctx.state.settings;
  const perm = browserPermission();
  const ext = extensionStatus();
  root.innerHTML = `
    <div class="page-head"><div><h1>Impostazioni</h1><p>Notifiche, finestrella, dati ufficiali, database dei piani e backup.</p></div></div>
    <form id="f" class="stack">
      <div class="card"><h2>Notifiche</h2>
        <label class="check"><input type="checkbox" name="inapp" ${s.notifications.inapp ? 'checked' : ''}> Notifiche interne (centro avvisi e messaggi nell'app)</label>
        <label class="check"><input type="checkbox" name="browser" ${s.notifications.browser ? 'checked' : ''}> Notifiche del browser / desktop dell'app installata
          <span class="small muted">· permesso: ${esc({ granted: 'concesso', denied: 'negato', default: 'non richiesto', unsupported: 'non supportato' }[perm])}</span></label>
        <label class="check"><input type="checkbox" name="desktop" ${s.notifications.desktop ? 'checked' : ''}> Notifiche desktop tramite estensione (anche con l'app chiusa)</label>
        <label class="check" style="opacity:.6"><input type="checkbox" name="push" disabled> Notifiche push remote <span class="small muted">· richiedono il server di sincronizzazione (fase 3)</span></label>
        <p class="hint">Ogni servizio può avere notifiche e soglie proprie: <a href="#/servizi">Le mie AI</a> › Modifica.</p></div>

      <div class="card"><h2>Generali</h2><div class="fields">
        <div class="field"><label>Valuta per i valori calcolati</label><select name="currency">${options([['EUR', 'EUR'], ['USD', 'USD'], ['GBP', 'GBP'], ['CHF', 'CHF']], s.currency)}</select></div>
        <div class="field"><label>Tua tariffa oraria (facoltativa)</label><input name="hourlyValue" inputmode="decimal" value="${esc(s.hourlyValue ?? '')}" placeholder="es. 30">
          <div class="hint">Usata solo per il "valore potenziale" negli indici.</div></div>
        <div class="field"><label>Tema</label><select name="theme">${options([['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']], s.theme)}</select></div>
      </div></div>

      <div class="card"><h2>Finestrella flottante (estensione)</h2>
        <p class="small">Stato estensione: <b>${ext.connected ? '✓ collegata' : 'non rilevata'}</b>${ext.connected ? '' : ' — installala dalla cartella <code>extension/</code> (vedi README).'}</p>
        <div class="field"><label>Trasparenza: <span id="opv">${Math.round(s.widget.opacity * 100)}%</span></label><input type="range" name="opacity" min="40" max="100" value="${Math.round(s.widget.opacity * 100)}"></div>
        <label>Informazioni da mostrare</label>
        <div class="fields">${WIDGET_FIELDS.map(([k, l]) => `<label class="check"><input type="checkbox" name="wf" value="${k}" ${s.widget.fields.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <label class="check"><input type="checkbox" name="autoCount" ${s.widget.autoCount ? 'checked' : ''}> Conteggio automatico degli invii (tasto Invio nella casella di testo)</label>
        <p class="hint">Disattivato per default. Non legge il contenuto delle conversazioni; i conteggi sono registrati come <b>stima</b>.</p></div>

      <div class="card"><h2>Dati ufficiali via proxy (facoltativo)</h2>
        <p class="small text2">Per account API (OpenAI, Anthropic, DeepSeek) i consumi ufficiali si leggono tramite il tuo proxy (<code>server/proxy.mjs</code>), che custodisce le chiavi API lato server. Nel browser resta solo il token di accesso al proxy.</p>
        <div class="fields"><div class="field"><label>URL del proxy</label><input name="proxyUrl" value="${esc(s.proxy.url)}" placeholder="http://localhost:8787"></div>
        <div class="field"><label>Token di accesso al proxy</label><input name="proxyToken" type="password" autocomplete="off" value="${esc(s.proxy.token)}"></div></div>
        <button type="button" id="sync">Sincronizza ora</button> <span id="syncres" class="small"></span></div>

      <div class="row"><button class="primary">Salva impostazioni</button></div>
    </form>

    <div class="section card"><h2>Database dei piani</h2>
      <p class="small text2">Versione ${esc(ctx.state.catalog.version)} · aggiornato ${esc(ctx.state.catalog.updatedAt)}. Importa un file JSON di aggiornamento (stesso formato del catalogo) per aggiornare prezzi, modelli e limiti.</p>
      <div class="row"><label class="btn" style="margin:0">Importa aggiornamento JSON<input type="file" id="cat" accept="application/json" hidden></label>
        <button id="catexp">Esporta catalogo</button><button id="catreset">Ripristina catalogo iniziale</button></div></div>

    <div class="section card"><h2>Backup e dati</h2>
      <div class="row"><button id="bk">Esporta backup</button>
        <label class="btn" style="margin:0">Ripristina backup<input type="file" id="restore" accept="application/json" hidden></label>
        <button class="danger" id="wipe">Cancella tutti i dati</button></div>
      <p class="hint">I dati sono salvati solo in questo browser. Nessuna password delle piattaforme AI viene mai richiesta o memorizzata.</p></div>`;

  const f = root.querySelector('#f');
  f.opacity.oninput = () => { root.querySelector('#opv').textContent = f.opacity.value + '%'; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    if (fd.get('browser') === 'on' && browserPermission() !== 'granted') {
      const p = await requestBrowserPermission();
      if (p !== 'granted') toast('Permesso notifiche non concesso dal browser');
    }
    const url = String(fd.get('proxyUrl') || '').trim();
    if (url && !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) { toast('Il proxy deve usare HTTPS (o localhost)'); return; }
    const hv = String(fd.get('hourlyValue') || '').replace(',', '.');
    update(st => {
      st.settings.notifications = { inapp: fd.get('inapp') === 'on', browser: fd.get('browser') === 'on', desktop: fd.get('desktop') === 'on', push: false };
      st.settings.currency = fd.get('currency');
      st.settings.hourlyValue = hv ? Number(hv) : null;
      st.settings.theme = fd.get('theme');
      st.settings.widget = { opacity: Number(fd.get('opacity')) / 100, fields: fd.getAll('wf'), autoCount: fd.get('autoCount') === 'on' };
      st.settings.proxy = { url: url.replace(/\/$/, ''), token: String(fd.get('proxyToken') || '') };
    });
    toast('Impostazioni salvate');
  });
  root.querySelector('#sync').onclick = async () => {
    const out = root.querySelector('#syncres');
    out.textContent = 'Sincronizzazione…';
    try { const r = await syncOfficial(); out.textContent = r; }
    catch (err) { out.textContent = '⚠ ' + err.message; }
  };
  root.querySelector('#cat').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const errs = validateCatalog(data);
      if (errs.length) throw new Error(errs.slice(0, 3).join('; '));
      update(st => { st.catalog = mergeCatalog(st.catalog, data); });
      toast('Catalogo aggiornato');
    } catch (err) { toast('Aggiornamento non valido: ' + err.message); }
  };
  root.querySelector('#catexp').onclick = () => download('ai-plan-manager-catalogo.json', JSON.stringify(getState().catalog, null, 2), 'application/json');
  root.querySelector('#catreset').onclick = () => { if (confirm('Ripristinare il catalogo iniziale? Le modifiche al database dei piani andranno perse (gli abbonamenti restano).')) { update(st => { st.catalog = structuredClone(DEFAULT_CATALOG); }); toast('Catalogo ripristinato'); } };
  root.querySelector('#bk').onclick = () => download(`ai-plan-manager-backup-${new Date().toISOString().slice(0, 10)}.json`, stateToJSON(getState()), 'application/json');
  root.querySelector('#restore').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = parseBackup(await file.text());
      if (!confirm(`Ripristinare il backup del ${data.exportedAt?.slice(0, 10) ?? '?'}? I dati attuali verranno sostituiti.`)) return;
      const cur = getState().settings.proxy;
      delete data.app; delete data.exportedAt;
      data.settings = { ...data.settings, proxy: cur };
      replace(data); toast('Backup ripristinato');
    } catch (err) { toast('Backup non valido: ' + err.message); }
  };
  root.querySelector('#wipe').onclick = () => {
    if (confirm('Cancellare TUTTI i dati (servizi, consumi, impostazioni)? Esporta prima un backup se ti serve.')) { replace(createState()); toast('Dati cancellati'); location.hash = '#/'; }
  };
}
