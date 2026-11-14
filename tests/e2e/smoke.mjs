// Test end-to-end dell'app: node tests/e2e/smoke.mjs [baseUrl]
// Richiede il server di sviluppo avviato (npm start) e Playwright disponibile.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] ?? 'http://localhost:8080/';
const SHOTS = process.env.SHOTS;
const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (c, msg) => { if (!c) errors.push('ASSERT: ' + msg); };
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('aipm.state.v1')));

await p.goto(BASE);
await p.waitForSelector('#add-first');

// Aggiungi Claude Pro
await p.click('#add-first');
await p.selectOption('#f-prov', 'anthropic');
await p.selectOption('#f-plan', 'claude-pro');
await p.fill('#f-ren', '2026-12-01');
await p.click('dialog button.primary');
// Aggiungi Gemini AI Pro
await p.click('#add');
await p.selectOption('#f-prov', 'google');
await p.selectOption('#f-plan', 'gemini-pro-plan');
await p.click('dialog button.primary');
// Servizio personalizzato
await p.click('#add');
await p.selectOption('#f-prov', 'custom');
await p.fill('#f-cname', 'Poe');
await p.fill('#f-amt', '19,99');
await p.click('dialog button.primary');
const cards = await p.$$('.grid.cards > .card');
ok(cards.length === 3, 'tre schede servizio, trovate ' + cards.length);

// +1 rapidi su Gemini
let st = await state();
const gem = st.subscriptions.find(s => s.providerId === 'google').id;
const cl = st.subscriptions.find(s => s.providerId === 'anthropic').id;
ok(st.subscriptions.find(s => s.name === 'Poe')?.cost.amount === 19.99, 'costo con virgola decimale');
for (let i = 0; i < 3; i++) await p.click(`[data-quick="${gem}"]`);
st = await state();
ok(st.events.length === 3 && st.events.every(e => e.source === 'manuale'), 'tre eventi manuali');

// Lettura per Claude
await p.click(`[data-reading="${cl}"]`);
await p.fill('input[name=usedPct]', '88');
await p.click('dialog button.primary');
await p.waitForTimeout(200);
const txt = await p.textContent('#view');
ok(txt.includes('88%'), 'percentuale lettura visibile');
ok(txt.includes('Integrazione'), 'badge fonte integrazione');

// Limite personale su Gemini → percentuale
await p.goto(BASE + '#/servizi/' + gem);
await p.click('[data-lim="prompts-pro"]');
await p.fill('input[name=personal]', '4');
await p.click('dialog button.primary');
await p.click('#log');
await p.selectOption('#u-model', 'gemini-pro');
await p.fill('input[name=amount]', '3');
await p.selectOption('select[name=task]', 'traduzione');
await p.click('dialog button.primary');
await p.waitForTimeout(200);
ok((await p.textContent('#view')).includes('limite personale'), 'tag limite personale');

for (const r of ['', 'servizi', 'consumi', 'consulente', 'confronto', 'indici', 'storico', 'impostazioni']) {
  await p.goto(BASE + '#/' + r);
  await p.waitForTimeout(250);
  const t = await p.textContent('#view');
  ok(!t.includes('Errore nella visualizzazione'), 'errore render in ' + r);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${r || 'dashboard'}.png`, fullPage: true });
}
// Confronto: traduzione semplice non deve consigliare Opus
await p.goto(BASE + '#/confronto');
await p.selectOption('select[name=task]', 'traduzione');
await p.selectOption('select[name=complexity]', '0');
await p.waitForTimeout(150);
const bestName = await p.textContent('.rec-best .best-name');
ok(!bestName.includes('Opus'), 'traduzione semplice: consigliato ' + bestName);
// Alert in-app per Claude 88% (soglia 85)
st = await state();
ok(Object.keys(st.alertsFired).some(k => k.startsWith('thr:' + cl) && k.includes(':85:')), 'alert 85% registrato');
// Export
await p.goto(BASE + '#/storico');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
ok(dl.suggestedFilename().endsWith('.csv'), 'download csv');

// Mobile
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto(BASE);
await m.evaluate(s => localStorage.setItem('aipm.state.v1', s), JSON.stringify(st));
for (const r of ['', 'consumi', 'confronto', 'indici']) {
  await m.goto(BASE + '#/' + r); await m.waitForTimeout(250);
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= 390, `scroll orizzontale su mobile (${r || 'dashboard'}): ${sw}`);
}
await m.goto(BASE); await m.waitForTimeout(250);
if (SHOTS) await m.screenshot({ path: `${SHOTS}/mobile.png`, fullPage: true });

await b.close();
if (errors.length) { console.error('FALLITO:\n' + errors.join('\n')); process.exit(1); }
console.log('E2E OK');
