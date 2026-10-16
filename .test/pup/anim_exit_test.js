/* 验证：动画运行中拖动会触发重建的参数 → 自动退出动画 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 3000));   // 动画运行中
  const during = await page.evaluate(() => ({
    btn: document.getElementById('btnAnim').textContent,
    distDisabled: document.getElementById('dist').disabled,
  }));
  // 拖动"深度强度"滑块（触发重建 → 应自动退出动画）
  await page.evaluate(() => {
    const el = document.getElementById('depth');
    el.value = '3.0';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1500));   // 防抖 120ms + 重建
  const after = await page.evaluate(() => ({
    btn: document.getElementById('btnAnim').textContent,
    distDisabled: document.getElementById('dist').disabled,
    vDist: document.getElementById('vDist').textContent,
    vDepth: document.getElementById('vDepth').textContent,
    stats: window.__PC_STATS,
  }));
  console.log('拖动前:', JSON.stringify(during));
  console.log('拖动后:', JSON.stringify(after));
  /* 注意：按钮上的 ▶ / ■ 是 CSS ::before 渲染的，不在 textContent 里，
     所以断言只能比对文案本身（中英均可）——旧版脚本比对 '▶' 属于过时断言 */
  const idleLabel = await page.evaluate(() => window.__PC_I18N.en.btnAnimIdle);
  const runLabel = await page.evaluate(() => window.__PC_I18N.en.btnAnimRun);
  const ok = (during.btn === runLabel || during.btn.includes('停止')) && during.distDisabled === true &&
             (after.btn === idleLabel || after.btn.includes('开始流动')) && after.distDisabled === false &&
             after.vDist === '+0.70' && after.vDepth === '3.0' && after.stats.dist === 0.7;
  console.log(ok ? '✅ 自动退出测试通过' : '❌ 自动退出测试未通过');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
