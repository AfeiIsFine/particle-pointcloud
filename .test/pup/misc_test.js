/* 综合验证：自动旋转默认关 / 亮度下限滑块 / 单粒子相位流动 */
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  /* 1. 自动旋转默认关闭：读取面板 select 状态（代码侧 controls.autoRotate 初始化为 false） */
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  const rotSel = await page.evaluate(() => document.getElementById('autoRotate').value);

  /* 2. 亮度下限：拖到 100 → 重建后暗粒子应大量消失（avgL 上升） */
  const statsBefore = await page.evaluate(() => window.__PC_STATS);
  await page.evaluate(() => {
    const el = document.getElementById('lumMin');
    el.value = '100';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1500));
  const statsAfter = await page.evaluate(() => window.__PC_STATS);

  /* 3. 流动模式：单粒子相位跨度 */
  await page.evaluate(() => {
    document.getElementById('lumMin').value = '0.5';
    document.getElementById('lumMin').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.click('#btnAnim');
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const b = await page.evaluate(() => document.getElementById('btnAnim').textContent);
    if (b.includes('停止')) break;
    await new Promise(r => setTimeout(r, 300));
  }
  const phaseSpan = await page.evaluate(() => window.__PC_ANIM_PHASE_SPAN ?? null);
  await new Promise(r => setTimeout(r, 2500));
  const morph = await page.evaluate(() => window.__PC_MORPH);
  console.log('自动旋转 select =', rotSel, '(0=关 ✓)');
  console.log('亮度下限: 之前 avgL =', statsBefore.avgL.toFixed(3), '→ lumMin=100 后 avgL =', statsAfter.avgL.toFixed(3));
  console.log('相位跨度 =', phaseSpan, '(0.25 = 粒子在 2s 内先后出发)  流动中 morph =', morph);
  console.log('errors:', JSON.stringify(errors));

  const okRot = rotSel === '0';
  const okLum = statsAfter.avgL > statsBefore.avgL * 1.3;
  const okPhase = phaseSpan !== null && phaseSpan >= 0.2;
  const okFlow = morph !== null && morph >= 0;
  console.log((okRot && okLum && okPhase && okFlow) ? '✅ 综合测试通过' : '❌ 综合测试未通过');
  await browser.close();
  process.exit((okRot && okLum && okPhase && okFlow) ? 0 : 1);
})();
