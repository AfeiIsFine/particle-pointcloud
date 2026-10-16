/* 验证打包版（file:// 双击）的连续流动动画 */
const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = 'file://' + path.join(__dirname, '..', '..', 'dist', 'index.html') + '?test&dist=0.7&stats=1';
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#btnAnim');
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const b = await page.evaluate(() => document.getElementById('btnAnim').textContent);
    if (b.includes('停止')) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const s0 = await page.evaluate(() => ({ morph: window.__PC_MORPH, vDist: document.getElementById('vDist').textContent, genMs: window.__PC_ANIM_GEN_MS, errbar: document.getElementById('errbar')?.textContent || '', ready: !!window.__pcReady }));
  await new Promise(r => setTimeout(r, 2500));
  const s1 = await page.evaluate(() => ({ morph: window.__PC_MORPH, vDist: document.getElementById('vDist').textContent }));
  console.log('开始:', JSON.stringify(s0));
  console.log('2.5s 后:', JSON.stringify(s1));
  console.log('errors:', JSON.stringify(errors));
  const ok = s0.ready && !s0.errbar && s1.vDist !== s0.vDist && s1.morph !== null;
  console.log(ok ? '✅ 打包版流动动画测试通过' : '❌ 打包版流动动画测试未通过');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
