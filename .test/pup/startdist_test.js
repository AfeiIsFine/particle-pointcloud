/* 验证：动画起点分布 ≈ 静态 dist=-0.9 分布 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8123/?test&dist=-0.9&stats=1&animPhase=0.1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  const staticAvgL = await page.evaluate(() => window.__PC_STATS.avgL);
  await page.click('#btnAnim');
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const b = await page.evaluate(() => document.getElementById('btnAnim').textContent);
    if (b.includes('停止')) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const startAvgL = await page.evaluate(() => window.__PC_ANIM_START_AVGL);
  const span = await page.evaluate(() => window.__PC_ANIM_PHASE_SPAN);
  console.log(`静态 dist=-0.9 avgL=${staticAvgL.toFixed(3)}   动画起点(前${(span/2).toFixed(0)}个周期段) avgL=${startAvgL}`);
  const ok = Math.abs(startAvgL - staticAvgL) < 0.06;
  console.log(ok ? '✅ 动画起点分布与静态 -0.9 一致' : '❌ 起点分布偏差过大');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
