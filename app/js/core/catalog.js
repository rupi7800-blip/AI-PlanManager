// DATABASE DINAMICO DEI PIANI AI — versione iniziale.
//
// REGOLE:
//  * Nessun limite inventato: se il valore numerico non è verificato, `value` è null.
//  * Prezzi indicativi noti al momento della stesura: `verified:false` finché l'utente
//    (o un aggiornamento JSON) non li conferma dalla fonte ufficiale indicata.
//  * I profili dei modelli (caps 0–5, costWeight) sono STIME EDITORIALI, non benchmark:
//    servono al selettore per evitare modelli sovradimensionati e sono modificabili.

export const CATALOG_VERSION = '2026.11-1';

const chk = null; // data di verifica: null = non verificato

export const DEFAULT_CATALOG = {
  version: CATALOG_VERSION,
  updatedAt: '2026-11-14',
  providers: [
    {
      id: 'openai', name: 'ChatGPT / OpenAI', url: 'https://chatgpt.com', domains: ['chatgpt.com', 'chat.openai.com'], usageApi: 'openai',
      plans: [
        { id: 'openai-free', name: 'Free', price: { amount: 0, currency: 'USD', period: 'month' }, models: ['gpt-main', 'gpt-mini'],
          limits: [{ id: 'msg-main', label: 'Messaggi modello principale', unit: 'messages', value: null, window: { type: 'rolling', hours: 5 }, models: ['gpt-main'], status: 'dinamico', verified: false, note: 'Limite variabile; finestra indicativa da verificare.' }],
          source: { url: 'https://openai.com/chatgpt/pricing/', checkedAt: chk }, verified: false },
        { id: 'openai-plus', name: 'Plus', price: { amount: 20, currency: 'USD', period: 'month' }, models: ['gpt-main', 'gpt-thinking', 'gpt-mini', 'gpt-image'],
          limits: [
            { id: 'msg-main', label: 'Messaggi modello principale', unit: 'messages', value: null, window: { type: 'rolling', hours: 3 }, models: ['gpt-main'], status: 'dinamico', verified: false, note: 'OpenAI indica limiti per modello che possono cambiare: inserisci il valore che vedi nella documentazione aggiornata.' },
            { id: 'msg-thinking', label: 'Messaggi modello di ragionamento', unit: 'messages', value: null, window: { type: 'weekly' }, models: ['gpt-thinking'], status: 'non_pubblicato', verified: false, note: '' },
          ],
          source: { url: 'https://openai.com/chatgpt/pricing/', checkedAt: chk }, verified: false },
        { id: 'openai-pro', name: 'Pro', price: { amount: 200, currency: 'USD', period: 'month' }, models: ['gpt-main', 'gpt-thinking', 'gpt-mini', 'gpt-image'],
          limits: [{ id: 'msg-main', label: 'Messaggi (uso "illimitato" soggetto a policy)', unit: 'messages', value: null, window: { type: 'rolling', hours: 3 }, models: null, status: 'dinamico', verified: false, note: 'Soggetto a guardrail anti-abuso non pubblicati.' }],
          source: { url: 'https://openai.com/chatgpt/pricing/', checkedAt: chk }, verified: false },
        { id: 'openai-api', name: 'API a consumo', price: { amount: 0, currency: 'USD', period: 'usage' }, models: ['gpt-main', 'gpt-thinking', 'gpt-mini'],
          limits: [
            { id: 'spend', label: 'Spesa nel mese', unit: 'usd', value: null, window: { type: 'monthly' }, models: null, status: 'personale', verified: true, note: 'Imposta il tuo budget. Dati ufficiali via proxy (Costs API).' },
            { id: 'tokens', label: 'Token nel mese', unit: 'tokens', value: null, window: { type: 'monthly' }, models: null, status: 'personale', verified: true, note: 'Dati ufficiali via proxy (Usage API).' },
          ],
          source: { url: 'https://platform.openai.com/docs/api-reference/usage', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'anthropic', name: 'Claude / Anthropic', url: 'https://claude.ai', domains: ['claude.ai'], usageApi: 'anthropic',
      plans: [
        { id: 'claude-free', name: 'Free', price: { amount: 0, currency: 'USD', period: 'month' }, models: ['claude-sonnet', 'claude-haiku'],
          limits: [{ id: 'session', label: 'Limite di sessione', unit: 'percent', value: 100, window: { type: 'session', hours: 5 }, models: null, status: 'pubblicato', verified: false, note: 'Claude mostra la percentuale usata in Impostazioni › Utilizzo: registrala come lettura.' }],
          source: { url: 'https://claude.com/pricing', checkedAt: chk }, verified: false },
        { id: 'claude-pro', name: 'Pro', price: { amount: 20, currency: 'USD', period: 'month' }, models: ['claude-opus', 'claude-sonnet', 'claude-haiku'],
          limits: [
            { id: 'session', label: 'Limite di sessione (~5 h)', unit: 'percent', value: 100, window: { type: 'session', hours: 5 }, models: null, status: 'pubblicato', verified: false, note: 'Percentuale visibile in Impostazioni › Utilizzo. Registrala come lettura con l\'orario di ripristino.' },
            { id: 'weekly', label: 'Limite settimanale', unit: 'percent', value: 100, window: { type: 'weekly' }, models: null, status: 'pubblicato', verified: false, note: 'Il giorno di ripristino reale è indicato dalla piattaforma: inseriscilo nella lettura.' },
          ],
          source: { url: 'https://claude.com/pricing', checkedAt: chk }, verified: false },
        { id: 'claude-max5', name: 'Max 5x', price: { amount: 100, currency: 'USD', period: 'month' }, models: ['claude-opus', 'claude-sonnet', 'claude-haiku'],
          limits: [
            { id: 'session', label: 'Limite di sessione (~5 h)', unit: 'percent', value: 100, window: { type: 'session', hours: 5 }, models: null, status: 'pubblicato', verified: false, note: '' },
            { id: 'weekly', label: 'Limite settimanale', unit: 'percent', value: 100, window: { type: 'weekly' }, models: null, status: 'pubblicato', verified: false, note: '' },
          ],
          source: { url: 'https://claude.com/pricing', checkedAt: chk }, verified: false },
        { id: 'claude-max20', name: 'Max 20x', price: { amount: 200, currency: 'USD', period: 'month' }, models: ['claude-opus', 'claude-sonnet', 'claude-haiku'],
          limits: [
            { id: 'session', label: 'Limite di sessione (~5 h)', unit: 'percent', value: 100, window: { type: 'session', hours: 5 }, models: null, status: 'pubblicato', verified: false, note: '' },
            { id: 'weekly', label: 'Limite settimanale', unit: 'percent', value: 100, window: { type: 'weekly' }, models: null, status: 'pubblicato', verified: false, note: '' },
          ],
          source: { url: 'https://claude.com/pricing', checkedAt: chk }, verified: false },
        { id: 'claude-api', name: 'API a consumo', price: { amount: 0, currency: 'USD', period: 'usage' }, models: ['claude-opus', 'claude-sonnet', 'claude-haiku'],
          limits: [
            { id: 'spend', label: 'Spesa nel mese', unit: 'usd', value: null, window: { type: 'monthly' }, models: null, status: 'personale', verified: true, note: 'Dati ufficiali via proxy (Usage & Cost Admin API).' },
            { id: 'tokens', label: 'Token nel mese', unit: 'tokens', value: null, window: { type: 'monthly' }, models: null, status: 'personale', verified: true, note: '' },
          ],
          source: { url: 'https://docs.claude.com/en/api/usage-cost-api', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'google', name: 'Gemini / Google', url: 'https://gemini.google.com', domains: ['gemini.google.com'], usageApi: null,
      plans: [
        { id: 'gemini-free', name: 'Gratuito', price: { amount: 0, currency: 'EUR', period: 'month' }, models: ['gemini-flash', 'gemini-pro'],
          limits: [{ id: 'prompts-pro', label: 'Prompt modello Pro al giorno', unit: 'messages', value: null, window: { type: 'daily' }, models: ['gemini-pro'], status: 'pubblicato', verified: false, note: 'Valori nel Centro assistenza Gemini ("limiti di utilizzo"): inseriscili dopo averli verificati.' }],
          source: { url: 'https://support.google.com/gemini/answer/16275805', checkedAt: chk }, verified: false },
        { id: 'gemini-pro-plan', name: 'Google AI Pro', price: { amount: 21.99, currency: 'EUR', period: 'month' }, models: ['gemini-flash', 'gemini-pro', 'gemini-image'],
          limits: [
            { id: 'prompts-pro', label: 'Prompt modello Pro al giorno', unit: 'messages', value: null, window: { type: 'daily' }, models: ['gemini-pro'], status: 'pubblicato', verified: false, note: 'Verifica il valore nel Centro assistenza.' },
            { id: 'deep-research', label: 'Report Deep Research al giorno', unit: 'requests', value: null, window: { type: 'daily' }, models: null, status: 'pubblicato', verified: false, note: '' },
          ],
          source: { url: 'https://one.google.com/about/ai-premium', checkedAt: chk }, verified: false },
        { id: 'gemini-ultra', name: 'Google AI Ultra', price: { amount: 274.99, currency: 'EUR', period: 'month' }, models: ['gemini-flash', 'gemini-pro', 'gemini-image'],
          limits: [{ id: 'prompts-pro', label: 'Prompt modello Pro al giorno', unit: 'messages', value: null, window: { type: 'daily' }, models: ['gemini-pro'], status: 'pubblicato', verified: false, note: '' }],
          source: { url: 'https://one.google.com/about/ai-premium', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai', domains: ['www.perplexity.ai', 'perplexity.ai'], usageApi: null,
      plans: [
        { id: 'pplx-pro', name: 'Pro', price: { amount: 20, currency: 'USD', period: 'month' }, models: ['pplx-search', 'pplx-research'],
          limits: [{ id: 'pro-search', label: 'Ricerche Pro al giorno', unit: 'searches', value: null, window: { type: 'daily' }, models: ['pplx-research'], status: 'dinamico', verified: false, note: 'Limite comunicato in modo variabile: verifica nelle impostazioni dell\'account.' }],
          source: { url: 'https://www.perplexity.ai/pro', checkedAt: chk }, verified: false },
        { id: 'pplx-max', name: 'Max', price: { amount: 200, currency: 'USD', period: 'month' }, models: ['pplx-search', 'pplx-research'],
          limits: [{ id: 'pro-search', label: 'Ricerche avanzate', unit: 'searches', value: null, window: { type: 'daily' }, models: null, status: 'non_pubblicato', verified: false, note: '' }],
          source: { url: 'https://www.perplexity.ai/pro', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'microsoft', name: 'Microsoft Copilot', url: 'https://copilot.microsoft.com', domains: ['copilot.microsoft.com'], usageApi: null,
      plans: [
        { id: 'copilot-free', name: 'Copilot gratuito', price: { amount: 0, currency: 'EUR', period: 'month' }, models: ['copilot-main', 'copilot-think'],
          limits: [{ id: 'think', label: 'Risposte "Think Deeper"', unit: 'messages', value: null, window: { type: 'daily' }, models: ['copilot-think'], status: 'non_pubblicato', verified: false, note: '' }],
          source: { url: 'https://www.microsoft.com/microsoft-copilot', checkedAt: chk }, verified: false },
        { id: 'm365-premium', name: 'Microsoft 365 Premium / Copilot Pro', price: { amount: 22, currency: 'EUR', period: 'month' }, models: ['copilot-main', 'copilot-think', 'copilot-image'],
          limits: [{ id: 'credits', label: 'Crediti AI (app Microsoft 365)', unit: 'credits', value: null, window: { type: 'monthly' }, models: null, status: 'non_pubblicato', verified: false, note: 'Verifica crediti e piano disponibili nel tuo paese.' }],
          source: { url: 'https://www.microsoft.com/microsoft-365/copilot', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'xai', name: 'Grok / xAI', url: 'https://grok.com', domains: ['grok.com'], usageApi: null,
      plans: [
        { id: 'supergrok', name: 'SuperGrok', price: { amount: 30, currency: 'USD', period: 'month' }, models: ['grok-main', 'grok-fast', 'grok-image'],
          limits: [{ id: 'queries', label: 'Richieste per finestra', unit: 'requests', value: null, window: { type: 'rolling', hours: 2 }, models: null, status: 'dinamico', verified: false, note: 'Finestra e quantità non verificate.' }],
          source: { url: 'https://grok.com/plans', checkedAt: chk }, verified: false },
        { id: 'supergrok-heavy', name: 'SuperGrok Heavy', price: { amount: 300, currency: 'USD', period: 'month' }, models: ['grok-main', 'grok-heavy', 'grok-fast', 'grok-image'],
          limits: [{ id: 'queries', label: 'Richieste per finestra', unit: 'requests', value: null, window: { type: 'rolling', hours: 2 }, models: null, status: 'non_pubblicato', verified: false, note: '' }],
          source: { url: 'https://grok.com/plans', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', domains: ['chat.deepseek.com'], usageApi: 'deepseek',
      plans: [
        { id: 'deepseek-chat', name: 'Chat gratuita', price: { amount: 0, currency: 'USD', period: 'month' }, models: ['deepseek-chat', 'deepseek-reasoner'],
          limits: [{ id: 'msgs', label: 'Messaggi', unit: 'messages', value: null, window: { type: 'daily' }, models: null, status: 'non_pubblicato', verified: false, note: '' }],
          source: { url: 'https://chat.deepseek.com', checkedAt: chk }, verified: false },
        { id: 'deepseek-api', name: 'API a credito prepagato', price: { amount: 0, currency: 'USD', period: 'usage' }, models: ['deepseek-chat', 'deepseek-reasoner'],
          limits: [{ id: 'balance', label: 'Credito residuo', unit: 'usd', value: null, window: { type: 'none' }, models: null, status: 'pubblicato', verified: true, note: 'Saldo ufficiale tramite endpoint /user/balance (proxy).' }],
          source: { url: 'https://api-docs.deepseek.com/api/get-user-balance', checkedAt: chk }, verified: false },
      ],
    },
    {
      id: 'mistral', name: 'Mistral (Le Chat)', url: 'https://chat.mistral.ai', domains: ['chat.mistral.ai'], usageApi: null,
      plans: [
        { id: 'lechat-free', name: 'Free', price: { amount: 0, currency: 'EUR', period: 'month' }, models: ['mistral-main', 'mistral-reasoning'],
          limits: [{ id: 'msgs', label: 'Messaggi', unit: 'messages', value: null, window: { type: 'daily' }, models: null, status: 'non_pubblicato', verified: false, note: '' }],
          source: { url: 'https://mistral.ai/pricing', checkedAt: chk }, verified: false },
        { id: 'lechat-pro', name: 'Pro', price: { amount: 14.99, currency: 'EUR', period: 'month' }, models: ['mistral-main', 'mistral-reasoning', 'mistral-image'],
          limits: [{ id: 'msgs', label: 'Messaggi', unit: 'messages', value: null, window: { type: 'daily' }, models: null, status: 'non_pubblicato', verified: false, note: '' }],
          source: { url: 'https://mistral.ai/pricing', checkedAt: chk }, verified: false },
      ],
    },
  ],

  // caps: reasoning, writing, coding, math, research, speed, vision, images, longContext, data (0–5)
  // costWeight: consumo relativo di risorse/quota (1 = leggero … 10 = molto oneroso). STIMA EDITORIALE.
  models: [
    m('gpt-main', 'openai', 'GPT – modello principale', 4, 5, { reasoning: 4, writing: 5, coding: 4, math: 4, research: 4, speed: 4, vision: 4, images: 0, longContext: 4, data: 4 }),
    m('gpt-thinking', 'openai', 'GPT – ragionamento (Thinking)', 5, 8, { reasoning: 5, writing: 4, coding: 5, math: 5, research: 5, speed: 2, vision: 4, images: 0, longContext: 4, data: 5 }),
    m('gpt-mini', 'openai', 'GPT – mini (veloce)', 2, 1, { reasoning: 3, writing: 3, coding: 3, math: 3, research: 2, speed: 5, vision: 3, images: 0, longContext: 3, data: 3 }),
    m('gpt-image', 'openai', 'ChatGPT – generazione immagini', 3, 6, { reasoning: 0, writing: 0, coding: 0, math: 0, research: 0, speed: 2, vision: 3, images: 5, longContext: 0, data: 0 }),
    m('claude-opus', 'anthropic', 'Claude Opus', 5, 9, { reasoning: 5, writing: 5, coding: 5, math: 5, research: 5, speed: 2, vision: 4, images: 0, longContext: 5, data: 5 }),
    m('claude-sonnet', 'anthropic', 'Claude Sonnet', 4, 4, { reasoning: 4, writing: 5, coding: 5, math: 4, research: 4, speed: 4, vision: 4, images: 0, longContext: 5, data: 4 }),
    m('claude-haiku', 'anthropic', 'Claude Haiku', 2, 1, { reasoning: 3, writing: 4, coding: 3, math: 3, research: 2, speed: 5, vision: 3, images: 0, longContext: 4, data: 3 }),
    m('gemini-pro', 'google', 'Gemini Pro', 5, 6, { reasoning: 5, writing: 4, coding: 5, math: 5, research: 5, speed: 3, vision: 5, images: 0, longContext: 5, data: 5 }),
    m('gemini-flash', 'google', 'Gemini Flash', 3, 1, { reasoning: 3, writing: 4, coding: 3, math: 3, research: 3, speed: 5, vision: 4, images: 0, longContext: 5, data: 3 }),
    m('gemini-image', 'google', 'Gemini – generazione immagini', 3, 5, { reasoning: 0, writing: 0, coding: 0, math: 0, research: 0, speed: 3, vision: 4, images: 5, longContext: 0, data: 0 }),
    m('pplx-search', 'perplexity', 'Perplexity – ricerca rapida', 2, 1, { reasoning: 2, writing: 3, coding: 2, math: 2, research: 4, speed: 5, vision: 2, images: 0, longContext: 2, data: 2 }),
    m('pplx-research', 'perplexity', 'Perplexity – ricerca approfondita', 4, 6, { reasoning: 4, writing: 4, coding: 2, math: 3, research: 5, speed: 1, vision: 2, images: 0, longContext: 3, data: 3 }),
    m('copilot-main', 'microsoft', 'Copilot – risposta rapida', 3, 2, { reasoning: 3, writing: 4, coding: 3, math: 3, research: 3, speed: 4, vision: 3, images: 0, longContext: 3, data: 3 }),
    m('copilot-think', 'microsoft', 'Copilot – Think Deeper', 4, 6, { reasoning: 4, writing: 4, coding: 4, math: 4, research: 4, speed: 2, vision: 3, images: 0, longContext: 3, data: 4 }),
    m('copilot-image', 'microsoft', 'Copilot – immagini', 3, 5, { reasoning: 0, writing: 0, coding: 0, math: 0, research: 0, speed: 3, vision: 3, images: 4, longContext: 0, data: 0 }),
    m('grok-main', 'xai', 'Grok – modello principale', 4, 5, { reasoning: 4, writing: 4, coding: 4, math: 4, research: 4, speed: 3, vision: 3, images: 0, longContext: 4, data: 4 }),
    m('grok-fast', 'xai', 'Grok – veloce', 2, 1, { reasoning: 3, writing: 3, coding: 3, math: 3, research: 3, speed: 5, vision: 2, images: 0, longContext: 3, data: 3 }),
    m('grok-heavy', 'xai', 'Grok Heavy', 5, 10, { reasoning: 5, writing: 4, coding: 5, math: 5, research: 5, speed: 1, vision: 3, images: 0, longContext: 4, data: 5 }),
    m('grok-image', 'xai', 'Grok – immagini', 3, 5, { reasoning: 0, writing: 0, coding: 0, math: 0, research: 0, speed: 3, vision: 3, images: 4, longContext: 0, data: 0 }),
    m('deepseek-chat', 'deepseek', 'DeepSeek – chat', 3, 1, { reasoning: 3, writing: 3, coding: 4, math: 4, research: 2, speed: 4, vision: 1, images: 0, longContext: 3, data: 3 }),
    m('deepseek-reasoner', 'deepseek', 'DeepSeek – ragionamento', 4, 3, { reasoning: 4, writing: 3, coding: 4, math: 5, research: 3, speed: 2, vision: 1, images: 0, longContext: 3, data: 4 }),
    m('mistral-main', 'mistral', 'Mistral – modello principale', 3, 2, { reasoning: 3, writing: 4, coding: 3, math: 3, research: 3, speed: 5, vision: 3, images: 0, longContext: 3, data: 3 }),
    m('mistral-reasoning', 'mistral', 'Mistral – ragionamento (Magistral)', 4, 4, { reasoning: 4, writing: 3, coding: 4, math: 4, research: 3, speed: 3, vision: 2, images: 0, longContext: 3, data: 4 }),
    m('mistral-image', 'mistral', 'Le Chat – immagini', 3, 4, { reasoning: 0, writing: 0, coding: 0, math: 0, research: 0, speed: 3, vision: 3, images: 4, longContext: 0, data: 0 }),
  ],
};

function m(id, providerId, name, tier, costWeight, caps) {
  return { id, providerId, name, tier, costWeight, caps, profileSource: 'stima editoriale', note: 'Nome e profilo da verificare: le versioni dei modelli cambiano spesso.' };
}

export function findProvider(catalog, id) { return catalog.providers.find(p => p.id === id) ?? null; }
export function findPlan(catalog, providerId, planId) { return findProvider(catalog, providerId)?.plans.find(p => p.id === planId) ?? null; }
export function findModel(catalog, id) { return catalog.models.find(x => x.id === id) ?? null; }

/**
 * Unisce un aggiornamento del catalogo (es. file JSON da fonte ufficiale) preservando
 * le verifiche fatte dall'utente quando l'aggiornamento non è più recente.
 */
export function mergeCatalog(base, update) {
  const out = structuredClone(base);
  for (const up of update.providers ?? []) {
    const i = out.providers.findIndex(p => p.id === up.id);
    if (i < 0) { out.providers.push(structuredClone(up)); continue; }
    const cur = out.providers[i];
    const plans = [...cur.plans];
    for (const pl of up.plans ?? []) {
      const j = plans.findIndex(p => p.id === pl.id);
      if (j < 0) plans.push(structuredClone(pl)); else plans[j] = { ...plans[j], ...structuredClone(pl) };
    }
    out.providers[i] = { ...cur, ...structuredClone(up), plans };
  }
  for (const mod of update.models ?? []) {
    const i = out.models.findIndex(x => x.id === mod.id);
    if (i < 0) out.models.push(structuredClone(mod)); else out.models[i] = { ...out.models[i], ...structuredClone(mod) };
  }
  out.version = update.version ?? out.version;
  out.updatedAt = update.updatedAt ?? new Date().toISOString().slice(0, 10);
  return out;
}

/** Validazione minima di un file di aggiornamento catalogo. Restituisce elenco errori. */
export function validateCatalog(cat) {
  const errs = [];
  if (!cat || typeof cat !== 'object') return ['Formato non valido'];
  for (const p of cat.providers ?? []) {
    if (!p.id || !p.name) errs.push('Fornitore senza id/nome');
    for (const pl of p.plans ?? []) {
      if (!pl.id || !pl.name) errs.push(`Piano senza id/nome in ${p.id}`);
      for (const l of pl.limits ?? []) {
        if (!l.unit) errs.push(`Limite senza unità in ${pl.id}`);
        if (l.value != null && typeof l.value !== 'number') errs.push(`Valore limite non numerico in ${pl.id}/${l.id}`);
      }
    }
  }
  return errs;
}
