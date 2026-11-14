// Ponte tra la PWA AI Plan Manager e l'estensione.
// Attivo SOLO se la pagina dichiara <meta name="aipm-app">: sulle altre pagine non fa nulla.
(() => {
  if (!document.querySelector('meta[name="aipm-app"]')) return;
  const ORIGIN = location.origin;
  const send = (msg) => window.postMessage({ ns: 'aipm', from: 'extension', ...msg }, ORIGIN);

  async function flushPending() {
    const { pending = [] } = await chrome.storage.local.get('pending');
    send({ type: 'events', events: pending });
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.origin !== ORIGIN) return;
    const m = e.data;
    if (!m || m.ns !== 'aipm' || m.from !== 'app') return;
    if (m.type === 'hello') { flushPending(); return; }
    if (m.type === 'snapshot' && m.snapshot && m.snapshot.v === 1) {
      // dimensione limitata per sicurezza
      if (JSON.stringify(m.snapshot).length > 500000) return;
      await chrome.storage.local.set({ snapshot: m.snapshot, appUrl: location.href.split('#')[0] });
      flushPending();
      return;
    }
    if (m.type === 'ack' && Array.isArray(m.ids)) {
      const ids = new Set(m.ids);
      const { pending = [] } = await chrome.storage.local.get('pending');
      await chrome.storage.local.set({ pending: pending.filter(p => !ids.has(p.id)) });
    }
  });

  // Se la finestrella registra utilizzi mentre l'app è aperta, inoltrali subito
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pending && (changes.pending.newValue?.length ?? 0) > (changes.pending.oldValue?.length ?? 0)) flushPending();
  });
  send({ type: 'hello' });
})();
