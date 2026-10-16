const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#btnAnim');
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const b = await page.evaluate(() => document.getElementById('btnAnim').textContent);
    if (b.includes('停止')) break;
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '../banim_0.png' });
  await page.evaluate(() => {
    const el = document.getElementById('bloom');
    el.value = '1.5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: '../banim_15.png' });
  await browser.close();
})();
