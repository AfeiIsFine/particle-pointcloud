/* 英文版 UI 截图：面板全貌 + 页面状态，供肉眼检查排版/文案 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });

  await page.goto('http://127.0.0.1:8123/index.html?test&dist=0.7&settle=1&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const setLang = l => page.evaluate(l => {
    const s = document.getElementById('lang');
    s.value = l; s.dispatchEvent(new Event('change', { bubbles: true }));
  }, l);

  const shotPanel = async (path) => {
    const el = await page.$('#panel');
    await el.screenshot({ path });
  };

  await setLang('zh');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: '../ui_zh.png' });
  await shotPanel('../ui_zh_panel.png');

  await setLang('en');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: '../ui_en.png' });
  await shotPanel('../ui_en_panel.png');

  /* 英文版：主按钮流状态 + 相机动画 状态下的文案 */
  await page.evaluate(() => document.getElementById('btnAnim').click());
  await new Promise(r => setTimeout(r, 1200));
  const flow = await page.evaluate(() => ({
    anim: document.getElementById('btnAnim').textContent,
    status: (document.getElementById('info') || {}).textContent,
  }));
  await page.screenshot({ path: '../ui_en_flow.png' });

  const err = await page.evaluate(() => document.getElementById('err'));
  console.log(JSON.stringify({ flow, errors, errHidden: err ? err.hidden || getComputedStyle(err).display === 'none' : 'no-el' }, null, 1));
  await browser.close();
})();
