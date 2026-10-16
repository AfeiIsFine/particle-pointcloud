/* 打包版（file:// 双击场景）语言切换验证：中/EN 词条对齐 + 切换后动态文案跟随 */
const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text()); });

  const file = 'file://' + path.resolve(__dirname, '../../dist/index.html');
  await page.goto(file + '?test&dist=0.7&settle=1&stats=1', { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 3000));

  const dict = await page.evaluate(() => {
    if (!window.__PC_I18N) return null;
    const z = Object.keys(window.__PC_I18N.zh).sort(), e = Object.keys(window.__PC_I18N.en).sort();
    return { n: z.length, missingInEn: z.filter(k => !e.includes(k)), extraInEn: e.filter(k => !z.includes(k)) };
  });

  const audit = () => page.evaluate(() => {
    const empty = [], overflow = [];
    document.querySelectorAll('.panel [data-i18n]').forEach(el => { if (!el.textContent.trim()) empty.push(el.dataset.i18n); });
    document.querySelectorAll('.panel .k, .panel .g-name, .panel .sub-label, .panel .btn, .panel .seg > button, .panel .sub-tag').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1) overflow.push(el.textContent.trim());
    });
    return { empty, overflow, lang: document.documentElement.lang, title: document.title, h1: document.querySelector('#panelL h1').textContent };
  });
  const zh = await audit();
  await page.evaluate(() => { const s = document.getElementById('lang'); s.value = 'en'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 500));
  const en = await audit();
  const dyn = await page.evaluate(() => ({
    anim: document.getElementById('btnAnim').textContent,
    cam: document.getElementById('btnCamAnim').textContent,
    info: document.getElementById('info').textContent.replace(/\s+/g, ' '),
    stats: window.__PC_STATS,
  }));

  const ok = dict && dict.n > 60 && !dict.missingInEn.length && !dict.extraInEn.length &&
             zh.lang === 'zh-CN' && en.lang === 'en' &&
             !zh.overflow.length && !en.overflow.length && !zh.empty.length && !en.empty.length &&
             dyn.anim === 'Start flow' && dyn.cam === 'Orbit camera' &&
             dyn.stats && dyn.stats.n > 0 && !errors.length;
  console.log(JSON.stringify({ dict, zh, en, dyn, errors, ok }, null, 1));
  console.log(ok ? '✅ 打包版 i18n 测试通过' : '❌ 打包版 i18n 测试未通过');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
