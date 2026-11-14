// Genera le icone PNG dall'SVG (richiede Playwright, solo in sviluppo).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../app/icons/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
const out = [
  ['app/icons/icon-192.png', 192, 0], ['app/icons/icon-512.png', 512, 0], ['app/icons/icon-maskable-512.png', 512, 0.12],
  ['extension/icons/icon-16.png', 16, 0], ['extension/icons/icon-32.png', 32, 0], ['extension/icons/icon-48.png', 48, 0], ['extension/icons/icon-128.png', 128, 0],
];
for (const [file, size, pad] of out) {
  await p.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await p.setContent(`<html><body style="margin:0;background:${pad ? '#2a78d6' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await p.screenshot({ path: file, omitBackground: !pad });
}
await b.close();
console.log('Icone generate');
