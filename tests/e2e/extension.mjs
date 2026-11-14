// Test dell'estensione: carica extension/ in Chromium, collega l'app e verifica la finestrella
// su una pagina AI simulata (risposta intercettata, nessun accesso reale alla piattaforma).
// Uso: node tests/e2e/extension.mjs [baseUrl]
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] ?? 'http://localhost:8080/';
const EXT = fileURLToPath(new URL('../../extension', import.meta.url));
const SHOTS = process.env.SHOTS;
const errors = [];
const ok = (c, m) => { if (!c) errors.push('ASSERT: ' + m); };

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'aipm-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 860 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route('https://claude.ai/**', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="font-family:sans-serif;padding:40px;background:#f4f1ea"><h1>Pagina AI simulata</h1><textarea id="t" style="width:600px;height:80px"></textarea></body></html>' }));

const app = await ctx.newPage();
app.on('pageerror', e => errors.push('app: ' + e.message));
await app.goto(BASE);
await app.evaluate(() => localStorage.clear());
await app.reload();
await app.click('#add-first');
await app.selectOption('#f-prov', 'anthropic');
await app.selectOption('#f-plan', 'claude-pro');
await app.click('dialog button.primary');
const subId = await app.evaluate(() => JSON.parse(localStorage.getItem('aipm.state.v1')).subscriptions[0].id);
await app.click(`[data-reading="${subId}"]`);
await app.fill('input[name=usedPct]', '72');
await app.click('dialog button.primary');
await app.waitForTimeout(800);

const ai = await ctx.newPage();
await ai.goto('https://claude.ai/new');
const host = ai.locator('#aipm-widget-host');
await host.waitFor({ state: 'attached', timeout: 8000 });
await ai.waitForTimeout(800);
// Shadow root chiuso: verifichiamo tramite screenshot e interazione per coordinate
const box = await host.boundingBox();
ok(box && box.width > 100, 'finestrella compatta visibile');
if (SHOTS) await ai.screenshot({ path: `${SHOTS}/ext-compact.png` });
// Espandi (clic sul testo della pillola, lontano dal pulsante +1)
await ai.mouse.click(box.x + 30, box.y + box.height / 2);
await ai.waitForTimeout(400);
const box2 = await host.boundingBox();
ok(box2.height > box.height + 50, 'finestrella espansa');
if (SHOTS) await ai.screenshot({ path: `${SHOTS}/ext-expanded.png` });

// Registra +1 dalla pillola (ri-minimizza e clicca +1)
const [sw] = ctx.serviceWorkers().length ? ctx.serviceWorkers() : [await ctx.waitForEvent('serviceworker')];
const before = await sw.evaluate(() => chrome.storage.local.get('snapshot').then(d => d.snapshot?.services?.length));
ok(before === 1, 'snapshot ricevuto dall\'estensione');
await sw.evaluate((id) => chrome.storage.local.set({ pending: [{ id: 'ext_test1', subId: id, ts: Date.now() - 1000, unit: 'messages', amount: 1, source: 'manuale' }] }), subId);
await app.bringToFront();
await app.waitForTimeout(1500);
const evs = await app.evaluate(() => JSON.parse(localStorage.getItem('aipm.state.v1')).events);
ok(evs.some(e => e.id === 'ext_test1' && e.origin === 'estensione'), 'evento della finestrella importato nell\'app');
const left = await sw.evaluate(() => chrome.storage.local.get('pending').then(d => d.pending.length));
ok(left === 0, 'coda svuotata dopo conferma: ' + left);

await ctx.close();
if (errors.length) { console.error('FALLITO:\n' + errors.join('\n')); process.exit(1); }
console.log('EXTENSION OK');
