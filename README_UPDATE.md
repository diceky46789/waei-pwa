# PWA Explainer Patch v3（GitHubに差し替えるだけ）

このパッチは **「解説」機能のみを確実に動かす** 最小変更です。既存の UI / CSV / 音声 / PWA 設定には触れません。

## 同梱ファイル
- `js/explain.js` … OpenAI へ直接問い合わせる堅牢版（APIキーは localStorage から読む）
- `test-explain.html` … 解説の単体テストページ（動作確認用）

## アップロード手順（GitHub UI）
1. GitHub で公開リポジトリを開く → **Code** タブ  
2. キーボードの **T** を押す（iPhone は「Go to file」）→ `js` フォルダを探す  
   - もし `js` が無ければ、この後のアップロードで自動作成されます  
3. 右上 **Add file → Upload files** を押す  
4. このパッチの中から **`js/explain.js` と `test-explain.html`** をドラッグ＆ドロップ（iPhoneはファイル選択）  
5. 下部の **Commit changes** を押す（メッセージ例：`feat: replace explainer`）

> 既に `js/explain.js` がある場合は **上書き** になります。  
> 解説関連の JS が別名ファイルに入っている場合は、そのファイルを開いて鉛筆アイコン **Edit** → 中身をこの `getExplanation` で置き換えてください。

## 反映されない場合（PWAキャッシュ）
- PC：Shift+再読み込み（または DevTools → Application → Service Workers → Unregister）  
- iPhone：設定 → Safari → 詳細 → **Webサイトデータ** → 該当サイトを削除 → 再アクセス  
- あるいは HTML の `<script src="js/explain.js">` のURL末尾に `?v=2` のようなクエリを付けて更新を促進

## テスト方法
1. 公開サイトで `test-explain.html` を開く（例：`https://<username>.github.io/<repo>/test-explain.html`）  
2. `sk-...` の OpenAI APIキーを入力 → **保存**  
3. 英文を入れて **解説を取得** をクリック  
4. 正しく解説が表示されれば、アプリ本体の「解説」ボタンも同様に動作します

## 注意
- API キーは **あなたの端末の localStorage** に保存されます。公開・配布は非推奨です（自分専用でご利用ください）。
- モデル名は `gpt-4o-mini` を既定にしています。必要なら `js/explain.js` の引数 `model` を変更してください。
