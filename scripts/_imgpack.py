# -*- coding: utf-8 -*-
"""剧情视觉素材 · 压缩入库（2026-10-03 · 父亲大人送 36 世界场景 + 36 Boss + 深井）
================================================================================
为什么要压：送来的原图合计 **227 MB**（场景 1080×1920 单张 ~950 KB、Boss 单张 ~2.3 MB）。
小游戏**主包 4 MB**、**分包有总上限** —— 原图一张都进不去，必须压过再落包。

口径（一句话）：**视觉分辨得出来就行，包体不能爆。**
  · 场景（37 张：W01~W36 + 深井）→ 810×1440 · JPEG q74  → 单张 ~139 KB
  · Boss（36 张）→ 720×1280 · PNG 256 色（**带真透明**，按人物前景层叠在场景之上）

⚠️ 2026-10-03 晚些时候（父亲大人：「12 母版 + 6 Boss 可以删了」）：
   那 12 张母版图**已经删掉**，本脚本不再产出它们。
   "母版 id"这条链还在用（人物故事 / 装备故事按它取名与色调），图由 `MASTER_WORLD`
   折到某个世界的 `img_scene_W##.jpg` —— 见 `js/sc-story-data.js`。
   所以现在落包的就是 **36 + 1 张场景 + 36 张立绘**，一个多余文件都没有。

为什么 Boss 留 PNG：这批图是**真透明 RGBA**（透明区 36~54%），换成 JPEG 会糊成一块方图，
压在场景上立刻穿帮。量化到 256 色是唯一能在"保透明"与"控体积"之间两全的做法。

用法：
    python3 scripts/_imgpack.py <新图目录>
例：
    python3 scripts/_imgpack.py "/Users/mianod/Desktop/codex项目/游戏/游戏素材/新图"

⚠️ 幂等：原图永远从**素材目录**读，输出永远覆盖 `story/scene` `story/boss` ——
   反复跑都得到同一份产物，不会"压一次再压一次"。
⚠️ 文件名契约（`visual_story_audit` ③ 钉着）：**全 ASCII 小写 + 下划线**。
   送来的 `img_scene_深井.jpg` 是中文名，落包时改名为 `img_scene_corridor.jpg`
   （corridor ＝ 深井那个页面的 handler id，全项目同一套叫法）。
"""
import io
import os
import re
import sys

from PIL import Image

SCENE_SIZE = (810, 1440)
SCENE_Q = 74
BOSS_W = 720
BOSS_COLORS = 256


def repo_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def enc_scene(src, dst):
    """场景 / 母版：等比缩到 810 宽，JPEG q74（progressive + optimize）。"""
    im = Image.open(src).convert('RGB')
    w = SCENE_SIZE[0]
    h = int(round(im.height * w / float(im.width)))
    im = im.resize((w, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=SCENE_Q, optimize=True, progressive=True)
    write(dst, buf.getvalue())


def enc_boss(src, dst):
    """Boss 立绘：等比缩到 720 宽，PNG 256 色（保留 alpha 通道）。"""
    im = Image.open(src).convert('RGBA')
    w = BOSS_W
    h = int(round(im.height * w / float(im.width)))
    im = im.resize((w, h), Image.LANCZOS)
    q = im.quantize(colors=BOSS_COLORS, method=Image.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, 'PNG', optimize=True)
    write(dst, buf.getvalue())


ROWS = []


def write(dst, data):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    old = os.path.getsize(dst) if os.path.exists(dst) else 0
    with open(dst, 'wb') as f:
        f.write(data)
    ROWS.append((os.path.relpath(dst, repo_root()), len(data), old))


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    newdir = sys.argv[1]
    if not os.path.isdir(newdir):
        print('找不到新图目录：' + newdir)
        return 1
    root = repo_root()
    scene_out = os.path.join(root, 'story/scene')
    boss_out = os.path.join(root, 'story/boss')

    names = sorted(os.listdir(newdir))
    n_scene = n_boss = 0
    for f in names:
        p = os.path.join(newdir, f)
        if not os.path.isfile(p):
            continue
        m = re.match(r'^img_scene_W(\d{2})\.jpe?g$', f, re.I)
        if m:
            enc_scene(p, os.path.join(scene_out, 'img_scene_W%s.jpg' % m.group(1)))
            n_scene += 1
            continue
        if f.startswith('img_scene_') and ('深井' in f or 'corridor' in f.lower()):
            enc_scene(p, os.path.join(scene_out, 'img_scene_corridor.jpg'))
            n_scene += 1
            continue
        m = re.match(r'^img_boss_W(\d{2})\.png$', f, re.I)
        if m:
            enc_boss(p, os.path.join(boss_out, 'img_boss_W%s.png' % m.group(1)))
            n_boss += 1
            continue

    print('新图目录：%s' % newdir)
    print('  场景 %d 张 · Boss %d 张' % (n_scene, n_boss))
    print('  （12 张母版已在 2026-10-03 删除；人物/装备故事的底图改由 MASTER_WORLD 折到世界图）')
    tot = sum(r[1] for r in ROWS)
    print('落包：%d 个文件 · 合计 %.2f MB' % (len(ROWS), tot / 1048576.0))
    big = sorted(ROWS, key=lambda r: -r[1])[:5]
    for rel, size, old in big:
        print('   最大 %-42s %6.0f KB%s' % (rel, size / 1024.0,
              ('（原来 %.0f KB）' % (old / 1024.0)) if old else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
