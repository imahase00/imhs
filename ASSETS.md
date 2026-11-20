# 素材対応表

`IMG/`（原本・非公開。ゲームごとのフォルダに整理）→ 配信用コピー（`docs/` 配下）の対応です。
配信用コピーは `python tools/prepare_assets.py` で再生成できます（原本は読み取りのみ）。

- マージの旅: アイテム 192×192 / 生産元 224×224（WebP・透過保持）
- ひだまり菜園: 一覧表（スプライトシート）を透明な隙間で自動分割し、余白を詰めて正方形に配置（WebP・透過保持）
- 背景: 幅1600まで / 表紙: 幅900（WebP・縦横比保持）
- 森のとりで: 一覧表を自動分割。攻撃ポーズの離れた効果線・飛び道具は除去、白背景の壁は透明化（WebP・透過保持）
- PWAアイコン: `docs/icons/`（りんご Lv.1 から合成）

| 原本ファイル | 原寸 | SHA1先頭 | 用途 | ゲームID / 素材ID | 配信パス（docs/ 相対） |
|---|---|---|---|---|---|
| ライト・ダーク・絵本のゲームランチャー比較-1.png | 1536×1024 | e6cbb8e92e | 画面見本: IMHSの３テーマ比較 | — / `ref-themes` | `（配信しない・参照のみ）` |
| こもれび島のマージ冒険-2.png | 853×1844 | 8f108189ea | 画面見本: こもれび島のゲーム画面 | — / `ref-game` | `（配信しない・参照のみ）` |
| りんご園から始まる旅-4.png | 1122×1402 | 42c4674007 | 表紙（ランチャーのゲームカード） | merge-journey / `cover` | `games/merge-journey/img/cover.webp` |
| こもれび島のりんご広場-2.png | 2172×724 | b3df86b5d1 | 島背景: こもれび島（果樹園の広場） | merge-journey / `komorebi` | `games/merge-journey/img/bg/komorebi.webp` |
| しおかぜ島の小さな港-1.png | 2172×724 | 9a2b59a6bd | 島背景: しおかぜ島（港） | merge-journey / `shiokaze` | `games/merge-journey/img/bg/shiokaze.webp` |
| 星あかりの花丘灯台-3.png | 2172×724 | dfa1fb9363 | 島背景: ほしあかり島（星空の灯台） | merge-journey / `hoshiakari` | `games/merge-journey/img/bg/hoshiakari.webp` |
| 葉付きの赤いりんご-1.png | 1254×1254 | c64afc8341 | アイテム: 果物 Lv.1 | merge-journey / `fruit-1` | `games/merge-journey/img/items/fruit-1.webp` |
| 寄り添う赤いりんごペア-3.png | 1254×1254 | cef639fa1a | アイテム: 果物 Lv.2 | merge-journey / `fruit-2` | `games/merge-journey/img/items/fruit-2.webp` |
| 三つのりんごの小かご-5.png | 1254×1254 | 65cc1de9f0 | アイテム: 果物 Lv.3 | merge-journey / `fruit-3` | `games/merge-journey/img/items/fruit-3.webp` |
| 彩り豊かな果物かご-4.png | 1254×1254 | b2aa90f8bd | アイテム: 果物 Lv.4 | merge-journey / `fruit-4` | `games/merge-journey/img/items/fruit-4.webp` |
| 果物いっぱいの木箱-2.png | 1254×1254 | 4d13b8a7b3 | アイテム: 果物 Lv.5 | merge-journey / `fruit-5` | `games/merge-journey/img/items/fruit-5.webp` |
| 豊穣の果実盛り合わせ-6.png | 1254×1254 | 6edb714b2e | アイテム: 果物 Lv.6 | merge-journey / `fruit-6` | `games/merge-journey/img/items/fruit-6.webp` |
| 黄金の花形クッキー-8.png | 1254×1254 | 585b46425c | アイテム: お菓子 Lv.1 | merge-journey / `sweet-1` | `games/merge-journey/img/items/sweet-1.webp` |
| 三段重ねの花形クッキー-7.png | 1254×1254 | d7a84319e2 | アイテム: お菓子 Lv.2 | merge-journey / `sweet-2` | `games/merge-journey/img/items/sweet-2.webp` |
| こんがりマフィン-13.png | 1254×1254 | 6a2d41ed0f | アイテム: お菓子 Lv.3 | merge-journey / `sweet-3` | `games/merge-journey/img/items/sweet-3.webp` |
| いちごの小さな三角ケーキ-9.png | 1254×1254 | d112869f14 | アイテム: お菓子 Lv.4 | merge-journey / `sweet-4` | `games/merge-journey/img/items/sweet-4.webp` |
| いちごのデコレーションケーキ-11.png | 1254×1254 | 6de2e3a133 | アイテム: お菓子 Lv.5 | merge-journey / `sweet-5` | `games/merge-journey/img/items/sweet-5.webp` |
| いちごと星の二段お祝いケーキ-14.png | 1254×1254 | 675e95abd0 | アイテム: お菓子 Lv.6 | merge-journey / `sweet-6` | `games/merge-journey/img/items/sweet-6.webp` |
| 桃色の小さな貝殻-2.png | 1254×1254 | ce1a00b1fc | アイテム: 貝 Lv.1 | merge-journey / `shell-1` | `games/merge-journey/img/items/shell-1.webp` |
| 桃色と象牙色の貝ペア-3.png | 1254×1254 | 861f17266d | アイテム: 貝 Lv.2 | merge-journey / `shell-2` | `games/merge-journey/img/items/shell-2.webp` |
| 桃色貝チャームのブレスレット-1.png | 1254×1254 | 5af22c4010 | アイテム: 貝 Lv.3 | merge-journey / `shell-3` | `games/merge-journey/img/items/shell-3.webp` |
| 桃貝と青玉の首飾り-5.png | 1254×1254 | 64cd832234 | アイテム: 貝 Lv.4 | merge-journey / `shell-4` | `games/merge-journey/img/items/shell-4.webp` |
| 貝殻とシーグラスのリース-10.png | 1254×1254 | a682d8ff60 | アイテム: 貝 Lv.5 | merge-journey / `shell-5` | `games/merge-journey/img/items/shell-5.webp` |
| 真珠を抱く海色宝箱-8.png | 1254×1254 | 69681cc953 | アイテム: 貝 Lv.6 | merge-journey / `shell-6` | `games/merge-journey/img/items/shell-6.webp` |
| やさしく曲がる麻ひも-4.png | 1254×1254 | 2692ddf1c0 | アイテム: 船具 Lv.1 | merge-journey / `gear-1` | `games/merge-journey/img/items/gear-1.webp` |
| ひと結びの編みロープ-7.png | 1254×1254 | 8a9da4898a | アイテム: 船具 Lv.2 | merge-journey / `gear-2` | `games/merge-journey/img/items/gear-2.webp` |
| 船具の巻きロープ-9.png | 1254×1254 | 0c2ff7666b | アイテム: 船具 Lv.3 | merge-journey / `gear-3` | `games/merge-journey/img/items/gear-3.webp` |
| 生成り帆布と木製糸巻き-6.png | 1254×1254 | 8fcca4de5d | アイテム: 船具 Lv.4 | merge-journey / `gear-4` | `games/merge-journey/img/items/gear-4.webp` |
| 小さな帆の木製マスト-11.png | 1254×1254 | 4f161a8271 | アイテム: 船具 Lv.5 | merge-journey / `gear-5` | `games/merge-journey/img/items/gear-5.webp` |
| 真鍮コンパスの航海セット-19.png | 1254×1254 | 88273ac0eb | アイテム: 船具 Lv.6 | merge-journey / `gear-6` | `games/merge-journey/img/items/gear-6.webp` |
| 淡桃色の一輪の花-14.png | 1254×1254 | 762218e52c | アイテム: 花 Lv.1 | merge-journey / `flower-1` | `games/merge-journey/img/items/flower-1.webp` |
| 三輪の小さな花束-15.png | 1254×1254 | a69c38f3f1 | アイテム: 花 Lv.2 | merge-journey / `flower-2` | `games/merge-journey/img/items/flower-2.webp` |
| ピンクとラベンダーの花束-22.png | 1254×1254 | 718c830753 | アイテム: 花 Lv.3 | merge-journey / `flower-3` | `games/merge-journey/img/items/flower-3.webp` |
| 春色あふれる花かご-26.png | 1254×1254 | 0bf181bfe8 | アイテム: 花 Lv.4 | merge-journey / `flower-4` | `games/merge-journey/img/items/flower-4.webp` |
| 桃色の花のリース-21.png | 1254×1254 | 2c3d2717be | アイテム: 花 Lv.5 | merge-journey / `flower-5` | `games/merge-journey/img/items/flower-5.webp` |
| 星咲く花冠-17.png | 1254×1254 | 7d1c903d95 | アイテム: 花 Lv.6 | merge-journey / `flower-6` | `games/merge-journey/img/items/flower-6.webp` |
| やさしく灯る象牙のろうそく-16.png | 1254×1254 | 153de1e6bf | アイテム: 灯り Lv.1 | merge-journey / `light-1` | `games/merge-journey/img/items/light-1.webp` |
| 金の炎を灯す真鍮の燭台-18.png | 1254×1254 | 3d63114510 | アイテム: 灯り Lv.2 | merge-journey / `light-2` | `games/merge-journey/img/items/light-2.webp` |
| あたたかな真鍮ランタン-23.png | 1254×1254 | 7998e5a683 | アイテム: 灯り Lv.3 | merge-journey / `light-3` | `games/merge-journey/img/items/light-3.webp` |
| あたたかな星形ランタン-20.png | 1254×1254 | c5828e13d3 | アイテム: 灯り Lv.4 | merge-journey / `light-4` | `games/merge-journey/img/items/light-4.webp` |
| 月星カットの真鍮ランタン-25.png | 1254×1254 | 4b8138ca1f | アイテム: 灯り Lv.5 | merge-journey / `light-5` | `games/merge-journey/img/items/light-5.webp` |
| 金色レンズの灯台灯火-24.png | 1254×1254 | f7af9fcfd3 | アイテム: 灯り Lv.6 | merge-journey / `light-6` | `games/merge-journey/img/items/light-6.webp` |
| りんご実る小さな果樹-12.png | 1254×1254 | 17bd65d7f3 | 生産元: 果物 | merge-journey / `gen-fruit` | `games/merge-journey/img/gen/fruit.webp` |
| 焼き菓子工房のかご-10.png | 1254×1254 | 622d3abd15 | 生産元: お菓子 | merge-journey / `gen-sweet` | `games/merge-journey/img/gen/sweet.webp` |
| 貝とシーグラスの採集かご-12.png | 1254×1254 | 2f5d3224c8 | 生産元: 貝 | merge-journey / `gen-shell` | `games/merge-journey/img/gen/shell.webp` |
| 船大工の道具箱-13.png | 1254×1254 | 55c3d11f59 | 生産元: 船具 | merge-journey / `gen-gear` | `games/merge-journey/img/gen/gear.webp` |
| 花咲く木製育苗箱-27.png | 1254×1254 | e7a9fefad3 | 生産元: 花 | merge-journey / `gen-flower` | `games/merge-journey/img/gen/flower.webp` |
| 灯り工房のランタン木箱-28.png | 1254×1254 | 4e275be398 | 生産元: 灯り | merge-journey / `gen-light` | `games/merge-journey/img/gen/light.webp` |
| 12種の作物と花のスプライトアトラス.png | 1536×1024 | acbb5705f9 | 一覧表: 畑（4×3を分割） | hidamari-garden / `soil・seed・sprout・young・tomato・carrot・strawberry・pumpkin・sunflower・lavender・corn・blueberry` | `games/hidamari-garden/img/plot/*.webp` |
| 収穫アイコンの彩りシート.png | 1536×1024 | b25c9d3873 | 一覧表: 収穫物（4×2を分割） | hidamari-garden / `tomato・carrot・strawberry・pumpkin・sunflower・lavender・corn・blueberry` | `games/hidamari-garden/img/items/*.webp` |
| ほっこり手作りグッズ八種.png | 1536×1024 | fd5f48188b | 一覧表: 加工品（4×2を分割） | hidamari-garden / `soup・carrotcake・jam・pie・bouquet・potpourri・cornbread・tart` | `games/hidamari-garden/img/items/*.webp` |
| 庭を彩る六つの小さな飾り.png | 1536×1024 | 640d6cb962 | 一覧表: 飾り（3×2を分割） | hidamari-garden / `fence・bench・birdhouse・flowerpot・lamp・birdbath` | `games/hidamari-garden/img/decor/*.webp` |
| 村のパン屋・配達員・花屋.png | 1536×1024 | b66942e890 | 一覧表: 村の人（3×1を分割） | hidamari-garden / `toyo・sora・yuzu` | `games/hidamari-garden/img/faces/*.webp` |
| 丘の上の小さな菜園.png | 1536×1024 | ec6ff7dc81 | 背景: 昼の菜園 | hidamari-garden / `bg-day` | `games/hidamari-garden/img/bg/day.webp` |
| 灯りきらめく収穫祭の庭.png | 1536×1024 | c329149138 | 背景: 収穫祭の夕暮れ（エンディング） | hidamari-garden / `bg-festival` | `games/hidamari-garden/img/bg/festival.webp` |
| 丘の庭の収穫かご.png | 1024×1536 | 6fd6d00683 | 表紙（ランチャーのゲームカード） | hidamari-garden / `cover` | `games/hidamari-garden/img/cover.webp` |
| 森の守護者・八つの武器ポーズ.png | 1536×1024 | 5e7d53981c | 一覧表: 主人公（武器4段階×立ち・攻撃） | forest-fort / `hero-1・hero-2・hero-3・hero-4・hero-1a・hero-2a・hero-3a・hero-4a` | `games/forest-fort/img/sprites/*.webp` |
| 森のとりでの動物仲間スプライト.png | 1536×1024 | 00987da508 | 一覧表: 仲間（4種×立ち・攻撃） | forest-fort / `rabbit・bear・squirrel・owl・rabbit-a・bear-a・squirrel-a・owl-a` | `games/forest-fort/img/sprites/*.webp` |
| 森のとりでの8体のモンスター.png | 1536×1024 | 5cb8b4d323 | 一覧表: 敵（7種＋ボス） | forest-fort / `mushroom・wolf・crow・monkey・golem・caterpillar・wisp・boar` | `games/forest-fort/img/sprites/*.webp` |
| 森のとりで建築アップグレード図鑑.png | 1536×1024 | 09c70fcd4f | 一覧表: 砦の中心4段階（下の段の囲いは使わない） | forest-fort / `core-1・core-2・core-3・core-4` | `games/forest-fort/img/sprites/*.webp` |
| 八種の直線壁スプライト.png | 1536×1024 | 37f1c562c9 | 一覧表: 柵・城壁4段階（横向き・縦向き） | forest-fort / `wall-h-1・wall-h-2・wall-h-3・wall-h-4・wall-v-1・wall-v-2・wall-v-3・wall-v-4` | `games/forest-fort/img/sprites/*.webp` |
| 森のとりで防衛アイテムスプライト集.png | 1536×1024 | 83e65f396f | 一覧表: 設備と小物 | forest-fort / `tower-1・tower-2・tower-3・campfire・coin・pad・berry・arrows` | `games/forest-fort/img/sprites/*.webp` |
| 森に囲まれた四方向の草原.png | 1024×1536 | 7b006ea254 | マップ: 森の空き地（四方に小道） | forest-fort / `map` | `games/forest-fort/img/map.webp` |
| 夕暮れの森の五人の守り手.png | 1024×1536 | c15854b1b0 | 表紙（ランチャーのゲームカード） | forest-fort / `cover` | `games/forest-fort/img/cover.webp` |
| 霧の島の若き発明家アクション集.png | 1536×1024 | eea9012e06 | 一覧表: 主人公（8ポーズ） | drift-1 / `hero・hero-walk・hero-carry・hero-pick・hero-axe・hero-fix・hero-plan・hero-joy` | `games/drift-1/img/sprites/*.webp` |
| スチームパンク島の仲間たち八体.png | 1536×1024 | 73121cbb20 | 一覧表: ロボットと島の生き物 | drift-1 / `bot-broken・bot-carry・bot-miner・bot-drone・keeper・crab・gull・lizard` | `games/drift-1/img/sprites/*.webp` |
| 霧の島の資源と機械部品.png | 1254×1254 | 6262134e9f | 一覧表: 資源と部品（16種） | drift-1 / `wood・stone・copper-ore・iron-ore・coal・cotton・plank・copper-plate・iron-plate・gear・pipe・cloth・engine・frame・envelope・propeller` | `games/drift-1/img/sprites/*.webp` |
| 霧の島 8種資源スプライト.png | 1536×1024 | 63704569f0 | 一覧表: 島の資源と障害物 | drift-1 / `n-tree・n-rock・n-copper・n-iron・n-coal・n-cotton・n-crate・n-log` | `games/drift-1/img/sprites/*.webp` |
| 霧の島の蒸気機械八種.png | 1536×1024 | 6f95e7acc9 | 一覧表: 機械（はじめの時代） | drift-1 / `m-bench・m-store・m-handdrill・m-boiler・m-drill・m-saw・m-furnace・m-lift` | `games/drift-1/img/sprites/*.webp` |
| 霧の島・進化した蒸気工場機械.png | 1536×1024 | 4a7a3446a5 | 一覧表: 機械（工場の時代） | drift-1 / `m-roller・m-assembler・m-loom・m-bigdrill・m-bigassembler・m-warehouse・m-station・m-console` | `games/drift-1/img/sprites/*.webp` |
| 霧の島の蒸気遺構八景.png | 1536×1024 | bdd80d646c | 一覧表: 島の大きな建物と残骸 | drift-1 / `wreck・lab・bridge-broken・bridge・reactor-off・reactor-on・dock・ship-frame` | `games/drift-1/img/sprites/*.webp` |
| 霧の島・六つの地形テクスチャ.png | 1536×1024 | 7f4af57348 | 地面の模様（6種） | drift-1 / `grass・sand・dirt・rock・tiles・sea` | `games/drift-1/img/ground/*.webp` |
| 嵐雲渦巻く夜の海.png | 1536×1024 | 38ce8f3c17 | 演出: 嵐の空 | drift-1 / `s-storm` | `games/drift-1/img/scene/storm.webp` |
| 煙を引く旧式飛行船.png | 1536×1024 | c3fc31f4f9 | 演出: 嵐の中の古い飛行船（透過） | drift-1 / `s-oldship` | `games/drift-1/img/scene/oldship.webp` |
| 霧に包まれた孤島.png | 1536×1024 | 9456208f16 | 演出: 霧の島を見下ろす | drift-1 / `s-island` | `games/drift-1/img/scene/island.webp` |
| 霧の島の浜辺、目覚めの瞬間.png | 1024×1536 | 3ac9f0b9c7 | 演出: 浜辺で目を覚ます | drift-1 / `s-beach` | `games/drift-1/img/scene/beach.webp` |
| 森の奥の廃研究所.png | 1024×1536 | c887e2becf | 出来事: 研究所の発見 | drift-1 / `s-lab` | `games/drift-1/img/scene/lab.webp` |
| 発明家とロボット、地熱炉再起動.png | 1024×1536 | d088ff4771 | 出来事: 地熱炉の再起動 | drift-1 / `s-reactor` | `games/drift-1/img/scene/reactor.webp` |
| 黄金の夜明け、旅立ちの空.png | 1024×1536 | d41b3d16f2 | 演出: 夜明けの空 | drift-1 / `s-dawn` | `games/drift-1/img/scene/dawn.webp` |
| 船底から見上げる真鍮飛行船.png | 1024×1536 | 366599cf05 | 演出: 飛行船を見上げる（透過） | drift-1 / `s-shipup` | `games/drift-1/img/scene/shipup.webp` |
| 着陸台で空を見上げる三人.png | 1536×1024 | 471d3350ac | 演出: 地面と後ろ姿（透過） | drift-1 / `s-crew` | `games/drift-1/img/scene/crew.webp` |
| 雲海に浮かぶ霧の島.png | 1536×1024 | aeb174bd59 | 演出: 雲海と遠ざかる島 | drift-1 / `s-sea` | `games/drift-1/img/scene/cloudsea.webp` |
| 横顔の蒸気飛行船.png | 1536×1024 | 5a706f04e9 | 演出: 飛び立つ飛行船（透過） | drift-1 / `s-ship` | `games/drift-1/img/scene/ship.webp` |
| 朝空に立ちはだかる嵐雲.png | 1536×1024 | 34022515da | 演出: 行く手の巨大な嵐 | drift-1 / `s-nextstorm` | `games/drift-1/img/scene/nextstorm.webp` |
| 夕映えの山頂、発明家と飛行船.png | 1024×1536 | 8e82d720f6 | 表紙（ランチャーのゲームカード） | drift-1 / `cover` | `games/drift-1/img/cover.webp` |
| 冒険の輝く宝物コレクション.png | 1254×1254 | bb18a0d7cf | 一覧表: お宝（密林の遺跡・水没神殿） | puztre / `j1・j2・j3・j4・j5・j6・j7・j8・s1・s2・s3・s4・s5・s6・s7・s8` | `games/puztre/img/treasure/*.webp` |
| 炎と氷の宝物コレクション.png | 1254×1254 | 5eb4e3fcbb | 一覧表: お宝（炎の鉱山・氷の洞窟） | puztre / `f1・f2・f3・f4・f5・f6・f7・f8・i1・i2・i3・i4・i5・i6・i7・i8` | `games/puztre/img/treasure/*.webp` |
| 16種のきらめく宝物コレクション.png | 1254×1254 | cc4bb1d224 | 一覧表: お宝（天空の塔・黄金郷） | puztre / `k1・k2・k3・k4・k5・k6・k7・k8・g1・g2・g3・g4・g5・g6・g7・g8` | `games/puztre/img/treasure/*.webp` |
| ジャングルと海底神殿の八つの障害.png | 1536×1024 | dae8c61913 | 一覧表: 仕掛け（密林の遺跡・水没神殿） | puztre / `vine-door・snake・bridge・boss-j・sluice・whirl・grate・boss-s` | `games/puztre/img/trap/*.webp` |
| 炎と氷の八つの障害物.png | 1536×1024 | 372ccd497d | 一覧表: 仕掛け（炎の鉱山・氷の洞窟） | puztre / `lava・fire-door・boulder・boss-f・ice-door・icicle・blizzard・boss-i` | `games/puztre/img/trap/*.webp` |
| 空の塔と黄金迷宮の障害物.png | 1536×1024 | 23e7e6dd78 | 一覧表: 仕掛け（天空の塔・黄金郷） | puztre / `wind・mirror-door・stairs・boss-k・scale・masks・pit・boss-g` | `games/puztre/img/trap/*.webp` |
| 冒険者の装備16種アイコンシート.png | 1254×1254 | 22c9ec2400 | 一覧表: 探検の道具（16種） | puztre / `torch・flask・pick・lantern・mirror・hourglass・rope・compass・map・hammer・scope・herbs・keys・lens・boots・gloves` | `games/puztre/img/tool/*.webp` |
| 陽光差す密林神殿の回廊.png | 1024×1536 | 2ed267b31f | 背景: 密林の遺跡 | puztre / `bg-j` | `games/puztre/img/bg/j.webp` |
| 蒼き水流の古代大理石神殿.png | 1024×1536 | 130ce81225 | 背景: 水没神殿 | puztre / `bg-s` | `games/puztre/img/bg/s.webp` |
| 溶岩輝く鉱山の坑道.png | 1024×1536 | 03a214a80a | 背景: 炎の鉱山 | puztre / `bg-f` | `games/puztre/img/bg/f.webp` |
| 青白く輝く氷晶洞窟.png | 1024×1536 | 99d2b03152 | 背景: 氷の洞窟 | puztre / `bg-i` | `games/puztre/img/bg/i.webp` |
| 雲上の白石回廊.png | 1024×1536 | 4c38c5bf1b | 背景: 天空の塔 | puztre / `bg-k` | `games/puztre/img/bg/k.webp` |
| エルドラドの黄金大回廊.png | 1024×1536 | 55f96d48bc | 背景: 黄金郷 | puztre / `bg-g` | `games/puztre/img/bg/g.webp` |
| 開かれた黄金の宝物庫.png | 1024×1536 | d1a2e3211c | エンディング: 開いた宝物庫 | puztre / `ending` | `games/puztre/img/ending.webp` |
| 黄金の宝箱と六色の宝珠.png | 1024×1536 | 8eadeac629 | 表紙（ランチャーのゲームカード・タイトル画面） | puztre / `cover` | `games/puztre/img/cover.webp` |
