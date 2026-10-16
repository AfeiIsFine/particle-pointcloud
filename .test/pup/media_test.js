/* GIF 与视频模式验证：粒子颜色随媒体帧变化 */
const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
           '--autoplay-policy=no-user-gesture-required'],
  });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/?test&dist=0.7', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  /* 1. GIF：上传 5 帧彩色动画，两时刻截图颜色应不同 */
  const fileInput = await page.$('#file');
  await fileInput.uploadFile(path.join(__dirname, '..', 'test_anim.gif'));
  await new Promise(r => setTimeout(r, 2500));
  const info1 = await page.evaluate(() => document.getElementById('info').textContent.replace(/\s+/g, ' '));
  await page.screenshot({ path: '../gif_a.png' });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: '../gif_b.png' });

  /* 2. 视频：页面内用 canvas+MediaRecorder 生成一段彩色 webm 并拖放上传 */
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 180;
    const ctx = c.getContext('2d');
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(res => rec.onstop = res);
    rec.start(100);
    const t0 = performance.now();
    await new Promise(res => {
      const step = () => {
        const t = (performance.now() - t0) / 1000;
        ctx.fillStyle = `hsl(${(t * 90) % 360}, 90%, 55%)`;
        ctx.fillRect(0, 0, 320, 180);
        if (t < 2) requestAnimationFrame(step); else res();
      };
      step();
    });
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const file = new File([blob], 'test.webm', { type: 'video/webm' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const dz = document.getElementById('dropzone');
    dz.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 3000));
  const info2 = await page.evaluate(() => document.getElementById('info').textContent.replace(/\s+/g, ' '));
  await page.screenshot({ path: '../video_a.png' });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: '../video_b.png' });
  console.log('GIF info:', info1);
  console.log('视频 info:', info2);
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
