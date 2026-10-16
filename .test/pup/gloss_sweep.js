/* 光泽滑块量程检查：0（哑光）→ 1（镜面）四档，确认两端都可用、无破图 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const out = [];
  for (const g of [0, 0.4, 0.72, 1]) {
    const browser = await puppeteer.launch({
      executablePath: CHROME, headless: 'new',
      args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 520, height: 380, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:8123/index.html?test&settle=1&dist=0&count=20000&size=1.6&depth=1.0&solid=1&gloss=${g}`,
      { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    const label = await page.evaluate(() => document.getElementById('vGloss').textContent);
    await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
    await new Promise(r => setTimeout(r, 300));
    fs.writeFileSync(`../gloss_${String(g).replace('.', '')}.png`, await (await page.$('canvas')).screenshot());
    out.push({ gloss: g, label, errors });
    await browser.close();
  }
  console.log(JSON.stringify(out));
})();
