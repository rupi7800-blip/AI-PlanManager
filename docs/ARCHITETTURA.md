# AI Plan Manager — Architettura tecnica (v1)

> Principio guida: **il miglior risultato con la minore quantità di risorse, tempo e denaro** —
> senza mai inventare dati e senza compromettere la qualità del lavoro.

## 1. Architettura in sintesi

```
┌──────────────────────────── Browser dell'utente ─────────────────────────────┐
│                                                                              │
│  PWA "AI Plan Manager" (app/)                 Estensione Chrome (extension/) │
│  ┌──────────────────────────────┐            ┌────────────────────────────┐  │
│  │ UI (js/ui/*)                 │            │ content/widget.js          │  │
│  │  Dashboard · Le mie AI · …   │            │  finestrella flottante     │  │
│  ├──────────────────────────────┤  snapshot  │  (Shadow DOM, solo lettura │  │
│  │ Core (js/core/*) — puro JS   │──────────► │   + registrazione manuale) │  │
│  │  monitor · forecast · alerts │ ◄───────── │ content/bridge.js          │  │
│  │  advisor · selector · indici │  eventi    │ background.js (notifiche)  │  │
│  │  catalog (DB piani)          │            └────────────────────────────┘  │
│  ├──────────────────────────────┤                                            │
│  │ store.js (localStorage)      │  notifiche interne / browser / desktop     │
│  │ notify.js · bridge.js · sw.js│                                            │
│  └──────────────┬───────────────┘                                            │
└─────────────────┼────────────────────────────────────────────────────────────┘
                  │ (facoltativo, solo dati ufficiali)
                  ▼
     server/proxy.mjs  ── chiavi API custodite lato server ──►  API OpenAI / Anthropic / DeepSeek
```

Moduli separati come richiesto:

| Livello | Dove | Responsabilità |
|---|---|---|
| Interfaccia utente | `app/js/ui/` | 8 schermate, componenti, grafici SVG |
| Motore di monitoraggio | `app/js/core/monitor.js`, `time.js` | finestre temporali, contatori, livelli colore |
| Database dei piani | `app/js/core/catalog.js` | fornitori, piani, limiti, modelli, fonti, stato verifica |
| Motore di analisi | `forecast.js`, `advisor.js`, `selector.js`, `indices.js`, `history.js` | previsioni, consigli, scelta modello, indici |
| Sistema di notifiche | `core/alerts.js` (regole) + `app/js/notify.js` (canali) + `extension/background.js` | soglie, deduplica, consegna |
| Integrazioni fornitori | `server/proxy.mjs` + `app/js/integrations.js` | dati ufficiali via API (solo dove esistono) |
| Estensione browser | `extension/` | finestrella flottante, ponte dati, notifiche desktop |

Il **core è JavaScript puro senza dipendenze dal DOM**: gli stessi moduli girano nel browser e nei test Node.
Aggiungere una piattaforma = aggiungere un oggetto in `catalog.js` (o importarlo in JSON dall'app): nessun
altro file va modificato, perché tutto il motore lavora su *limiti tipizzati* (unità + finestra + attendibilità).

## 2. Tecnologie scelte

| Scelta | Motivo |
|---|---|
| HTML + CSS + JavaScript ES Modules, **nessun build step** | zero dipendenze, zero costi, caricamento istantaneo, manutenzione semplice |
| PWA (manifest + service worker cache-first) | installabile su PC e smartphone, funziona offline |
| `localStorage` versionato | database locale leggero; dati sempre sul dispositivo dell'utente |
| Grafici SVG scritti a mano | nessuna libreria esterna, accessibili, leggeri |
| Chrome Extension Manifest V3 | finestrella sulle pagine AI con permessi minimi (`storage`, `notifications`) |
| Node.js ≥ 18 senza dipendenze (`server/proxy.mjs`) | proxy opzionale per chiavi API; deployabile su qualunque host o in locale |
| `node --test` + Playwright | test unitari del motore e test end-to-end dell'interfaccia |
| Hosting statico (GitHub Pages / qualsiasi CDN) | costo di gestione zero |

## 3. Modalità di acquisizione dei dati

Ogni dato porta con sé la propria **fonte**, mostrata sempre in interfaccia con un badge:

| Fonte | Badge | Come si ottiene | Attendibilità |
|---|---|---|---|
| `ufficiale` | ● Ufficiale | API del fornitore tramite proxy (es. OpenAI Usage API, Anthropic Usage & Cost API, DeepSeek balance) | alta |
| `integrazione` | ◐ Integrazione | lettura che l'utente copia dalla pagina "Utilizzo" del fornitore (es. barra % di Claude) con data/ora | media-alta (dato del fornitore, trascritto) |
| `manuale` | ○ Manuale | registrazione dell'utente (app, pulsante "+1" della finestrella) | media (dipende dalla costanza) |
| `stima` | ◌ Stima | calcolata dall'app (previsioni, valori derivati, conteggio automatico opzionale) | bassa — sempre etichettata |

Regole: un valore combinato eredita l'attendibilità **più bassa** tra le sue fonti; le stime non vengono mai
mostrate come dati ufficiali; se un limite non è pubblicato la percentuale **non viene calcolata** (si mostra
"limite non pubblicato") a meno che l'utente non imposti un proprio limite personale, chiaramente indicato.

**Nessuno scraping, nessuna password.** L'estensione non legge il contenuto delle conversazioni né le pagine di
utilizzo dei fornitori. Il conteggio automatico degli invii è opzionale, disattivato per default, conta solo il
tasto Invio premuto dall'utente nella casella di testo e produce dati con fonte `stima`.

## 4. Limiti tecnici delle singole piattaforme (stato noto, da verificare periodicamente)

| Piattaforma | Abbonamento consumer | API dei consumi | Cosa può fare l'app |
|---|---|---|---|
| ChatGPT / OpenAI | limiti per modello, dinamici, non tutti pubblicati | Usage & Costs API **solo per account API** (chiave admin) | consumer: manuale/integrazione; API: ufficiale via proxy |
| Claude / Anthropic | limite di sessione (finestra ~5 h) + limiti settimanali, mostrati in % nelle impostazioni | Usage & Cost Admin API **solo per organizzazioni API** | consumer: lettura % (integrazione) + manuale; API: ufficiale via proxy |
| Gemini / Google | limiti giornalieri per funzione indicati nel centro assistenza | nessuna API consumer | manuale/integrazione |
| Perplexity | limiti giornalieri su ricerche Pro (variabili) | nessuna API consumer | manuale |
| Microsoft Copilot | limiti/crediti variabili per funzione | nessuna API consumer | manuale |
| Grok / xAI | limiti per finestra temporale, non sempre pubblicati | nessuna API consumer | manuale |
| DeepSeek | chat gratuita | API a consumo con endpoint saldo (`/user/balance`) | saldo ufficiale via proxy |
| Mistral (Le Chat) | limiti indicati nel piano | nessuna API consumer | manuale |

Tutti i prezzi e limiti nel database iniziale sono marcati **"non verificato"** con link alla fonte ufficiale:
l'utente (o un aggiornamento JSON) li conferma e la data di verifica viene registrata.

## 5. Struttura del database (localStorage, chiave `aipm.state.v1`)

```text
State {
  version: 1
  catalog: {
    updatedAt, providers: [ Provider ], models: [ Model ]
  }
  subscriptions: [ Subscription ]
  events:   [ UsageEvent ]      // consumo registrato
  readings: [ Reading ]         // letture puntuali di un contatore del fornitore
  alertsFired: { [dedupKey]: ISO }   // anti-duplicazione notifiche
  inbox:    [ Notification ]    // notifiche interne
  settings: Settings
}

Provider   { id, name, url, domains[], usageApi: 'openai'|'anthropic'|'deepseek'|null, plans: [Plan] }
Plan       { id, name, price:{amount,currency,period:'month'|'year'|'usage'}, models:[modelId],
             limits:[LimitDef], resetInfo, source:{url, checkedAt|null}, verified:boolean, note }
LimitDef   { id, label, unit:'messages'|'requests'|'tokens'|'credits'|'searches'|'images'|'minutes'|'sessions'|'usd',
             value:number|null, window:{type:'rolling'|'daily'|'weekly'|'monthly'|'billing', hours?},
             models:[modelId]|null, status:'pubblicato'|'dinamico'|'non_pubblicato'|'personale', verified:boolean, note }
Model      { id, providerId, name, tier:1..5, costWeight, caps:{reasoning,writing,coding,math,research,speed,
             vision,images,longContext,data} (0..5), profileSource:'stima editoriale', note }
Subscription { id, providerId, planId|null, name, cost:{amount,currency,period}, renewalDate, startedAt,
             models:[modelId], limits:[LimitDef + personale], levels:{yellow,orange,red},
             thresholds:[50,70,85,95,100], caps:{daily,weekly,monthly,budgetMonthly,maxMinutes,maxRequests,maxSessions},
             notify:{inapp,browser,desktop,push}, active }
UsageEvent { id, subId, ts, unit, amount, modelId?, task?, source, durationMin?, outcome?:'completata'|'abbandonata',
             regenerations?, quality?:1..5, minutesSaved?, note? }
Reading    { id, subId, limitId, ts, usedPct?|used?, resetAt?, source:'integrazione'|'ufficiale' }
Settings   { currency, hourlyValue|null, notifications:{inapp,browser,desktop,push}, proxy:{url,token},
             widget:{opacity, fields[]}, theme }
```

Esportazione: JSON completo (backup/ripristino) e CSV degli eventi.

## 6. Piano di sviluppo per fasi

| Fase | Contenuto | Stato |
|---|---|---|
| **1 — MVP** | Dashboard, gestione abbonamenti, contatori, letture, alert e limiti personalizzabili, consulente, selettore modelli, indici, storico, export, PWA offline, estensione con finestrella | **questa versione** |
| 2 — Dati ufficiali | proxy per OpenAI/Anthropic/DeepSeek (incluso, sperimentale), pianificazione aggiornamenti catalogo da JSON firmato | parziale |
| 3 — Sync multi-dispositivo | backend leggero (es. Supabase) con autenticazione, cifratura lato client, push notifications | da fare |
| 4 — Analisi avanzate | qualità per tipologia di attività, benchmark esterni aggiornati, suggerimenti personalizzati appresi | da fare |

## 7. Formule degli indici (documentate anche nell'app)

* **Costo mensile normalizzato** `Cm` = prezzo mensile, oppure prezzo annuale / 12.
* **Sessione** = gruppo di eventi della stessa AI separati da meno di 30 minuti.
* **Costo per sessione** = `Cm` / sessioni nel periodo (rapportato a 30 giorni).
* **Costo per attività completata** = `Cm` / eventi con esito "completata" (se registrati).
* **Unità per euro** = unità consumate / `Cm`.
* **Tempo medio per attività** = media `durationMin` degli eventi che lo riportano.
* **Richieste per attività** = richieste / attività completate.
* **Tasso di completamento** = completate / (completate + abbandonate).
* **Tasso di rigenerazione** = Σ rigenerazioni / richieste.
* **% utilizzo** = usato / limite (solo se il limite è noto o personale).
* **Regolarità** = 1 − CV dei consumi giornalieri (CV = deviazione standard / media), limitata a [0,1].
* **Qualità per richiesta** = qualità media (1–5) / richieste medie per attività.
* **Minuti risparmiati per euro** = Σ minutesSaved / `Cm`.
* **Valore potenziale** = (Σ minutesSaved / 60) × tariffa oraria **impostata dall'utente**; senza tariffa non viene calcolato.

## 8. Sicurezza e privacy

* Nessuna password delle piattaforme AI viene richiesta o memorizzata.
* Le chiavi API restano **solo** nelle variabili d'ambiente del proxy; il browser conosce solo un token di accesso
  al proprio proxy. CORS limitato all'origine dell'app.
* Tutti i dati restano sul dispositivo; esportazione/backup sotto controllo dell'utente.
* L'estensione usa soli permessi `storage` e `notifications` e content script sui domini AI dichiarati.
