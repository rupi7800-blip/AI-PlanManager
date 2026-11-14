// Service worker dell'estensione: notifiche desktop per i nuovi alert dello snapshot.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.snapshot?.newValue) return;
  const snap = changes.snapshot.newValue;
  if (!snap.desktop) return;
  const { notified = {} } = await chrome.storage.local.get('notified');
  let changed = false;
  for (const s of snap.services ?? []) {
    if (s.desktop === false) continue;
    for (const a of s.alerts ?? []) {
      if (notified[a.key]) continue;
      notified[a.key] = Date.now(); changed = true;
      chrome.notifications.create(a.key.slice(0, 200), {
        type: 'basic', iconUrl: 'icons/icon-128.png', title: a.title, message: a.body, priority: a.level === 'red' ? 2 : 0,
      });
    }
  }
  if (changed) {
    const cutoff = Date.now() - 120 * 864e5;
    for (const [k, v] of Object.entries(notified)) if (v < cutoff) delete notified[k];
    await chrome.storage.local.set({ notified });
  }
});

chrome.notifications.onClicked.addListener(async () => {
  const { appUrl } = await chrome.storage.local.get('appUrl');
  if (appUrl) chrome.tabs.create({ url: appUrl });
});
