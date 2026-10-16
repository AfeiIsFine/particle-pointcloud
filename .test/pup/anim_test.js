/* 动态分布按钮的浏览器级验证 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });

  await page.goto('http://127.0.0.1:8123/?test&dist=0.3&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));   // 等聚合动画完成

  const read = () => page.evaluate(() => ({
    vDist: document.getElementById('vDist')?.textContent,
    btn: document.getElementById('btnAnim')?.textContent,
    btnActive: document.getElementById('btnAnim')?.classList.contains('active'),
    distDisabled: document.getElementById('dist')?.disabled,
    stats: window.__PC_STATS || null,
  }));

  console.log('初始:', JSON.stringify(await read()));
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 2500));
  console.log('开启后 2.5s:', JSON.stringify(await read()));
  await new Promise(r => setTimeout(r, 2500));
  const mid = await read();
  console.log('开启后 5.0s:', JSON.stringify(mid));
  await page.screenshot({ path: '../shot_anim_mid.png' });
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 1500));
  const after = await read();
  console.log('停止后:', JSON.stringify(after));
  console.log('errors:', JSON.stringify(errors));

  const v1 = (await read()).vDist;
  const ok = mid.btn.includes('停止') && mid.distDisabled === true &&
             mid.vDist !== '+0.30' && after.vDist === '+0.30' &&
             /* 图形标记 ▶/■ 改由 CSS ::before 渲染，文本不再含符号 */
             !after.btn.includes('停止') && after.distDisabled === false;
  console.log(ok ? '✅ 动画测试通过' : '❌ 动画测试未通过');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
