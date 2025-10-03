// 和英正順アプリ (Touch & Drop 版)
// 仕様：
// - タッチ＆ドロップで単語を「組み立てエリア」の好きな位置へ挿入可能
// - 組み立て中の単語はドラッグで入れ替え可能（ドロップ位置で再配置）
// - 単語をバンク↔組み立て間で往復可能（戻す/追加）
// - 左右スワイプ：前へ/次へ（モバイル対応）
// - 出題順：1周網羅のシャッフルキュー（全問出たら再シャッフル）
// - 履歴保存/検索、CSV/JSONインポート、履歴エクスポート、リセット
// 既存仕様に影響しないよう、UIとキーバインドは従来通り

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ---------- ユーティリティ ----------
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const tokenize = (sentence) => {
  // 句読点を分離。シンプル実装
  return sentence
    .replace(/([.,!?;:])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
};

const detokenize = (tokens) => {
  // 空白処理（句読点前の空白解除）
  const s = tokens.join(" ").replace(/\s+([.,!?;:])/g, "$1");
  return s;
};

// ---------- データ ----------
const DEFAULT_DATA = [
  { jp: "私は明日あなたに電話します。", en: "I will call you tomorrow.", hint: "未来の予定: will + 原形", explain: "will の後は動詞の原形。時を表す副詞 tomorrow は文末。" },
  { jp: "彼は手術の準備をしています。", en: "He is preparing for the surgery.", hint: "進行形", explain: "be動詞 + V-ing で進行形。for the surgery で『手術のために』。" },
  { jp: "この薬は食後に飲んでください。", en: "Please take this medicine after meals.", hint: "命令形", explain: "Please + 動詞原形 で丁寧な依頼。" },
  { jp: "看護師は患者の状態を確認した。", en: "The nurse checked the patient's condition.", hint: "過去形", explain: "checked は過去。所有格は the patient's。" },
  { jp: "私は新しい技術を学びたい。", en: "I want to learn new techniques.", hint: "to不定詞", explain: "want to + 動詞原形。" },
  { jp: "あなたは出血を止めなければならない。", en: "You must stop the bleeding.", hint: "義務", explain: "must + 動詞原形。" },
  { jp: "彼女は腫れが引いたと言った。", en: "She said the swelling had gone down.", hint: "過去完了含む報告", explain: "said の目的節で had + 過去分詞。" },
  { jp: "感染を避けるには手を洗いましょう。", en: "To avoid infection, wash your hands.", hint: "不定詞の副詞的用法", explain: "To avoid ~, 命令文。" },
  { jp: "医師は患者に十分な説明を提供する。", en: "Doctors provide patients with sufficient explanations.", hint: "SVOO", explain: "provide A with B 構文。" },
  { jp: "この手順は慎重さを必要とする。", en: "This procedure requires caution.", hint: "三単現", explain: "三人称単数 requires。" }
];

// ローカルストレージキー
const LS_DATA = "woa_data_v3";
const LS_QUEUE = "woa_queue_v3";
const LS_IDX = "woa_idx_v3";
const LS_HISTORY = "woa_history_v3";

let DATA = JSON.parse(localStorage.getItem(LS_DATA) || "null") || DEFAULT_DATA;
let QUEUE = JSON.parse(localStorage.getItem(LS_QUEUE) || "null") || [];
let IDX = parseInt(localStorage.getItem(LS_IDX) || "0", 10);
let HISTORY = JSON.parse(localStorage.getItem(LS_HISTORY) || "[]");

// キュー初期化（全問網羅）
function ensureQueue() {
  if (!QUEUE.length) {
    QUEUE = shuffle([...Array(DATA.length)].map((_, i) => i));
    localStorage.setItem(LS_QUEUE, JSON.stringify(QUEUE));
  }
  if (IDX >= QUEUE.length) {
    IDX = 0;
  }
  localStorage.setItem(LS_IDX, String(IDX));
}

function currentItem() {
  ensureQueue();
  const qi = QUEUE[IDX];
  return { idx: qi, item: DATA[qi] };
}

function gotoNext() {
  ensureQueue();
  IDX++;
  if (IDX >= QUEUE.length) {
    // 全問出題済 → 再シャッフル
    QUEUE = shuffle([...Array(DATA.length)].map((_, i) => i));
    IDX = 0;
    localStorage.setItem(LS_QUEUE, JSON.stringify(QUEUE));
  }
  localStorage.setItem(LS_IDX, String(IDX));
  loadCurrent();
}

function gotoPrev() {
  ensureQueue();
  IDX = (IDX - 1 + QUEUE.length) % QUEUE.length;
  localStorage.setItem(LS_IDX, String(IDX));
  loadCurrent();
}

// ---------- UI構築 ----------
const jpEl = $("#jp");
const ansEl = $("#answer");
const builderEl = $("#builder");
const bankEl = $("#bank");
const progressEl = $("#progress");
const feedbackEl = $("#feedback");

const btnCheck = $("#btnCheck");
const btnHint = $("#btnHint");
const btnReveal = $("#btnReveal");
const btnClear = $("#btnClear");
const btnUndo = $("#btnUndo");
const btnPrev = $("#btnPrev");
const btnNext = $("#btnNext");

// Undoスタック
let undoStack = [];

// トークンDOM生成
function createToken(text, origin) {
  const span = document.createElement("span");
  span.className = "token";
  span.textContent = text;
  span.setAttribute("data-origin", origin); // 'bank' or 'builder'
  span.setAttribute("tabindex", "0");
  enableDrag(span);
  enableDoubleTapRemove(span);
  return span;
}

// ドロップゾーン生成
function createDropzone() {
  const dz = document.createElement("div");
  dz.className = "dropzone";
  return dz;
}

// Builderにドロップゾーンを挿入（単語の前後＋両端）
function refreshDropzones() {
  // 既存のドロップゾーン削除
  $$(".dropzone").forEach(d => d.remove());
  const tokens = Array.from(builderEl.querySelectorAll(".token"));

  const prepend = createDropzone();
  builderEl.insertBefore(prepend, tokens[0] || null);

  tokens.forEach(tok => {
    const dz = createDropzone();
    builderEl.insertBefore(dz, tok.nextSibling);
  });
}

// 現在のBuilder配列を取得
function builderTokens() {
  return Array.from(builderEl.querySelectorAll(".token")).map(el => el.textContent);
}

// 現在のBank配列を取得
function bankTokens() {
  return Array.from(bankEl.querySelectorAll(".token")).map(el => el.textContent);
}

// 履歴保存
function pushHistory(entry) {
  // { ts, jp, en, user, correct, hint, explain }
  HISTORY.push({ ...entry, ts: Date.now() });
  localStorage.setItem(LS_HISTORY, JSON.stringify(HISTORY));
}

// 画面読み込み
function loadCurrent() {
  undoStack = [];
  const { idx, item } = currentItem();
  const answer = item.en.trim();
  const tokens = tokenize(answer);
  const shuffled = shuffle(tokens);

  jpEl.textContent = item.jp;
  ansEl.textContent = answer;
  ansEl.classList.add("hidden");
  feedbackEl.textContent = "";

  builderEl.innerHTML = "";
  bankEl.innerHTML = "";
  shuffled.forEach(t => bankEl.appendChild(createToken(t, "bank")));
  refreshDropzones();
  updateProgress();
}

// 進捗表示
function updateProgress() {
  const total = DATA.length;
  const cur = (QUEUE[IDX] ?? 0) + 1;
  progressEl.textContent = `全${total}問中の #${cur}（キュー位置 ${IDX + 1}/${QUEUE.length}）`;
}

// 採点
function checkAnswer() {
  const user = detokenize(builderTokens());
  const correct = ansEl.textContent.trim();
  if (!user.length) {
    feedbackEl.textContent = "組み立て中の英文が空です。";
    return;
  }
  const ok = user === correct;
  feedbackEl.textContent = ok ? "✅ 正解！" : `❌ 不正解: 「${user}」`;
  const { item } = currentItem();
  pushHistory({ jp: item.jp, en: correct, user, correct: ok, hint: item.hint || "", explain: item.explain || "" });
}

// ヒント
function showHint() {
  const { item } = currentItem();
  feedbackEl.textContent = item.hint ? `ヒント: ${item.hint}` : "ヒントはありません。";
}

// 答え表示/非表示トグル
function toggleReveal() {
  ansEl.classList.toggle("hidden");
}

// クリア
function clearBuilder() {
  const currentBank = bankTokens();
  const currentBuilder = builderTokens();
  undoStack.push({ bank: currentBank, builder: currentBuilder });
  // すべてバンクへ戻す（追加順は維持）
  builderEl.querySelectorAll(".token").forEach(tok => {
    tok.setAttribute("data-origin", "bank");
    bankEl.appendChild(tok);
  });
  refreshDropzones();
}

// Undo
function undo() {
  const last = undoStack.pop();
  if (!last) return;
  bankEl.innerHTML = "";
  builderEl.innerHTML = "";
  last.bank.forEach(t => bankEl.appendChild(createToken(t, "bank")));
  last.builder.forEach(t => builderEl.appendChild(createToken(t, "builder")));
  refreshDropzones();
}

// ---------- タッチ＆ドロップ（ライブラリなし） ----------
let dragCtx = null;

function enableDrag(el) {
  el.addEventListener("pointerdown", onDragStart);
  el.addEventListener("pointerup", onDragEnd);
  el.addEventListener("pointercancel", onDragEnd);
}

function onDragStart(e) {
  const target = e.currentTarget;
  e.preventDefault();
  target.setPointerCapture(e.pointerId);

  dragCtx = {
    el: target,
    startX: e.clientX,
    startY: e.clientY,
    clone: null,
    from: target.parentElement.id // 'bank' or 'builder'
  };
  target.classList.add("dragging");

  // クローンを生成して追従
  const rect = target.getBoundingClientRect();
  const clone = target.cloneNode(true);
  clone.style.position = "fixed";
  clone.style.left = rect.left + "px";
  clone.style.top = rect.top + "px";
  clone.style.width = rect.width + "px";
  clone.style.pointerEvents = "none";
  clone.style.opacity = "0.85";
  clone.classList.add("dragging");
  document.body.appendChild(clone);
  dragCtx.clone = clone;

  window.addEventListener("pointermove", onDragMove);
  // 有効化（ビルダーのドロップゾーン）
  refreshDropzones();
}

function onDragMove(e) {
  if (!dragCtx) return;
  const { clone } = dragCtx;
  const dx = e.clientX - dragCtx.startX;
  const dy = e.clientY - dragCtx.startY;
  const left = parseFloat(clone.style.left) + dx;
  const top = parseFloat(clone.style.top) + dy;
  clone.style.left = left + "px";
  clone.style.top = top + "px";
  dragCtx.startX = e.clientX;
  dragCtx.startY = e.clientY;

  // ホバー中のドロップゾーンをハイライト
  let active = null;
  $$(".dropzone").forEach(dz => {
    const r = dz.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    dz.classList.toggle("active", inside);
    if (inside) active = dz;
  });
  dragCtx.activeZone = active;

  // 既存トークンへのスワップ（builder内）
  dragCtx.swapTarget = null;
  if (dragCtx.from === "builder") {
    const toks = $$("#builder .token");
    for (const t of toks) {
      const r = t.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside && t !== dragCtx.el) {
        t.classList.add("dragging");
        dragCtx.swapTarget = t;
      } else {
        t.classList.remove("dragging");
      }
    }
  }
}

function onDragEnd(e) {
  if (!dragCtx) return;
  const { el, clone, from, activeZone, swapTarget } = dragCtx;

  // Undo用スナップショット
  undoStack.push({ bank: bankTokens(), builder: builderTokens() });

  // 1) スワップ優先（builder内でトークン上にドロップ）
  if (swapTarget && from === "builder") {
    const parent = builderEl;
    const a = el;
    const b = swapTarget;
    // a と b の位置を入れ替え
    const aNext = a.nextSibling === b ? a : a.nextSibling;
    parent.insertBefore(a, b);
    parent.insertBefore(b, aNext);
  }
  // 2) ドロップゾーン挿入（builderへ）
  else if (activeZone) {
    // どこから来たかに関わらず、ドロップゾーンの位置へ挿入
    const isFromBank = from === "bank";
    el.setAttribute("data-origin", "builder");
    builderEl.insertBefore(el, activeZone.nextSibling);
  }
  // 3) バンクへ戻す（builder→bank） or 何も起きない（bank→bankの空ドロップ）
  else {
    // 組み立て中のトークンを画面外にドロップしたらバンクへ戻す
    if (from === "builder") {
      el.setAttribute("data-origin", "bank");
      bankEl.appendChild(el);
    }
  }

  // クリーンアップ
  el.classList.remove("dragging");
  $$("#builder .token").forEach(t => t.classList.remove("dragging"));
  $$(".dropzone").forEach(d => d.classList.remove("active"));
  if (clone && clone.parentElement) clone.parentElement.removeChild(clone);
  dragCtx = null;
  window.removeEventListener("pointermove", onDragMove);
  refreshDropzones();
}

// ダブルタップで builder→bank 戻す（誤配置の即修正用）
function enableDoubleTapRemove(el) {
  let last = 0;
  el.addEventListener("pointerup", (e) => {
    const now = Date.now();
    if (now - last < 300) {
      if (el.parentElement === builderEl) {
        undoStack.push({ bank: bankTokens(), builder: builderTokens() });
        el.setAttribute("data-origin", "bank");
        bankEl.appendChild(el);
        refreshDropzones();
      }
    }
    last = now;
  });
}

// ---------- スワイプ（左右で前/次） ----------
(function enableSwipeNav(){
  const panel = $("#builderPanel");
  let startX = 0, startY = 0, moved = false;
  panel.addEventListener("touchstart", (e)=>{
    if (!e.touches.length) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false;
  }, {passive:true});
  panel.addEventListener("touchmove", (e)=>{
    moved = true;
  }, {passive:true});
  panel.addEventListener("touchend", (e)=>{
    if (!moved) return;
    const endX = (e.changedTouches[0]||{}).clientX || startX;
    const endY = (e.changedTouches[0]||{}).clientY || startY;
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) {
      if (dx < 0) gotoNext(); else gotoPrev();
    }
  }, {passive:true});
})();

// ---------- イベント ----------
btnCheck.addEventListener("click", checkAnswer);
btnHint.addEventListener("click", showHint);
btnReveal.addEventListener("click", toggleReveal);
btnClear.addEventListener("click", clearBuilder);
btnUndo.addEventListener("click", undo);
btnPrev.addEventListener("click", gotoPrev);
btnNext.addEventListener("click", gotoNext);

// 履歴モーダル
const historyModal = $("#historyModal");
$("#btnHistory").addEventListener("click", ()=>{
  renderHistory();
  historyModal.classList.remove("hidden");
});
$("#closeHistory").addEventListener("click", ()=> historyModal.classList.add("hidden"));
$("#historySearch").addEventListener("input", renderHistory);

function renderHistory(){
  const q = ($("#historySearch").value || "").toLowerCase();
  const box = $("#historyList");
  box.innerHTML = "";
  const rows = [...HISTORY].reverse().filter(r => {
    return r.jp.toLowerCase().includes(q) || r.en.toLowerCase().includes(q) || r.user.toLowerCase().includes(q);
  });
  if (!rows.length){
    box.innerHTML = "<div>履歴なし</div>";
    return;
  }
  rows.forEach(r => {
    const div = document.createElement("div");
    div.className = "history-item";
    const dt = new Date(r.ts);
    div.innerHTML = `
      <div class="jp">${r.jp}</div>
      <div class="en">${r.en}</div>
      <div>あなたの解答: ${r.user} ${r.correct ? "✅" : "❌"}</div>
      ${r.hint? `<div>ヒント: ${r.hint}</div>`:""}
      ${r.explain? `<div>解説: ${r.explain}</div>`:""}
      <div style="font-size:12px;color:#666">${dt.toLocaleString()}</div>
    `;
    box.appendChild(div);
  });
}

// インポート/エクスポート/リセット
$("#fileInput").addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  let data = null;
  if (file.name.endsWith(".json")){
    data = JSON.parse(text);
  } else if (file.name.endsWith(".csv")){
    // 簡易CSV（カンマ区切り、引用符対応弱）
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = lines.shift().split(",").map(s=>s.trim());
    const jpIdx = head.indexOf("jp");
    const enIdx = head.indexOf("en");
    const hintIdx = head.indexOf("hint");
    const expIdx = head.indexOf("explain");
    data = lines.map(line => {
      const cols = line.split(","); // シンプル実装
      return {
        jp: cols[jpIdx] || "",
        en: cols[enIdx] || "",
        hint: hintIdx>=0 ? (cols[hintIdx]||"") : "",
        explain: expIdx>=0 ? (cols[expIdx]||"") : ""
      };
    });
  }
  if (!Array.isArray(data) || !data.length) {
    alert("読み込み失敗: フォーマットを確認してください。");
    return;
  }
  DATA = data;
  localStorage.setItem(LS_DATA, JSON.stringify(DATA));
  // キュー更新
  QUEUE = [];
  IDX = 0;
  localStorage.setItem(LS_QUEUE, JSON.stringify(QUEUE));
  localStorage.setItem(LS_IDX, "0");
  loadCurrent();
  alert(`読み込み完了: ${DATA.length}問`);
});

$("#btnExport").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(HISTORY, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "history-export.json";
  a.click();
  URL.revokeObjectURL(url);
});

$("#btnResetHistory").addEventListener("click", ()=>{
  if (confirm("学習履歴を削除しますか？")) {
    HISTORY = [];
    localStorage.setItem(LS_HISTORY, "[]");
    renderHistory();
  }
});

// 初期化
loadCurrent();
