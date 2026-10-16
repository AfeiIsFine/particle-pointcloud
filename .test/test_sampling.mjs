/* 算法级验证：从 index.html 提取真实的采样代码，在 Node 里执行并统计粒子分布。
 * 不依赖浏览器 / WebGL，只验证"分布偏向"核心逻辑。
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf-8');

/* 按花括号配对提取函数（避免正则被函数体内的 } 行截断） */
function extractFunc(name) {
  const start = html.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('未找到 ' + name);
  let i = html.indexOf('{', start), depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) break; }
  }
  return html.slice(start, i + 1);
}

/* 页面真实代码（buildPoints 依赖这些；AO 常量在页面里是模块级声明，需一并带进来） */
const src =
  'const AO_REF_HEIGHT = 1800; let AO_RADIUS_MULT = 5.5; const AO_STRENGTH = 0.70; const WEIGHT_FLOOR = 0.02;\n' +
  extractFunc('srgbToLinear') + '\n' +
  extractFunc('bakeAO') + '\n' +
  extractFunc('aoForPositions') + '\n' +
  extractFunc('luminanceWeight') + '\n' +
  extractFunc('prepareScan') + '\n' +
  extractFunc('sampleFromScan') + '\n' +
  extractFunc('samplePoints') + '\n' +
  extractFunc('buildPoints');

/* ---- 测试环境桩（挂到 globalThis，供 new Function 使用） ---- */
globalThis.THREE = {
  BufferGeometry: class {
    setAttribute(name, attr) { this._attrs = this._attrs || {}; this._attrs[name] = attr.array; }
    dispose() {}
  },
  Float32BufferAttribute: class { constructor(arr) { this.array = arr; } },
  Points: class { constructor(geo, mat) { this.geometry = geo; this.material = mat || { dispose() {} }; } },
};
globalThis.scene = { remove() {}, add() {} };
globalThis.makeMaterial = () => ({ uniforms: { uSize: { value: 0 }, uFloatAmp: { value: 0 }, uOpacity: { value: 1 }, uProgress: { value: 0 }, uMorph: { value: 0 } }, dispose() {} });
globalThis.$ = () => ({ innerHTML: '' });
globalThis.window = { __PC_SETTLE: false };
globalThis.points = null;
globalThis.animStart = 0;
globalThis.params = { count: 40000, size: 0.3, depth: 2.0, depthDir: 1, noise: 0.3, dist: 0.7, depthMode: 'brightness', lumMin: 0, lumMax: 255, animFrom: -0.9, animTo: 0.9, animSpeed: 1 };
/* 动画系统相关全局（buildPoints 开头会引用） */
globalThis.animState = null;
globalThis.animLayers = null;
globalThis.preAnimDist = 0.7;
globalThis.animBuildToken = 0;
globalThis.ANIM_KEYFRAMES = [-1, -0.8, -0.6, -0.4, -0.2, 0, 0.15, 0.3, 0.5, 0.7];
globalThis.ANIM_BTN_IDLE = 'idle';
globalThis.fmtDist = v => (v > 0 ? '+' : '') + v.toFixed(2);
globalThis.exitAnimIfActive = () => {};
globalThis.clearAnimLayers = () => {};
/* buildPoints 收尾会调用 renderInfo()（页面里的 DOM 统计刷新）——本测试不涉及 DOM，给空桩即可 */
globalThis.renderInfo = () => {};
/* 深度预通道层（柔和光点的前后遮挡用）：与采样算法无关，空桩即可 */
globalThis.addCoreLayer = () => null;
globalThis.removeCoreLayer = () => {};
globalThis.pointsCore = null;

/* ---- 合成测试图：左半暗(L=40) 右半亮(L=220)，右下角一小块纯亮(L=250，面积 4%) ---- */
const W = 800, H = 600;
const data = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let L = x < W / 2 ? 40 : 220;
    if (x > W * 0.8 && y > H * 0.7) L = 250;
    const i = (y * W + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = L;
    data[i + 3] = 255;
  }
}
globalThis.imageData = { data, width: W, height: H };

/* 执行页面里的真实代码，取出两个函数 */
const { luminanceWeight: _lw, buildPoints } = new Function(src + '\nreturn { luminanceWeight, buildPoints };')();

/* ---- 统计 ---- */
function stats() {
  const attrs = points.geometry._attrs;
  const pos = attrs.position, col = attrs.color;
  const n = pos.length / 3;
  let brightHalf = 0, hotZone = 0;
  for (let k = 0; k < n; k++) {
    const px = pos[k * 3] / (10 / W) + W / 2;      // 世界坐标 → 图片 x
    const py = -pos[k * 3 + 1] / (10 / W) + H / 2; // 世界坐标 → 图片 y
    if (px >= W / 2) brightHalf++;
    if (px > W * 0.8 && py > H * 0.7) hotZone++;
  }
  return { n, brightHalf: brightHalf / n, hotZone: hotZone / n };
}

const cases = [
  { dist: 1,    lo: 0.95, hi: 1.01, tag: '≈100% 在右半亮部' },
  { dist: 0.7,  lo: 0.60, hi: 0.95, tag: '明显偏右半亮部' },
  { dist: 0,    lo: 0.45, hi: 0.55, tag: '均匀' },
  { dist: -0.7, lo: 0.05, hi: 0.40, tag: '明显偏左半暗部' },
  { dist: -1,   lo: -0.01, hi: 0.05, tag: '≈0% 在右半亮部' },
];

let fail = 0;
for (const c of cases) {
  params.dist = c.dist;
  buildPoints();
  const s = stats();
  const ok = s.brightHalf >= c.lo && s.brightHalf <= c.hi;
  if (!ok) fail++;
  console.log(
    `dist=${String(c.dist).padStart(4)}  粒子=${s.n}  右半亮部占比=${(s.brightHalf * 100).toFixed(1)}%  ` +
    `${ok ? '✓' : '✗ 预期 ' + c.tag}`
  );
}

/* dist=1 极限语义：应只取全图最亮的像素（L=250 小块） */
params.dist = 1;
buildPoints();
{
  const s = stats();
  const ok = s.hotZone > 0.97;
  if (!ok) fail++;
  console.log(`dist=1 极限检查：落在最亮小块(L=250)占比=${(s.hotZone * 100).toFixed(1)}% ${ok ? '✓' : '✗ 应为 ≈100%'}`);
}

/* 亮度下限：lumMin=100 时左半暗区（L=40）应全部被删除 */
params.dist = 0;
params.lumMin = 100;
buildPoints();
{
  const s = stats();
  const ok = s.brightHalf > 0.99;
  if (!ok) fail++;
  console.log(`lumMin=100 亮度过滤：暗半(L=40)粒子应全删，右半亮部占比=${(s.brightHalf * 100).toFixed(1)}% ${ok ? '✓' : '✗ 应为 ≈100%'}`);
  params.lumMin = 0.5;
}

/* 亚网格抖动：无抖动时所有粒子 x 都落在 stride 网格点上（离散值极少），
   有抖动后位置应高度多样化（打破网格周期性） */
params.dist = 0.7;
buildPoints();
{
  const pos = points.geometry._attrs.position;
  const n = pos.length / 3;
  const xs = new Set();
  for (let k = 0; k < n; k++) xs.add(Math.round(pos[k * 3] * 1e6));
  const ratio = xs.size / n;
  const ok = ratio > 0.5;
  if (!ok) fail++;
  console.log(`亚网格抖动：${n} 个粒子有 ${xs.size} 个不同 x 位置（多样性 ${(ratio * 100).toFixed(0)}%）${ok ? '✓' : '✗ 位置疑似被量化到网格'}`);
}

/* ---- buildKeyframes 关键帧序列测试（提取自页面真实代码） ---- */
{
  const kfFn = new Function(extractFunc('buildKeyframes') + '\nreturn buildKeyframes;')();
  const kf = kfFn();
  const ok = kf.length === 19 && Math.abs(kf[0] + 0.9) < 1e-9 && Math.abs(kf[18] - 0.9) < 1e-9 &&
             Math.abs((kf[1] - kf[0]) - 0.1) < 1e-9;
  if (!ok) fail++;
  console.log(`buildKeyframes: ${kf.length} 帧，首=${kf[0]} 末=${kf[18]} 步长=${(kf[1]-kf[0]).toFixed(1)} ${ok ? '✓' : '✗ 应为 19 帧、-0.9→0.9、步长 0.1'}`);
}

/* ---- matchNearestPairs 就近配对测试（提取自页面真实代码） ---- */
globalThis.ANIM_GRID_CELL = 0.7;
globalThis.ANIM_SHELLS = null;
{
  const pairSrc = extractFunc('animShells') + '\n' + extractFunc('matchNearestPairs');
  const { matchNearestPairs } = new Function(pairSrc + '\nreturn { matchNearestPairs };')();

  /* 合成：A 分布在 [-3,1]（暗部密集），B 分布在 [-1,3]（亮部密集），中间有重叠区
     —— 模拟真实图片中暗亮像素交错、就近迁移有优势的场景 */
  const N = 2000;
  const A = new Float32Array(N * 3), B = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    A[i * 3] = -3 + Math.random() * 4;   A[i * 3 + 1] = (Math.random() - 0.5) * 2;  A[i * 3 + 2] = (Math.random() - 0.5) * 2;
    B[i * 3] = -1 + Math.random() * 4;   B[i * 3 + 1] = (Math.random() - 0.5) * 2;  B[i * 3 + 2] = (Math.random() - 0.5) * 2;
  }
  const t0 = Date.now();
  const pairs = matchNearestPairs(A, B);
  const ms = Date.now() - t0;

  /* 唯一性 + 平均位移 */
  const seen = new Set();
  let dup = 0, sumD = 0;
  for (let i = 0; i < N; i++) {
    const j = pairs[i];
    if (seen.has(j)) dup++; else seen.add(j);
    const dx = A[i * 3] - B[j * 3], dy = A[i * 3 + 1] - B[j * 3 + 1], dz = A[i * 3 + 2] - B[j * 3 + 2];
    sumD += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const avgNear = sumD / N;

  /* 随机配对基线 */
  const idx = [...Array(N).keys()].sort(() => Math.random() - 0.5);
  let sumR = 0;
  for (let i = 0; i < N; i++) {
    const j = idx[i];
    const dx = A[i * 3] - B[j * 3], dy = A[i * 3 + 1] - B[j * 3 + 1], dz = A[i * 3 + 2] - B[j * 3 + 2];
    sumR += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const avgRand = sumR / N;

  /* 就近配对应显著优于随机配对（该场景下 3D 最优传输均值约 2.11，2.10 已接近最优） */
  const ok = dup === 0 && avgNear < avgRand * 0.9;
  if (!ok) fail++;
  console.log(`就近配对: ${N} 对耗时 ${ms}ms，重复配对 ${dup}，平均位移 ${avgNear.toFixed(2)}（随机配对基线 ${avgRand.toFixed(2)}）${ok ? '✓' : '✗'}`);
}

console.log(fail === 0 ? '\n✅ 算法测试全部通过' : `\n❌ ${fail} 项未通过`);
process.exit(fail === 0 ? 0 : 1);
