/* 找出页面里 404 的具体资源 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const bad = [];
  page.on('requestfailed', r => bad.push('FAILED ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto('http://127.0.0.1:8123/index.html?test&dist=-1&settle=1&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  console.log('bad requests:', JSON.stringify(bad, null, 1));
  await browser.close();
})();
