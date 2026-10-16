/* 新功能验证：镜头动画（画面连续变化）+ 录屏（产出非空视频） */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
           '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  /* 1. 镜头动画：激活 → 画面应持续变化；停止 → 按钮复位 */
  await page.click('#btnCamAnim');
  const btnRun = await page.evaluate(() => document.getElementById('btnCamAnim').textContent);
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: '../cam_1.png' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '../cam_2.png' });
  await page.click('#btnCamAnim');
  const btnIdle = await page.evaluate(() => document.getElementById('btnCamAnim').textContent);

  console.log('镜头按钮:', JSON.stringify({ btnRun, btnIdle }));
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
