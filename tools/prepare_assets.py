"""IMG/ の原本から配信用コピーを docs/ に生成する。

原本は読み取りのみで、移動・改名・上書きはしない。
使い方:  python tools/prepare_assets.py            （全ゲーム）
        python tools/prepare_assets.py forest-fort（指定したゲームの画像だけ作り直す。素材表は全ゲーム分を更新）
必要:    Pillow (pip install pillow)
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "IMG"          # 原本は IMG/マージの旅/ と IMG/ランチャー/ に整理済み
SRC_DIRS = [SRC / "マージの旅", SRC / "ランチャー"]
ONLY = sys.argv[1] if len(sys.argv) > 1 else None
wants = lambda game: ONLY is None or ONLY == game  # noqa: E731
DOCS = ROOT / "docs"
GAME = DOCS / "games" / "merge-journey"
GAME_ID = "merge-journey"

ITEM_PX = 192      # 盤面(最大約84px)×高DPI と図鑑に十分なサイズ
GEN_PX = 224
BG_W = 1600
COVER_W = 900

# 原本ファイル名 → (用途, ID, 配信パス(docs相対), 種別)
# 種別: item / gen / bg / cover / ref(配信しない)
MAPPING: list[tuple[str, str, str, str | None, str]] = [
    ("ライト・ダーク・絵本のゲームランチャー比較-1.png", "画面見本: IMHSの３テーマ比較", "ref-themes", None, "ref"),
    ("こもれび島のマージ冒険-2.png", "画面見本: こもれび島のゲーム画面", "ref-game", None, "ref"),
    ("りんご園から始まる旅-4.png", "表紙（ランチャーのゲームカード）", "cover", "games/merge-journey/img/cover.webp", "cover"),
    ("こもれび島のりんご広場-2.png", "島背景: こもれび島（果樹園の広場）", "komorebi", "games/merge-journey/img/bg/komorebi.webp", "bg"),
    ("しおかぜ島の小さな港-1.png", "島背景: しおかぜ島（港）", "shiokaze", "games/merge-journey/img/bg/shiokaze.webp", "bg"),
    ("星あかりの花丘灯台-3.png", "島背景: ほしあかり島（星空の灯台）", "hoshiakari", "games/merge-journey/img/bg/hoshiakari.webp", "bg"),
]

ITEMS = {
    "fruit": ["葉付きの赤いりんご-1.png", "寄り添う赤いりんごペア-3.png", "三つのりんごの小かご-5.png",
              "彩り豊かな果物かご-4.png", "果物いっぱいの木箱-2.png", "豊穣の果実盛り合わせ-6.png"],
    "sweet": ["黄金の花形クッキー-8.png", "三段重ねの花形クッキー-7.png", "こんがりマフィン-13.png",
              "いちごの小さな三角ケーキ-9.png", "いちごのデコレーションケーキ-11.png", "いちごと星の二段お祝いケーキ-14.png"],
    "shell": ["桃色の小さな貝殻-2.png", "桃色と象牙色の貝ペア-3.png", "桃色貝チャームのブレスレット-1.png",
              "桃貝と青玉の首飾り-5.png", "貝殻とシーグラスのリース-10.png", "真珠を抱く海色宝箱-8.png"],
    "gear": ["やさしく曲がる麻ひも-4.png", "ひと結びの編みロープ-7.png", "船具の巻きロープ-9.png",
             "生成り帆布と木製糸巻き-6.png", "小さな帆の木製マスト-11.png", "真鍮コンパスの航海セット-19.png"],
    "flower": ["淡桃色の一輪の花-14.png", "三輪の小さな花束-15.png", "ピンクとラベンダーの花束-22.png",
               "春色あふれる花かご-26.png", "桃色の花のリース-21.png", "星咲く花冠-17.png"],
    "light": ["やさしく灯る象牙のろうそく-16.png", "金の炎を灯す真鍮の燭台-18.png", "あたたかな真鍮ランタン-23.png",
              "あたたかな星形ランタン-20.png", "月星カットの真鍮ランタン-25.png", "金色レンズの灯台灯火-24.png"],
}
GENS = {
    "fruit": "りんご実る小さな果樹-12.png",
    "sweet": "焼き菓子工房のかご-10.png",
    "shell": "貝とシーグラスの採集かご-12.png",
    "gear": "船大工の道具箱-13.png",
    "flower": "花咲く木製育苗箱-27.png",
    "light": "灯り工房のランタン木箱-28.png",
}
CHAIN_LABEL = {"fruit": "果物", "sweet": "お菓子", "shell": "貝", "gear": "船具", "flower": "花", "light": "灯り"}

for chain, files in ITEMS.items():
    for lv, f in enumerate(files, 1):
        MAPPING.append((f, f"アイテム: {CHAIN_LABEL[chain]} Lv.{lv}", f"{chain}-{lv}",
                        f"games/merge-journey/img/items/{chain}-{lv}.webp", "item"))
for chain, f in GENS.items():
    MAPPING.append((f, f"生産元: {CHAIN_LABEL[chain]}", f"gen-{chain}",
                    f"games/merge-journey/img/gen/{chain}.webp", "gen"))


def find_src(name: str) -> Path:
    for d in SRC_DIRS:
        hit = next(d.rglob(name), None)
        if hit:
            return hit
    raise FileNotFoundError(name)


def resize_w(im: Image.Image, w: int) -> Image.Image:
    if im.width <= w:
        return im.copy()
    h = round(im.height * w / im.width)
    return im.resize((w, h), Image.LANCZOS)


def main() -> int:
    if not SRC.is_dir():
        print(f"IMG フォルダが見つかりません: {SRC}")
        return 1
    present = {p.name for d in SRC_DIRS if d.is_dir() for p in d.rglob("*") if p.is_file()}
    mapped = {m[0] for m in MAPPING}
    missing = sorted(mapped - present)
    extra = sorted(present - mapped)
    if missing:
        print("原本が見つかりません:", *missing, sep="\n  ")
        return 1
    if extra:
        print("対応表にない原本（未使用）:", *extra, sep="\n  ")

    rows = []
    for name, usage, gid, out, kind in MAPPING:
        src = find_src(name)
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if out and wants(GAME_ID):
                dst = DOCS / out
                dst.parent.mkdir(parents=True, exist_ok=True)
                if kind in ("item", "gen"):
                    px = ITEM_PX if kind == "item" else GEN_PX
                    img = im.convert("RGBA").resize((px, px), Image.LANCZOS)
                    img.save(dst, "WEBP", quality=88, method=6)
                elif kind == "bg":
                    resize_w(im.convert("RGB"), BG_W).save(dst, "WEBP", quality=82, method=6)
                elif kind == "cover":
                    resize_w(im.convert("RGB"), COVER_W).save(dst, "WEBP", quality=84, method=6)
        rows.append((name, size, digest, usage, GAME_ID if not gid.startswith("ref-") else "—", gid, out or "（配信しない・参照のみ）"))

    rows += prepare_hidamari()
    import assets_forest
    rows += assets_forest.prepare(SRC / "森のとりで", DOCS, wants(assets_forest.GAME))
    if wants(GAME_ID):
        make_icons()
    write_table(rows)
    print(f"{len(rows)} 件を処理しました。")
    return 0


def make_icons() -> None:
    """PWA / ホーム画面アイコン。りんご(fruit Lv.1)を生成りの円背景に配置。"""
    src = find_src(ITEMS["fruit"][0])
    icons = DOCS / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        apple = im.convert("RGBA")
    for size, name, scale in [(512, "icon-512.png", 0.78), (192, "icon-192.png", 0.78),
                              (180, "apple-touch-icon.png", 0.74), (512, "icon-maskable-512.png", 0.6),
                              (32, "favicon-32.png", 0.95)]:
        canvas = Image.new("RGBA", (size, size), (247, 239, 220, 255))
        # やわらかい若草色の縁取り
        from PIL import ImageDraw
        d = ImageDraw.Draw(canvas)
        if size >= 180:
            pad = round(size * 0.035)
            d.rounded_rectangle([pad, pad, size - pad - 1, size - pad - 1], radius=round(size * 0.2),
                                outline=(140, 170, 100, 255), width=max(2, size // 90))
        a = apple.resize((round(size * scale), round(size * scale)), Image.LANCZOS)
        canvas.alpha_composite(a, ((size - a.width) // 2, (size - a.height) // 2))
        canvas.convert("RGB").save(icons / name, "PNG", optimize=True)


def write_table(rows) -> None:
    lines = [
        "# 素材対応表",
        "",
        "`IMG/`（原本・非公開。ゲームごとのフォルダに整理）→ 配信用コピー（`docs/` 配下）の対応です。",
        "配信用コピーは `python tools/prepare_assets.py` で再生成できます（原本は読み取りのみ）。",
        "",
        "- マージの旅: アイテム 192×192 / 生産元 224×224（WebP・透過保持）",
        "- ひだまり菜園: 一覧表（スプライトシート）を透明な隙間で自動分割し、余白を詰めて正方形に配置（WebP・透過保持）",
        "- 背景: 幅1600まで / 表紙: 幅900（WebP・縦横比保持）",
        "- 森のとりで: 一覧表を自動分割。攻撃ポーズの離れた効果線・飛び道具は除去、白背景の壁は透明化（WebP・透過保持）",
        "- PWAアイコン: `docs/icons/`（りんご Lv.1 から合成）",
        "",
        f"| 原本ファイル | 原寸 | SHA1先頭 | 用途 | ゲームID / 素材ID | 配信パス（docs/ 相対） |",
        "|---|---|---|---|---|---|",
    ]
    for name, size, digest, usage, game, gid, out in rows:
        lines.append(f"| {name} | {size} | {digest} | {usage} | {game} / `{gid}` | `{out}` |")
    (ROOT / "ASSETS.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


# ---------------------------------------------------------------- ひだまり菜園
HG_ID = "hidamari-garden"
HG_SRC = SRC / "ひだまり菜園"
HG_OUT = "games/hidamari-garden/img"
# 一覧表: 原本 → (列, 行, 出力サイズ, 各マスのID（左上から右へ）, 種別ラベル)
HG_SHEETS = [
    ("12種の作物と花のスプライトアトラス.png", 4, 3, 224, "plot",
     ["soil", "seed", "sprout", "young", "tomato", "carrot", "strawberry", "pumpkin",
      "sunflower", "lavender", "corn", "blueberry"], "畑"),
    ("収穫アイコンの彩りシート.png", 4, 2, 192, "item",
     ["tomato", "carrot", "strawberry", "pumpkin", "sunflower", "lavender", "corn", "blueberry"], "収穫物"),
    ("ほっこり手作りグッズ八種.png", 4, 2, 192, "item",
     ["soup", "carrotcake", "jam", "pie", "bouquet", "potpourri", "cornbread", "tart"], "加工品"),
    ("庭を彩る六つの小さな飾り.png", 3, 2, 192, "decor",
     ["fence", "bench", "birdhouse", "flowerpot", "lamp", "birdbath"], "飾り"),
    ("村のパン屋・配達員・花屋.png", 3, 1, 256, "face", ["toyo", "sora", "yuzu"], "村の人"),
]
HG_SCENES = [
    ("丘の上の小さな菜園.png", "背景: 昼の菜園", "bg-day", "bg/day.webp", 1536),
    ("灯りきらめく収穫祭の庭.png", "背景: 収穫祭の夕暮れ（エンディング）", "bg-festival", "bg/festival.webp", 1536),
    ("丘の庭の収穫かご.png", "表紙（ランチャーのゲームカード）", "cover", "cover.webp", COVER_W),
]


def _runs(mask_1d):
    runs, start = [], None
    for i, v in enumerate(mask_1d):
        if v and start is None:
            start = i
        elif not v and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(mask_1d)))
    return runs


def split_sheet(im: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    """透明な縦横の隙間で区切って、左上から順に各絵を切り出す。"""
    alpha = im.getchannel("A").point(lambda a: 255 if a > 24 else 0)
    w, h = im.size
    col_has = [alpha.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    row_has = [alpha.crop((0, y, w, y + 1)).getbbox() is not None for y in range(h)]
    cr, rr = _runs(col_has), _runs(row_has)
    if len(cr) != cols or len(rr) != rows:
        raise ValueError(f"区切りが想定と違います（列{len(cr)}/{cols}・行{len(rr)}/{rows}）")
    out = []
    for (y0, y1) in rr:
        for (x0, x1) in cr:
            cell = im.crop((x0, y0, x1, y1))
            out.append(cell.crop(cell.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()))
    return out


def fit_square(img: Image.Image, px: int, pad: float = 0.04, bottom: bool = False) -> Image.Image:
    """余白を詰めた絵を正方形キャンバスの中央（bottom=True なら下寄せ）に縮小配置する。"""
    inner = round(px * (1 - pad * 2))
    s = min(inner / img.width, inner / img.height)
    r = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    x = (px - r.width) // 2
    y = (px - r.height) - round(px * pad) if bottom else (px - r.height) // 2
    canvas.alpha_composite(r, (x, y))
    return canvas


def prepare_hidamari() -> list[tuple]:
    if not HG_SRC.is_dir():
        print(f"ひだまり菜園の原本フォルダがありません: {HG_SRC}")
        return []
    rows = []
    names = {p.name for p in HG_SRC.iterdir() if p.is_file()}
    expected = {s[0] for s in HG_SHEETS} | {s[0] for s in HG_SCENES}
    if expected - names:
        raise SystemExit("ひだまり菜園の原本が見つかりません: " + ", ".join(sorted(expected - names)))
    if names - expected:
        print("ひだまり菜園: 対応表にない原本（未使用）:", *sorted(names - expected), sep="\n  ")
    for name, cols, rws, px, kind, ids, label in HG_SHEETS:
        src = HG_SRC / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            parts = split_sheet(im.convert("RGBA"), cols, rws) if wants(HG_ID) else []
            size = f"{im.width}×{im.height}"
        sub = {"plot": "plot", "item": "items", "decor": "decor", "face": "faces"}[kind]
        for pid, part in zip(ids, parts):
            dst = DOCS / HG_OUT / sub / f"{pid}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            # 畑は土の位置をそろえるため下寄せ、人物は胸元を下端に合わせる
            fit_square(part, px, pad=0.03 if kind in ("plot", "face") else 0.06,
                       bottom=kind in ("plot", "face")).save(dst, "WEBP", quality=88, method=6)
        rows.append((name, size, digest, f"一覧表: {label}（{cols}×{rws}を分割）", HG_ID,
                     "・".join(ids), f"{HG_OUT}/{sub}/*.webp"))
    for name, usage, gid, out, width in HG_SCENES:
        src = HG_SRC / name
        digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
        with Image.open(src) as im:
            im.load()
            size = f"{im.width}×{im.height}"
            if wants(HG_ID):
                dst = DOCS / HG_OUT / out
                dst.parent.mkdir(parents=True, exist_ok=True)
                resize_w(im.convert("RGB"), width).save(dst, "WEBP", quality=82, method=6)
        rows.append((name, size, digest, usage, HG_ID, gid, f"{HG_OUT}/{out}"))
    return rows


if __name__ == "__main__":
    sys.exit(main())
