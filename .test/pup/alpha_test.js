/* 透明度滑块 + 遮挡叠加验证
 * 预期：
 *   1) 透明度越低，画面总亮度越低（uAlpha 真的进了着色器）
 *   2) 遮挡开启时，改变透明度不改变"点亮像素数"的量级 —— 因为遮挡关系由深度决定，
 *      与 alpha 无关（这正是"半透明 + 实心球体"这个组合该有的行为）
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COMMON = 'test&settle=1&nopost=1&stats=1&dist=0&count=80000&size=0.35';

async function shoot(tag, extra) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:8123/index.html?${COMMON}${extra ? '&' + extra : ''}`, { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
  await new Promise(r => setTimeout(r, 300));
  await (await page.$('canvas')).screenshot({ path: `../alpha_${tag}.png` });
  const ui = await page.evaluate(() => ({
    label: document.getElementById('vOpacity').textContent,
    slider: document.getElementById('opacity').value,
  }));
  await browser.close();
  return { tag, ui, errors };
}

(async () => {
  const runs = [];
  for (const [tag, extra] of [
    ['a100', 'opacity=1'],
    ['a50', 'opacity=0.5'],
    ['a20', 'opacity=0.2'],
    ['occ_a100', 'solid=1&opacity=1'],
    ['occ_a50', 'solid=1&opacity=0.5'],
    ['occ_a20', 'solid=1&opacity=0.2'],
  ]) runs.push(await shoot(tag, extra));
  console.log(JSON.stringify(runs, null, 1));
})();
