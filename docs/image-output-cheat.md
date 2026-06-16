# 画像出力コマンド チートシート

`tools/render-keymap.mjs` で ZMK keymap から確認用のキーマップ画像を出力するための早見表です。

## 基本

| やりたいこと | コマンド |
| --- | --- |
| ヘルプを表示 | `node tools/render-keymap.mjs --help` |
| デフォルト設定で SVG を出力 | `node tools/render-keymap.mjs` |
| PNG を出力 | `node tools/render-keymap.mjs --format png` |
| 出力先を指定して SVG を出力 | `node tools/render-keymap.mjs --out docs/keymap-preview.svg` |
| 出力先を指定して PNG を出力 | `node tools/render-keymap.mjs --out docs/keymap-preview.png` |
| 標準出力へ SVG を出す | `node tools/render-keymap.mjs --out -` |

デフォルト出力先は `docs/keymap.svg` です。`--format png` を指定して `--out` を省略した場合は `docs/keymap.png` に出力されます。

## レイヤー指定

| やりたいこと | コマンド |
| --- | --- |
| BASE だけ出力 | `node tools/render-keymap.mjs --layers layer0 --out docs/keymap-base.svg` |
| NAV と CODE だけ出力 | `node tools/render-keymap.mjs --layers layer1,layer2 --out docs/keymap-nav-code.svg` |
| raw 名で指定 | `node tools/render-keymap.mjs --layers NAV,CODE --out docs/keymap-nav-code.svg` |
| 複数レイヤーを PNG で出力 | `node tools/render-keymap.mjs --layers layer0,layer1,layer4 --format png --out docs/keymap-preview.png` |

この keymap で使える主なレイヤー名です。

| 表示名 | raw 名 | 別名 |
| --- | --- | --- |
| `layer0` | `default_layer` | `BASE` |
| `layer1` | `NAV` |  |
| `layer2` | `CODE` |  |
| `layer3` | `ADJUST` |  |
| `layer4` | `MOUSE` |  |
| `layer5` | `SCROLL` |  |
| `layer6` | `layer_6` | `LAYER 6` |
| `layer7` | `layer_7` | `LAYER 7` |

## 入力ファイルを変える

| やりたいこと | コマンド |
| --- | --- |
| 別の keymap を読む | `node tools/render-keymap.mjs --keymap path/to/custom.keymap --out docs/custom-keymap.svg` |
| 別のレイアウト JSON を読む | `node tools/render-keymap.mjs --layout path/to/layout.json --out docs/custom-layout.svg` |
| JSON 内の layout 名を指定 | `node tools/render-keymap.mjs --layout-name default_layout --out docs/keymap.svg` |
| 画像タイトルを変える | `node tools/render-keymap.mjs --title "cool642tb-mini preview" --out docs/keymap-preview.svg` |

## PNG 変換

| やりたいこと | コマンド |
| --- | --- |
| 自動判定で PNG 出力 | `node tools/render-keymap.mjs --format png` |
| rsvg-convert を使う | `node tools/render-keymap.mjs --format png --png-engine rsvg` |
| Inkscape を使う | `node tools/render-keymap.mjs --format png --png-engine inkscape` |
| ImageMagick を使う | `node tools/render-keymap.mjs --format png --png-engine magick` |
| 依存なしの簡易 PNG を使う | `node tools/render-keymap.mjs --format png --png-engine bitmap` |

滑らかな文字で PNG を出すなら `rsvg-convert` が安定です。macOS では次で入れられます。

```sh
brew install librsvg
```

`--png-engine auto` は `rsvg-convert`、`inkscape`、`magick`、`convert` の順に探します。見つからない場合は内蔵の簡易ビットマップ PNG にフォールバックします。

## オプション早見表

| オプション | 用途 | デフォルト |
| --- | --- | --- |
| `--keymap <path>` | 読み込む ZMK keymap | `config/cool642tb-mini.keymap` |
| `--layout <path>` | 読み込む QMK info.json 形式のレイアウト | `config/cool642tb-mini.json` |
| `--layout-name <name>` | JSON 内の layout 名 | `default_layout` |
| `--out <path>` | 出力先。`-` で標準出力 | `docs/keymap.svg` |
| `--format <svg|png>` | 出力形式 | `--out` の拡張子から推定 |
| `--png-engine <name>` | PNG レンダラ。`auto`, `rsvg`, `inkscape`, `magick`, `convert`, `bitmap` | `auto` |
| `--layers <names>` | カンマ区切りの出力レイヤー | 全レイヤー |
| `--title <text>` | SVG タイトル | `cool642tb-mini` |
| `--help` | ヘルプ表示 |  |

## エラー時の確認

| 症状 | 確認すること |
| --- | --- |
| `No layers selected for rendering` | `--layers` の名前が `layer0` や `NAV` など実在する名前になっているか確認 |
| `Layer ... has ... keys, but layout has ... keys.` | keymap の binding 数と layout JSON のキー数が一致しているか確認 |
| PNG が粗い | `brew install librsvg` 後に `--png-engine rsvg` で再出力 |
| 指定した PNG エンジンで失敗する | `--png-engine auto` か `--png-engine bitmap` に切り替える |

