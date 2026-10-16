/* 交叉淡化回归：遮挡模式下开启动态分布，淡入淡出不能被深度写入破坏
 *
 * 原理：轨迹生成完成后，动画开头 0.4s 是"主层淡出 + 流动层淡入"的交叉淡化。
 *   若淡出的旧层仍然写深度，它会把淡入的新层挡掉 → 画面在淡化期间明显偏暗。
 * 判据：遮挡开 / 关两种情况下，淡化中途的画面总亮度应当接近（比值接近 1）。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/* 注意：不能用 settle=1 —— settle 模式渲染 10 帧后停掉 rAF，流动动画不会推进 */
const COMMON = 'test&nopost=1&stats=1&dist=0&count=80000&size=0.35';

async function run(tag, occlude) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:8123/index.html?${COMMON}${occlude ? '&solid=1' : ''}`, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await page.screenshot({ path: `/tmp/xf_${tag}_before.png` });

  await page.evaluate(() => document.getElementById('btnAnim').click());

  /* 等轨迹生成完成（__PC_MORPH 由 null 变为数值 = 动画已开始） */
  let waited = 0;
  while (waited < 30000) {
    const m = await page.evaluate(() => window.__PC_MORPH);
    if (m !== null && m !== undefined) break;
    await new Promise(r => setTimeout(r, 30));
    waited += 30;
  }
  const marks = [];
  /* 交叉淡化窗口 0.4s，抓 4 帧 */
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 90));
    const buf = await page.screenshot();
    fs.writeFileSync(`/tmp/xf_${tag}_${i}.png`, buf);
    marks.push(await page.evaluate(() => ({ morph: window.__PC_MORPH, btn: document.getElementById('btnAnim').textContent })));
  }
  /* 淡化结束后的稳定帧 */
  await new Promise(r => setTimeout(r, 1500));
  fs.writeFileSync(`/tmp/xf_${tag}_after.png`, await page.screenshot());

  await browser.close();
  return { genWaitMs: waited, marks, errors };
}

(async () => {
  const blend = await run('blend', false);
  const occ = await run('occ', true);
  console.log(JSON.stringify({ blend, occ }, null, 1));
})();
