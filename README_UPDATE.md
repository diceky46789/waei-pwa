# ランダム＆全網羅 出題パッチ（PWA Random Cover Patch v1）

**目的**：練習モードで「同じデータセット内の問題をランダム順に出しつつ、重複なく全問を出題」し、全問終わったら自動で再シャッフルして次ラウンドに入るようにします。**他の仕様は変更しません。**

## 同梱ファイル
- `js/scheduler.js` … ランダム無重複の出題順を管理するクラス `DeckScheduler`

## 使い方（最小変更）
1. GitHub のリポジトリで **Add file → Upload files** を押し、`js/scheduler.js` をアップロード（フォルダが無ければ自動作成）。  
2. あなたのアプリの **練習画面を制御しているJS**（例：`app.js` / `practice.js` / `main.js`）で、**「次の問題を選ぶ箇所」**を以下のように差し替えます。

### A. モジュールとして読み込む場合（推奨）
HTML のどこかに次を追加：
```html
<script type="module" src="./js/scheduler.js"></script>
```
JS 側（データ読み込み後の初期化処理）に：
```js
// problems: 現在のデータセットの配列（既存と同じ配列を使ってください）
// deckId: データセット識別子（ファイル名やカテゴリ名など。無ければ任意の固定文字列）
const scheduler = new DeckScheduler({ items: problems, deckId: currentDeckId });

function nextProblem() {
  const { item, index, round } = scheduler.next();
  renderPractice(item);   // ←既存の描画関数を呼ぶだけ
}
```

### B. 既存の Math.random() を置き換える
**置き換え前（例）**
```js
const i = Math.floor(Math.random() * problems.length);
const item = problems[i];
```
**置き換え後**
```js
const { item } = scheduler.next(); // 無重複 & 全網羅
```

## 仕様
- **無重複保証**：ラウンド内で同じ問題は出ません（全問出題）。
- **全問後**：自動で新しいランダム順にシャッフルして次ラウンドへ。
- **永続化**：順序と位置を `localStorage` に保存し、リロード後も続きから再開（データセットが変われば自動リセット）。
- **他機能**（履歴、検索、TTS、自動再生、PWA）は変更しません。

## よくある統合ポイント
- データセット切替時：
```js
scheduler = new DeckScheduler({ items: problems, deckId: newDeckId });
```
- 残り件数：`scheduler.remaining()`  
- リセット：`scheduler.reset()`

## 反映されない場合（PWAキャッシュ）
- PC：Shift+再読み込み / DevTools → Application → Service Workers → Unregister  
- iPhone：設定 → Safari → 詳細 → Webサイトデータ → 対象サイトを削除  
- `<script src="./js/scheduler.js?v=2">` のようにクエリを付加
