/* 亮度带通验证：
 *   A) 手动设定时，上下限都真实生效（硬性过滤）
 *   B) 换图后的自动默认值符合规格：
 *        暗色背景 → 下限 30 / 上限 255 / 柔和光点
 *        亮色背景 → 下限 0  / 上限 240 / 实心球体
 * 判据用 ?stats=1 钩子输出的 avgL（粒子的平均亮度，线性空间）：
 *   抬高下限 → 暗部被删 → avgL 上升；压低上限 → 亮部被删 → avgL 下降。
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run(extra, file, autoOn) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ctrl = autoOn ? '&bgauto=1' : '&bgauto=0&bg=000000';   // autoOn 时不固定背景，才能测自动判定
  await page.goto(`http://127.0.0.1:8123/index.html?blank&stats=1&count=80000${ctrl}${extra || ''}`,
    { waitUntil: 'load', timeout: 40000 });
  await new Promise(r => setTimeout(r, 2500));
  if (file) {                                   // 走真实换图路径测自动判定
    await (await page.$('#file')).uploadFile(file);
    await new Promise(r => setTimeout(r, 4000));
  }
  const st = await page.evaluate(() => ({
    n: window.__PC_STATS && window.__PC_STATS.n,
    avgL: window.__PC_STATS && window.__PC_STATS.avgL,
    lo: document.getElementById('vLumMin').textContent,
    hi: document.getElementById('vLumMax').textContent,
    solid: document.getElementById('solid').value,
  }));
  await browser.close();
  return { extra: extra || '(默认)', ...st, errors };
}

(async () => {
  /* 手动带通用固定素材（不带自动判定），保证只有亮度过滤这一个变量在变 */
  const FIX = '../fixtures/bg_dark.png';
  const rows = [];
  for (const e of ['', '&lumMin=60', '&lumMax=120', '&lumMin=60&lumMax=200']) rows.push(await run(e, FIX));
  rows.forEach(r => console.log(
    `${r.extra.padEnd(22)} 粒子=${r.n} avgL=${r.avgL === undefined ? 'n/a' : r.avgL.toFixed(4)} 下限=${r.lo} 上限=${r.hi}`));

  const [, lo60, hi120, band] = rows;
  const okFloor = lo60.avgL > rows[0].avgL;      // 抬高下限 → 变亮
  const okCeil = hi120.avgL < rows[0].avgL;      // 压低上限 → 变暗
  const okBand = band.avgL > hi120.avgL;         // 只留中间带 → 比"只砍亮部"更亮

  const dark = await run('', '../fixtures/bg_dark.png', true);
  const bright = await run('', '../fixtures/bg_bright.png', true);
  console.log(`\n暗底图自动值: 下限=${dark.lo} 上限=${dark.hi} 形态=${dark.solid === '0' ? '柔和光点' : '实心球体'}`);
  console.log(`亮底图自动值: 下限=${bright.lo} 上限=${bright.hi} 形态=${bright.solid === '0' ? '柔和光点' : '实心球体'}`);
  const okAuto = dark.lo === '30' && dark.hi === '255' && dark.solid === '0'
              && bright.lo === '0' && bright.hi === '240' && bright.solid === '1';

  const errs = rows.concat([dark, bright]).flatMap(r => r.errors);
  const all = okFloor && okCeil && okBand && okAuto && !errs.length;
  console.log(`上限生效=${okCeil}  下限生效=${okFloor}  带通生效=${okBand}  换图自动值=${okAuto}`);
  console.log(all ? '✅ 亮度带通测试通过' : '❌ 亮度带通测试未通过');
  process.exit(all ? 0 : 1);
})();
