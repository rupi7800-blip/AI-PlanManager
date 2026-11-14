import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, newSubscription, addEvent, addReading, normalizeState } from '../app/js/core/state.js';
import { computeLimitStatus, computeAll, overview, levelFor, countSessions, monthlyCost } from '../app/js/core/monitor.js';
import { windowBounds, billingCycle, HOUR, DAY } from '../app/js/core/time.js';
import { forecastLimit } from '../app/js/core/forecast.js';
import { evaluateAlerts, newAlerts } from '../app/js/core/alerts.js';
import { recommend } from '../app/js/core/selector.js';
import { advise } from '../app/js/core/advisor.js';
import { computeIndices, regularity } from '../app/js/core/indices.js';
import { insights, series, buckets } from '../app/js/core/history.js';
import { eventsToCSV, stateToJSON, parseBackup } from '../app/js/core/export.js';
import { mergeCatalog, validateCatalog, DEFAULT_CATALOG } from '../app/js/core/catalog.js';
import { buildSnapshot } from '../app/js/core/snapshot.js';
import { weakestSource } from '../app/js/core/units.js';

const NOW = new Date(2026, 10, 14, 12, 0, 0).getTime(); // 14 nov 2026 12:00 locale

function setup() {
  const st = createState();
  const sub = newSubscription(st.catalog, 'openai', 'openai-plus', { renewalDate: '2026-11-20' });
  st.subscriptions.push(sub);
  return { st, sub };
}

test('livelli colore', () => {
  assert.equal(levelFor(null), 'unknown');
  assert.equal(levelFor(10), 'green');
  assert.equal(levelFor(70), 'yellow');
  assert.equal(levelFor(85), 'orange');
  assert.equal(levelFor(100), 'red');
  assert.equal(levelFor(120), 'red');
});

test('limite non pubblicato: nessuna percentuale inventata', () => {
  const { st, sub } = setup();
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'messages', amount: 10, modelId: 'gpt-main' });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.used, 10);
  assert.equal(s.limitValue, null);
  assert.equal(s.pct, null);
  assert.equal(s.level, 'unknown');
  assert.ok(s.notes.some(n => /limite personale/i.test(n)));
});

test('limite personale abilita percentuale e la etichetta', () => {
  const { st, sub } = setup();
  sub.limits[0].personalValue = 40;
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'messages', amount: 30, modelId: 'gpt-main' });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.pct, 75);
  assert.equal(s.basis, 'personale');
  assert.equal(s.level, 'yellow');
});

test('limite per modello non conta eventi di altri modelli né unità diverse', () => {
  const { st, sub } = setup();
  sub.limits[0].personalValue = 100;
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'messages', amount: 5, modelId: 'gpt-mini' });
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'tokens', amount: 5000, modelId: 'gpt-main' });
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'messages', amount: 2, modelId: 'gpt-main' });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.used, 2);
});

test('finestra scorrevole: eventi vecchi escono e ripristino = scadenza del più vecchio', () => {
  const { st, sub } = setup(); // msg-main rolling 3h
  addEvent(st, { subId: sub.id, ts: NOW - 4 * HOUR, unit: 'messages', amount: 9, modelId: 'gpt-main' });
  addEvent(st, { subId: sub.id, ts: NOW - 2 * HOUR, unit: 'messages', amount: 1, modelId: 'gpt-main' });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.used, 1);
  assert.equal(s.resetAt, NOW - 2 * HOUR + 3 * HOUR);
});

test('finestra di sessione (Claude): parte dal primo utilizzo', () => {
  const evs = [{ ts: NOW - 6 * HOUR }, { ts: NOW - 2 * HOUR }, { ts: NOW - HOUR }];
  const w = windowBounds({ type: 'session', hours: 5 }, NOW, { events: evs });
  // -6h apre una finestra fino a -1h; -2h vi rientra; -1h apre la nuova finestra
  assert.equal(w.start, NOW - HOUR);
  assert.equal(w.end, NOW + 4 * HOUR);
  const w2 = windowBounds({ type: 'session', hours: 5 }, NOW, { events: [{ ts: NOW - 6 * HOUR }] });
  assert.equal(w2.active, false);
});

test('ciclo di fatturazione dalla data di rinnovo', () => {
  const c = billingCycle('2026-01-20', 'month', NOW);
  assert.equal(new Date(c.end).getDate(), 20);
  assert.equal(new Date(c.end).getMonth(), 10);
  assert.equal(new Date(c.start).getMonth(), 9);
  const y = billingCycle('2025-03-01', 'year', NOW);
  assert.equal(new Date(y.end).getFullYear(), 2027);
});

test('limite in percentuale usa solo letture e lo ripristino della lettura', () => {
  const st = createState();
  const sub = newSubscription(st.catalog, 'anthropic', 'claude-pro');
  st.subscriptions.push(sub);
  const s0 = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s0.pct, null);
  assert.equal(s0.hasData, false);
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'messages', amount: 3 });
  addReading(st, { subId: sub.id, limitId: 'session', ts: NOW - 30 * 60e3, usedPct: 62, resetAt: NOW + 2 * HOUR });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.pct, 62);
  assert.equal(s.source, 'integrazione');
  assert.equal(s.resetAt, NOW + 2 * HOUR);
  assert.equal(s.resetFromReading, true);
  // lettura scaduta: non più valida
  const later = NOW + 3 * HOUR;
  const s2 = computeLimitStatus(sub, sub.limits[0], st, later);
  assert.notEqual(s2.pct, 62);
});

test('lettura con saldo residuo (crediti prepagati)', () => {
  const st = createState();
  const sub = newSubscription(st.catalog, 'deepseek', 'deepseek-api');
  st.subscriptions.push(sub);
  addReading(st, { subId: sub.id, limitId: 'balance', ts: NOW - HOUR, remaining: 8.5, source: 'ufficiale' });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.remaining, 8.5);
  assert.equal(s.source, 'ufficiale');
});

test('attendibilità combinata = la più bassa', () => {
  assert.equal(weakestSource(['ufficiale', 'manuale']), 'manuale');
  assert.equal(weakestSource(['ufficiale', 'stima', 'integrazione']), 'stima');
  assert.equal(weakestSource([]), null);
});

test('sessioni: gap di 30 minuti', () => {
  assert.equal(countSessions([{ ts: 0 }, { ts: 10 * 60e3 }, { ts: 50 * 60e3 }, { ts: 200 * 60e3 }]), 3);
});

test('costo mensile normalizzato', () => {
  assert.equal(monthlyCost({ amount: 120, period: 'year' }), 10);
  assert.equal(monthlyCost({ amount: 20, period: 'month' }), 20);
  assert.equal(monthlyCost({ amount: 0, period: 'usage' }), null);
});

test('previsione: esaurimento anticipato e ritmo sostenibile', () => {
  const st = createState();
  const sub = newSubscription(st.catalog, 'google', 'gemini-pro-plan');
  sub.limits[0].personalValue = 100; // daily
  st.subscriptions.push(sub);
  const dayStart = new Date(2026, 10, 14, 0, 0).getTime();
  for (let i = 0; i < 75; i++) addEvent(st, { subId: sub.id, ts: dayStart + 1 * HOUR + i * 8 * 60e3, unit: 'messages', amount: 1, modelId: 'gemini-pro' });
  const s = computeLimitStatus(sub, sub.limits[0], st, NOW);
  assert.equal(s.pct, 75);
  const f = forecastLimit(s, st, NOW);
  assert.ok(f.willExceed);
  assert.ok(f.exhaustAt < s.resetAt);
  assert.ok(Math.abs(f.sustainableRate - 25 / 12) < 1e-9);
  assert.ok(f.reductionPct > 0);
});

test('alert: soglie indipendenti e anti-duplicazione', () => {
  const { st, sub } = setup();
  sub.limits[0].personalValue = 10;
  sub.thresholds = [50, 90];
  addEvent(st, { subId: sub.id, ts: NOW - 10 * 60e3, unit: 'messages', amount: 6, modelId: 'gpt-main' });
  let alerts = evaluateAlerts(st, computeAll(st, NOW), NOW).filter(a => a.kind === 'soglia');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].threshold, 50);
  st.alertsFired[alerts[0].key] = new Date(NOW).toISOString();
  assert.equal(newAlerts(alerts, st.alertsFired).length, 0);
  addEvent(st, { subId: sub.id, ts: NOW - 5 * 60e3, unit: 'messages', amount: 4, modelId: 'gpt-main' });
  alerts = evaluateAlerts(st, computeAll(st, NOW), NOW).filter(a => a.kind === 'soglia');
  assert.equal(alerts[0].threshold, 90);
  assert.equal(newAlerts(alerts, st.alertsFired).length, 1);
});

test('alert rinnovo entro 3 giorni', () => {
  const st = createState();
  const sub = newSubscription(st.catalog, 'anthropic', 'claude-pro', { renewalDate: '2026-11-16' });
  st.subscriptions.push(sub);
  const a = evaluateAlerts(st, computeAll(st, NOW), NOW).filter(x => x.kind === 'rinnovo');
  assert.equal(a.length, 1);
});

test('selettore: traduzione semplice non usa il modello più potente', () => {
  const st = createState();
  st.subscriptions.push(newSubscription(st.catalog, 'anthropic', 'claude-pro'));
  const r = recommend(st, computeAll(st, NOW), { task: 'traduzione', complexity: 0 });
  assert.notEqual(r.best.model.id, 'claude-opus');
  assert.ok(r.best.sufficient);
  assert.ok(r.saving && r.saving.pct > 0);
});

test('selettore: compito complesso richiede modello adeguato, non il più economico', () => {
  const st = createState();
  st.subscriptions.push(newSubscription(st.catalog, 'anthropic', 'claude-pro'));
  const r = recommend(st, computeAll(st, NOW), { task: 'scientifica', complexity: 2 });
  assert.equal(r.best.model.id, 'claude-opus');
});

test('selettore: modello con limite raggiunto viene evitato se esiste alternativa', () => {
  const st = createState();
  const a = newSubscription(st.catalog, 'anthropic', 'claude-pro');
  const g = newSubscription(st.catalog, 'google', 'gemini-pro-plan');
  st.subscriptions.push(a, g);
  addReading(st, { subId: a.id, limitId: 'session', ts: NOW - 60e3, usedPct: 100, resetAt: NOW + HOUR });
  const r = recommend(st, computeAll(st, NOW), { task: 'programmazione', complexity: 1 });
  assert.equal(r.best.subStatus.sub.id, g.id);
});

test('consulente: suggerimenti numerici in caso di esaurimento anticipato', () => {
  const st = createState();
  const sub = newSubscription(st.catalog, 'google', 'gemini-pro-plan');
  sub.limits[0].personalValue = 100;
  st.subscriptions.push(sub);
  const dayStart = new Date(2026, 10, 14, 0, 0).getTime();
  for (let i = 0; i < 80; i++) addEvent(st, { subId: sub.id, ts: dayStart + HOUR + i * 7 * 60e3, unit: 'messages', amount: 1, modelId: 'gemini-pro' });
  const tips = advise(st, computeAll(st, NOW), NOW);
  const t = tips.find(x => x.kind === 'ritmo');
  assert.ok(t);
  assert.match(t.actions[0], /ritmo massimo/);
  assert.equal(t.indicative, true); // limite non verificato
});

test('consulente: per limiti senza dati chiede di raccoglierli', () => {
  const st = createState();
  st.subscriptions.push(newSubscription(st.catalog, 'anthropic', 'claude-pro'));
  const tips = advise(st, computeAll(st, NOW), NOW);
  assert.ok(tips.some(t => t.kind === 'dati'));
});

test('indici: formule e valore potenziale solo con tariffa', () => {
  const { st, sub } = setup();
  for (let d = 0; d < 10; d++) addEvent(st, { subId: sub.id, ts: NOW - d * DAY, unit: 'messages', amount: 4, outcome: 'completata', durationMin: 10, minutesSaved: 20, quality: 4 });
  let idx = computeIndices(st, computeAll(st, NOW), NOW, 30)[0];
  assert.equal(idx.economic.monthlyCost.value, 20);
  assert.equal(idx.economic.costPerSession.value, 2);
  assert.equal(idx.economic.costPerTask.value, 2);
  assert.equal(idx.operational.requestsPerTask.value, 4);
  assert.equal(idx.operational.completionRate.value, 1);
  assert.equal(idx.yield.potentialValue.value, null);
  st.settings.hourlyValue = 30;
  idx = computeIndices(st, computeAll(st, NOW), NOW, 30)[0];
  assert.equal(idx.yield.potentialValue.value, (200 / 60) * 30);
  assert.equal(regularity([2, 2, 2]), 1);
});

test('storico: serie e analisi', () => {
  const { st, sub } = setup();
  addEvent(st, { subId: sub.id, ts: NOW - HOUR, unit: 'messages', amount: 1, modelId: 'gpt-main', task: 'scrittura' });
  addEvent(st, { subId: sub.id, ts: NOW - 3 * DAY, unit: 'messages', amount: 1, modelId: 'gpt-mini', task: 'scrittura' });
  for (const r of ['24h', '7g', '30g', '90g', '12m']) assert.ok(buckets(r, NOW).length > 0);
  const s7 = series(st.events, '7g', NOW, e => e.subId);
  assert.equal(s7.series[sub.id].reduce((a, b) => a + b, 0), 2);
  const s24 = series(st.events, '24h', NOW, e => e.subId);
  assert.equal(s24.series[sub.id].reduce((a, b) => a + b, 0), 1);
  const ins = insights(st, computeAll(st, NOW), '30g', NOW);
  assert.equal(ins.total, 2);
  assert.equal(ins.byTask[0].n, 2);
});

test('export CSV con protezione formule e backup JSON senza token', () => {
  const { st, sub } = setup();
  addEvent(st, { subId: sub.id, ts: NOW, unit: 'messages', amount: 1, note: '=HYPERLINK("x")' });
  st.settings.proxy.token = 'segreto';
  const csv = eventsToCSV(st);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
  const json = stateToJSON(st);
  assert.ok(!json.includes('segreto'));
  const back = parseBackup(json);
  assert.equal(back.events.length, 1);
  assert.throws(() => parseBackup('{"a":1}'));
});

test('catalogo: aggiornamento e validazione', () => {
  const upd = { version: 'x', providers: [{ id: 'openai', name: 'OpenAI', plans: [{ id: 'openai-plus', name: 'Plus', verified: true, price: { amount: 22, currency: 'USD', period: 'month' } }] }, { id: 'nuovo', name: 'Nuova AI', domains: ['nuova.ai'], plans: [] }] };
  assert.deepEqual(validateCatalog(upd), []);
  const merged = mergeCatalog(DEFAULT_CATALOG, upd);
  const plus = merged.providers.find(p => p.id === 'openai').plans.find(p => p.id === 'openai-plus');
  assert.equal(plus.price.amount, 22);
  assert.ok(plus.limits.length > 0); // limiti preservati
  assert.ok(merged.providers.some(p => p.id === 'nuovo'));
  assert.ok(validateCatalog({ providers: [{ id: 'a', name: 'b', plans: [{ id: 'p', name: 'q', limits: [{ id: 'l' }] }] }] }).length > 0);
});

test('catalogo iniziale: nessun limite numerico non verificato', () => {
  for (const p of DEFAULT_CATALOG.providers) for (const pl of p.plans) for (const l of pl.limits) {
    if (l.value != null) assert.equal(l.unit, 'percent', `${pl.id}/${l.id} ha un valore numerico`);
  }
});

test('overview non somma valute diverse', () => {
  const st = createState();
  st.subscriptions.push(newSubscription(st.catalog, 'openai', 'openai-plus'));
  st.subscriptions.push(newSubscription(st.catalog, 'google', 'gemini-pro-plan'));
  const o = overview(st, NOW);
  assert.equal(o.spendByCurrency.USD, 20);
  assert.equal(o.spendByCurrency.EUR, 21.99);
});

test('snapshot per estensione', () => {
  const { st } = setup();
  const snap = buildSnapshot(st, computeAll(st, NOW), NOW);
  assert.equal(snap.services.length, 1);
  assert.deepEqual(snap.services[0].domains, ['chatgpt.com', 'chat.openai.com']);
  assert.ok(JSON.stringify(snap).length < 50000);
});

test('normalizeState ripara dati incompleti', () => {
  const s = normalizeState({ subscriptions: null, settings: { currency: 'USD' } });
  assert.deepEqual(s.subscriptions, []);
  assert.equal(s.settings.currency, 'USD');
  assert.equal(s.settings.notifications.inapp, true);
});
