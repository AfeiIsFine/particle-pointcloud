# 图片转粒子点云效果 · 代码审核报告

审核日期：2026-10-11　审核对象：`index.html`（2978 行，单文件开发版）
使用技能：`threejs-debug-profiler`（性能剖析）、`threejs-aaa-graphics-builder`（画面标准）、
`web-design-engineer`（设计批判 / 浏览器验收）、`ui-style-toolkit`（工具类 UI 风格基线）、
`a11y-interaction-motion-sensitivity`、`a11y-interaction-keyboard-navigation`（无障碍）

> 本报告所有性能数字都是 headless Chrome + 系统 Chrome（**真实 GPU**：ANGLE Metal / Apple M1 Max）
> 在 1440×900、1000×562 测试图下实测；探针脚本在 `/tmp/pc_review/`，未改动项目任何文件。

---

## 一、总评

**代码不需要"性能优化"——它已经在性能上达标且有余量。** 需要修的是三个具体缺陷（一个功能 bug、
一个可访问性硬伤、一份过期的对外构建）和若干工程细节。

代码本身处于工程化水平而非原型水平：注释解释的是"为什么这样做、踩过什么坑"而不是复述代码；
参数改动分了"实时 uniform / 需要重采样"两条路；重建有防抖 + 令牌化的等待提示；
轨迹构建用 `setTimeout(step,0)` 分片避免长时间阻塞。这些是很多生产项目都做不到的。

---

## 二、实测基线（生产默认路径）

| 场景 | 帧率 | p95 | p99 | 最差单帧 | JS 堆 |
|---|---|---|---|---|---|
| 默认 20k · 柔光点 · 无辉光 | **60.0** | 18.0 ms | 18.6 ms | 19.7 ms | 8.1 MB |
| 40k | 60.0 | 18.0 | 18.8 | 20.1 | 9.2 MB |
| 100k | 60.0 | 18.2 | 19.5 | 20.3 | 12.0 MB |
| 300k（滑块上限） | 60.0 | 18.3 | 19.2 | 21.7 | 21.1 MB |
| 实心球体 20k | 60.0 | 17.3 | 18.1 | 18.9 | 8.1 MB |
| 辉光 1.0 + 100k | 60.0 | 18.2 | 20.1 | 20.7 | 12.1 MB |
| 绕过 composer 直出（对照） | 60.0 | 18.9 | 21.4 | 22.9 | 8.3 MB |
| 关掉深度预通道（对照） | 60.0 | 18.6 | 20.1 | 24.3 | 8.3 MB |

- **流动动画**（20k 粒子 × 12 关键帧轨迹，Catmull-Rom 每帧 CPU 插值）：**0.6 – 2.8 ms/帧**，稳 60fps。
  轨迹构建 547 ms（有分片 + 进度文案），流动层额外占 ~22 MB 堆。
- 画布显示尺寸 1440×900 = 绘制缓冲 1440×900（dpr=1），`setPixelRatio(min(dpr,2))` 有上限 ✓
- 控制台**零报错**（唯一 404 是 `favicon.ico`）。
- 结论：GPU 与 CPU 两个方向都有大量余量。300k 粒子、100k+辉光都守得住 60fps，
  **不需要 LOD、不需要降采样、不需要砍功能**。深度预通道的额外一遍绘制实测无代价。

---

## 三、需要修的问题

### P0-1 · AO 烘焙在主线程同步跑，规模一开就冻结页面（最严重）

`bakeAO()`（index.html:1328）对每颗粒子扫 27 个格子。按代码自己的公式，
`AO_RADIUS_MULT = 5.5` 意味着每颗粒子平均要检查 **(4/3)π·5.5³ ≈ 697 个邻居**——
远多于平滑密度估计实际所需。

实测（实心球体模式，只改粒子数量，每次独立页面）：

| 粒子数 | 单次冻结 |
|---|---|
| 20,000 | 0.62 s |
| 50,000 | 2.61 s |
| 100,000 | 4.39 s |
| 200,000 | 10.3 s |
| **300,000** | **17.8 s**（另一轮同类测量 26.3 s，受机器负载影响） |

三条触发路径，**其中一条完全没有提示**：

1. 点「实心球体」→ `withBusy(rebuildMaterials)`（index.html:2688）：有"计算中…"胶囊。
   这里看门狗**不会**误收提示——同步阻塞期间定时器无法执行，`finally` 里的 `hideBusy` 会先清掉它。设计是对的。
2. 拖「粒子数量 / 分布偏向」→ `rebuildDebounced`（index.html:2639）：有提示，但**松手后每次卡 4 秒以上**。
3. **换图 → `processImage()`（index.html:2229）里是裸调 `buildPoints()`，没有任何提示。**
   而 `processImage` 会在亮背景图上自动把形态切成实心球体（index.html:2219-2226）。
   于是"把粒子数拉到 300k，再拖一张白底图进来"= 静默冻结十几秒。

**建议（按性价比）：**

- **必做**：`processImage` 的重算走 `withBusy()`，与其它路径一致。
- **首选修法**：把 AO 烘焙**分片**。文件里已有现成范式——`buildMorphLayerAsync` 用 `setTimeout(step, 0)`
  逐帧推进；AO 的逐粒子循环彼此独立，天然可切分。分片不减少总计算量，但页面不再冻结。
- **配套**：把 `AO_RADIUS_MULT` 默认值从 5.5 下调。实测（300k 实心球，只改 `?aorad`）：

  | aorad | 冻结 | 平均遮蔽 `aoMean` | 画面平均亮度 | 与 5.5 差异 >6 的像素 |
  |---|---|---|---|---|
  | 5.5（现状） | 26.3 s | 0.5581 | 60.14 | — |
  | 4.0 | 8.8 s | 0.5810 | 60.50 | 0.04 % |
  | 3.0 | 4.9 s | 0.6031 | 60.82 | 0.63 % |
  | 2.0 | 2.1 s | 0.6239 | 61.05 | 2.19 % |

  `aoMin` 在四档下**恒为 0.30**（85 分位归一化 + `AO_STRENGTH` 保证了最暗处不变），
  变化的是"内部平均压暗多少"。**降到 3.0 是约 5 倍收益、只有 0.63% 的像素有可见变化**，
  视觉上需要你自己在真实素材上确认一次再定默认值。
  （对照图：`/tmp/pc_review/ao_side_by_side.png`，左 5.5 / 中 3.0 / 右 2.0，已播种 RNG 保证粒子集完全一致。）
- **可选（收益最大、需要验证）**：把"逐粒子数邻居"换成"先算格子占据密度场、再按粒子采样"，
  复杂度从 O(n×697) 降到 O(n + cells)，任意粒子数都在百毫秒级。代价是衰减曲线形状会变，需要重标定。

### P0-2 · 取消「选择导出文件夹」会弹出"模块加载失败"

`renderExport()`（index.html:2873）里，`dir = await window.showDirectoryPicker(...)`（index.html:2891）
在 `try` 块（index.html:2917）**之外**。用户在系统选择框里点"取消"时抛 `AbortError`，
异常直接冒泡出 async 函数 → 触发全局 `unhandledrejection`（index.html:362）→ 顶部红条。

实测复现（桩掉 `showDirectoryPicker` 使其以 AbortError 拒绝）：

```json
{ "pickerCalled": 1,
  "errbar": "! 模块加载失败：The user aborted a request.",
  "recBarOn": false }
// unhandled: ["pageerror: AbortError: The user aborted a request."]
```

用户看到的是"模块加载失败"——与真实原因（自己点了取消）完全无关。

**修法**：把 picker 调用移进 `try`，或就地 `catch (e) { if (e.name === 'AbortError') return; throw e; }`。

### P1-1 · 流动动画时「分布偏向」滑块的白色填充不跟着走

`updateAnimLayer`（index.html:2143-2145）每帧写 `params.dist`、`$('vDist').textContent`、`$('dist').value`，
但**没有调用 `paintRange($('dist'))`**。而滑轨的白色已填充段是由 `--fill` 变量驱动的，只有 `paintRange` 会写它。

结果：动画播放时手柄在动、读数在变，**白色已填充段停在开播前的位置**。
一行修复：在 `$('dist').value = ...` 之后补 `paintRange($('dist'))`。

### P1-2 · 可访问性（对照两个新装的 a11y 技能标准）

**已做对的**：`#busy` / `#recBar` 有 `role="status" aria-live="polite"`；
分段控件用 `<button aria-pressed>` + `role="group" aria-label`；
`data-i18n-aria` 会随语言切换；`:focus-visible` 焦点环齐全（滑块还专门换成手柄光圈）；
`<details>` 原生可键盘操作；`document.documentElement.lang` 随语言更新。

**缺口（按严重度）：**

1. **收起面板后键盘彻底出不来（硬伤）。** `#toggleBtn`（index.html:405）是 `<div>`：
   实测 `TAG=DIV, tabIndex=-1, role=null`。而面板收起后**唯一的唤出入口就是它**。
   同时 `.panel.hidden { opacity:0; pointer-events:none }`（index.html:77）**没有 `visibility:hidden`**：
   实测收起后 `visibility:visible / opacity:0 / checkVisibility()=false`，
   而连续按 Tab 会依次落进 **`SUMMARY, btnUpload, bg, .rv, count, lumMin, lumMax, dist, .on, BUTTON …`**
   等十多个**看不见的控件**。
   → 纯键盘用户：先是焦点在隐形控件里迷路，然后**没有任何办法把面板叫回来**。
   （这条同时命中键盘导航技能的"每个交互元素必须可 Tab 到达""不得有键盘陷阱"，
   以及 ui-style-toolkit 技术债 #3。）
   修法：`#toggleBtn` 换成 `<button>`（样式不变）；`.panel.hidden` 补 `visibility:hidden`
   （配 `transition: opacity .2s, transform .25s, visibility 0s .25s`）。
2. **没有任何 `prefers-reduced-motion` 适配。** 全站只有一条
   `@media (prefers-reduced-motion: reduce) { #recBar .dot { animation: none } }`（index.html:261）。
   而**页面首次打开会自动播放流动动画**（`maybeAutoStartFlow`，index.html:2074）＋镜头环绕巡游。
   动效敏感度技能："Never autoplay anything — let the user opt in"、"Respect prefers-reduced-motion …
   Non-negotiable"；ui-style-toolkit 也把这条列为"新项目请补"的技术债 #1。
   修法：`matchMedia('(prefers-reduced-motion: reduce)')` 为真时不自动开流动；
   并补一条全局 `* { transition-duration:.01ms !important; animation-duration:.01ms !important }`。
   *（说明：流动动画是这个工具的核心卖点，"默认自动播"作为产品选择可以保留——但必须给动效敏感的人一个不播的开关。）*
3. **15 个控件全部没有无障碍名称。** 实测 `count/lumMin/lumMax/dist/depth/noise/size/bright/sat/bloom/
   floatAmp/animSpeed/animPhase/bg/expRes` 的 `accessibleName` 全为 `null`——页面里 **0 个 `<label>`**。
   可见的 `<span class="k" data-i18n="lCount">粒子数量</span>` 与输入框没有程序化关联，
   屏幕阅读器只念"滑块 20000"。
   修法：把 `<span class="k">` 改成 `<label class="k" for="count">`。CSS 是按 class 选中的，
   `data-i18n` 替换 textContent，两者都不受影响——每个控件一个词的改动。
4. **次要**：`#recBar` 的 `aria-live="polite"` 文本每帧都在改，导出时会持续刷屏播报（建议只在整秒变化时更新）；
   `animFrom/animTo` 的 `aria-label` 是硬编码英文 `"range start" / "range end"`（index.html:543,545），
   中文界面下会被念成英文，且没走 `data-i18n-aria`。

### P1-3 · 对外分享版是旧构建

`dist/index.html`（876 KB，9/13 12:15 构建）与 `particle-cloud-share.zip` 落后于开发版。
判定依据（对象属性名不参与 minify，同批词条可用于对照）：

| i18n 键 | 开发版 | dist |
|---|---|---|
| `panelChip` / `nMediaOff2` / `oFormSolid` / `nForm` / `lPhase` / `subFlow` / `btnAnimBusy` | 有 | **有** |
| `recStop` / `recProgress` / `recStopping` | 有 | **无** |

即 `#recBar`（导出进度条 + 停止按钮）整块功能不在分享版里；`showDirectoryPicker` 的出现次数也不同。
"发给别人双击打开"的那一份比开发版旧。

**修法**：上面几条修完后跑一次 `python3 build_share.py` 重新构建。
（我没有动它——对外交付物不该在审核里被顺手改掉。）

---

## 四、可优化项（都不是性能瓶颈，按收益排序）

1. **`prepareScan()` 没有缓存。** 它做两次 5×5 可分离高斯（全图 ×10 乘加 ×2 遍），
   而结果只依赖 `imageData` 与亮度上下限。改「粒子数量」「分布偏向」「深度强度」「相位散布」
   都会整段重来。4096² 大图实测：换图就绪 1.18 s，之后**每次重建 1.87 – 2.18 s**，
   重建过程 JS 堆峰值 **326 MB**。
   → 加缓存（键：`imageData` 身份 + 亮度带）后，大图上拖滑块从 ~2 s 降到接近 0。
   → 纵向那遍可以直接写回 `Lf`（`Lf` 用完即弃），省下 `T` 那 67 MB。
2. **改「相位散布」会重建整条点云并作废流动轨迹缓存。** 它只影响
   `phase[i] = Math.random() * params.animPhase`（index.html:1962）——O(n)、约 1 ms 的事，
   却走了 `rebuildDebounced` → 重新采样 + 重烘 AO + `clearAnimLayers()`，
   把花 547 ms 建好的轨迹丢掉、按钮退回"开始流动"。
   实测 1000×562 下总共 201 ms（代价不大），**图像大时叠加第 1 条的 2 s**。
   → 存一个 `phaseRand[i]`，改相位时只重算 `morphPhase`。
3. **`Math.random()` 让输出不可复现。** 同一张图两次加载，粒子抖动（±2px）、
   每粒子尺寸倍率、颜色微扰全都不同（本报告为了做像素级对照，不得不先给 RNG 播种）。
   加一个可选的 `?seed=` 会让视觉回归测试、以及"客户说这次和上次不一样"的排查省很多事。
4. **`gl_PointSize` 没有上限钳制**（index.html:937）：相机拉到最近（`minDistance = 2`）+ 4K 导出时
   可算到 250 px 以上；部分 GPU 的 `ALIASED_POINT_SIZE_RANGE` 上限是 255 甚至 63（老移动端），
   会被静默钳掉 → 观感不一致。加 `min(..., 256.0)` 一行。
5. **`loadImageFromBlob` 走 FileReader + dataURL**（index.html:2386）：整张图 base64 进内存再解码回位图。
   `createImageBitmap(blob)` 可省掉这一次编码 + 一次解码 + 一份 base64 拷贝。
6. **没有 `webglcontextlost` 处理**：一旦丢上下文页面永久冻住，至少该给一句提示。
7. **`resize` 不处理 DPR 变化**（index.html:2966）：窗口从 Retina 拖到普通屏（或反过来）时
   `renderer.setPixelRatio` 不会更新，画面会糊或过锐。
8. **换图后拖放失效**：`dropzone` 加载完图就 `display:none`，而 `dragover/drop` 只绑在它身上
   （index.html:2456-2458）→ 之后往窗口里拖文件**毫无反应**，只能点按钮。
   建议把 drop 监听到 `window` 上。
9. **`matchNearestPairs` 的 `cand.push([j, d2])`**（index.html:1853）每次配对分配上万个二元数组。
   由于总量小（20k×12 帧全流程 547 ms、且有进度提示），这属于"顺手能改"，
   改成两条平行数组或排序索引即可——**不是瓶颈，别为它花时间**。
10. **`renderer.debug.onShaderError`**（index.html:772）只读了 shader 的 info log。
    varying 不匹配这类**链接**失败，信息在 `gl.getProgramInfoLog(program)` 里，shader log 往往是空的
    → 红条会显示一条空错误。补一行 program log。
11. **文案措辞**：`nForm` 写"影棚 HDR 打光"，实现是着色器里的解析式程序化影棚
    （刻意不依赖外部 HDR 贴图，保证 `file://` 离线可用，见 index.html:1030 注释）。
    改成"程序化影棚打光"更贴合实际。
12. **`--ink-3` 对比度 3.26:1**（`.note` / `.p-sub` / `.g-no`）不到 AA 的 4.5:1。
    目前它只用在辅助信息上，符合 ui-style-toolkit 的既定分工；**但以后若把错误提示或关键状态放进去，
    必须换 `--ink-2`（7.25:1）或 `--ink`**。

---

## 五、我验证过但**不成立**的怀疑（记录在此，避免以后重复排查）

| 怀疑 | 实测 | 结论 |
|---|---|---|
| `preserveDrawingBuffer: true`（为录屏/导出保留帧缓冲）拖慢渲染 | A/B/C 三档：`true` 60.1 fps / `false` 59.8 fps / `false + antialias:false` 60.0 fps | **无可测差异**。且导出 `toBlob` 依赖它，保持现状正确 |
| `antialias: true` 在 composer 路径下白付代价 | 同上，无差异 | 不成立 |
| 深度预通道（多画一遍粒子）代价明显 | `?nocore=1` 对照：p95 18.6 vs 18.0 ms | 在噪声范围内 |
| 100k + 辉光会掉帧 | 60 fps / p95 18.2 ms | 不成立 |
| `?settle=1` 下测的 60 fps | **settle 模式 10 帧后停掉渲染循环**，量到的是空 rAF | 这是我自己第一次测量踩的坑，已重测 |
| `dist` 里 `gl_FragDepth` 出现 3 次 ⇒ 分享版还在写逐像素球面深度 | 那 3 次来自打包进来的 three.js（`gl_FragDepthEXT` 对数深度缓冲），不是应用代码 | 不成立 |

---

## 六、验收：一条命令、一个退出码

本报告的三条 P0/P1 缺陷已经固化成回归守卫（诊断技能 Phase 5 的"冻结基线"）：

```bash
cd .test/pup && node review_checks.js     # 需先起本地服务；约 28 秒；全过退出码 0
```

**2026-10-11 修复完成：5/5 通过。** 修复前为 0/5（退出码 1）。逐条对照：

| 断言 | 修复前 | 修复后 |
|---|---|---|
| 导出点「取消」不显示错误提示 | `#errbar` = "! 模块加载失败：The user aborted a request." | ✅ 不出现 |
| 实心球体 100k 单帧阻塞 < 1500 ms | 4285 ms | ✅ **109 ms**（300k：17812 → 161 ms） |
| 收起面板后键盘可达 + 焦点不进不可见控件 | `#toggleBtn` 是 `DIV`；13 个不可见控件可 Tab | ✅ `BUTTON`，0 个 |
| `prefers-reduced-motion` 下不自动播放流动 | 仍然自动开播 | ✅ 保持静止 |
| `dist` 与开发版同步 | 缺 `recStop`/`recProgress`/`recStopping` | ✅ 已重建 |

### 改了什么

| 文件 | 改动 |
|---|---|
| `index.html` | 导出取消的 `AbortError` 就地拦下（不再冒泡成"模块加载失败"）；AO 烘焙拆成 `aoPrepare`/`aoAccumulate`/`aoFinalize` + 分片驱动（每片 ≤5ms 让出主线程，带令牌防并发）；`buildPoints`/`rebuildMaterials`/`buildMediaPoints` 改 async 并 await 烘焙；`processImage` 的重算补上"计算中"提示；`#toggleBtn` 改 `<button>` + 面板收起加 `inert`；`.panel.hidden` 补 `visibility`；16 个控件补 `<label for>`；`prefers-reduced-motion` 全局适配 + 不自动播放；流动时补 `paintRange`；`gl_PointSize` 上限钳制；shader 链接日志 |
| `index.html` | `withBusy`/`rebuildDebounced` 抽出 `afterPaint()`：两次 rAF 与 60ms 定时器竞速（rAF 在渲染循环停止时会被节流到几百毫秒，实测把重算推迟 2 秒） |
| `.test/pup/review_checks.js` | 新增：一条命令 5 项断言的回归守卫 |
| `.test/README.md` | 新增第 3 节：守卫用法 + 四条踩坑（含本报告作者踩过的） |
| `dist/` + `particle-cloud-share.zip` | 用 `build_share.py` 重新构建（862 KB / 368 KB） |

**正确性证明（分片不改数学）**：播种 RNG 后同一粒子集下，改动前后 `aoMean`/`aoMin`/`meanLin`
逐位一致（`0.5581 / 0.3 / 0.13278`）。这是"重构没改行为"最省事的证据。

### 回归确认（与改动前的原始副本逐项对照）

| 测试 | 改动前 | 改动后 |
|---|---|---|
| `test_sampling.mjs`（算法级） | 通过 | ✅ 通过 |
| `browser_test.js` / `form_smoke.js` / `autodist_test.js` / `solid_flow_test.js` / `crossfade_test.js` | 通过 | ✅ 通过 |
| `flow_test.js` | ❌ 失败 | ❌ **失败（既有，与本次改动无关）** |
| `alpha_test.js` | ❌ 崩溃 | ❌ **崩溃（既有）** |
| `gloss_sweep.js` | ❌ 崩溃 | ❌ **崩溃（既有）** |

三个既有红灯都是**测试跟不上 UI 变化**，不是功能坏了：
`flow_test` 的"连续流动"阈值是按旧波形写的；`alpha_test` 读的 `#opacity`/`#vOpacity`
与 `gloss_sweep` 读的 `#vGloss` 这两个面板控件**已经从 UI 移除**（透明度与光泽改为 URL 参数/固定值）。
建议要么更新这三个脚本，要么删掉——留着一堆红的测试等于没有测试。

### 仍未处理（按性价比排在后面）

1. `prepareScan()` 没缓存：4096² 大图每次重建仍要 1.9–2.2 s、JS 堆峰值 326 MB。改滑块时会卡这一下。
2. 改「相位散布」仍会重建整条点云并作废流动轨迹缓存（实测 201ms @1000×562）。
3. `Math.random()` 让输出不可复现，视觉回归只能靠统计容差。
4. 换图后拖放失效（`dropzone` 隐藏后没有窗口级 drop 监听）。
5. 无 `webglcontextlost` 处理；`resize` 不处理 DPR 变化。

**回滚**：改动前的原始副本在
`index.html.auto-backup-1011-1344`（150551 字节）、`dist/index.html.auto-backup-1011-1344`、
`particle-cloud-share.auto-backup-1011-1344.zip`、`.test/README.md.auto-backup-1011-1344`。

