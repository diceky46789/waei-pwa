# スワイプで前後移動パッチ（PWA Swipe Navigation Patch v1）

**目的**：練習画面で「左スワイプ＝次」「右スワイプ＝前」に対応。既存仕様は変更しません。

## 同梱ファイル
- `js/swipe-nav.js` … スワイプ検出
- `js/practice_navigator.js` … 履歴つき next()/prev()

## 導入
1. GitHub → Code → **Add file → Upload files**  
   **`js/swipe-nav.js` と `js/practice_navigator.js`** をアップロード（`js` が無ければ自動作成）。
2. 練習ページの HTML に読み込みを追加：
```html
<script type="module" src="./js/swipe-nav.js"></script>
<script type="module" src="./js/practice_navigator.js"></script>
```
3. 練習ロジックに最小差分で組み込み：

### A) 既に nextProblem()/prevProblem() がある場合
```js
import { initSwipeNavigation } from './js/swipe-nav.js';
const container = document.getElementById('practice-root') || document.body;
initSwipeNavigation({ container, onSwipeLeft: ()=>nextProblem(), onSwipeRight: ()=>prevProblem() });
```

### B) 「前へ」が未実装のとき（履歴ナビを利用）
```js
import { initSwipeNavigation } from './js/swipe-nav.js';
import { PracticeNavigator } from './js/practice_navigator.js';
import { DeckScheduler } from './js/scheduler.js'; // 導入済みなら

const scheduler = window.DeckScheduler ? new DeckScheduler({ items: problems, deckId: currentDeckId }) : null;
const nav = new PracticeNavigator({
  getNextItem: () => scheduler ? scheduler.next() : { item: problems[Math.floor(Math.random()*problems.length)] },
  onRender: (item) => renderPractice(item),
  deckId: currentDeckId
});
nav.start();

window.nextProblem = () => nav.next();
window.prevProblem = () => nav.prev();

const container = document.getElementById('practice-root') || document.body;
initSwipeNavigation({ container, onSwipeLeft: ()=>nav.next(), onSwipeRight: ()=>nav.prev() });
```

## 補足
- 既定のスワイプ判定: 横40px以上/縦100px以下/600ms以内
- PC ではマウスのドラッグでも左右判定
- 履歴は localStorage に保存（再読み込み後も「前へ」が使えます）

## 反映されない場合（PWAキャッシュ）
- PC：Shift+再読み込み／DevTools→Application→Service Workers→Unregister
- iPhone：設定→Safari→詳細→Webサイトデータ→該当サイトを削除
- `<script src="./js/swipe-nav.js?v=2">` のように `?v=` を足す
