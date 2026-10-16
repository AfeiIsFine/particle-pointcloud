/* 验证两项改动：
 * A) 分辨率缩放修复：900x600 与 1800x1200 渲染后缩到同尺寸应几乎一致
 *    （修复前：高分辨率下粒子相对缩小一半）
 * B) 接触阴影 AO：ao=0 与 ao=1 同场景对比
 * 同时测 bakeAO 带来的重建耗时。
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const BASE = 'test&settle=1&nopost=1&stats=1&dist=0&count=20000&size=0.5&solid=1';

async function shot(file, w, h, extra = '') {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:8123/index.html?${BASE}${extra}`, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  const info = await page.evaluate(() => ({ cw: document.querySelector('canvas').width, ch: document.querySelector('canvas').height }));
  fs.writeFileSync(file, await (await page.$('canvas')).screenshot());
  await browser.close();
  return { info, errors };
}

(async () => {
  const out = {};
  out.small = await shot('/tmp/rf_600.png', 900, 600);
  out.large = await shot('/tmp/rf_1200.png', 1800, 1200);
  out.aoOff = await shot('/tmp/rf_ao0.png', 900, 600, '&ao=0');
  out.aoOn = await shot('/tmp/rf_ao1.png', 900, 600, '&ao=1');

  /* 测重建耗时（含 bakeAO） */
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8123/index.html?test&settle=1&stats=1&count=80000', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  out.rebuildMs = await page.evaluate(async () => {
    const t0 = performance.now();
    for (let i = 0; i < 3; i++) {
      /* 用深度滑块触发一次完整重建（buildPoints 内含 bakeAO） */
      const el = document.getElementById('depth');
      el.value = String(2 + i * 0.1);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 700));
    }
    return Math.round((performance.now() - t0) / 3);
  });
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
