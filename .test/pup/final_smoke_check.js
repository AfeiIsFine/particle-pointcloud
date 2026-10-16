/* 统一冒烟：三个入口都不应有 errbar、都应渲染出 canvas 与素材信息 */
const puppeteer = require('puppeteer-core');
const TARGETS = [
  ['开发版', 'http://127.0.0.1:8123/index.html'],
  ['本机分享版 dist', 'http://127.0.0.1:8123/dist/index.html'],
  ['线上版 dist-web', 'http://127.0.0.1:8123/dist-web/index.html'],
];
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  let fail = 0;
  for (const [name, url] of TARGETS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
    page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, 6000));
    const s = await page.evaluate(() => ({
      ready: !!window.__pcReady,
      errbar: (document.getElementById('errbar') || {}).textContent || '',
      info: (document.getElementById('info') || {}).textContent || '',
      canvas: !!document.querySelector('canvas'),
      title: document.title,
      h1: (document.querySelector('h1') || {}).textContent || '',
      dropHidden: (document.getElementById('dropzone') || { classList: { contains: () => false } }).classList.contains('hidden'),
    }));
    const ok = s.ready && !s.errbar && s.canvas && /×/.test(s.info) && s.dropHidden && errs.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? '✔' : '✘'} ${name}`);
    console.log(`   ready=${s.ready} canvas=${s.canvas} 素材信息="${s.info.replace(/\s+/g, ' ')}"`);
    console.log(`   横幅="${s.errbar || '(无)'}" 控制台错误=${errs.length ? JSON.stringify(errs) : '无'}`);
    console.log(`   标题="${s.title}" / h1="${s.h1}"`);
    await page.close();
  }
  await browser.close();
  console.log(fail ? `\n✘ ${fail} 个入口未通过` : '\n✔ 三个入口全部通过');
  process.exit(fail ? 1 : 0);
})();
