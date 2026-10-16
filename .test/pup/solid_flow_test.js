/* 遮挡模式下的完整流程回归：流动动画 → 停止 → 单帧导出 → 序列导出
 * 关注点：depthWrite 在图层交叉淡化/隐藏时是否被正确关闭，导出是否仍能拿到帧。
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });

  await page.goto('http://127.0.0.1:8123/index.html?test&solid=1&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const uiInit = await page.evaluate(() => ({
    seg: document.querySelector('#segSolid button[aria-pressed="true"]').textContent,
    select: document.getElementById("solid").value,
    bright: document.getElementById('vBright').textContent,
  }));

  /* 流动动画：跑 6 秒，确认持续推进（遮挡模式下不能卡住） */
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 3000));
  const m1 = await page.evaluate(() => window.__PC_MORPH);
  await new Promise(r => setTimeout(r, 3000));
  const m2 = await page.evaluate(() => window.__PC_MORPH);
  const flowRunning = await page.evaluate(() => document.getElementById('btnAnim').textContent);

  /* 停止 → 回到静态 */
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 800));
  const afterStop = await page.evaluate(() => ({
    btn: document.getElementById('btnAnim').textContent,
    distEnabled: !document.getElementById('dist').disabled,
  }));

  /* 导出：单帧 + 序列 */
  const still = await page.evaluate(async () => {
    document.querySelector('#segExpMode button[data-val="still"]').click();
    document.getElementById('btnExport').click();
    for (let i = 0; i < 60 && !window.__PC_EXP; i++) await new Promise(r => setTimeout(r, 100));
    return window.__PC_EXP;
  });
  const seq = await page.evaluate(async () => {
    window.__PC_EXP = null;
    document.querySelector('#segExpMode button[data-val="anim"]').click();
    /* 固定为 1 秒 × 24fps = 24 帧，避免依赖面板默认值 */
    document.getElementById('expSec').value = '1';
    document.getElementById('expFps').value = '24';
    document.getElementById('btnExport').click();
    for (let i = 0; i < 150 && !window.__PC_EXP; i++) await new Promise(r => setTimeout(r, 100));
    return window.__PC_EXP;
  });

  const ok = uiInit.seg === '实心球体' && uiInit.select === '1' &&
             m1 !== null && m2 !== null && m2 > m1 &&
             flowRunning === '停止流动' && afterStop.btn === '开始流动' && afterStop.distEnabled &&
             still && still.frames === 1 && still.bytes > 1000 &&
             seq && seq.frames === 24 && seq.bytes > 100000 &&
             errors.length === 0;
  console.log(JSON.stringify({ uiInit, m1, m2, flowRunning, afterStop, still, seq, errors, ok }, null, 1));
  console.log(ok ? '✅ 遮挡模式全流程通过' : '❌ 遮挡模式全流程失败');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
