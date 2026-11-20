"""パズトレ: IMG/パズトレ/ の原本から配信用コピーを作る（prepare_assets.py から呼ばれる）。

- お宝・仕掛け・道具の一覧表を絵ごとに切り分けて正方形に配置
- お宝の1枚目と仕掛けの1枚目は背景に白い半透明が残っているので消してから切る
- 背景・表紙・エンディングはそのまま縮小
原本は読み取りのみ。
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

import numpy as np

from assets_forest import clean_haze, components, keep_main, split, trim
from assets_drift import clean_haze_all, opaque

GAME = "puztre"
OUT = "games/puztre/img"

TREASURE_IDS = [f"{z}{i}" for z in ("j", "s") for i in range(1, 9)], \
    [f"{z}{i}" for z in ("f", "i") for i in range(1, 9)], \
    [f"{z}{i}" for z in ("k", "g") for i in range(1, 9)]
# 原本 → (列, 行, 出力px, ID, 処理, 出力先, 説明)
SHEETS = [
    ("冒険の輝く宝物コレクション.png", 4, 4, 256, TREASURE_IDS[0], {"haze_all": True}, "treasure", "お宝（密林の遺跡・水没神殿）"),
    ("炎と氷の宝物コレクション.png", 4, 4, 256, TREASURE_IDS[1], {}, "treasure", "お宝（炎の鉱山・氷の洞窟）"),
    ("16種のきらめく宝物コレクション.png", 4, 4, 256, TREASURE_IDS[2], {}, "treasure", "お宝（天空の塔・黄金郷）"),
    ("ジャングルと海底神殿の八つの障害.png", 4, 2, 512,
     ["vine-door", "snake", "bridge", "boss-j", "sluice", "whirl", "grate", "boss-s"], {"haze_all": True, "defringe": True}, "trap", "仕掛け（密林の遺跡・水没神殿）"),
    ("炎と氷の八つの障害物.png", 4, 2, 512,
     ["lava", "fire-door", "boulder", "boss-f", "ice-door", "icicle", "blizzard", "boss-i"], {}, "trap", "仕掛け（炎の鉱山・氷の洞窟）"),
    ("空の塔と黄金迷宮の障害物.png", 4, 2, 512,
     ["wind", "mirror-door", "stairs", "boss-k", "scale", "masks", "pit", "boss-g"], {}, "trap", "仕掛け（天空の塔・黄金郷）"),
    ("冒険者の装備16種アイコンシート.png", 4, 4, 192,
     ["torch", "flask", "pick", "lantern", "mirror", "hourglass", "rope", "compass",
      "map", "hammer", "scope", "herbs", "keys", "lens", "boots", "gloves"], {}, "tool", "探検の道具（16種）"),
]
# 原本, 用途, ID, 出力, 幅px
SCENES = [
    ("陽光差す密林神殿の回廊.png", "背景: 密林の遺跡", "bg-j", "bg/j.webp", 768),
    ("蒼き水流の古代大理石神殿.png", "背景: 水没神殿", "bg-s", "bg/s.webp", 768),
    ("溶岩輝く鉱山の坑道.png", "背景: 炎の鉱山", "bg-f", "bg/f.webp", 768),
    ("青白く輝く氷晶洞窟.png", "背景: 氷の洞窟", "bg-i", "bg/i.webp", 768),
    ("雲上の白石回廊.png", "背景: 天空の塔", "bg-k", "bg/k.webp", 768),
    ("エルドラドの黄金大回廊.png", "背景: 黄金郷", "bg-g", "bg/g.webp", 768),
    ("開かれた黄金の宝物庫.png", "エンディング: 開いた宝物庫", "ending", "ending.webp", 768),
    ("黄金の宝箱と六色の宝珠.png", "表紙（ランチャーのゲームカード・タイトル画面）", "cover", "cover.webp", 900),
]


# 絵ごとの切り出し方: all = 離れた部品も全部残す（浮かぶ足場） / largest = 本体の範囲内だけ残す
CUT = {"stairs": "all", "icicle": "largest", "snake": "largest"}
# 格子のすき間に白いもやが閉じこめられている絵（外とつながっていないので個別に消す）
INNER_HAZE = {"grate", "bridge"}


def keep_largest(cell: Image.Image) -> Image.Image:
    """いちばん大きな塊（つながっている部分）だけを残す。"""
    from collections import deque
    small = cell.resize((max(1, cell.width // 3), max(1, cell.height // 3)), Image.BOX)
    mask = np.array(small.getchannel("A")) > 20
    h, w = mask.shape
    seen = np.zeros_like(mask)
    best = None
    for y0, x0 in zip(*np.nonzero(mask)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        pts = []
        while q:
            y, x = q.popleft()
            pts.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
        if best is None or len(pts) > len(best):
            best = pts
    keep = np.zeros(mask.shape, dtype=np.uint8)
    for y, x in best or []:
        keep[y, x] = 255
    big = Image.fromarray(keep, "L").resize(cell.size, Image.NEAREST)
    from PIL import ImageFilter
    big = big.filter(ImageFilter.MaxFilter(7))
    arr = np.array(cell)
    arr[..., 3] = np.minimum(arr[..., 3], np.array(big))
    return Image.fromarray(arr, "RGBA")


def defringe(im: Image.Image) -> Image.Image:
    """外側の透明部分からつながった、白っぽい半透明（もやの残り）を消す。内側の白い部分（水しぶき・石像）は残る。"""
    a = np.array(im).astype(np.int16)
    rgb = a[..., :3]
    cand = (rgb.min(axis=2) > 190) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 40) & (a[..., 3] < 246)
    reach = a[..., 3] < 10
    for _ in range(200):
        grow = reach.copy()
        grow[1:] |= reach[:-1]; grow[:-1] |= reach[1:]; grow[:, 1:] |= reach[:, :-1]; grow[:, :-1] |= reach[:, 1:]
        grow &= cand | reach
        if (grow == reach).all():
            break
        reach = grow
    a[..., 3] = np.where(reach & cand, 0, a[..., 3])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def fit_center(img: Image.Image, px: int) -> Image.Image:
    """中央にそろえて正方形に配置。"""
    pad = round(px * 0.04)
    inner = px - pad * 2
    s = min(inner / img.width, inner / img.height)
    r = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    canvas.alpha_composite(r, ((px - r.width) // 2, (px - r.height) // 2))
    return canvas


def prepare(src_dir: Path, docs: Path, write: bool) -> list[tuple]:
    rows = []
    if not src_dir.is_dir():
        print(f"パズトレの原本フォルダがありません: {src_dir}")
        return rows
    names = {p.name for p in src_dir.iterdir() if p.is_file()}
    expected = {s[0] for s in SHEETS} | {s[0] for s in SCENES}
    if expected - names:
        raise SystemExit("パズトレの原本が見つかりません: " + ", ".join(sorted(expected - names)))
    if names - expected:
        print("パズトレ: 対応表にない原本（未使用）:", *sorted(names - expected), sep="\n  ")
    for name, cols, rws, px, ids, opt, kind, label in SHEETS:
        src = src_dir / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if write:
                rgba = clean_haze_all(im) if opt.get("haze_all") else clean_haze(im.convert("RGBA"))
                if opt.get("defringe"):
                    rgba = defringe(rgba)
                rgba = opaque(rgba)
                for pid, cell in zip(ids, split(rgba, cols, rws)):
                    how = CUT.get(pid)
                    cell = cell if how == "all" else keep_largest(cell) if how == "largest" else keep_main(cell)
                    if pid in INNER_HAZE:
                        arr = np.array(cell).astype(np.int16)
                        rgb = arr[..., :3]
                        haze = (rgb.min(axis=2) > 185) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 40) & (arr[..., 3] < 252)
                        arr[..., 3] = np.where(haze, 0, arr[..., 3])
                        cell = Image.fromarray(arr.astype(np.uint8), "RGBA")
                    out = fit_center(trim(cell), px)
                    dst = docs / OUT / kind / f"{pid}.webp"
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    out.save(dst, "WEBP", quality=88, method=4)
        rows.append((name, size, digest, f"一覧表: {label}", GAME, "・".join(ids), f"{OUT}/{kind}/*.webp"))
    for name, usage, gid, out, w in SCENES:
        src = src_dir / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if write:
                rgb = im.convert("RGB")
                h = round(rgb.height * w / rgb.width)
                dst = docs / OUT / out
                dst.parent.mkdir(parents=True, exist_ok=True)
                rgb.resize((w, h), Image.LANCZOS).save(dst, "WEBP", quality=82, method=6)
        rows.append((name, size, digest, usage, GAME, gid, f"{OUT}/{out}"))
    return rows
