/* 逐帧渲染导出测试（stats 模式跳过文件夹选择，统计帧数/字节） */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360 });   // 小窗口加速 headless 渲染
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  // 设置导出参数：1 秒、24fps、当前窗口分辨率、JPEG
  await page.evaluate(() => {
    document.getElementById('expSec').value = '1';
    document.getElementById('expFps').value = '24';
    document.getElementById('expRes').value = 'window';
    document.getElementById('expFmt').value = 'jpeg';
  });
  await page.evaluate(() => { document.querySelector('#btnExport').closest('details').open = true; });
  await page.click('#btnExport');
  const t0 = Date.now();
  let exp = null;
  while (Date.now() - t0 < 120000) {
    exp = await page.evaluate(() => window.__PC_EXP ?? null);
    if (exp) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('导出结果:', JSON.stringify(exp), ' 耗时:', Math.round((Date.now() - t0) / 1000) + 's');
  await browser.close();
})();
