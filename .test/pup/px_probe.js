/* 实测粒子在屏幕上的真实像素尺寸 + 覆盖率：
 * - 稀疏场（count 很小）量出单颗粒子的实际直径（device px / CSS px）
 * - 默认场（80k）量出画面点亮比例，评估重叠/糊成一团的程度
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function shoot({ dpr, size, count, dist, out }) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: dpr });
  await page.goto(`http://127.0.0.1:8123/index.html?test&settle=1&nopost=1&dist=${dist}&count=${count}&size=${size}`,
    { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  /* 只截 canvas，避免面板干扰统计 */
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  const canvas = await page.$('canvas');
  await canvas.screenshot({ path: out });
  const info = await page.evaluate(() => ({
    dpr: devicePixelRatio,
    canvasW: document.querySelector('canvas').width,
    canvasH: document.querySelector('canvas').height,
    n: window.__PC_STATS ? window.__PC_STATS.n : null,
  }));
  await browser.close();
  return info;
}

(async () => {
  const jobs = [
    { dpr: 1, size: 0.35, count: 1500, dist: 0, out: '../px_dpr1_sparse.png', tag: '默认尺寸·稀疏(dpr1)' },
    { dpr: 2, size: 0.35, count: 1500, dist: 0, out: '../px_dpr2_sparse.png', tag: '默认尺寸·稀疏(Retina dpr2)' },
    { dpr: 2, size: 2.0,  count: 1500, dist: 0, out: '../px_dpr2_big.png',    tag: '最大尺寸2.0·稀疏(Retina)' },
    { dpr: 2, size: 0.35, count: 80000, dist: 0.7, out: '../px_dpr2_dense.png', tag: '默认 80k(dpr2)' },
    { dpr: 2, size: 2.0,  count: 80000, dist: 0.7, out: '../px_dpr2_dense_big.png', tag: '80k + 尺寸2.0(dpr2)' },
  ];
  const out = [];
  for (const j of jobs) out.push({ tag: j.tag, ...(await shoot(j)) });
  fs.writeFileSync('../px_meta.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})();
