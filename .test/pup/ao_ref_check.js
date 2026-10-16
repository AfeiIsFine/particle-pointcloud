/* 在参考分辨率（画布 1800px 高 = Retina 上 900px 高的窗口）下检查 AO 效果 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'test&settle=1&dist=0.7&count=80000&size=0.6&depth=2.0&solid=1';

async function shot(file, extra) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });   // 画布 1800x1200
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:8123/index.html?${BASE}${extra}`, { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  const info = await page.evaluate(() => ({ cw: document.querySelector('canvas').width, ch: document.querySelector('canvas').height }));
  fs.writeFileSync(file, await (await page.$('canvas')).screenshot());
  await browser.close();
  return { info, errors };
}

(async () => {
  const a = await shot('/tmp/ao_ref_0.png', '&ao=0');
  const b = await shot('/tmp/ao_ref_1.png', '&ao=1');
  console.log(JSON.stringify({ aoOff: a, aoOn: b }));
})();
