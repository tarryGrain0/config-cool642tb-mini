cool642tb_mini専用ファームウェアリポジトリ
forkしてから使用してください。

## キーマップ確認画像の生成

コマンドだけ確認したい場合は [画像出力コマンド チートシート](docs/image-output-cheat.md) を見てください。

依存なしの簡易CLIで、ZMK keymap と `config/cool642tb-mini.json` の物理配置から SVG を生成できます。

```sh
node tools/render-keymap.mjs
```

出力先はデフォルトで `docs/keymap.svg` です。PNG で出したい場合は、内部で SVG を生成してから PNG に変換します。

```sh
node tools/render-keymap.mjs --format png
```

`--out` に `.png` を指定した場合も PNG として出力されます。

滑らかな文字で PNG を生成するには `rsvg-convert` などの SVG レンダラが必要です。macOS では次のように入れられます。

```sh
brew install librsvg
```

SVG レンダラが見つからない場合は、依存なしの簡易ビットマップ PNG にフォールバックします。

特定レイヤーだけ確認したい場合は次のように指定できます。

```sh
node tools/render-keymap.mjs --layers layer0,layer1,layer4 --out docs/keymap-preview.svg
```

