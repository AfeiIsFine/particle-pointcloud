/* 读取页面的 __PC_STATS：验证真实浏览器里采样分布的正确性 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  for (const d of ['-1', '-0.7', '0', '0.7', '1']) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:8123/?test&dist=${d}&settle=1&stats=1`, { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    const stats = await page.evaluate(() => window.__PC_STATS || null);
    console.log(`dist=${d}  stats=${JSON.stringify(stats)}  errors=${JSON.stringify(errors)}`);
    await page.close();
  }
  await browser.close();
})();
