"""森のとりで: IMG/森のとりで/ の原本から配信用コピーを作る（prepare_assets.py から呼ばれる）。

- 一覧表（スプライトシート）を絵ごとに切り分け、余白を詰めて正方形に配置する
- 攻撃ポーズで本体から離れて描かれた矢・石・蒸気・効果線は取り除く（ゲーム側で描くため）
- 背景が白く塗られた一覧表は、白を透明に抜いてから切り分ける
原本は読み取りのみ。
"""
from __future__ import annotations

import hashlib
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

GAME = "forest-fort"
OUT = "games/forest-fort/img"

# 原本 → (列, 行, 出力px, 各マスのID（左上から右へ。None は使わない）, 処理, 説明)
SHEETS = [
    ("森の守護者・八つの武器ポーズ.png", 4, 2, 256,
     ["hero-1", "hero-2", "hero-3", "hero-4", "hero-1a", "hero-2a", "hero-3a", "hero-4a"], {"main_only": True, "haze": True}, "主人公（武器4段階×立ち・攻撃）"),
    ("森のとりでの動物仲間スプライト.png", 4, 2, 224,
     ["rabbit", "bear", "squirrel", "owl", "rabbit-a", "bear-a", "squirrel-a", "owl-a"], {"main_only": True}, "仲間（4種×立ち・攻撃）"),
    ("森のとりでの8体のモンスター.png", 4, 2, 224,
     ["mushroom", "wolf", "crow", "monkey", "golem", "caterpillar", "wisp", "boar"], {"main_only": True}, "敵（7種＋ボス）"),
    ("森のとりで建築アップグレード図鑑.png", 4, 2, 320,
     ["core-1", "core-2", "core-3", "core-4", None, None, None, None], {}, "砦の中心4段階（下の段の囲いは使わない）"),
    ("八種の直線壁スプライト.png", 4, 2, 0,
     ["wall-h-1", "wall-h-2", "wall-h-3", "wall-h-4", "wall-v-1", "wall-v-2", "wall-v-3", "wall-v-4"], {"white_bg": True, "keep_aspect": True}, "柵・城壁4段階（横向き・縦向き）"),
    ("森のとりで防衛アイテムスプライト集.png", 4, 2, 224,
     ["tower-1", "tower-2", "tower-3", "campfire", "coin", "pad", "berry", "arrows"], {}, "設備と小物"),
]
SCENES = [
    ("森に囲まれた四方向の草原.png", "マップ: 森の空き地（四方に小道）", "map", "map.webp", 1024),
    ("夕暮れの森の五人の守り手.png", "表紙（ランチャーのゲームカード）", "cover", "cover.webp", 900),
]


def _runs(v):
    runs, start = [], None
    for i, x in enumerate(v):
        if x and start is None:
            start = i
        elif not x and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(v)))
    return runs


def clean_white(im: Image.Image) -> Image.Image:
    """白っぽい無彩色の背景を透明にする（なめらかな縁を残す）。"""
    a = np.array(im.convert("RGBA")).astype(np.int16)
    rgb = a[..., :3]
    mn = rgb.min(axis=2)
    spread = rgb.max(axis=2) - mn
    whiteness = np.clip((mn - 222) / (246 - 222), 0, 1) * (spread < 22)
    alpha = (a[..., 3] * (1 - whiteness)).astype(np.uint8)
    out = a.astype(np.uint8)
    out[..., 3] = alpha
    return Image.fromarray(out, "RGBA")


def clean_haze(im: Image.Image) -> Image.Image:
    """白っぽい半透明のもや（背景の塗り残し）を透明にする。"""
    a = np.array(im.convert("RGBA")).astype(np.int16)
    rgb = a[..., :3]
    light = rgb.min(axis=2) > 175
    gray = (rgb.max(axis=2) - rgb.min(axis=2)) < 40
    haze = light & gray & (a[..., 3] < 200)
    a[..., 3] = np.where(haze, 0, a[..., 3])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def components(mask: np.ndarray) -> list[tuple[int, tuple[int, int, int, int]]]:
    """2値マスクの連結成分（面積とbbox）。8近傍。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        n, x1, y1, x2, y2 = 0, x0, y0, x0, y0
        while q:
            y, x = q.popleft()
            n += 1
            x1, y1, x2, y2 = min(x1, x), min(y1, y), max(x2, x), max(y2, y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
        out.append((n, (x1, y1, x2 + 1, y2 + 1)))
    return out


def keep_main(cell: Image.Image) -> Image.Image:
    """いちばん大きな塊と、それに重なる塊だけを残す（離れた効果線・飛び道具を消す）。"""
    small = cell.resize((max(1, cell.width // 3), max(1, cell.height // 3)), Image.BOX)
    mask = np.array(small.getchannel("A")) > 40
    comps = components(mask)
    if len(comps) <= 1:
        return cell
    comps.sort(reverse=True)
    biggest, (mx1, my1, mx2, my2) = comps[0]
    h, w = mask.shape
    keep = np.zeros(mask.shape, dtype=bool)
    for n, (x1, y1, x2, y2) in comps:
        inside = x1 >= mx1 and x2 <= mx2 and y1 >= my1 and y2 <= my2      # 本体の範囲内（模様・目など）
        near = not (x2 < mx1 or x1 > mx2 or y2 < my1 or y1 > my2) and n >= biggest * 0.04
        edge = x1 <= 0 or y1 <= 0 or x2 >= w or y2 >= h                  # マスの端にかかる（隣の絵のはみ出し）
        if n == biggest or ((inside or near) and not edge):
            keep[y1:y2, x1:x2] = True
    big = Image.fromarray((keep * 255).astype(np.uint8), "L").resize(cell.size, Image.NEAREST)
    arr = np.array(cell)
    arr[..., 3] = np.minimum(arr[..., 3], np.array(big))
    return Image.fromarray(arr, "RGBA")


def split(im: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    """透明な隙間で区切って切り出す。区切りが想定と違えば等分の格子で切る。"""
    alpha = im.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    w, h = im.size
    cr = _runs([alpha.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)])
    rr = _runs([alpha.crop((0, y, w, y + 1)).getbbox() is not None for y in range(h)])
    if len(cr) == cols and len(rr) == rows:
        boxes = [(x0, y0, x1, y1) for (y0, y1) in rr for (x0, x1) in cr]
    else:
        boxes = [(w * i // cols, h * j // rows, w * (i + 1) // cols, h * (j + 1) // rows) for j in range(rows) for i in range(cols)]
    return [im.crop(b) for b in boxes]


def trim(img: Image.Image) -> Image.Image:
    bb = img.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    return img.crop(bb) if bb else img


def fit_square(img: Image.Image, px: int) -> Image.Image:
    """下端をそろえて正方形に配置（足元＝影の位置をそろえる）。"""
    pad = round(px * 0.03)
    inner = px - pad * 2
    s = min(inner / img.width, inner / img.height)
    r = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    canvas.alpha_composite(r, ((px - r.width) // 2, px - pad - r.height))
    return canvas


def fit_long(img: Image.Image, long_px: int = 384) -> Image.Image:
    """縦横比を保って長辺を long_px に（壁の区間用）。"""
    s = long_px / max(img.width, img.height)
    return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)


def prepare(src_dir: Path, docs: Path, write: bool) -> list[tuple]:
    rows = []
    if not src_dir.is_dir():
        print(f"森のとりでの原本フォルダがありません: {src_dir}")
        return rows
    names = {p.name for p in src_dir.iterdir() if p.is_file()}
    expected = {s[0] for s in SHEETS} | {s[0] for s in SCENES}
    if expected - names:
        raise SystemExit("森のとりでの原本が見つかりません: " + ", ".join(sorted(expected - names)))
    if names - expected:
        print("森のとりで: 対応表にない原本（未使用）:", *sorted(names - expected), sep="\n  ")
    for name, cols, rws, px, ids, opt, label in SHEETS:
        src = src_dir / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if write:
                rgba = clean_white(im) if opt.get("white_bg") else im.convert("RGBA")
                if opt.get("haze"):
                    rgba = clean_haze(rgba)
                # ほぼ透明なにじみ（不透明度わずか）は完全に透明へ
                a = np.array(rgba)
                a[..., 3] = np.where(a[..., 3] < 24, 0, a[..., 3])
                rgba = Image.fromarray(a, "RGBA")
                for pid, cell in zip(ids, split(rgba, cols, rws)):
                    if pid is None:
                        continue
                    if opt.get("main_only"):
                        cell = keep_main(cell)
                    cell = trim(cell)
                    out = fit_long(cell) if opt.get("keep_aspect") else fit_square(cell, px)
                    dst = docs / OUT / "sprites" / f"{pid}.webp"
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    out.save(dst, "WEBP", quality=88, method=4)
        used = "・".join(i for i in ids if i)
        rows.append((name, size, digest, f"一覧表: {label}", GAME, used, f"{OUT}/sprites/*.webp"))
    for name, usage, gid, out, width in SCENES:
        src = src_dir / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if write:
                dst = docs / OUT / out
                dst.parent.mkdir(parents=True, exist_ok=True)
                img = im.convert("RGB")
                if img.width > width:
                    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
                img.save(dst, "WEBP", quality=84, method=4)
        rows.append((name, size, digest, usage, GAME, gid, f"{OUT}/{out}"))
    return rows
