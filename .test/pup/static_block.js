const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-gpu'],
  });
  for (const [name, d] of [['stat_07', '0.7'], ['stat_m09', '-0.9'], ['stat_0', '0']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.goto(`http://127.0.0.1:8123/?test&dist=${d}&settle=1`, { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: `../${name}.png` });
    await page.close();
  }
  await browser.close();
})();
