/* 最终验证：默认值 / 录屏已删 / 导出模式 / 导出后画面仍正常 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  /* 1. 默认值 */
  const defaults = await page.evaluate(() => ({
    animSpeed: document.getElementById('animSpeed').value,
    floatAmp: document.getElementById('floatAmp').value,
    hasRecord: !!document.getElementById('btnRecord'),
    hasExport: !!document.getElementById('btnExport'),
    hasExpMode: !!document.getElementById('expMode'),
  }));

  /* 2. 单帧导出 */
  await page.evaluate(() => {
    document.getElementById('expMode').value = 'still';
    document.getElementById('expRes').value = 'window';
    document.getElementById('expFmt').value = 'jpeg';
  });
  await page.evaluate(() => { document.querySelector('#btnExport').closest('details').open = true; });
  await page.click('#btnExport');
  let exp1 = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    exp1 = await page.evaluate(() => window.__PC_EXP ?? null);
    if (exp1) break;
    await new Promise(r => setTimeout(r, 500));
  }

  /* 3. 导出后画面仍正常（bug 修复验证）：截图应有粒子 */
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '../after_export.png' });
  const infoAfter = await page.evaluate(() => document.getElementById('info').textContent.replace(/\s+/g, ' '));

  /* 4. 动画序列导出（1s×24fps） */
  await page.evaluate(() => {
    document.getElementById('expMode').value = 'anim';
    document.getElementById('expSec').value = '1';
    document.getElementById('expFps').value = '24';
  });
  await page.evaluate(() => { document.querySelector('#btnExport').closest('details').open = true; });
  await page.click('#btnExport');
  const t1 = Date.now();
  let exp2 = null;
  while (Date.now() - t1 < 120000) {
    exp2 = await page.evaluate(() => window.__PC_EXP ?? null);
    if (exp2 && exp2.frames > exp1.frames) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('默认值:', JSON.stringify(defaults));
  console.log('单帧导出:', JSON.stringify(exp1));
  console.log('序列导出:', JSON.stringify(exp2));
  console.log('导出后 info:', infoAfter, ' errors:', JSON.stringify(errors));
  await browser.close();
})();
