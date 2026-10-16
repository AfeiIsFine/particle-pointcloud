/* 启动横幅诊断：量「诊断守卫(12s) vs __pcReady」的竞态 + 横幅是否会自行消失
   用法：node .test/pup/startup_banner_diag.js [页面路径...]
   默认测 dist/index.html 与 dist-web/index.html（本地 8123 静态服务）
   要点：CDP 限速 + 禁用缓存（走缓存会让限速失效，测出来的是假数据）
*/
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const KB = 1024, Bps = (kbps) => kbps * KB / 8;
const PAGES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['/dist/index.html', '/dist-web/index.html'];

const CASES = [
  { name: '慢速 4G  2Mbps / 150ms', net: { latency: 150, downloadThroughput: Bps(2048), uploadThroughput: Bps(768), packetLoss: 1 } },
  { name: '跨境拥塞 800kbps / 300ms / 2% 丢包', net: { latency: 300, downloadThroughput: Bps(800), uploadThroughput: Bps(400), packetLoss: 2 } },
  { name: '极差  400kbps / 400ms / 3% 丢包', net: { latency: 400, downloadThroughput: Bps(400), uploadThroughput: Bps(200), packetLoss: 3 } },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });

  for (const p of PAGES) {
    console.log('\n══════════ ' + p + ' ══════════');
    for (const c of CASES) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setCacheEnabled(false);
      await page.setViewport({ width: 1280, height: 800 });

      const cdp = await page.target().createCDPSession();
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...c.net });

      let wireBytes = 0, enc = '(无压缩)';
      page.on('request', (r) => { if (r.url().includes(p)) r.__t0 = Date.now(); });
      page.on('response', async (r) => {
        if (!r.url().includes(p)) return;
        enc = r.headers()['content-encoding'] || '(无压缩)';
        try { wireBytes = (await r.buffer()).length; } catch (e) {}
      });

      await page.evaluateOnNewDocument(() => {
        window.__T = { navStart: performance.now() };
        document.addEventListener('DOMContentLoaded', () => { window.__T.dcl = performance.now(); });
        const tick = () => {
          if (window.__pcReady && !window.__T.ready) window.__T.ready = performance.now();
          if (!window.__T.errbarAt && document.getElementById('errbar')) window.__T.errbarAt = performance.now();
          /* 记录横幅消失的时刻（出现过的前提下） */
          if (window.__T.errbarAt && !window.__T.errbarGone && !document.getElementById('errbar')) {
            window.__T.errbarGone = performance.now();
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      const t0 = Date.now();
      await page.goto('http://127.0.0.1:8123' + p, { waitUntil: 'load', timeout: 180000 });
      await page.waitForFunction('window.__pcReady === true', { timeout: 90000 }).catch(() => {});
      const readyWall = Date.now() - t0;
      await new Promise(r => setTimeout(r, 8000));   // 就绪后再等 8 秒，看横幅是否撤掉

      const out = await page.evaluate(() => ({
        T: window.__T, ready: !!window.__pcReady,
        errbar: (document.getElementById('errbar') || {}).textContent || '',
        stillThere: !!document.getElementById('errbar'),
        canvas: !!document.querySelector('canvas'),
      }));

      const ms = (v) => (v == null ? '—' : Math.round(v) + 'ms');
      const verdict = out.T.errbarAt == null
        ? '✔ 横幅未出现（在 12s 之内就绪）'
        : (out.stillThere ? '✘ 横幅仍在（应已撤掉）'
                          : '✔ 横幅出现过，就绪后已自行撤掉 @' + ms(out.T.errbarGone));
      console.log(`【${c.name}】`);
      console.log(`  实际传输 ${(wireBytes / KB).toFixed(0)} KB (编码 ${enc}) | __pcReady ${Math.round(out.T.ready)}ms (墙钟 ${readyWall}ms) | canvas ${out.canvas ? '有' : '无'}`);
      console.log(`  横幅出现 ${ms(out.T.errbarAt)} → ${verdict}`);
      if (out.errbar) console.log(`  横幅文字: ${out.errbar.replace(/\n/g, ' ')}`);
      await ctx.close();
    }
  }
  await browser.close();
})();
