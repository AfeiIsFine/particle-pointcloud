/* 动画播放中连续截帧（bloom 已默认禁用），分析网格的时间特性 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-gpu'],
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
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: `../anim_f${i}.png` });
    const m = await page.evaluate(() => window.__PC_MORPH);
    console.log(`帧${i}: morph=${m}`);
  }
  await browser.close();
})();
