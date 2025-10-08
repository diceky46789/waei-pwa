Explain Addon — 機能のみ追加（UIは変更しない）
================================================

目的
----
既存の「日本語・英語の並べ替えアプリ」に **解説列**（explanation）を“追加対応”し、
**Check** ボタン押下時に該当問題の解説を表示できるようにします。既存のUI/仕様は極力変更しません。

同梱物
------
- `explain_support.js`：機能追加の本体（小さなアドオン）
- `sample.csv`：`jp, en, explanation` のサンプル

導入（最小手順）
----------------
1. 既存の `index.html` の **最後の <script>** の直後に、次の1行を追記して `explain_support.js` を読み込みます。

    <script src="explain_support.js"></script>

2. あなたの初期化コードのどこか（DOM準備後）で、次を1回だけ呼びます。

    ExplainAddon.install({
      // 既存のDOMのセレクタを書き換えてください
      csvInputSel: '#csvInput',       // CSV読み込み<input type="file">
      checkBtnSel:  '#checkBtn',      // Checkボタン
      // 現在表示中の問題を返す関数を渡してください（必須）
      getCurrentProblem: () => problems[currentIndex]  // <- あなたの変数名に合わせて
      // （任意）解説表示位置を指定：explainInsertAfterSel: '#checkBtn'
    });

   ※ `getCurrentProblem` は少なくとも `{ en, ex? }` を返せばOKです。
   ※ CSVのロードは既存実装で構いません。既存のCSVが `explanation` 列を含んでいれば、
      その値を `ex` プロパティとして問題オブジェクトに保持してください。

表示仕様（デフォルト）
----------------------
- `Check` ボタンがクリックされたとき、現在の問題に `ex`（または `explanation`）があれば、
  既存UIの近く（既定では画面末尾、`explainInsertAfterSel` を指定した場合はその要素の直後）に
  小さなカードを **動的に生成** して解説を表示します。
- 既存のUIを壊さないため、CSSは内蔵の最小限（白背景のカード）で追加します。
  スタイルを既存テーマに合わせたい場合は、`onShowExplanation` を渡して自前で描画してください。

CSV要件
-------
- 最低ヘッダー：`jp, en`
- 任意ヘッダー（どれか一つでOK）：`explanation`, `explain`, `ex`, `解説`
- 既存の `jp, en` のみCSVもそのまま使えます（解説無しのときは何も表示しません）。

既存ローダへの最小変更例
------------------------
**（あなたのCSV→配列変換）**の行で、行オブジェクトに `ex` を持たせるだけです。

例）
    const item = { jp: row[jpIdx], en: row[enIdx] };
    if (exIdx >= 0) item.ex = row[exIdx];   // ★この1行を追加

Checkハンドラのカスタマイズ（任意）
----------------------------------
自前で描画したい場合：

    ExplainAddon.install({
      csvInputSel: '#csvInput',
      checkBtnSel: '#checkBtn',
      getCurrentProblem: () => problems[currentIndex],
      onShowExplanation: (exText) => {
        // 既存の結果表示エリアに差し込む等
        const el = document.querySelector('#resultArea .explain');
        if (el) el.textContent = exText;
      }
    });

トラブルシュート
----------------
- `getCurrentProblem hook is required.` と出る → `getCurrentProblem` を実装してください。
- `checkBtn not found` → `checkBtnSel` を既存のボタンに合わせてください。
- 既存のCSVローダが `ex` を取り込んでいない → 上記「最小変更例」を入れてください。
