# AI Plan Manager

Applicazione web installabile (PWA) + estensione browser per **monitorare, ottimizzare e gestire gli abbonamenti alle AI**
(ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, DeepSeek, Mistral e servizi personalizzati).

> Il miglior risultato con la minore quantità di risorse, tempo e denaro — senza inventare dati.

Architettura, tecnologie, modalità di acquisizione dei dati, limiti delle piattaforme, struttura del database
e piano per fasi: **[docs/ARCHITETTURA.md](docs/ARCHITETTURA.md)**.

## Cosa fa (v1)

| Sezione | Funzioni |
|---|---|
| **Dashboard** | servizi attivi, spesa mensile (valute non mescolate), % utilizzo, tempo al ripristino, rinnovi, avvisi, schede per servizio con semaforo verde/giallo/arancione/rosso, grafico 7 g / 30 g / 12 m |
| **Le mie AI** | aggiunta guidata da database dei piani, servizi personalizzati, costo, rinnovo, modelli, limiti del fornitore e limiti personali (giornaliero, settimanale, mensile, budget, tempo, richieste, sessioni) |
| **Consumi** | contatori per unità (messaggi, richieste, token, crediti, minuti, sessioni, frequenza), letture del contatore del fornitore, ritmo attuale/sostenibile, previsione di esaurimento |
| **Consulente** | avvisi di esaurimento anticipato con ritmo massimo consigliato, alternative disponibili, sottoutilizzo, modelli sovradimensionati, rigenerazioni, costo per sessione |
| **Confronto modelli** | 13 tipologie di attività × 3 livelli di complessità; consiglia il modello *sufficiente* meno oneroso e disponibile, con motivazione, risparmio stimato e compromessi |
| **Indici di efficienza** | economici, operativi, di utilizzo, di rendimento — formule visibili; benchmark esterni con fonte, data, metodo, campione, attendibilità e limiti |
| **Storico** | 24 h / 7 g / 30 g / 90 g / 12 mesi, per servizio/modello/attività, sprechi stimati, esportazione CSV e JSON |
| **Impostazioni** | notifiche (interne, browser/desktop, estensione), finestrella, proxy dati ufficiali, aggiornamento del database dei piani, backup/ripristino |

### Regole di affidabilità applicate nel codice
- Ogni valore porta la sua **fonte** (Ufficiale ● · Integrazione ◐ · Manuale ○ · Stima ◌); un valore combinato prende la fonte meno attendibile.
- Se il limite non è pubblicato la **percentuale non viene calcolata**, salvo limite personale dichiarato come tale.
- Token, messaggi, richieste, crediti e % non vengono mai sommati o convertiti tra loro.
- Il catalogo iniziale **non contiene limiti numerici non verificati** (verificato da un test); prezzi marcati "non verificato" con link alla fonte.
- Le previsioni con limiti dinamici/non verificati sono etichettate "indicative".
- Nessuna password richiesta; chiavi API solo nel proxy lato server.

## Avvio rapido

```bash
npm start            # serve app/ su http://localhost:8080
npm test             # 31 test unitari (motore + proxy)
```
Nessuna dipendenza da installare (Node ≥ 18). Per installare l'app: apri l'indirizzo in Chrome/Edge/Safari → "Installa app" / "Aggiungi a Home".

**Pubblicazione gratuita**: il workflow `.github/workflows/pages.yml` esegue i test e pubblica la cartella `app/` su GitHub Pages a ogni push su `main`
(attivazione una tantum: *Settings → Pages → Source: GitHub Actions*). Indirizzo: https://rupi7800-blip.github.io/AI-PlanManager/

## Estensione (finestrella flottante)

1. Chrome → `chrome://extensions` → attiva *Modalità sviluppatore* → **Carica estensione non pacchettizzata** → cartella `extension/`.
2. Apri l'app una volta (localhost o `*.github.io`): l'estensione riceve i dati.
3. Su claude.ai, chatgpt.com, gemini.google.com ecc. compare la finestrella: compatta, clic per espanderla; trascinabile, ridimensionabile, minimizzabile, nascondibile per sito, trasparenza e campi configurabili; pulsante **+1** per registrare un utilizzo.

Permessi: solo `storage` e `notifications`, più i content script sui domini AI elencati e sulle pagine dell'app (il ponte si attiva solo dove esiste `<meta name="aipm-app">`).
Se pubblichi l'app su un dominio diverso, aggiungilo a `content_scripts[1].matches` in `extension/manifest.json`.
L'estensione **non legge** conversazioni o pagine di utilizzo dei fornitori; il modello in uso si seleziona a mano.
Il conteggio automatico degli invii è opzionale (off), conta solo il tasto Invio e produce dati "stima".

## Dati ufficiali (facoltativo)

Solo gli account **API** espongono consumi ufficiali. Il proxy `server/proxy.mjs` (zero dipendenze) custodisce le chiavi:

```bash
PROXY_TOKEN=$(openssl rand -hex 24) ALLOWED_ORIGIN=http://localhost:8080 \
ANTHROPIC_ADMIN_KEY=sk-ant-admin… OPENAI_ADMIN_KEY=… DEEPSEEK_API_KEY=… npm run proxy
```
Poi in Impostazioni inserisci URL e token del proxy e premi *Sincronizza ora*: i dati entrano come fonte **Ufficiale**.

| Fornitore | Endpoint | Stato del formato |
|---|---|---|
| Anthropic | `usage_report/messages`, `cost_report` (importi in centesimi) | verificato sulla documentazione ufficiale (nov 2026) |
| OpenAI | `organization/usage/completions`, `organization/costs` | **da verificare** — parsing difensivo |
| DeepSeek | `user/balance` | **da verificare** — parsing difensivo |

Gli abbonamenti consumer (ChatGPT Plus, Claude Pro, Gemini, …) non hanno API dei consumi: si usano letture del contatore della piattaforma (es. la % in Impostazioni › Utilizzo di Claude) e registrazioni manuali.

## Test

```bash
npm test                                   # unitari
npm start & node tests/e2e/smoke.mjs        # end-to-end app (Playwright)
node tests/e2e/extension.mjs                # estensione caricata in Chromium
```

## Struttura

```
app/                 PWA (index.html, sw.js, manifest, css, icons)
  js/core/           motore puro: catalog, monitor, time, forecast, alerts, advisor, selector, indices, history, export, snapshot, state
  js/ui/             8 schermate + componenti e grafici SVG
  js/store.js        persistenza locale · notify.js notifiche · bridge.js ponte estensione · integrations.js dati ufficiali
extension/           Chrome MV3: widget, bridge, background (notifiche), popup
server/proxy.mjs     proxy opzionale per i dati ufficiali
docs/                architettura
tests/               unitari ed end-to-end
```

## Limiti noti della v1
- Dati solo locali (nessuna sincronizzazione tra dispositivi: usa backup/ripristino). Sync cifrata e notifiche push remote: fase 3.
- I profili di capacità dei modelli e i prezzi sono stime/indicazioni da verificare; aggiornali importando un JSON del catalogo.
- Le finestre "scorrevoli" dei fornitori non pubblicate sono approssimate: il tempo al ripristino è indicato come stima.
