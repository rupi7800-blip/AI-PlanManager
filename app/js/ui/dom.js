// Piccole utility DOM, componenti condivisi e grafici SVG senza dipendenze.
import { LEVELS } from '../core/monitor.js';
import { SOURCES, fmtNum, fmtDuration, unitLabel } from '../core/units.js';
import { fmtDateTime } from '../core/time.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const PROVIDER_COLOR = { openai: 1, anthropic: 2, google: 0, perplexity: 2, microsoft: 6, xai: 7, deepseek: 0, mistral: 3 };
export function avatar(providerId, name) {
  const c = SERIES[PROVIDER_COLOR[providerId] ?? 6];
  return `<span class="avatar" style="background:${c}" aria-hidden="true">${esc((name || '?').trim()[0].toUpperCase())}</span>`;
}

export function status(level, text) {
  const L = LEVELS[level] ?? LEVELS.unknown;
  return `<span class="status st-${level}"><span class="dot">${L.icon}</span>${esc(text ?? L.label)}</span>`;
}

export function sourceBadge(source) {
  if (!source) return '<span class="src">— nessun dato</span>';
  const S = SOURCES[source];
  return `<span class="src src-${source}" title="${esc(S.desc)}">${S.icon} ${esc(S.label)}</span>`;
}

export function meter(pct, level, projectedPct) {
  if (pct == null) return '<div class="meter unknown" role="img" aria-label="Percentuale non disponibile"></div>';
  const w = Math.min(100, Math.max(0, pct));
  const proj = projectedPct != null && projectedPct > pct ? `<i class="proj" style="left:0;width:${Math.min(100, projectedPct)}%" title="Proiezione al ripristino (stima)"></i>` : '';
  return `<div class="meter lv-${level}" role="meter" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${w}%"></span>${proj}</div>`;
}

/** Blocco di un limite (usato in dashboard, Le mie AI, Consumi). */
export function limitBlock(st, forecast) {
  const unit = unitLabel(st.unit).toLowerCase();
  let main;
  if (st.unit === 'percent') main = st.used != null ? `<b class="num">${Math.round(st.used)}%</b>` : '<span class="muted">non disponibile</span>';
  else if (st.limitValue != null) main = `<b class="num">${fmtNum(st.used)}</b> <span class="muted">/ ${fmtNum(st.limitValue)} ${esc(unit)}</span>`;
  else if (st.remaining != null) main = `<b class="num">${fmtNum(st.remaining, 2)}</b> <span class="muted">${esc(unit)} residui</span>`;
  else main = st.used != null && st.hasData ? `<b class="num">${fmtNum(st.used)}</b> <span class="muted">${esc(unit)} · limite non noto</span>` : '<span class="muted">nessun dato</span>';
  const meta = [];
  meta.push(sourceBadge(st.source));
  if (st.basis === 'personale') meta.push('<span class="tag">limite personale</span>');
  else if (st.limitValue != null && !st.limitVerified) meta.push('<span class="tag warn">limite non verificato</span>');
  if (st.limitStatus === 'dinamico') meta.push('<span class="tag warn">limite dinamico</span>');
  if (st.pct != null && st.unit !== 'percent') meta.push(`<span class="num">${Math.round(st.pct)}%</span>`);
  if (st.remaining != null && st.limitValue != null) meta.push(`<span>Residuo: <b class="num">${fmtNum(st.remaining)}${st.unit === 'percent' ? '%' : ''}</b></span>`);
  if (st.resetAt) meta.push(`<span title="${esc(fmtDateTime(st.resetAt))}">↻ ripristino tra <b>${fmtDuration(st.msToReset)}</b>${st.resetFromReading ? '' : st.window?.type === 'rolling' ? ' (stima)' : ''}</span>`);
  else if (st.window?.type === 'none') meta.push('<span>nessun ripristino automatico</span>');
  if (forecast?.available && forecast.willExceed) meta.push(`<span class="st-orange">⚠ esaurimento stimato ${esc(fmtDateTime(forecast.exhaustAt))}</span>`);
  return `<div class="limit">
    <div class="head"><span>${esc(st.label)}</span><span>${main}</span></div>
    ${meter(st.pct, st.level, forecast?.available ? forecast.projectedPct : null)}
    <div class="meta">${meta.join('')}</div>
  </div>`;
}

let tipEl = null;
function chartTip(container) {
  container.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tipEl?.remove(); tipEl = null; return; }
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'chart-tip'; container.appendChild(tipEl); }
    const r = container.getBoundingClientRect();
    tipEl.textContent = t.dataset.tip;
    tipEl.style.left = `${e.clientX - r.left}px`; tipEl.style.top = `${e.clientY - r.top}px`;
  });
  container.addEventListener('pointerleave', () => { tipEl?.remove(); tipEl = null; });
}

/**
 * Grafico a barre impilate. data = { labels[], series: [{name, color, values[]}] }
 */
export function stackedBars(el, data, { height = 180, unit = 'utilizzi' } = {}) {
  const W = Math.max(300, Math.min(900, el.clientWidth || 640)), H = height, pad = { l: 34, r: 6, t: 8, b: 22 };
  const n = data.labels.length;
  const totals = data.labels.map((_, i) => data.series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = Math.max(1, ...totals);
  const nice = niceMax(max);
  const bw = (W - pad.l - pad.r) / n;
  const barW = Math.max(2, Math.min(28, bw - 3));
  const y = v => H - pad.b - (v / nice) * (H - pad.t - pad.b);
  let svg = '';
  for (let k = 0; k <= 4; k++) {
    const v = (nice / 4) * k, yy = y(v);
    svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text class="axis" x="${pad.l - 6}" y="${yy + 3}" text-anchor="end">${fmtNum(v)}</text>`;
  }
  const every = Math.ceil(n / 12);
  data.labels.forEach((lab, i) => {
    const x = pad.l + i * bw + (bw - barW) / 2;
    let acc = 0;
    const segs = data.series.filter(s => s.values[i]);
    segs.forEach((s, j) => {
      const v = s.values[i];
      const y1 = y(acc + v), y0 = y(acc);
      const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
      const top = j === segs.length - 1;
      svg += `<rect class="bar" x="${x}" y="${y1}" width="${barW}" height="${h}" rx="${top ? 3 : 0}" fill="${s.color}" data-tip="${esc(`${lab} · ${s.name}: ${fmtNum(v)} ${unit}`)}"/>`;
      acc += v;
    });
    if (i % every === 0) svg += `<text class="axis" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${esc(lab)}</text>`;
    svg += `<rect x="${pad.l + i * bw}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}" fill="transparent" data-tip="${esc(`${lab}: ${fmtNum(totals[i])} ${unit} in totale`)}"/>`;
  });
  const legend = data.series.length > 1
    ? `<div class="legend">${data.series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico ${esc(unit)}">${svg}</svg></div>${legend}`;
  chartTip(el.querySelector('.chart'));
  // svg data-tip sulle barre è sotto le aree trasparenti: le aree totali sono disegnate dopo → metti barre sopra
  const svgEl = el.querySelector('svg');
  $$('rect.bar', svgEl).forEach(r => svgEl.appendChild(r));
}

/** Barre orizzontali semplici per classifiche. items=[{label, value, color?, text?}] */
export function hBars(items, { unit = '' } = {}) {
  if (!items.length) return '<p class="muted small">Nessun dato nel periodo.</p>';
  const max = Math.max(...items.map(i => i.value), 1);
  return `<div class="stack">${items.map((it, i) => `
    <div><div class="row between small"><span>${esc(it.label)}</span><span class="num text2">${esc(it.text ?? `${fmtNum(it.value)} ${unit}`)}</span></div>
    <div class="meter" style="height:6px"><span style="width:${(it.value / max) * 100}%;background:${it.color ?? SERIES[0]}"></span></div></div>`).join('')}</div>`;
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/* Modale */
export function openModal({ title, body, onSubmit, submitLabel = 'Salva', wide = false }) {
  const dlg = document.createElement('dialog');
  if (wide) dlg.style.width = 'min(820px, calc(100vw - 32px))';
  dlg.innerHTML = `<form method="dialog" novalidate>
    <div class="dlg-head"><h2 style="margin:0">${esc(title)}</h2><button type="button" class="ghost" data-close aria-label="Chiudi">✕</button></div>
    <div class="dlg-body">${body}</div>
    <div class="dlg-foot"><button type="button" data-close>Annulla</button>${onSubmit ? `<button class="primary" value="ok">${esc(submitLabel)}</button>` : ''}</div>
  </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('close', () => dlg.remove());
  form.addEventListener('submit', (e) => {
    if (!onSubmit) return;
    e.preventDefault();
    try {
      const ok = onSubmit(new FormData(form), dlg);
      if (ok !== false) dlg.close();
    } catch (err) { toast(err.message || String(err)); }
  });
  dlg.showModal();
  return dlg;
}

export function toast(msg, ms = 3800) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => t.remove(), ms);
}

export function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function options(list, selected) {
  return list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

export function toLocalInput(t) {
  const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
