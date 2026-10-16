/* 面板改版验证：语言切换（中/EN）+ 渲染导出的"内容优先"逻辑
 * 1. 中英词条一一对应（无漏译），切语言后动态文案全部跟随
 * 2. 分段控件/隐藏 select 双向同步，切语言不丢状态
 * 3. 单帧模式：时长与序列帧率不可操作；分辨率/格式仍可用（对两种模式都生效）
 * 4. 面板内无文案溢出（英文更长，272px 宽下面板不能被撑破）
 */
const puppeteer = require('puppeteer-core');
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
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });

  /* stats=1：headless 下无法弹文件夹选择框，走测试钩子统计帧数据 */
  await page.goto('http://127.0.0.1:8123/index.html?test&dist=0.7&settle=1&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  const dict = await page.evaluate(() => {
    const I = window.__PC_I18N;
    const z = Object.keys(I.zh).sort();
    const e = Object.keys(I.en).sort();
    /* 关键补充：检查 DOM 里每个 data-i18n* 引用的键都真的存在。
       只比对中英两份词表的"对齐"是不够的 —— 两边同时漏掉同一个键时对齐仍然成立，
       界面上却会直接显示键名（lLumMax 就这么漏过一次）。 */
    const used = new Set();
    document.querySelectorAll('[data-i18n]').forEach(el => used.add(el.dataset.i18n));
    document.querySelectorAll('[data-i18n-aria]').forEach(el => used.add(el.dataset.i18nAria));
    document.querySelectorAll('[data-i18n-title]').forEach(el => used.add(el.dataset.i18nTitle));
    const missingKeys = [...used].filter(k => I.zh[k] === undefined || I.en[k] === undefined);
    return { n: z.length, missingInEn: z.filter(k => !e.includes(k)), extraInEn: e.filter(k => !z.includes(k)), missingKeys };
  });
  const okDict = dict.n > 60 && !dict.missingInEn.length && !dict.extraInEn.length && !dict.missingKeys.length;

  const audit = () => page.evaluate(() => {
    const empty = [], overflow = [];
    document.querySelectorAll('[data-i18n]').forEach(el => { if (!el.textContent.trim()) empty.push(el.dataset.i18n); });
    document.querySelectorAll('.panel .k, .panel .g-name, .panel .sub-label, .panel .btn, .panel .seg > button, .panel .sub-tag').forEach(el => {
      if (el.scrollWidth > el.clientWidth + 1) overflow.push(el.textContent.trim());
    });
    return { empty, overflow, lang: document.documentElement.lang, title: document.title };
  });
  const zh = await audit();

  const setLang = l => page.evaluate(l => {
    const s = document.getElementById('lang');
    s.value = l; s.dispatchEvent(new Event('change', { bubbles: true }));
  }, l);
  await setLang('en');
  await new Promise(r => setTimeout(r, 400));
  const en = await audit();
  const dyn = await page.evaluate(() => ({
    count: document.getElementById('vCount').textContent,
    info: document.getElementById('info').textContent.replace(/\s+/g, ' '),
    anim: document.getElementById('btnAnim').textContent,
    cam: document.getElementById('btnCamAnim').textContent,
    group2: document.querySelector('[data-g="dist"] .g-name').textContent,
    segOn: document.querySelector('#segDepthMode button[aria-pressed="true"]').textContent,
  }));
  const okLang = zh.lang === 'zh-CN' && en.lang === 'en' && !zh.empty.length && !en.empty.length &&
                 !zh.overflow.length && !en.overflow.length &&
                 /k$/.test(dyn.count) && /Particles/.test(dyn.info) && dyn.anim === 'Start flow' &&
                 dyn.cam === 'Orbit camera' && dyn.group2 === 'Distribution';

  /* 单帧模式：序列设置应不可操作；分辨率/格式保持可用 */
  await page.evaluate(() => document.querySelector('#segExpMode button[data-val="still"]').click());
  await new Promise(r => setTimeout(r, 300));
  const still = await page.evaluate(() => ({
    sec: document.getElementById('expSec').disabled,
    fps: document.getElementById('expFps').disabled,
    locked: document.getElementById('segExpFps').classList.contains('locked'),
    tag: getComputedStyle(document.querySelector('.still-off')).display !== 'none',
    cls: document.getElementById('panel').classList.contains('export-still'),
    label: document.getElementById('btnExport').textContent,
    res: document.getElementById('expRes').disabled,
    fmt: document.getElementById('expFmt').disabled,
  }));
  const okStill = still.sec && still.fps && still.locked && still.tag && still.cls &&
                  still.label === 'Export still' && !still.res && !still.fmt;

  /* 切回序列：恢复可操作 */
  await page.evaluate(() => document.querySelector('#segExpMode button[data-val="anim"]').click());
  await new Promise(r => setTimeout(r, 300));
  const back = await page.evaluate(() => ({
    sec: document.getElementById('expSec').disabled,
    fps: document.getElementById('expFps').disabled,
    label: document.getElementById('btnExport').textContent,
    cls: document.getElementById('panel').classList.contains('export-still'),
  }));
  const okBack = !back.sec && !back.fps && back.label === 'Export sequence' && !back.cls;

  /* 语言记忆 + 图片模式下的导出仍旧可用（回归：t() 曾被时间变量遮蔽，导致序列导出只出 1 帧） */
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  const remembered = await page.evaluate(() => document.documentElement.lang);
  await page.evaluate(() => document.querySelector('#segExpMode button[data-val="anim"]').click());
  await page.evaluate(() => {
    document.getElementById('expMode').value = 'anim';
    document.getElementById('expSec').value = '1';
    document.getElementById('expFps').value = '24';
    document.querySelector('#btnExport').closest('details').open = true;
  });
  await page.click('#btnExport');
  let exp = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    exp = await page.evaluate(() => window.__PC_EXP || null);
    if (exp) break;
    await new Promise(r => setTimeout(r, 400));
  }
  const okExport = exp && exp.frames === 24;

  console.log('词条:', JSON.stringify(dict));
  console.log('中文:', JSON.stringify(zh));
  console.log('英文:', JSON.stringify(en), JSON.stringify(dyn));
  console.log('单帧:', JSON.stringify(still));
  console.log('切回序列:', JSON.stringify(back));
  console.log('语言记忆:', remembered, ' 序列导出:', JSON.stringify(exp));
  console.log('errors:', JSON.stringify(errors));
  const ok = okDict && okLang && okStill && okBack && remembered === 'en' && okExport && !errors.length;
  console.log('词条对齐=' + okDict, '语言切换=' + okLang, '单帧禁用=' + okStill, '切回恢复=' + okBack, '导出回归=' + okExport);
  console.log(ok ? '✅ 面板 i18n / 导出模式测试通过' : '❌ 面板 i18n / 导出模式测试未通过');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
