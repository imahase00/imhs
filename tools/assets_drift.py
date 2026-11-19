"""漂流発明記 ― 霧の島 ―: IMG/漂流発明記/ の原本から配信用コピーを作る（prepare_assets.py から呼ばれる）。

- 一覧表を絵ごとに切り分けて正方形に配置（森のとりでと同じ処理を使う）
- 遺構の一覧表は背景に白い半透明のもやがあるので消してから切る
- 地面の模様は1マスずつ切り出し、つなぎ目が目立たないよう端をなじませる
- 演出の場面絵はそのまま縮小（透過のものは透過を保つ）
原本は読み取りのみ。
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

from assets_forest import clean_haze, keep_main, split, trim, fit_square

GAME = "drift-1"
OUT = "games/drift-1/img"

# 原本 → (列, 行, 出力px, ID, 処理, 説明)
SHEETS = [
    ("霧の島の若き発明家アクション集.png", 4, 2, 256,
     ["hero", "hero-walk", "hero-carry", "hero-pick", "hero-axe", "hero-fix", "hero-plan", "hero-joy"], {"main_only": True}, "主人公（8ポーズ）"),
    ("スチームパンク島の仲間たち八体.png", 4, 2, 224,
     ["bot-broken", "bot-carry", "bot-miner", "bot-drone", "keeper", "crab", "gull", "lizard"], {"main_only": True}, "ロボットと島の生き物"),
    ("霧の島の資源と機械部品.png", 4, 4, 128,
     ["wood", "stone", "copper-ore", "iron-ore", "coal", "cotton", "plank", "copper-plate",
      "iron-plate", "gear", "pipe", "cloth", "engine", "frame", "envelope", "propeller"], {"main_only": True}, "資源と部品（16種）"),
    ("霧の島 8種資源スプライト.png", 4, 2, 256,
     ["n-tree", "n-rock", "n-copper", "n-iron", "n-coal", "n-cotton", "n-crate", "n-log"], {"main_only": True}, "島の資源と障害物"),
    ("霧の島の蒸気機械八種.png", 4, 2, 256,
     ["m-bench", "m-store", "m-handdrill", "m-boiler", "m-drill", "m-saw", "m-furnace", "m-lift"], {"main_only": True}, "機械（はじめの時代）"),
    ("霧の島・進化した蒸気工場機械.png", 4, 2, 256,
     ["m-roller", "m-assembler", "m-loom", "m-bigdrill", "m-bigassembler", "m-warehouse", "m-station", "m-console"], {"main_only": True}, "機械（工場の時代）"),
    ("霧の島の蒸気遺構八景.png", 4, 2, 512,
     ["wreck", "lab", "bridge-broken", "bridge", "reactor-off", "reactor-on", "dock", "ship-frame"], {"haze_all": True, "main_only": True}, "島の大きな建物と残骸"),
]
TEXTURE = ("霧の島・六つの地形テクスチャ.png", 3, 2, ["grass", "sand", "dirt", "rock", "tiles", "sea"], 256)
# 原本, 用途, ID, 出力, 長辺px, 透過
SCENES = [
    ("嵐雲渦巻く夜の海.png", "演出: 嵐の空", "s-storm", "scene/storm.webp", 1400, False),
    ("煙を引く旧式飛行船.png", "演出: 嵐の中の古い飛行船（透過）", "s-oldship", "scene/oldship.webp", 1100, True),
    ("霧に包まれた孤島.png", "演出: 霧の島を見下ろす", "s-island", "scene/island.webp", 1400, False),
    ("霧の島の浜辺、目覚めの瞬間.png", "演出: 浜辺で目を覚ます", "s-beach", "scene/beach.webp", 1300, False),
    ("森の奥の廃研究所.png", "出来事: 研究所の発見", "s-lab", "scene/lab.webp", 1300, False),
    ("発明家とロボット、地熱炉再起動.png", "出来事: 地熱炉の再起動", "s-reactor", "scene/reactor.webp", 1300, False),
    ("黄金の夜明け、旅立ちの空.png", "演出: 夜明けの空", "s-dawn", "scene/dawn.webp", 1100, False),
    ("船底から見上げる真鍮飛行船.png", "演出: 飛行船を見上げる（透過）", "s-shipup", "scene/shipup.webp", 1300, True),
    ("着陸台で空を見上げる三人.png", "演出: 地面と後ろ姿（透過）", "s-crew", "scene/crew.webp", 1400, True),
    ("雲海に浮かぶ霧の島.png", "演出: 雲海と遠ざかる島", "s-sea", "scene/cloudsea.webp", 1400, False),
    ("横顔の蒸気飛行船.png", "演出: 飛び立つ飛行船（透過）", "s-ship", "scene/ship.webp", 1100, True),
    ("朝空に立ちはだかる嵐雲.png", "演出: 行く手の巨大な嵐", "s-nextstorm", "scene/nextstorm.webp", 1400, False),
    ("夕映えの山頂、発明家と飛行船.png", "表紙（ランチャーのゲームカード）", "cover", "cover.webp", 900, False),
]


def clean_haze_all(im: Image.Image) -> Image.Image:
    """背景全体に白い半透明のもやがある一覧表: 白っぽく不透明度の低い画素を透明に。"""
    a = np.array(im.convert("RGBA")).astype(np.int16)
    rgb = a[..., :3]
    light = rgb.min(axis=2) > 200
    gray = (rgb.max(axis=2) - rgb.min(axis=2)) < 30
    haze = (light & gray & (a[..., 3] < 235)) | (a[..., 3] < 200)
    a[..., 3] = np.where(haze, 0, a[..., 3])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def opaque(im: Image.Image) -> Image.Image:
    """生成画像は不透明部分でも 254 になっていることがあるので、ほぼ不透明は 255 に、ほぼ透明は 0 に。"""
    a = np.array(im.convert("RGBA"))
    al = a[..., 3]
    a[..., 3] = np.where(al >= 250, 255, np.where(al < 24, 0, al))
    return Image.fromarray(a, "RGBA")


def seamless(tile: Image.Image) -> Image.Image:
    """半分ずらした絵と、端ほど強く混ぜて、上下左右に並べたときのつなぎ目を消す。"""
    a = np.array(tile.convert("RGB")).astype(np.float32)
    h, w = a.shape[:2]
    shifted = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]
    x = np.abs(np.linspace(-1, 1, w))[None, :]
    edge = np.clip((np.maximum(x, y) - 0.55) / 0.45, 0, 1)[..., None]   # 端ほど 1
    out = a * (1 - edge) + shifted * edge
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGB")


def prepare(src_dir: Path, docs: Path, write: bool) -> list[tuple]:
    rows = []
    if not src_dir.is_dir():
        print(f"漂流発明記の原本フォルダがありません: {src_dir}")
        return rows
    names = {p.name for p in src_dir.iterdir() if p.is_file()}
    expected = {s[0] for s in SHEETS} | {s[0] for s in SCENES} | {TEXTURE[0]}
    if expected - names:
        raise SystemExit("漂流発明記の原本が見つかりません: " + ", ".join(sorted(expected - names)))
    if names - expected:
        print("漂流発明記: 対応表にない原本（未使用）:", *sorted(names - expected), sep="\n  ")
    for name, cols, rws, px, ids, opt, label in SHEETS:
        src = src_dir / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if write:
                rgba = clean_haze_all(im) if opt.get("haze_all") else clean_haze(im.convert("RGBA"))
                rgba = opaque(rgba)
                for pid, cell in zip(ids, split(rgba, cols, rws)):
                    if pid is None:
                        continue
                    if opt.get("main_only"):
                        cell = keep_main(cell)
                    out = fit_square(trim(cell), px)
                    dst = docs / OUT / "sprites" / f"{pid}.webp"
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    out.save(dst, "WEBP", quality=88, method=4)
        rows.append((name, size, digest, f"一覧表: {label}", GAME, "・".join(i for i in ids if i), f"{OUT}/sprites/*.webp"))
    name, cols, rws, ids, px = TEXTURE
    src = src_dir / name
    digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
    with Image.open(src) as im:
        im.load()
        size = f"{im.width}×{im.height}"
        if write:
            rgb = im.convert("RGB")
            w, h = rgb.size
            for k, tid in enumerate(ids):
                i, j = k % cols, k // cols
                m = 6   # 境目のにじみを避けて少し内側を使う
                box = (w * i // cols + m, h * j // rws + m, w * (i + 1) // cols - m, h * (j + 1) // rws - m)
                t = seamless(rgb.crop(box)).resize((px, px), Image.LANCZOS)
                dst = docs / OUT / "ground" / f"{tid}.webp"
                dst.parent.mkdir(parents=True, exist_ok=True)
                t.save(dst, "WEBP", quality=84, method=4)
    rows.append((name, size, digest, "地面の模様（6種）", GAME, "・".join(ids), f"{OUT}/ground/*.webp"))
    for name, usage, gid, out, long_px, alpha in SCENES:
        src = src_dir / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if write:
                img = opaque(im) if alpha else im.convert("RGB")
                if alpha:
                    img = trim(img)
                s = long_px / max(img.width, img.height)
                if s < 1:
                    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
                dst = docs / OUT / out
                dst.parent.mkdir(parents=True, exist_ok=True)
                img.save(dst, "WEBP", quality=84, method=4)
        rows.append((name, size, digest, usage, GAME, gid, f"{OUT}/{out}"))
    return rows
