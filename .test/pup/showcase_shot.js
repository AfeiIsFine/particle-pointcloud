/* 交付对照图：
 *   showcase_soft.png / showcase_solid.png      同一场景两种粒子形态
 *   showcase_edge_soft/solid.png                放大看边缘（黑边是否消失）
 *   showcase_panel_zh.png / _en.png             面板 04 区块
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function open(extra, w = 1200, h = 820, dsf = 1) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
  await page.goto(`http://127.0.0.1:8123/index.html?test&settle=1&dist=0.7&count=80000&size=0.5&depth=2.0&noise=0.3${extra}`,
    { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  return { browser, page };
}

(async () => {
  /* 1) 整幅对照（面板可见） */
  for (const [tag, extra] of [['soft', ''], ['solid', '&solid=1']]) {
    const { browser, page } = await open(extra);
    await page.screenshot({ path: `../showcase_${tag}.png` });
    await browser.close();
  }
  /* 2) 边缘放大（大颗粒 + 无面板） */
  for (const [tag, extra] of [['soft', ''], ['solid', '&solid=1']]) {
    const browser = await puppeteer.launch({
      executablePath: CHROME, headless: 'new',
      args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 700, height: 500, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:8123/index.html?test&settle=1&dist=0&count=20000&size=1.6&depth=1.0${extra}`,
      { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => { document.getElementById('panel').style.display = 'none'; });
    await new Promise(r => setTimeout(r, 300));
    await (await page.$('canvas')).screenshot({ path: `../showcase_edge_${tag}_raw.png` });
    await browser.close();
  }
  /* 3) 面板 04 区块（中/英） */
  const { browser, page } = await open('', 1200, 820, 2);
  for (const lang of ['zh', 'en']) {
    await page.evaluate(l => {
      const s = document.getElementById('lang');
      s.value = l; s.dispatchEvent(new Event('change', { bubbles: true }));
    }, lang);
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => document.querySelector('[data-g="look"]').scrollIntoView({ block: 'start' }));
    await new Promise(r => setTimeout(r, 300));
    await (await page.$('#panel')).screenshot({ path: `../showcase_panel_${lang}.png` });
  }
  await browser.close();
  console.log('done');
})();
