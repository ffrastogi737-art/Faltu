// Renders icons/icon.svg to the PNG sizes the web manifest needs (uses the preinstalled Playwright Chromium).
import { createRequire } from 'node:module';

// CommonJS require resolves the globally installed Playwright; install it with `npm i -D playwright` elsewhere.
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-maskable-512', 512, 0.12]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:#07090f;display:grid;place-items:center;height:100vh">
    <div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body>`);
  await page.screenshot({ path: new URL(`../icons/${name}.png`, import.meta.url).pathname });
}
await browser.close();
console.log('icons written');
