/* 面板下半部分（导出/快捷键等）+ 英文排版检查 */
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
  await page.goto('http://127.0.0.1:8123/index.html?test&dist=0.7&settle=1&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    const s = document.getElementById('lang');
    s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('panel').scrollTop = 99999;
  });
  await new Promise(r => setTimeout(r, 600));

  /* 英文版全量溢出检查：所有面板内文本元素 */
  const audit = await page.evaluate(() => {
    const sel = '#panel .k, #panel .g-name, #panel .sub-label, #panel .btn, #panel .seg > button, #panel .sub-tag, #panel h1, #panel .sub, #panel button';
    const overflow = [];
    document.querySelectorAll(sel).forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1) overflow.push({ t: el.textContent.trim(), sw: el.scrollWidth, cw: el.clientWidth });
    });
    return {
      overflow,
      panelScrollH: document.getElementById('panel').scrollHeight,
      panelClientH: document.getElementById('panel').clientHeight,
      scrollTop: document.getElementById('panel').scrollTop,
      lang: document.documentElement.lang,
    };
  });
  const el = await page.$('#panel');
  await el.screenshot({ path: '../ui_en_panel_bottom.png' });
  await page.screenshot({ path: '../ui_en_bottom.png' });
  console.log(JSON.stringify({ audit, errors }, null, 1));
  await browser.close();
})();
