const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  const fileInput = await page.$('#file');
  await fileInput.uploadFile(path.join(__dirname, '..', 'test_anim.gif'));
  await new Promise(r => setTimeout(r, 2500));
  const r = await page.evaluate(() => ({
    info: document.getElementById('info').textContent.replace(/\s+/g, ' '),
    hasImageDecoder: !!window.ImageDecoder,
    errbar: document.getElementById('errbar')?.textContent || '',
  }));
  console.log(JSON.stringify(r));
  await browser.close();
})();
