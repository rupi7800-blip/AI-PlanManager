const COL = { green: '#0ca30c', yellow: '#fab219', orange: '#ec835a', red: '#d03b3b', unknown: '#8a8984' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
(async () => {
  const { snapshot, appUrl, hiddenSites = [], pending = [] } = await chrome.storage.local.get(['snapshot', 'appUrl', 'hiddenSites', 'pending']);
  const list = document.getElementById('list');
  if (!snapshot) list.textContent = 'Nessun dato: apri AI Plan Manager una volta con l\'estensione installata.';
  else {
    list.className = '';
    list.innerHTML = snapshot.services.map(s => {
      const k = s.limits.filter(l => l.pct != null);
      const m = k.length ? k.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
      return `<div class="s"><div class="row"><span><span class="dot" style="background:${COL[s.level] ?? COL.unknown}"></span>${esc(s.name)}</span><b>${m ? Math.round(m.pct) + '%' : 'n.d.'}</b></div>
        ${m ? `<div class="muted">${esc(m.label)}</div>` : ''}</div>`;
    }).join('') + `<p class="muted">Aggiornato: ${new Date(snapshot.at).toLocaleString('it-IT')}${pending.length ? ` · ${pending.length} utilizzi da sincronizzare` : ''}</p>`;
  }
  const h = document.getElementById('hidden');
  if (hiddenSites.length) {
    h.innerHTML = '<p class="muted">Finestrella nascosta su:</p>' + hiddenSites.map(s => `<div class="row"><span>${esc(s)}</span><button data-s="${esc(s)}">Mostra</button></div>`).join('');
    h.querySelectorAll('button').forEach(b => b.onclick = async () => {
      await chrome.storage.local.set({ hiddenSites: hiddenSites.filter(x => x !== b.dataset.s) });
      b.closest('.row').remove();
    });
  }
  document.getElementById('open').onclick = () => chrome.tabs.create({ url: appUrl || 'http://localhost:8080/' });
})();
