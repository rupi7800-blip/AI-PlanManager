// SISTEMA DI NOTIFICHE: canali interno, browser/desktop (via service worker), estensione.
import { toast } from './ui/dom.js';

export function browserPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
export async function requestBrowserPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

/**
 * Consegna un alert sui canali abilitati sia globalmente sia per il servizio.
 * Il canale "desktop" è gestito dall'estensione (riceve gli alert nello snapshot).
 */
export async function deliver(alert, settings, sub) {
  const n = settings.notifications;
  const per = sub?.notify ?? {};
  if (n.inapp && per.inapp !== false) toast(`🔔 ${alert.title} — ${alert.body}`, 7000);
  if (n.browser && per.browser !== false && browserPermission() === 'granted') {
    const opts = { body: alert.body, tag: alert.key, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(alert.title, opts); else new Notification(alert.title, opts);
    } catch { /* il browser può rifiutare: le notifiche interne restano */ }
  }
}
