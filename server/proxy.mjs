// AI Plan Manager — proxy opzionale per i DATI UFFICIALI di consumo.
// Le chiavi API restano qui (variabili d'ambiente) e non arrivano mai al browser.
//
// Variabili d'ambiente:
//   PROXY_TOKEN           token che l'app invia (Authorization: Bearer …)  [obbligatorio]
//   ALLOWED_ORIGIN        origine dell'app, es. https://utente.github.io  [obbligatorio fuori da localhost]
//   PORT                  porta (default 8787)
//   OPENAI_ADMIN_KEY      chiave Admin OpenAI (Usage/Costs API)            [facoltativa]
//   ANTHROPIC_ADMIN_KEY   chiave Admin Anthropic (sk-ant-admin…)          [facoltativa]
//   DEEPSEEK_API_KEY      chiave API DeepSeek (saldo)                      [facoltativa]
//
// Endpoint:  GET /health   GET /usage?provider=openai|anthropic&days=1..90   GET /balance?provider=deepseek
// Risposta /usage normalizzata: { provider, source:'ufficiale', fetchedAt, days:[{date, requests?, inputTokens, outputTokens, costUsd?}], notes:[] }

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.PROXY_TOKEN ?? '';
const ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:8080';
const CACHE_MS = 5 * 60e3; // i fornitori aggiornano i dati con qualche minuto di ritardo
const cache = new Map();

export const day = (d) => new Date(d).toISOString().slice(0, 10);

async function getJSON(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${new URL(url).host} HTTP ${res.status}`), { status: 502, detail: text.slice(0, 300) });
  return JSON.parse(text);
}

/** Scorre tutte le pagine (has_more/next_page) di un endpoint. */
async function paged(base, params, headers, max = 20) {
  const out = [];
  let page = null;
  for (let i = 0; i < max; i++) {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (page) u.searchParams.set('page', page);
    const j = await getJSON(u.href, headers);
    out.push(...(j.data ?? []));
    if (!j.has_more || !j.next_page) break;
    page = j.next_page;
  }
  return out;
}

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

function bucketMap(days, startMs) {
  const m = new Map();
  for (let i = 0; i < days; i++) { const d = day(startMs + i * 864e5); m.set(d, { date: d, inputTokens: 0, outputTokens: 0 }); }
  return m;
}

/** Anthropic Usage & Cost Admin API (formato verificato sulla documentazione ufficiale). */
export function normalizeAnthropic(usageBuckets, costBuckets, days, startMs) {
  const m = bucketMap(days, startMs);
  for (const b of usageBuckets) {
    const row = m.get(day(b.starting_at)); if (!row) continue;
    for (const r of b.results ?? []) {
      row.inputTokens += num(r.uncached_input_tokens) + num(r.cache_read_input_tokens)
        + num(r.cache_creation?.ephemeral_5m_input_tokens) + num(r.cache_creation?.ephemeral_1h_input_tokens);
      row.outputTokens += num(r.output_tokens);
    }
  }
  for (const b of costBuckets ?? []) {
    const row = m.get(day(b.starting_at)); if (!row) continue;
    for (const r of b.results ?? []) {
      if (r.currency && r.currency !== 'USD') continue;
      row.costUsd = (row.costUsd ?? 0) + num(r.amount) / 100; // amount = centesimi in stringa decimale
    }
  }
  return [...m.values()];
}

/** OpenAI Usage/Costs API (formato da verificare sulla documentazione corrente: parsing difensivo). */
export function normalizeOpenAI(usageBuckets, costBuckets, days, startMs) {
  const m = bucketMap(days, startMs);
  const ts = (b) => (b.start_time != null ? b.start_time * 1000 : b.starting_at);
  for (const b of usageBuckets) {
    const row = m.get(day(ts(b))); if (!row) continue;
    for (const r of b.results ?? []) {
      row.inputTokens += num(r.input_tokens);
      row.outputTokens += num(r.output_tokens);
      if (r.num_model_requests != null) row.requests = (row.requests ?? 0) + num(r.num_model_requests);
    }
  }
  for (const b of costBuckets ?? []) {
    const row = m.get(day(ts(b))); if (!row) continue;
    for (const r of b.results ?? []) {
      const a = r.amount ?? {};
      if (a.currency && String(a.currency).toLowerCase() !== 'usd') continue;
      row.costUsd = (row.costUsd ?? 0) + num(a.value);
    }
  }
  return [...m.values()];
}

async function usage(provider, days) {
  const startMs = Date.UTC(...(() => { const d = new Date(Date.now() - (days - 1) * 864e5); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; })());
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_ADMIN_KEY;
    if (!key) throw Object.assign(new Error('ANTHROPIC_ADMIN_KEY non configurata'), { status: 501 });
    const h = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    const p = { starting_at: new Date(startMs).toISOString(), bucket_width: '1d', limit: '31' };
    const [u, c] = await Promise.all([
      paged('https://api.anthropic.com/v1/organizations/usage_report/messages', p, h),
      paged('https://api.anthropic.com/v1/organizations/cost_report', p, h),
    ]);
    return { days: normalizeAnthropic(u, c, days, startMs), notes: ['Il report di Anthropic non include il numero di richieste.'] };
  }
  if (provider === 'openai') {
    const key = process.env.OPENAI_ADMIN_KEY;
    if (!key) throw Object.assign(new Error('OPENAI_ADMIN_KEY non configurata'), { status: 501 });
    const h = { Authorization: `Bearer ${key}` };
    const p = { start_time: String(Math.floor(startMs / 1000)), bucket_width: '1d', limit: '31' };
    const [u, c] = await Promise.all([
      paged('https://api.openai.com/v1/organization/usage/completions', p, h),
      paged('https://api.openai.com/v1/organization/costs', p, h),
    ]);
    return { days: normalizeOpenAI(u, c, days, startMs), notes: [] };
  }
  throw Object.assign(new Error('Fornitore non supportato'), { status: 400 });
}

/** DeepSeek: GET /user/balance (formato da verificare: parsing difensivo). */
export function normalizeDeepseek(j) {
  const info = (j.balance_infos ?? []).find(b => b.currency === 'USD') ?? j.balance_infos?.[0];
  return { balance: info ? num(info.total_balance) : null, currency: info?.currency ?? null, available: j.is_available ?? null };
}

async function balance(provider) {
  if (provider !== 'deepseek') throw Object.assign(new Error('Fornitore non supportato'), { status: 400 });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw Object.assign(new Error('DEEPSEEK_API_KEY non configurata'), { status: 501 });
  return normalizeDeepseek(await getJSON('https://api.deepseek.com/user/balance', { Authorization: `Bearer ${key}`, Accept: 'application/json' }));
}

function authorized(req) {
  const h = req.headers.authorization ?? '';
  const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const exp = Buffer.from(TOKEN);
  return TOKEN.length >= 16 && got.length === exp.length && timingSafeEqual(got, exp);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET', Vary: 'Origin' };
    const send = (code, body) => res.writeHead(code, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
    if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
    if (req.method !== 'GET') return send(405, { error: 'Metodo non consentito' });
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') return send(200, { ok: true });
    if (!authorized(req)) return send(401, { error: 'Token non valido' });
    const provider = url.searchParams.get('provider') ?? '';
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 31) || 31));
    const key = `${url.pathname}:${provider}:${days}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return send(200, hit.body);
    try {
      let body;
      if (url.pathname === '/usage') body = { provider, source: 'ufficiale', fetchedAt: new Date().toISOString(), ...(await usage(provider, days)) };
      else if (url.pathname === '/balance') body = { provider, source: 'ufficiale', fetchedAt: new Date().toISOString(), ...(await balance(provider)) };
      else return send(404, { error: 'Non trovato' });
      cache.set(key, { at: Date.now(), body });
      send(200, body);
    } catch (e) {
      // non inoltrare mai al client dettagli che potrebbero contenere dati sensibili
      console.error(e.message, e.detail ?? '');
      send(e.status ?? 500, { error: e.message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (TOKEN.length < 16) { console.error('Imposta PROXY_TOKEN (almeno 16 caratteri).'); process.exit(1); }
  createServer().listen(PORT, () => console.log(`Proxy AI Plan Manager su :${PORT} (origine consentita: ${ORIGIN})`));
}
