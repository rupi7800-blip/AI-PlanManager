// Esportazione CSV / JSON e importazione di backup.

import { findModel } from './catalog.js';

const COLS = ['id', 'data_ora', 'servizio', 'unita', 'quantita', 'modello', 'attivita', 'fonte', 'durata_min', 'esito', 'rigenerazioni', 'qualita', 'minuti_risparmiati', 'note'];

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  // protezione da formula injection nei fogli di calcolo
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function eventsToCSV(state, events = state.events) {
  const subName = id => state.subscriptions.find(s => s.id === id)?.name ?? id;
  const rows = [COLS.join(',')];
  for (const e of [...events].sort((a, b) => a.ts - b.ts)) {
    rows.push([
      e.id, new Date(e.ts).toISOString(), subName(e.subId), e.unit, e.amount,
      e.modelId ? (findModel(state.catalog, e.modelId)?.name ?? e.modelId) : '', e.task ?? '', e.source,
      e.durationMin ?? '', e.outcome ?? '', e.regenerations ?? '', e.quality ?? '', e.minutesSaved ?? '', e.note ?? '',
    ].map(csvCell).join(','));
  }
  return rows.join('\r\n');
}

export function stateToJSON(state) {
  const { settings, ...rest } = state;
  // il token del proxy non viene incluso nel backup
  const safeSettings = { ...settings, proxy: { ...(settings?.proxy ?? {}), token: '' } };
  return JSON.stringify({ app: 'ai-plan-manager', exportedAt: new Date().toISOString(), ...rest, settings: safeSettings }, null, 2);
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.app !== 'ai-plan-manager') throw new Error('Il file non è un backup di AI Plan Manager');
  for (const k of ['subscriptions', 'events', 'readings']) if (!Array.isArray(data[k])) throw new Error(`Backup incompleto: manca "${k}"`);
  return data;
}
