#!/usr/bin/env python3
"""构建单文件版：把 three.js 与应用打包进一个 index.html。

两种产物：
  python3 build_share.py            本机分享版 → dist/          （内嵌示例图，双击 file:// 可用，带 zip）
  python3 build_share.py --web      线上部署版 → dist-web/      （不内嵌示例图，附带 _headers）

--web 与默认版的区别只有一处：不把示例图 / 测试图 base64 内嵌进 HTML
（线上访问时这两张图用不到，却是最大的两块体积）。
--no-inline-media 可单独使用，效果相同。

诊断层（页面顶部的错误提示条）不在这里手写，而是从 index.html 的
PC_DIAG_START / PC_DIAG_END 标记之间**原样抽取**——那里是单一真相源，
避免"开发版已修、分享版还是旧逻辑"的漂移。
"""
import base64
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')            # 本机分享版
DIST_WEB = os.path.join(ROOT, 'dist-web')    # 线上部署版


def load_diag_block(html):
    """从源 index.html 抽取错误自诊断层（标记之间，含标记注释）。"""
    m = re.search(r'/\* ==== PC_DIAG_START.*?/\* ==== PC_DIAG_END ==== \*/', html, re.S)
    if not m:
        sys.exit('❌ 在 index.html 里找不到 PC_DIAG_START / PC_DIAG_END 标记（诊断层抽取失败）')
    body = m.group(0)
    for need in ('__pcShowError', '__pcClearErr', '__pcReady', 'DEADLINE_MS'):
        if need not in body:
            sys.exit('❌ 诊断层缺少必要内容：%s' % need)
    if '4000' in body:
        sys.exit('❌ 诊断层里还有硬编码的 4000ms（旧逻辑残留）')
    return body


def diag_for_share(block):
    """把诊断层改写成分享版/线上版措辞。

    与开发版的三处差异（都是"告诉用户到底该做什么"这一件事）：
      1. file:// 双击提示 → 分享版本来就是单文件，双击是对的（改用 ?test 自测）
      2. import map 检查 → 分享版是 IIFE，不存在 import map 依赖，删掉
      3. 启动等待文案 → 线上要下载整个主程序，说清"慢网属正常"与真实体积
    """
    # 1) file:// 提示
    before = block
    block = re.sub(
        r"  if \(location\.protocol === 'file:'\) \{.*?\n  \}\n",
        "  if (location.protocol === 'file:') {\n"
        "    show(L('本地文件方式打开（file://）。想看内置效果可在网址末尾加 ?test 回车。',\n"
        "            'Opened as a local file (file://). Append ?test to the URL to load the built-in sample.'));\n"
        "  }\n",
        block, flags=re.S)
    if block == before:
        sys.exit('❌ 分享版改写：file:// 提示段没匹配上（源文件格式变了？）')

    # 2) import map 检查（分享版用不到）
    before = block
    block = re.sub(
        r"  try \{\n    if \(!\(HTMLScriptElement\.supports.*?\n  \} catch\(e\) \{\}\n",
        "", block, flags=re.S)
    if block == before:
        sys.exit('❌ 分享版改写：importmap 检查段没匹配上')

    # 3) 启动等待文案
    before = block
    block = re.sub(
        r"  var BOOT_ZH = '.*?';",
        "  var BOOT_ZH = '程序尚未就绪。首次打开需要下载整个主程序（约 600 KB，压缩后约 280 KB），'\n"
        "              + '网络较慢或跨境线路下等十几秒属正常；若长时间停在这里，请检查网络后刷新。';",
        block, flags=re.S)
    block = re.sub(
        r"  var BOOT_EN = '.*?';",
        "  var BOOT_EN = 'The app is not ready yet. The first visit downloads the whole app (about 600 KB, '\n"
        "              + '~280 KB compressed), so 10+ seconds is normal on a slow or cross-border connection; '\n"
        "              + 'if it stays like this, check your connection and reload.';",
        block, flags=re.S)
    if block == before:
        sys.exit('❌ 分享版改写：启动文案段没匹配上')
    return block


def build(inline_media, web_mode):
    out_dir = DIST_WEB if web_mode else DIST
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

    diag = diag_for_share(load_diag_block(html)) if web_mode else load_diag_block(html)

    # 1. 提取 module script
    m = re.search(r'<script type="module">(.*?)</script>', html, re.S)
    if not m:
        sys.exit('❌ 找不到 module script')
    code = m.group(1)

    # 2. import 路径改为本地相对路径
    code = code.replace("from 'three/addons/", "from './libs/")
    code = code.replace("from 'three'", "from './libs/three.module.js'")

    # 3. 注入内嵌示例图（data URL，双击 file:// 打开时也能用 ?test 自测）
    if inline_media:
        test_b64 = base64.b64encode(open(os.path.join(ROOT, 'test.jpg'), 'rb').read()).decode()
        code = 'const TEST_IMG_DATAURL = "data:image/jpeg;base64,%s";\n' % test_b64 + code
        # 默认素材（打开页面即加载）也要内嵌，否则 file:// 双击时读不到相对路径
        default_img = os.path.join(ROOT, 'testpic', 'black_4.jpg')
        if os.path.exists(default_img):
            def_b64 = base64.b64encode(open(default_img, 'rb').read()).decode()
            code = 'const DEFAULT_IMG_DATAURL = "data:image/jpeg;base64,%s";\n' % def_b64 + code

    entry = os.path.join(ROOT, '.build_entry.js')
    bundle = os.path.join(ROOT, '.build_bundle.js')
    open(entry, 'w', encoding='utf-8').write(code)

    # 4. esbuild 打包（IIFE = 普通脚本，file:// 双击可用）
    #    --alias 处理 libs/ 内部对 'three' 的引用（不改动源文件，不影响开发版）
    r = subprocess.run(
        ['npx', '--yes', 'esbuild', entry, '--bundle', '--minify',
         '--format=iife', '--alias:three=./libs/three.module.js',
         '--outfile=' + bundle, '--log-level=warning'],
        cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('❌ esbuild 打包失败:\n' + r.stderr)
    js = open(bundle, encoding='utf-8').read()
    os.remove(entry)
    os.remove(bundle)

    # 5. 安全处理：防止 JS 内容破坏 HTML 结构
    if '</script' in js:
        js = js.replace('</script', '<\\/script')

    # 6. 生成单文件 HTML
    new_html = re.sub(r'<script type="importmap">.*?</script>\s*', '', html, flags=re.S)
    # 用同一份 diag 内容构造替换串：下面的断言才能逐字节成立
    diag_tag = '<script>\n' + diag + '\n</script>'
    new_html, n_diag = re.subn(r'<script>\s*/\* 错误自诊断.*?</script>', lambda _m: diag_tag,
                               new_html, flags=re.S)
    if n_diag != 1 or diag_tag not in new_html:
        sys.exit('❌ 诊断层注入失败（匹配到 %d 处）' % n_diag)
    new_html = new_html.replace(m.group(0), '<script>\n' + js + '\n</script>')

    # 7. 断言产物完整
    if not new_html.rstrip().endswith('</html>'):
        sys.exit('❌ 产物结尾不是 </html>，构建异常')
    if '__pcReady' not in new_html:
        sys.exit('❌ 产物里没有 __pcReady，启动信号缺失')
    if not inline_media and 'data:image/jpeg;base64' in new_html:
        sys.exit('❌ --no-inline-media 生效失败：产物里仍有 base64 内嵌图')

    os.makedirs(out_dir, exist_ok=True)
    out_html = os.path.join(out_dir, 'index.html')
    open(out_html, 'w', encoding='utf-8').write(new_html)
    size_kb = os.path.getsize(out_html) / 1024
    print('✅ %s/index.html   %.0f KB' % (os.path.basename(out_dir), size_kb))

    if web_mode:
        write_web_extras(out_dir)
        copy_runtime_extras(out_dir)
        return

    # 8. 运行时文件 + 缓存头 + 使用说明 + zip（仅本机分享版）
    write_headers(out_dir)
    copy_runtime_extras(out_dir)
    readme = README_TEXT
    open(os.path.join(out_dir, '使用说明.txt'), 'w', encoding='utf-8').write(readme)

    zpath = os.path.join(ROOT, 'particle-cloud-share.zip')
    if os.path.exists(zpath):
        os.remove(zpath)
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(out_html, 'particle-cloud/index.html')
        z.write(os.path.join(out_dir, '使用说明.txt'), 'particle-cloud/使用说明.txt')
    print('   particle-cloud-share.zip   %d KB' % (os.path.getsize(zpath) // 1024))


HEADERS_TEXT = (
    "# 本文件由 build_share.py 生成\n"
    "# 规则语法见 https://developers.cloudflare.com/workers/static-assets/headers/\n"
    "#\n"
    "# Cloudflare 静态资源的默认头是 Cache-Control: public, max-age=0, must-revalidate，\n"
    "# 也就是浏览器每次打开都要先回边缘校验一趟（跨境线路这一趟往返本身就几百毫秒）。\n"
    "\n"
    "# HTML：5 分钟内直接用本地缓存，省掉那趟校验；更新后最多滞后 5 分钟（刷新一次即最新）\n"
    "/index.html\n"
    "  Cache-Control: public, max-age=300\n"
    "/\n"
    "  Cache-Control: public, max-age=300\n"
    "\n"
    "# 示例图等静态资源：一年长缓存\n"
    "/testpic/*\n"
    "  Cache-Control: public, max-age=31536000, immutable\n"
    "/libs/*\n"
    "  Cache-Control: public, max-age=31536000, immutable\n"
)


def write_headers(out_dir):
    """_headers：只有托管在 Cloudflare（Workers 静态资源 / Pages）时才生效，其它托管会忽略。
    注意：这里不改 Content-Encoding——云端是否压缩由 Cloudflare 按 Accept-Encoding 决定
    （实测线上返回 Content-Encoding: br），手动声明会与云端冲突。"""
    open(os.path.join(out_dir, '_headers'), 'w', encoding='utf-8').write(HEADERS_TEXT)
    print('   _headers（缓存策略）已生成')


def copy_runtime_extras(out_dir):
    """两个产物都要带的运行时文件：图标 + 示例图（路径须与代码里的 'testpic/black_4.jpg' 一致）。

    线上版靠这两个文件避免"白屏 / 空页面 / favicon 404"；本机分享版也放一份，
    好处是 dist/ 用静态服务打开时的行为与线上完全一致（自测才有意义）。
    zip 里不需要：那份是给 file:// 双击用的，示例图已 base64 内嵌。
    """
    shutil.copyfile(os.path.join(ROOT, 'favicon.ico'), os.path.join(out_dir, 'favicon.ico'))
    src_img = os.path.join(ROOT, 'testpic', 'black_4.jpg')
    if not os.path.exists(src_img):
        sys.exit('❌ 缺少示例图 testpic/black_4.jpg（打开页面会没有素材）')
    dst_dir = os.path.join(out_dir, 'testpic')
    os.makedirs(dst_dir, exist_ok=True)
    shutil.copyfile(src_img, os.path.join(dst_dir, 'black_4.jpg'))
    print('   favicon.ico + testpic/black_4.jpg（%.0f KB 示例图）'
          % (os.path.getsize(src_img) / 1024))


def write_web_extras(out_dir):
    """线上版的附加文件。

    _headers（Cloudflare Workers / Pages 静态资源都认）：
      · HTML 用 max-age=300：默认是 max-age=0, must-revalidate，浏览器每次打开都要先
        回边缘校验一次（ETag/304）。跨境线路这一趟往返本身就是好几百毫秒，给 5 分钟
        新鲜度窗口可以省掉它；改了内容想立刻生效，刷新一次或等 5 分钟即可。
      · 其余静态文件 immutable 长缓存。
    注意：这里不改 Content-Encoding。云端是否压缩由 Cloudflare 按客户端 Accept-Encoding
    自行决定（实测该站点返回 Content-Encoding: br），手动声明会与云端冲突。

    另外两个文件是"打开就能看到东西"的必要条件（缺了就是白屏 / 空页面）：
      · testpic/black_4.jpg —— 打开页面即加载的示例图。线上版不 base64 内嵌它
        （内嵌等于每次打开都多传 145 KB），改为随目录上传、按相对路径读取，
        配合长缓存只下载一次。只拷这一张：testpic/ 里另外 8 张是开发用测试图。
      · favicon.ico —— 否则浏览器每次打开都多一个 404 请求（首次那趟很贵）。
    """
    write_headers(out_dir)


# ↓↓↓ 使用说明正文：原样保留（改文案时只改这一处）↓↓↓
README_TEXT = '''粒子点云生成器 · 使用说明
================================

【怎么用】
1. 解压后双击 index.html，用浏览器打开（推荐 Chrome / Edge / Safari 最新版）
   打开即自动载入一张示例图，可以直接开始调
2. 把图片拖进窗口，或点击窗口选择图片。换图时会自动识别背景明暗并配好一组参数：
   背景色 = 图里面积最大的颜色；暗背景 → 亮度下限 30 / 上限 255 / 柔和光点；
   亮背景 → 亮度下限 0 / 上限 240 / 实心球体。不满意随时手动改
   · 每个滑杆左侧的小 ↺ 可以把该参数一键还原成默认值
3. 鼠标拖拽旋转视角，滚轮缩放
4. 右上角面板按功能分成 7 组（素材 / 粒子分布 / 深度与体积 / 粒子外观 / 粒子动态 / 镜头视角 / 渲染导出），
   点组标题可折叠展开；点面板右上角的 — 收起整个面板，方便录屏
   面板分左右两栏：左边是静态设定（素材 / 背景 / 粒子分布 / 深度与体积 / 粒子外观），
   右边是动态调节与输出（粒子动态 / 镜头视角 / 渲染导出）
   可调：粒子数量、亮度下限与上限、分布偏向、深度强度、噪声扰动、粒子大小、透明度、
   粒子形态（柔和光点 / 实心球体）、球体光泽、辉光、背景颜色（可渐变）等
   · 亮度下限 / 上限：只保留亮度落在两者之间的像素。下限默认 0，会保留纯黑粒子；
     上限默认 255，会保留纯白粒子。想只留中间调就把上下限都往中间收
   · 粒子明度 / 饱和度：明度整体加减亮度；饱和度 0 = 黑白、1 = 原色、2 = 浓艳
   · 粒子形态：
     「柔和光点」= 默认。圆点带柔边，且用"深度预通道"建立了前后遮挡关系：
       近处粒子的实心核心挡住后面的粒子，中心不再透出背景粒子，边缘依然柔和
       （核心区域会强制为完全不透明——写深度的像素必须不透明，否则核心边界会出现暗环）
     「实心球体」= 每颗粒子渲染成受光的实心小球，近处粒子真实遮挡远处粒子，
       点云立刻有体积感、颗粒清晰，适合做"实物 / 雕塑"质感
       · 光照为程序化影棚 HDR 打光（主光 + 冷色轮廓光 + 地面反光板），
         逐像素球面深度 + 烘焙接触阴影，经 ACES 电影级色调映射
       · 漫反射用连续的余弦梯度（不是平涂 + 贴一块高光），球面有真正的明暗过渡
       · 烘焙了粒子间的接触阴影（AO）：埋在内部的环境光更少，暗部更沉、表层更亮
       · 球体光泽固定为 50%（哑光 ↔ 镜面之间），已从面板移除以免选项过多
   · 「背景颜色」：点色块即可改背景。实心球调「透明度」时是朝背景色淡出，
     所以换成浅色背景后，降低透明度依然读作"变透"而不是"变脏"
       · 此模式下透明度的作用是整体压暗——球体必须不透明才能正确遮挡，
         若用半透明像素写深度，每颗粒子周围会出现一圈黑边
5. 面板「粒子动态 → 开始流动」：粒子沿亮度轨迹逐级流动往返，可设起点/终点、速度与相位散布，再次点击停止
   · 动画从"你当前看到的那一级分布"出发，不会一点击就跳到某个极端
   · 流动时会给粒子一层亮度补偿（柔和光点靠粒子叠加增亮，摊开后重叠变少会显暗）
6. 支持拖入视频 / GIF：画面内容实时驱动粒子颜色与深度（此时基于静态采样的参数不可用）
7. 「渲染导出 → 导出帧序列」：选文件夹后逐帧离线渲染（不卡顿），在剪辑软件中按帧序列导入即可合成视频

【不需要】
- 不需要联网（所有代码已打包在文件里）
- 不需要安装任何软件，Windows / Mac 都能用

【操作】
- 左键拖动 = 旋转 · 滚轮 = 缩放 · 中键（或右键）拖动 = 上下左右平移
- 平移之后面板「镜头视角」里会出现「视图回到中心」，点它把观察中心拉回原点
  （没平移时这个按钮不出现）
- 每个滑杆左侧的小 ↺ 可以把该参数还原成默认值

【小技巧】
- 想先看效果：双击打开后，把网址末尾加上 ?test 回车，
  例如 .../index.html 改成 .../index.html?test，会自动加载一张示例图
- 图片完全在你的电脑本地处理，不会上传到任何地方
- 如果页面顶部出现白色提示条，按提示处理（多为浏览器版本过旧，升级即可）

【背景】
- 换图时会自动把背景设成"这张图里面积最大的颜色"，让点云坐进画面自己的色调里；
  同时按这个背景的明暗自动给一个分布偏向：背景偏亮 → 0（均匀，避免亮部被背景占满），
  背景偏暗 → +0.7（往主体聚集）。不满意直接拖滑块覆盖即可
- 背景颜色不只是底色：它会作为环境光照到实心球体上 —— 亮背景把球的暗部抬起来，
  有色背景会给整颗球染色。想关掉这个影响，把背景设成纯黑即可
- 辉光只作用于粒子：辉光的提取阈值会自动抬到背景亮度之上，所以换成亮背景也不会整片糊开
  （代价是比背景更暗的粒子不参与辉光 —— 暗于背景的东西本来也不该发光）

【关于「粒子大小」与分辨率】
- 粒子的世界尺寸是固定的：窗口越大 / 导出分辨率越高，粒子在画面里的相对大小不变，
  但像素数等比增加 —— 所以导出 4K 会比预览更细腻，而不是更小更稀。
- 如果你觉得粒子整体偏大或偏小，直接调「粒子大小」即可（改动前该参数会随分辨率漂移，已修正）。

【导出建议（可选）】
- 想把点云画面录成视频：macOS 用 QuickTime 录屏，Windows 用 Win+G 录屏
- 想要更高画质：录屏时把浏览器窗口开大，并点面板右上角的 — 收起面板
'''
# ↑↑↑ 使用说明正文结束 ↑↑↑

if __name__ == '__main__':
    args = sys.argv[1:]
    WEB = '--web' in args
    INLINE = not (WEB or '--no-inline-media' in args)
    build(inline_media=INLINE, web_mode=WEB)
