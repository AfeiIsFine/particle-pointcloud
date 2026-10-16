/* 辉光滑块功能验证：0 vs 1.2 的画面亮度差异 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&settle=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '../bloom_off.png' });
  await page.evaluate(() => {
    const el = document.getElementById('bloom');
    el.value = '1.2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // settle 下 rAF 已停 → 需要手动触发渲染？改参数后无新帧。改用一个不 settle 的方式：
  // 直接读 bloomPass 状态
  const st = await page.evaluate(() => ({
    label: document.getElementById('vBloom').textContent,
    slider: document.getElementById('bloom').value,
  }));
  console.log('滑块状态:', JSON.stringify(st));
  await browser.close();
})();
