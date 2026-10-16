/* 浏览器级验证：puppeteer-core 连接系统 Chrome，捕获页面错误并截图对比不同 dist */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, '..');
const DISTS = process.argv[2] ? [process.argv[2]] : ['-1', '0', '0.7', '1'];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const results = [];
  for (const d of DISTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    await page.goto(`http://127.0.0.1:8123/?test&dist=${d}&settle=1`, { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 7000));   // 等 10 帧定格 + 渲染
    const state = await page.evaluate(() => ({
      errbar: document.getElementById('errbar')?.textContent || '',
      info: document.getElementById('info')?.textContent || '',
      dropzoneHidden: document.getElementById('dropzone')?.classList.contains('hidden'),
      vDist: document.getElementById('vDist')?.textContent,
      slider: document.getElementById('dist')?.value,
    }));
    const shot = path.join(OUT, `shot_p_${d}.png`);
    await page.screenshot({ path: shot });
    results.push({ d, state, errors });
    console.log(`dist=${d} errbar=${state.errbar || '无'} vDist=${state.vDist} 滑块=${state.slider} info=${state.info.replace(/\s+/g, ' ')} errors=${JSON.stringify(errors)}`);
    await page.close();
  }
  await browser.close();
})();
