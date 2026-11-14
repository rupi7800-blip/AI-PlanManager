// Finestrella flottante di AI Plan Manager.
// - Isolata in Shadow DOM: non altera lo stile né il funzionamento della pagina ospite.
// - Non legge il contenuto della pagina. Mostra lo snapshot calcolato dall'app.
// - Registra utilizzi manuali (+1) e, solo se attivato dall'utente, conta gli invii (fonte "stima").
(() => {
  if (window.top !== window || document.getElementById('aipm-widget-host')) return;
  const HOST = location.hostname;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LV = { green: ['#0ca30c', 'Regolare', '✓'], yellow: ['#fab219', 'Attenzione', '!'], orange: ['#ec835a', 'Limite vicino', '!!'], red: ['#d03b3b', 'Limite raggiunto', '✕'], unknown: ['#8a8984', 'Dato non disponibile', '?'] };
  const SRC = { ufficiale: '● Ufficiale', integrazione: '◐ Integrazione', manuale: '○ Manuale', stima: '◌ Stima' };
  const dur = (ms) => {
    if (ms == null) return '—'; if (ms <= 0) return 'ora';
    const m = Math.round(ms / 6e4); if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60); if (h < 48) return `${h} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
    return `${Math.floor(h / 24)} g ${h % 24} h`;
  };
  const matchDomain = (domains) => (domains ?? []).some(d => HOST === d || HOST.endsWith('.' + d));

  let snap = null, ui = { expanded: false, x: null, y: null, w: 340, h: null, hidden: false, subId: null, modelId: '' }, pending = [];
  const host = document.createElement('div');
  host.id = 'aipm-widget-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;right:16px;bottom:88px;';
  const root = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .w { color: #161614; background: #fff; border: 1px solid #e3e2dd; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.18); font-size: 12.5px; line-height: 1.4; }
    @media (prefers-color-scheme: dark) { .w { color: #f0efec; background: #1a1a19; border-color: #2f2f2c; } .muted { color: #8f8e86 !important; } .bar { background: #2f2f2c !important; } button { background: #232321 !important; color: #f0efec !important; border-color: #2f2f2c !important; } select { background:#232321; color:#f0efec; border-color:#2f2f2c; } }
    .pill { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; user-select: none; }
    .dot { width: 14px; height: 14px; border-radius: 50%; display: inline-grid; place-items: center; color: #fff; font-size: 8px; font-weight: 800; flex: none; }
    .muted { color: #8a8984; }
    .panel { width: 100%; height: 100%; display: flex; flex-direction: column; overflow: hidden; resize: both; min-width: 260px; min-height: 180px; max-width: 90vw; max-height: 85vh; }
    .head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid rgba(128,128,128,.25); cursor: move; user-select: none; }
    .head b { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .body { padding: 8px 10px 10px; overflow: auto; flex: 1; }
    .lim { margin: 6px 0 10px; }
    .row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
    .bar { height: 6px; background: #f1f1ee; border-radius: 9px; overflow: hidden; margin: 4px 0 3px; }
    .bar span { display: block; height: 100%; border-radius: 9px; }
    .bar.unk { background: repeating-linear-gradient(135deg,#e3e2dd 0 5px,transparent 5px 10px); }
    .tag { font-size: 10.5px; padding: 0 5px; border: 1px solid rgba(128,128,128,.4); border-radius: 5px; }
    h4 { margin: 10px 0 4px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: #8a8984; }
    ul { margin: 2px 0; padding-left: 16px; } li { margin: 2px 0; }
    button { font: inherit; border: 1px solid #e3e2dd; background: #fff; color: #161614; border-radius: 7px; padding: 3px 8px; cursor: pointer; }
    button.ic { border: 0; background: transparent !important; padding: 2px 5px; font-size: 13px; }
    button.pri { background: #2a78d6 !important; border-color: #2a78d6 !important; color: #fff !important; font-weight: 600; }
    select { font: inherit; border-radius: 7px; border: 1px solid #e3e2dd; padding: 2px 4px; max-width: 100%; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .alert { border-left: 3px solid; padding: 3px 7px; margin: 4px 0; border-radius: 4px; background: rgba(128,128,128,.08); }
    svg { display: block; }
    .set label { display: flex; gap: 6px; align-items: center; margin: 3px 0; }
  `;

  async function loadAll() {
    const d = await chrome.storage.local.get(['snapshot', 'ui:' + HOST, 'pending', 'hiddenSites']);
    snap = d.snapshot ?? null;
    ui = { ...ui, ...(d['ui:' + HOST] ?? {}) };
    pending = d.pending ?? [];
    ui.hidden = (d.hiddenSites ?? []).includes(HOST);
    render();
  }
  const saveUi = () => chrome.storage.local.set({ ['ui:' + HOST]: { expanded: ui.expanded, x: ui.x, y: ui.y, w: ui.w, h: ui.h, subId: ui.subId, modelId: ui.modelId, fields: ui.fields, opacity: ui.opacity } });

  function services() { return (snap?.services ?? []).filter(s => matchDomain(s.domains)); }
  function current() {
    const list = services();
    return list.find(s => s.subId === ui.subId) ?? list.find(s => !s.planUsage) ?? list[0] ?? null;
  }
  const fields = () => ui.fields ?? snap?.widget?.fields ?? ['model', 'pct', 'remaining', 'reset', 'alerts'];
  const has = (f) => fields().includes(f);

  function mainLimit(s) {
    const known = s.limits.filter(l => l.pct != null);
    return known.length ? known.reduce((a, b) => (b.pct > a.pct ? b : a)) : s.limits[0] ?? null;
  }

  function spark(values) {
    const W = 300, H = 40, max = Math.max(1, ...values), bw = W / values.length;
    return `<svg viewBox="0 0 ${W} ${H + 12}" width="100%" role="img" aria-label="Registrazioni ultimi 7 giorni">${values.map((v, i) => {
      const h = (v / max) * H;
      return `<rect x="${i * bw + 3}" y="${H - h}" width="${bw - 6}" height="${Math.max(h, 1)}" rx="3" fill="#2a78d6"><title>${v} registrazioni</title></rect>`;
    }).join('')}<text x="2" y="${H + 11}" font-size="9" fill="#8a8984">7 giorni fa</text><text x="${W - 2}" y="${H + 11}" font-size="9" fill="#8a8984" text-anchor="end">oggi</text></svg>`;
  }

  function render() {
    const s = current();
    host.style.display = ui.hidden ? 'none' : '';
    host.style.opacity = String(ui.opacity ?? snap?.widget?.opacity ?? 0.95);
    if (ui.x != null && ui.y != null) {
      host.style.left = Math.min(Math.max(0, ui.x), innerWidth - 80) + 'px';
      host.style.top = Math.min(Math.max(0, ui.y), innerHeight - 40) + 'px';
      host.style.right = 'auto'; host.style.bottom = 'auto';
    }
    const pend = pending.filter(p => p.subId === s?.subId).length;
    let html = `<style>${CSS}</style>`;
    if (!snap || !s) {
      html += `<div class="w pill" data-act="toggle" title="AI Plan Manager"><span class="dot" style="background:#8a8984">?</span>
        <span>${!snap ? 'Apri AI Plan Manager per collegare i dati' : 'Servizio non configurato in AI Plan Manager'}</span><button class="ic" data-act="hide" title="Nascondi su questo sito">✕</button></div>`;
      root.innerHTML = html; bind(); return;
    }
    const L = mainLimit(s);
    const lv = LV[s.level] ?? LV.unknown;
    const pctTxt = L?.pct != null ? `${Math.round(L.pct)}%` : 'n.d.';
    const resetTxt = L?.resetAt ? dur(L.resetAt - Date.now()) : null;
    const stale = Date.now() - snap.at > 6 * 3600e3;
    const modelName = s.models.find(m => m.id === ui.modelId)?.name;

    if (!ui.expanded) {
      html += `<div class="w pill" data-act="toggle" title="${esc(lv[1])} — clic per espandere" role="button" aria-expanded="false">
        <span class="dot" style="background:${lv[0]}">${lv[2]}</span><b>${esc(s.name)}</b>
        ${has('model') && modelName ? `<span class="muted">${esc(modelName)}</span>` : ''}
        ${has('pct') ? `<span>${esc(pctTxt)}</span>` : ''}
        ${has('remaining') && L?.remaining != null && L.limitValue != null ? `<span class="muted">res. ${esc(Math.round(L.remaining))}${L.unit === 'percent' ? '%' : ''}</span>` : ''}
        ${has('reset') && resetTxt ? `<span class="muted">↻ ${esc(resetTxt)}</span>` : ''}
        ${has('alerts') && s.alerts.length ? `<span title="${esc(s.alerts.map(a => a.title).join('\n'))}">🔔${s.alerts.length}</span>` : ''}
        <button class="ic" data-act="plus" title="Registra +1">+1</button></div>`;
    } else {
      html += `<div class="w panel" style="width:${ui.w}px;${ui.h ? `height:${ui.h}px` : ''}">
        <div class="head" data-drag><span class="dot" style="background:${lv[0]}">${lv[2]}</span><b>${esc(s.name)}</b>
          <button class="ic" data-act="settings" title="Personalizza">⚙</button><button class="ic" data-act="toggle" title="Minimizza">▁</button><button class="ic" data-act="hide" title="Nascondi su questo sito">✕</button></div>
        <div class="body">
          ${services().length > 1 ? `<select data-act="sub">${services().map(x => `<option value="${esc(x.subId)}" ${x.subId === s.subId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
          ${stale ? '<div class="alert" style="border-color:#fab219">Dati aggiornati ' + esc(dur(Date.now() - snap.at)) + ' fa: apri l\'app per aggiornarli.</div>' : ''}
          ${ui.settings ? settingsHtml() : ''}
          ${s.limits.map(l => `<div class="lim"><div class="row"><span>${esc(l.label)}</span><b>${l.pct != null ? Math.round(l.pct) + '%' : '<span class="muted">n.d.</span>'}</b></div>
            ${l.pct != null ? `<div class="bar"><span style="width:${Math.min(100, l.pct)}%;background:${(LV[l.level] ?? LV.unknown)[0]}"></span></div>` : '<div class="bar unk"></div>'}
            <div class="row muted"><span>${esc(l.text)}</span><span>${l.resetAt ? '↻ ' + esc(dur(l.resetAt - Date.now())) : ''}</span></div>
            <div class="muted"><span class="tag">${esc(SRC[l.source] ?? '— nessun dato')}</span> ${l.basis === 'personale' ? '<span class="tag">limite personale</span>' : ''} ${l.estimated ? '<span class="tag">indicativo</span>' : ''}
            ${l.willExceed ? `<span style="color:#ec835a">⚠ esaurimento stimato prima del ripristino</span>` : ''}</div></div>`).join('') || '<p class="muted">Nessun limite configurato.</p>'}
          ${pend ? `<p class="muted">${pend} utilizzi in attesa di sincronizzazione con l'app.</p>` : ''}
          <h4>Consumi registrati</h4>${spark(s.spark ?? [])}
          ${has('alerts') && s.alerts.length ? `<h4>Avvisi</h4>${s.alerts.map(a => `<div class="alert" style="border-color:${(LV[a.level] ?? LV.unknown)[0]}"><b>${esc(a.title)}</b><br><span class="muted">${esc(a.body)}</span></div>`).join('')}` : ''}
          ${has('tips') && s.tips.length ? `<h4>Suggerimenti</h4>${s.tips.map(t => `<div><b>${esc(t.title)}</b>${t.indicative ? ' <span class="tag">stima</span>' : ''}<ul>${t.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`).join('')}` : ''}
          ${has('alternatives') && s.alternatives.length ? `<h4>Alternative per attività semplici</h4><ul>${s.alternatives.map(a => `<li>${esc(a.model)} <span class="muted">· ${esc(a.service)} · ${esc(a.availability)}</span></li>`).join('')}</ul>` : ''}
          <div class="actions">
            <select data-act="model" title="Modello in uso (non rilevato automaticamente)"><option value="">Modello: non specificato</option>${s.models.map(m => `<option value="${esc(m.id)}" ${m.id === ui.modelId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
            <button class="pri" data-act="plus">+1 ${esc(s.defaultUnit === 'messages' ? 'messaggio' : s.defaultUnit)}</button>
          </div>
          <p class="muted" style="margin:6px 0 0">Il modello non viene letto dalla pagina: selezionalo tu. ${snap.widget?.autoCount ? 'Conteggio automatico invii attivo (stima).' : ''}</p>
        </div></div>`;
    }
    root.innerHTML = html;
    bind();
  }

  function settingsHtml() {
    const all = [['model', 'Modello'], ['pct', 'Percentuale'], ['remaining', 'Residuo'], ['reset', 'Ripristino'], ['alerts', 'Avvisi'], ['tips', 'Suggerimenti'], ['alternatives', 'Alternative']];
    return `<div class="set alert" style="border-color:#2a78d6"><b>Personalizza (questo sito)</b>
      ${all.map(([k, l]) => `<label><input type="checkbox" data-field="${k}" ${has(k) ? 'checked' : ''}> ${l}</label>`).join('')}
      <label>Trasparenza <input type="range" min="40" max="100" data-act="opacity" value="${Math.round((ui.opacity ?? snap?.widget?.opacity ?? 0.95) * 100)}"></label></div>`;
  }

  async function addPending(source) {
    const s = current(); if (!s) return;
    const ev = { id: 'ext_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), subId: s.subId, ts: Date.now(), unit: s.defaultUnit || 'messages', amount: 1, modelId: ui.modelId || undefined, source };
    const { pending: cur = [] } = await chrome.storage.local.get('pending');
    cur.push(ev);
    await chrome.storage.local.set({ pending: cur.slice(-2000) });
  }

  function bind() {
    root.querySelectorAll('[data-act]').forEach(el => {
      const act = el.dataset.act;
      if (el.tagName === 'SELECT' || el.type === 'range') {
        el.addEventListener(el.type === 'range' ? 'input' : 'change', (e) => {
          e.stopPropagation();
          if (act === 'sub') ui.subId = el.value;
          if (act === 'model') ui.modelId = el.value;
          if (act === 'opacity') { ui.opacity = Number(el.value) / 100; host.style.opacity = String(ui.opacity); saveUi(); return; }
          saveUi(); render();
        });
        el.addEventListener('click', e => e.stopPropagation());
        return;
      }
      el.addEventListener('click', async (e) => {
        if (act !== 'toggle' && e.currentTarget !== el) return;
        e.stopPropagation();
        if (act === 'toggle') { ui.expanded = !ui.expanded; saveUi(); render(); }
        if (act === 'plus') { await addPending('manuale'); el.textContent = '✓'; }
        if (act === 'settings') { ui.settings = !ui.settings; render(); }
        if (act === 'hide') {
          const { hiddenSites = [] } = await chrome.storage.local.get('hiddenSites');
          await chrome.storage.local.set({ hiddenSites: [...new Set([...hiddenSites, HOST])] });
        }
      });
    });
    root.querySelectorAll('[data-field]').forEach(cb => cb.addEventListener('change', () => {
      const set = new Set(fields());
      cb.checked ? set.add(cb.dataset.field) : set.delete(cb.dataset.field);
      ui.fields = [...set]; saveUi(); render();
    }));
    const head = root.querySelector('[data-drag]');
    if (head) dragify(head);
    const panel = root.querySelector('.panel');
    if (panel && 'ResizeObserver' in window) {
      let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { ui.w = panel.offsetWidth; ui.h = panel.offsetHeight; saveUi(); }, 300); }).observe(panel);
    }
  }

  function dragify(handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = host.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        ui.x = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 60);
        ui.y = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 30);
        host.style.left = ui.x + 'px'; host.style.top = ui.y + 'px'; host.style.right = 'auto'; host.style.bottom = 'auto';
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); saveUi(); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
  }

  // Conteggio automatico (facoltativo): solo il tasto Invio premuto dall'utente in un campo di testo.
  let lastAuto = 0;
  document.addEventListener('keydown', (e) => {
    if (!snap?.widget?.autoCount || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const t = e.target;
    if (!(t instanceof HTMLElement) || !(t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (Date.now() - lastAuto < 1500) return;
    lastAuto = Date.now();
    addPending('stima');
  }, true);

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.snapshot) snap = ch.snapshot.newValue;
    if (ch.pending) pending = ch.pending.newValue ?? [];
    if (ch.hiddenSites) ui.hidden = (ch.hiddenSites.newValue ?? []).includes(HOST);
    if (ch.snapshot || ch.pending || ch.hiddenSites) render();
  });
  setInterval(render, 60_000);
  loadAll();
})();
