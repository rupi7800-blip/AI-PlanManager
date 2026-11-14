// Persistenza locale (localStorage) con versioning e notifica dei cambiamenti.
import { createState, normalizeState } from './core/state.js';

const KEY = 'aipm.state.v1';
let state = null;
const listeners = new Set();

export function load() {
  try { state = normalizeState(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { state = createState(); }
  return state;
}
export function getState() { return state ?? load(); }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('Salvataggio non riuscito', e); alert('Spazio di archiviazione locale esaurito: esporta un backup e cancella lo storico più vecchio.'); }
}

/** Applica una modifica allo stato, salva e notifica. */
export function update(fn) {
  fn(state);
  save();
  for (const l of listeners) l(state);
}
export function replace(newState) {
  state = normalizeState(newState);
  save();
  for (const l of listeners) l(state);
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Sincronizza tra schede aperte
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  load();
  for (const l of listeners) l(state);
});
