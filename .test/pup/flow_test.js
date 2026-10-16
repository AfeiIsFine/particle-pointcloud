/* 多段链式流动动画的浏览器级验证：
 * 1. 开启后 vDist 从 -0.9 逐级向 0.9 推进（19 个关键帧）
 * 2. 速度滑块：高速时推进更快
 * 3. 修改端点 → 动画退出；再开启 → 新范围内流动
 * 4. 停止 → 恢复开启前的 dist
 */
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

  await page.goto('http://127.0.0.1:8123/?test&dist=0.7&stats=1', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const read = () => page.evaluate(() => ({
    vDist: document.getElementById('vDist')?.textContent,
    morph: window.__PC_MORPH ?? null,
    btn: document.getElementById('btnAnim')?.textContent,
    distDisabled: document.getElementById('dist')?.disabled,
    genMs: window.__PC_ANIM_GEN_MS ?? null,
    frames: window.__PC_ANIM_FRAMES ?? null,
    phaseSpan: window.__PC_ANIM_PHASE_SPAN ?? null,
    speedLabel: document.getElementById('vAnimSpeed')?.textContent,
  }));
  const waitBtn = async (text, timeoutMs) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const b = await page.evaluate(() => document.getElementById('btnAnim').textContent);
      if (b.includes(text)) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  };

  console.log('初始:', JSON.stringify(await read()));

  /* 开启 → 等生成完成 */
  await page.click('#btnAnim');
  const started = await waitBtn('停止', 40000);
  const s0 = await read();
  console.log(`动画开始(生成${s0.genMs}ms):`, JSON.stringify(s0));

  /* 采样 vDist 的变化轨迹（3 秒内多次） */
  const vd1 = parseFloat(s0.vDist);
  await new Promise(r => setTimeout(r, 3000));
  const m1 = await read();
  await new Promise(r => setTimeout(r, 3000));
  const m2 = await read();

  /* 速度对比：重置动画（波形从 0 起），同样 2s 窗口内 0.2 速变化应远小于 2 速 */
  const measure = async (spd) => {
    await page.click('#btnAnim');            // 停止
    await new Promise(r => setTimeout(r, 1200));
    await page.click('#btnAnim');            // 重开（波形从起点开始）
    const t1 = Date.now();
    while (Date.now() - t1 < 40000) {        // 等生成完成、动画开始
      const b = await page.evaluate(() => document.getElementById('btnAnim').textContent);
      if (b.includes('停止')) break;
      await new Promise(r => setTimeout(r, 300));
    }
    await page.evaluate(spd => {
      const el = document.getElementById('animSpeed');
      el.value = String(spd);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, spd);
    const a = (await read()).morph;
    await new Promise(r => setTimeout(r, 2000));
    const b = (await read()).morph;
    return Math.abs(b - a);
  };
  const slowD = await measure(0.2);
  const fastD = await measure(2);

  /* 改端点 → 退出；再开启 → 新范围 */
  await page.evaluate(() => {
    document.getElementById('animFrom').value = '-0.5';
    document.getElementById('animFrom').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => {
    document.getElementById('animTo').value = '0.5';
    document.getElementById('animTo').dispatchEvent(new Event('change', { bubbles: true }));
  });
  const afterChange = await read();
  await page.click('#btnAnim');
  const restarted = await waitBtn('停止', 40000);
  await new Promise(r => setTimeout(r, 4000));
  const m3 = await read();

  /* 停止 */
  await page.click('#btnAnim');
  await new Promise(r => setTimeout(r, 1500));
  const after = await read();
  console.log('3s/6s:', JSON.stringify(m1), JSON.stringify(m2));
  console.log(`速度 0.2: |Δm|=${slowD.toFixed(3)}  速度 2: |Δm|=${fastD.toFixed(3)}`);
  console.log('改端点后:', JSON.stringify(afterChange), ' 新范围 4s:', JSON.stringify(m3));
  console.log('停止后:', JSON.stringify(after));
  console.log('errors:', JSON.stringify(errors));

  const inRange = v => v >= -0.92 && v <= 0.92;
  const okStarted = started && s0.distDisabled === true && s0.phaseSpan >= 0.4;
  const okFlow = inRange(vd1) && m1.vDist !== s0.vDist && m2.vDist !== m1.vDist && inRange(parseFloat(m2.vDist));
  const okSpeed = fastD > slowD * 3;
  /* 按钮图形标记（▶/■）已改由 CSS ::before 渲染，文本里不再含符号 → 用"未处于停止态"判断 */
  const idle = t => !t.includes('停止');
  const okExit = idle(afterChange.btn) && afterChange.distDisabled === false;
  const okNewRange = restarted && parseFloat(m3.vDist) >= -0.55 && parseFloat(m3.vDist) <= 0.55;
  const okStop = idle(after.btn) && after.vDist === '+0.70' && after.distDisabled === false;
  console.log(`开启=${okStarted} 连续流动=${okFlow} 速度调节=${okSpeed} 改端点退出=${okExit} 新范围=${okNewRange} 停止恢复=${okStop}`);
  console.log((okStarted && okFlow && okSpeed && okExit && okNewRange && okStop) ? '✅ 连续流动动画测试通过' : '❌ 连续流动动画测试未通过');
  await browser.close();
  process.exit((okStarted && okFlow && okSpeed && okExit && okNewRange && okStop) ? 0 : 1);
})();
