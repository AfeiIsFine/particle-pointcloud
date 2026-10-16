const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
           '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  const fileInput = await page.$('#file');
  await fileInput.uploadFile(path.join(__dirname, '..', 'test_anim.gif'));
  await new Promise(r => setTimeout(r, 2500));
  // 页面内检测：img 画到 canvas 两次对比（判断 GIF 动画是否在播放）
  const r = await page.evaluate(async () => {
    const img = document.querySelector('img[src^="blob:"]') || [...document.images].find(i => i.src.includes('gif') || i.src.startsWith('blob:'));
    if (!img) return { err: 'no img found' };
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const ctx = c.getContext('2d');
    const snap = () => { ctx.drawImage(img, 0, 0); return c.toDataURL().slice(0, 2000); };
    const s1 = snap();
    await new Promise(r => setTimeout(r, 700));
    const s2 = snap();
    return { changed: s1 !== s2, inDom: !!img.parentElement, complete: img.complete };
  });
  console.log('GIF 动画检测:', JSON.stringify(r));
  await browser.close();
})();
