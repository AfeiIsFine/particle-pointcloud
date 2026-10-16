/* 导出与预览是否一致：
 *   预览：canvas 截图
 *   导出：拦截 canvas.toBlob 拿到导出路径真正写出的那张图（不弹文件夹选择框）
 * 对比两者的粒子相对尺寸与整体色彩。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/index.html?test&settle=1&stats=1&count=80000&size=0.8&bgauto=0&bg=000000',
    { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 4000));

  /* 预览截图（只留画布） */
  await page.evaluate(() => {
    document.getElementById('panelL').style.display = 'none';
    document.getElementById('panel').style.display = 'none';
  });
  await new Promise(r => setTimeout(r, 300));
  const cv = await page.$('canvas');
  fs.writeFileSync('/tmp/ex_prev.png', await cv.screenshot());
  const info = await page.evaluate(() => ({
    canvasW: document.querySelector('canvas').width,
    canvasH: document.querySelector('canvas').height,
    dpr: devicePixelRatio,
  }));

  /* 拦截 toBlob，抓导出真正写出的那张图 */
  await page.evaluate(() => {
    window.__CAP = null;
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      orig.call(this, b => {
        const fr = new FileReader();
        fr.onload = () => { window.__CAP = fr.result; };
        fr.readAsDataURL(b);
        cb(b);
      }, type, q);
    };
  });
  await page.evaluate(() => { document.querySelector('#segExpMode button[data-val="still"]').click(); document.getElementById('expRes').value = 'window'; });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.getElementById('btnExport').click());
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__CAP)); i++) await new Promise(r => setTimeout(r, 200));
  const dataUrl = await page.evaluate(() => window.__CAP);
  if (dataUrl) fs.writeFileSync('/tmp/ex_export.png', Buffer.from(dataUrl.split(',')[1], 'base64'));

  console.log(JSON.stringify({ ...info, captured: !!dataUrl, errors }, null, 1));
  await browser.close();
})();
