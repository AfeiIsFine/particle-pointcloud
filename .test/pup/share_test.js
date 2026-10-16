/* 验证打包后的 dist/index.html（file:// 双击场景）功能正常 */
const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--allow-file-access-from-files'],
  });
  for (const d of ['0.7', '1', '-1']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.join(__dirname, '..', '..', 'dist', 'index.html') + `?test&dist=${d}&settle=1&stats=1`;
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    const state = await page.evaluate(() => ({
      stats: window.__PC_STATS || null,
      errbar: document.getElementById('errbar')?.textContent || '',
      info: document.getElementById('info')?.textContent || '',
      ready: !!window.__pcReady,
    }));
    console.log(`dist=${d} ready=${state.ready} errbar=${state.errbar || '无'} stats=${JSON.stringify(state.stats)} errors=${JSON.stringify(errors)}`);
    await page.close();
  }
  await browser.close();
})();
