/* 上传后自动判断：
 *   背景（图片中面积最大的颜色）偏亮 → 分布偏向默认 0
 *   背景偏暗 → 分布偏向默认 0.7
 * 同时验证显式 ?dist= 不被覆盖。
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function upload(file, urlExtra = '') {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:8123/index.html?blank&stats=1${urlExtra}`, { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 1200));            // 等空场景就绪（没有素材）
  const input = await page.$('#file');
  await input.uploadFile(file);
  await new Promise(r => setTimeout(r, 4000));            // 等解码 + 采样
  const st = await page.evaluate(() => ({
    bg: document.getElementById('bg').value,
    dist: document.getElementById('dist').value,
    distLabel: document.getElementById('vDist').textContent,
    n: window.__PC_STATS ? window.__PC_STATS.n : null,
  }));
  await browser.close();
  return { file: file.split('/').pop(), ...st, errors };
}

(async () => {
  const bright = await upload('../fixtures/bg_bright.png');
  const dark = await upload('../fixtures/bg_dark.png');
  const fixed = await upload('../fixtures/bg_bright.png', '&dist=-0.5');
  console.log(JSON.stringify({ bright, dark, fixed }, null, 1));

  const ok = bright.dist === '0' && bright.distLabel === '0.00'
          && dark.dist === '0.7' && dark.distLabel === '+0.70'
          && fixed.dist === '-0.5'
          && !bright.errors.length && !dark.errors.length && !fixed.errors.length;
  console.log(ok ? '✅ 背景明暗 → 分布偏向 自动判断通过' : '❌ 自动判断未通过');
  process.exit(ok ? 0 : 1);
})();
