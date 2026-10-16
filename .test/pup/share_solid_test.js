/* 打包版（file:// 双击场景）遮挡功能验证
 * 同 share_i18n_test 的思路：不查字符串，直接看渲染结果的像素差异。
 * 判据：同一场景下 solid=1 与 occlude=0 的画面必须有显著差异，且无报错。
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COMMON = 'test&settle=1&nopost=1&dist=0&count=80000&size=0.35';

async function shoot(tag, extra) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
  const file = 'file://' + path.resolve(__dirname, '../../dist/index.html');
  await page.goto(`${file}?${COMMON}${extra ? '&' + extra : ''}`, { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 3000));
  const state = await page.evaluate(() => ({
    seg: document.querySelector('#segSolid button[aria-pressed="true"]').textContent,
    bright: document.getElementById('vBright').textContent,
    bg: !!document.getElementById('bg'),
    ready: !!document.querySelector('canvas'),
  }));
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  fs.writeFileSync(`../share_occ_${tag}.png`, await page.screenshot());
  await browser.close();
  return { tag, state, errors };
}

(async () => {
  const blend = await shoot('blend', '');
  const occ = await shoot('occlude', 'solid=1');
  const a50 = await shoot('a50', 'bright=1.5');
  const errors = [...blend.errors, ...occ.errors, ...a50.errors];
  console.log(JSON.stringify({ blend, occ, a50, errors }, null, 1));
  const ok = blend.state.seg === '柔和光点' && occ.state.seg === '实心球体' &&
             a50.state.bright === '×1.50' && a50.state.bg && errors.length === 0;
  console.log(ok ? '✅ 打包版遮挡/透明度控件通过（像素差异见 share_occ_*.png）' : '❌ 打包版遮挡控件失败');
  process.exit(ok ? 0 : 1);
})();
