import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAnthropic, normalizeOpenAI, normalizeDeepseek } from '../server/proxy.mjs';

const START = Date.UTC(2026, 10, 1);

test('Anthropic: token sommati e costo convertito da centesimi a dollari', () => {
  const usage = [{ starting_at: '2026-11-01T00:00:00Z', results: [{ uncached_input_tokens: 100, cache_read_input_tokens: 50, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 5 }, output_tokens: 40 }] }];
  const cost = [{ starting_at: '2026-11-01T00:00:00Z', results: [{ amount: '123.45', currency: 'USD' }, { amount: '0.55', currency: 'USD' }] }];
  const d = normalizeAnthropic(usage, cost, 2, START);
  assert.equal(d.length, 2);
  assert.equal(d[0].inputTokens, 165);
  assert.equal(d[0].outputTokens, 40);
  assert.ok(Math.abs(d[0].costUsd - 1.24) < 1e-9);
  assert.equal(d[0].requests, undefined); // non fornito: non inventato
  assert.equal(d[1].inputTokens, 0);
});

test('OpenAI: parsing difensivo', () => {
  const usage = [{ start_time: START / 1000, results: [{ input_tokens: 7, output_tokens: 3, num_model_requests: 2 }] }];
  const cost = [{ start_time: START / 1000, results: [{ amount: { value: 0.42, currency: 'usd' } }] }];
  const d = normalizeOpenAI(usage, cost, 1, START);
  assert.deepEqual(d[0], { date: '2026-11-01', inputTokens: 7, outputTokens: 3, requests: 2, costUsd: 0.42 });
});

test('DeepSeek: saldo', () => {
  assert.deepEqual(normalizeDeepseek({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '5' }, { currency: 'USD', total_balance: '8.50' }] }), { balance: 8.5, currency: 'USD', available: true });
  assert.deepEqual(normalizeDeepseek({}), { balance: null, currency: null, available: null });
});
