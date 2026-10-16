/* 实心球体：遮挡是否真的生效 + 帧率代价
 * 1) 遮挡验证：同场景下 solid=1 与 solid=0 的画面必须显著不同（近处球挡掉远处球）
 * 2) 性能：两种形态各跑固定时长，统计实际帧数与平均帧间隔
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COMMON = 'test&settle=1&nopost=1&stats=1&dist=0&count=80000&size=0.5&depth=2.0';

async function run(tag, extra, withPerf) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:8123/index.html?${COMMON}${extra}`, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  let perf = null;
  if (withPerf) {
    /* settle 模式会在 10 帧后停 rAF，所以性能测试不带 settle —— 单独跑 */
  }

  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  fs.writeFileSync(`../perf_${tag}.png`, await page.screenshot());
  await browser.close();
  return { tag, errors, perf };
}

async function perfRun(tag, extra) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:8123/index.html?test&nopost=1&stats=1&dist=0&count=80000&size=0.5${extra}`,
    { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  const r = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now(); const stamps = [];
    const tick = () => {
      stamps.push(performance.now());
      if (++n < 60) requestAnimationFrame(tick);
      else {
        const d = []; for (let i = 1; i < stamps.length; i++) d.push(stamps[i] - stamps[i - 1]);
        d.sort((a, b) => a - b);
        res({ frames: n, ms: Math.round(performance.now() - t0), medianGap: +d[d.length >> 1].toFixed(1) });
      }
    };
    requestAnimationFrame(tick);
  }));
  await browser.close();
  return { tag, ...r };
}

(async () => {
  const soft = await run('soft', '', false);
  const solid = await run('solid', '&solid=1', false);
  const perfSoft = await perfRun('soft', '');
  const perfSolid = await perfRun('solid', '&solid=1');
  const errors = [...soft.errors, ...solid.errors];
  console.log(JSON.stringify({ perfSoft, perfSolid, errors }, null, 1));
  console.log(errors.length === 0 ? '✅ 无报错' : '❌ 有报错');
})();
