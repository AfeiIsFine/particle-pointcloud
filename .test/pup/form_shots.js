/* 形态对照图：用**默认素材** testpic/black_4.jpg 出柔光点 / 实心球体两张。
 *
 * 与 ui_shot.js 的关键差异：不用 swiftshader 软件渲染。
 * 软件渲染下粒子叠加/辉光/着色器的观感与真实 GPU 有差异，而这两张是给人看效果的
 * 展示图，必须用与用户一致的渲染路径。做法是 headed Chrome + 窗口移到屏幕外。
 */
const puppeteer = require('puppeteer-core');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:8123/index.html';
const OUT = process.argv[2] || '.';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,                    // 真 GPU
    args: [
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-position=-2400,-2400',  // 窗口移到屏幕外，不打扰用户
      '--window-size=1600,1000',
      '--force-device-scale-factor=1',
    ],
    defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  });

  const errors = [];

  /* 构图：默认素材是竖幅（896×1344 → 世界尺寸 10×15），相机 z=8.5 时可见高度仅 7.9，
     默认取景只有云的下三分之一、主体认不出来。这里用 CDP 滚轮真实拉远 3 档
     （走 OrbitControls 原生路径，不改任何代码），让形态可读、粒子仍清晰。
     size=1.0 + count=50000 对两种形态取同一组参数，对照才只差"形态"这一个变量。 */
  const ZOOM_STEPS = 3;

  async function shoot(name, query, waitMs) {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(`${name} console: ${m.text()}`);
    });
    // ?test 会跳过默认素材，这里必须**不要**加，才会走换图自动判定（贴近真实使用）
    await page.goto(`${BASE}?${query}`, { waitUntil: 'load', timeout: 45000 });
    await new Promise(r => setTimeout(r, waitMs));

    if (ZOOM_STEPS > 0) {
      const client = await page.target().createCDPSession();
      await page.mouse.move(800, 500);
      for (let i = 0; i < ZOOM_STEPS; i++) {
        await client.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: 800, y: 500, deltaX: 0, deltaY: 120, modifiers: 0 });
        await new Promise(r => setTimeout(r, 90));
      }
      await new Promise(r => setTimeout(r, 1200));
    }
    // 收起左右两栏面板，只留点云本身（这是"效果图"，不是"界面图"）
    await page.evaluate(() => {
      for (const id of ['panelL', 'panel']) {
        const el = document.getElementById(id);
        if (el) { el.classList.add('hidden'); el.setAttribute('inert', ''); }
      }
      const btn = document.getElementById('toggleBtn');
      if (btn) btn.classList.remove('show');
    });
    await new Promise(r => setTimeout(r, 700));   // 等收起过渡结束
    const state = await page.evaluate(() => ({
      ready: !!window.__pcReady,
      count: document.getElementById('count') ? document.getElementById('count').value : '?',
      form: document.getElementById('solid') ? document.getElementById('solid').value : '?',
      size: document.getElementById('size') ? document.getElementById('size').value : '?',
      dist: document.getElementById('dist') ? document.getElementById('dist').value : '?',
      lm: [document.getElementById('lumMin')?.value, document.getElementById('lumMax')?.value],
      bg: document.getElementById('bg') ? document.getElementById('bg').value : '?',
      info: document.getElementById('info') ? document.getElementById('info').textContent : '',
    }));
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(name, JSON.stringify(state));
    await page.close();
  }

  /* 注意：绝不能加 ?settle=1。
     settle 会停掉 animate()，而实心球体是"深度预通道 + 主通道 + 后处理"多趟渲染，
     窗口在屏幕外时 Chrome 会限流 rAF —— 循环在管线跑完前就停了，截出来是全黑画布
     （实测 px.max=5、非黑像素 0；不加 settle 时 px.max=227、非黑像素 7936）。
     这是截图路径的假象，不是应用缺陷。 */
  await shoot('form-soft-dots', 'count=50000&size=0.5', 5000);
  await shoot('form-solid-spheres', 'solid=1&count=50000&size=1.0', 8000);

  console.log('errors:', errors.length ? errors : '无');
  await browser.close();
})();
