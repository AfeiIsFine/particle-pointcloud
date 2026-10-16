"""从 px_*.png 量粒子实际尺寸与画面覆盖率。
稀疏场：连通域面积 → 等效直径；密集场：点亮像素占比 → 重叠程度。
"""
import json
import os
from collections import Counter
from PIL import Image

# 用脚本自身位置定位，避免项目文件夹改名后路径失效（2026-09-23 文件夹已改名）
BASE = os.path.dirname(os.path.abspath(__file__)) + os.sep
META = json.load(open(BASE + 'px_meta.json', encoding='utf-8'))
by_tag = {m['tag']: m for m in META}

FILES = {
    'px_dpr1_sparse.png': '默认尺寸·稀疏(dpr1)',
    'px_dpr2_sparse.png': '默认尺寸·稀疏(Retina dpr2)',
    'px_dpr2_big.png': '最大尺寸2.0·稀疏(Retina)',
    'px_dpr2_dense.png': '默认 80k(dpr2)',
    'px_dpr2_dense_big.png': '80k + 尺寸2.0(dpr2)',
}


def label_diameter(mask, w, h):
    """连通域（8 邻域）→ 等效圆直径中位数"""
    seen = [[False] * w for _ in range(h)]
    areas = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            area = 0
            while stack:
                cx, cy = stack.pop()
                area += 1
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            areas.append(area)
    return areas


for fn, tag in FILES.items():
    im = Image.open(BASE + fn).convert('RGB')
    w, h = im.size
    px = im.load()
    mask = [[False] * w for _ in range(h)]
    lit = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) > 45:          # 阈值以上算"粒子点亮"
                mask[y][x] = True
                lit += 1
    cover = lit / (w * h)
    if 'sparse' in fn or 'big' in fn and 'dense' not in fn:
        areas = label_diameter(mask, w, h)
        # 单颗粒子：面积 >= 2 的连通域（滤掉噪点）
        ones = [a for a in areas if a >= 2]
        areas_sorted = sorted(ones)
        med = areas_sorted[len(areas_sorted) // 2] if areas_sorted else 0
        import math
        d = 2 * math.sqrt(med / math.pi) if med else 0
        dpr = by_tag[tag]['dpr']
        comps = len(ones)
        print(f'{tag}\n  连通域数={comps}  单颗面积中位数={med}px²  '
              f'等效直径={d:.1f} device px = {d / dpr:.1f} CSS px  覆盖率={cover * 100:.1f}%')
    else:
        import math
        print(f'{tag}\n  覆盖率={cover * 100:.1f}%  '
              f'（80000 颗粒子 / {w * h} 像素 = 每像素 {80000 / (w * h):.3f} 颗）')
