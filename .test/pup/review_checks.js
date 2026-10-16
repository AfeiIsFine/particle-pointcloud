/*
 * 审核回归守卫（2026-10-11 代码审核发现的缺陷，逐条断言）
 *
 * 用法：先起本地服务，再跑
 *     cd .test/pup && node review_checks.js
 *   或从项目根目录： python3 -m http.server 8123 &  然后  node .test/pup/review_checks.js
 *
 * 设计纪律（诊断技能 Phase 1）：一条命令、秒级、确定性、无人值守。
 * 每一项断言的都是**用户能看见的症状**，不是"没报错"。
 *
 * 修复前的实测坏数值（frozen baseline，2026-10-11，M1 Max / Chrome headless）
 * —— 下面 5 条**已于 2026-10-11 全部修复，现为 5/5 通过**；这些数字保留作回归基线：
 *   [导出取消]  #errbar = "! 模块加载失败：The user aborted a request."   ← 应为不出现
 *   [AO 冻结]   100k 实心球：单帧最长阻塞 4386 ms（20k=618 / 50k=2606 / 200k=10303 / 300k=17812）
 *               → 修复后 100k 最差单帧 109 ms、300k 161 ms（AO 分片，aoMean 逐位不变）
 *   [键盘可达]  #toggleBtn 是 DIV、tabIndex=-1；收起后 Tab 会落进 10+ 个不可见控件
 *   [减弱动效]  prefers-reduced-motion: reduce 下仍然自动播放流动动画
 *   [分享版]    dist/index.html 缺 recStop/recProgress/recStopping 三个词条（导出进度条整块功能）
 *
 * 注意：只降低 AO 搜索半径（?aorad）不会让 [AO 冻结] 变绿——那只是把 4.4s 变成 1.4s，
 *       仍然是一次可感知的冻结。要变绿必须把烘焙分片或移出主线程（现在是分片）。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.PC_BASE || 'http://127.0.0.1:8123';
const ROOT = path.resolve(__dirname, '..', '..');

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}\n         ${detail}`);
};

async function newPage(browser, opts = {}) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  page.__errs = errs;
  if (opts.seedRandom) {
    // 播种 Math.random → 同一张图每次加载得到完全相同的粒子集（抖动/尺寸/颜色微扰都确定）
    await page.evaluateOnNewDocument(() => {
      let a = 0x9e3779b9;
      Math.random = function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
  }
  if (opts.frameClock) {
    // 记录每帧间隔，用来量"主线程被同步阻塞多久"
    await page.evaluateOnNewDocument(() => {
      const P = window.__PERF = { t: [], t0: performance.now() };
      const raf = window.requestAnimationFrame.bind(window);
      let last = 0;
      (function tick() {
        const n = performance.now();
        if (last) P.t.push(+(n - last).toFixed(1));
        last = n; raf(tick);
      })();
    });
  }
  return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 0) 服务必须先起来
  try {
    const r = await fetch(BASE + '/index.html');
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    console.error(`❌ 本地服务没起：${BASE}\n   先运行  python3 -m http.server 8123 --bind 127.0.0.1`);
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  });

  /* ---------- 1. 取消「选择导出文件夹」不该弹错误条 ---------- */
  {
    const page = await newPage(browser);
    await page.evaluateOnNewDocument(() => {
      window.__PICKER_CALLED = 0;
      window.showDirectoryPicker = () => {
        window.__PICKER_CALLED++;
        return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
      };
    });
    // 不能用 ?stats=1：那会进导出测试模式、跳过选择器，症状就假消失了
    await page.goto(BASE + '/?test&noflow=1', { waitUntil: 'load', timeout: 60000 });
    await sleep(3500);
    await page.evaluate(() => { document.querySelector('details[data-g="export"]').open = true; });
    await sleep(250);
    await page.click('#btnExport');
    await sleep(1200);
    const st = await page.evaluate(() => ({
      pickerCalled: window.__PICKER_CALLED,
      errbar: (document.getElementById('errbar') || {}).textContent || null,
    }));
    const ok = st.pickerCalled === 1 && st.errbar === null;
    record('导出：点「取消」不该显示错误提示',
      ok,
      ok ? '选择器被调用 1 次，未出现错误条'
         : `选择器调用 ${st.pickerCalled} 次；错误条 = ${JSON.stringify(st.errbar)}（期望 null）`);
    await page.close();
  }

  /* ---------- 2. 实心球体高粒子数不该冻结主线程 ---------- */
  {
    const page = await newPage(browser, { frameClock: true });
    await page.goto(BASE + '/?test&noflow=1&solid=1&count=100000', { waitUntil: 'load', timeout: 90000 });
    await sleep(9000);                      // 覆盖采样 + AO 烘焙
    const r = await page.evaluate(() => {
      const t = window.__PERF.t;
      return { maxGap: Math.max(...t), frames: t.length,
               info: (document.getElementById('info') || {}).innerText || '' };
    });
    const LIMIT = 1500;
    const ok = r.maxGap < LIMIT && /100,000/.test(r.info);
    record('实心球体 100k：单帧阻塞 < 1500 ms',
      ok,
      ok ? `最长单帧 ${r.maxGap.toFixed(0)} ms`
         : `最长单帧 ${r.maxGap.toFixed(0)} ms（>${LIMIT}）= 页面同步冻结；粒子数确认=${/100,000/.test(r.info)}`);
    await page.close();
  }

  /* ---------- 3. 面板收起后键盘必须能叫回来，且焦点不掉进不可见区域 ---------- */
  {
    const page = await newPage(browser);
    await page.goto(BASE + '/?test&noflow=1', { waitUntil: 'load', timeout: 60000 });
    await sleep(3500);
    await page.click('#collapseBtn');
    // 等收起动画走完（steady state）再测 Tab —— 断言的是"收起之后"，
    // 不是过渡那 0.3 秒（那段时间元素已不可见但 CSS 过渡还没把 visibility 翻过来）
    for (let i = 0; i < 40; i++) {
      const settled = await page.evaluate(() => {
        const pl = document.getElementById('panelL');
        return pl.hasAttribute('inert') || !pl.checkVisibility({ visibilityProperty: true });
      });
      if (settled) break;
      await sleep(50);
    }
    const toggle = await page.evaluate(() => {
      const t = document.getElementById('toggleBtn');
      return { tag: t.tagName, tabIndex: t.tabIndex, role: t.getAttribute('role') };
    });
    const focusable = toggle.tag === 'BUTTON' || toggle.tabIndex >= 0;
    const landed = new Set();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const cur = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a) return null;
        return a.closest('#panelL.hidden, #panel.hidden') ? (a.id || a.tagName) : null;
      });
      if (cur) landed.add(cur);
    }
    const ok = focusable && landed.size === 0;
    record('键盘：收起面板后可达 + 焦点不进不可见控件',
      ok,
      ok ? `#toggleBtn 是 ${toggle.tag}（tabIndex=${toggle.tabIndex}），30 次 Tab 未落进隐藏面板`
         : `#toggleBtn = ${toggle.tag} / tabIndex=${toggle.tabIndex} / role=${toggle.role}；` +
           `30 次 Tab 有 ${landed.size} 个不可见控件获得焦点：${[...landed].slice(0, 6).join(', ')}`);
    await page.close();
  }

  /* ---------- 4. prefers-reduced-motion 下不该自动播放流动动画 ---------- */
  {
    const page = await newPage(browser);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 60000 });   // 无查询参数 = 会自动播放
    await sleep(9000);
    const st = await page.evaluate(() => ({
      btn: document.getElementById('btnAnim').textContent,
      flowRunning: !!(window.__PC_COLORSTATS && window.__PC_COLORSTATS().morph),
    }));
    const ok = !st.flowRunning && !/停止|Stop/.test(st.btn);
    record('动效：prefers-reduced-motion 下不自动播放流动',
      ok,
      ok ? `按钮 = "${st.btn}"，无流动图层`
         : `按钮 = "${st.btn}"，流动图层已生成（应保持静止，等用户主动点）`);
    await page.close();
  }

  await browser.close();

  /* ---------- 5. 对外分享版必须与开发版同步（静态检查，秒级） ---------- */
  {
    const distPath = path.join(ROOT, 'dist', 'index.html');
    let detail, ok = false;
    if (!fs.existsSync(distPath)) {
      detail = 'dist/index.html 不存在，需要跑 python3 build_share.py';
    } else {
      const dist = fs.readFileSync(distPath, 'utf8');
      // 对象属性名不参与 esbuild minify（同批 panelChip 等都在），可用于判断新旧
      const missing = ['recStop', 'recProgress', 'recStopping'].filter(k => !dist.includes(k + ':'));
      ok = missing.length === 0;
      detail = ok ? 'dist 含导出进度条词条'
                  : `dist 缺词条 ${missing.join(', ')}（导出进度条整块功能不在分享版里）→ 重跑 build_share.py`;
    }
    record('交付：dist 分享版与开发版同步', ok, detail);
  }

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 通过` +
              (failed.length ? `　失败：${failed.map(f => f.name).join(' / ')}` : '　全部通过'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('harness error:', e.message); process.exit(3); });
