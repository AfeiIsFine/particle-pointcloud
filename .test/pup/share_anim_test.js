/* 验证打包版（file:// 双击）的动态分布按钮 */
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
  await new Promise(r => setTimeout(r, 4000));   // 生成 + 动画跑一段
  const during = await page.evaluate(() => ({
    btn: document.getElementById('btnAnim').textContent,
    vDist: document.getElementById('vDist').textContent,
    errbar: document.getElementById('errbar')?.textContent || '',
    ready: !!window.__pcReady,
  }));
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 1200));
  const after = await page.evaluate(() => ({
    btn: document.getElementById('btnAnim').textContent,
    vDist: document.getElementById('vDist').textContent,
  }));
  console.log('运行中:', JSON.stringify(during));
  console.log('停止后:', JSON.stringify(after));
  console.log('errors:', JSON.stringify(errors));
  const ok = during.ready && !during.errbar && during.btn.includes('停止') && during.vDist !== '+0.70' &&
             /* 图形标记 ▶/■ 改由 CSS ::before 渲染，文本不再含符号 */
             !after.btn.includes('停止') && after.vDist === '+0.70';
  console.log(ok ? '✅ 打包版动画测试通过' : '❌ 打包版动画测试未通过');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
