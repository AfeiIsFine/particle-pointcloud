/* 冒烟：柔和光点 / 实心球体 两种形态都能正常编译、渲染、无报错 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function shoot(tag, extra) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 500, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:8123/index.html?test&settle=1&stats=1&dist=0&count=20000&size=1.6&depth=1.0${extra}`,
    { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  const ui = await page.evaluate(() => ({
    seg: document.querySelector('#segSolid button[aria-pressed="true"]').textContent,
    sel: document.getElementById('solid').value,
    errbar: document.getElementById('errBar') ? getComputedStyle(document.getElementById('errBar')).display : 'none',
    n: window.__PC_STATS ? window.__PC_STATS.n : null,
  }));
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  await (await page.$('canvas')).screenshot({ path: `../form_${tag}.png` });
  await browser.close();
  return { tag, ui, errors };
}

(async () => {
  const soft = await shoot('soft', '');
  const solid = await shoot('solid', '&solid=1');
  const errors = [...soft.errors, ...solid.errors];
  console.log(JSON.stringify({ soft, solid, errors }, null, 1));
  const ok = soft.ui.seg === '柔和光点' && solid.ui.seg === '实心球体' &&
             soft.ui.n === 20000 && solid.ui.n === 20000 && errors.length === 0;
  console.log(ok ? '✅ 两种粒子形态都正常' : '❌ 冒烟失败');
  process.exit(ok ? 0 : 1);
})();
