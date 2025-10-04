
// ==== Utilities ====
const TOKENS = {
  tokenize(s) {
    if (!s) return [];
    let t = s;
    const marks = [",",".","!","?",";",";",":","(",")","\"","'","[","]"];
    for (const m of marks) t = t.split(m).join(` ${m} `);
    return t.split(/\s+/).filter(Boolean);
  },
  detokenize(tokens) {
    if (!tokens || !tokens.length) return "";
    let s = tokens.join(" ");
    s = s.replace(/ \./g,".").replace(/ ,/g,",").replace(/ !/g,"!").replace(/ \?/g,"?")
         .replace(/ ;/g,";").replace(/ :/g,":").replace(/ \)/g,")").replace(/\( /g,"(")
         .replace(/ \]/g,"]").replace(/\[ /g,"[").replace(/ \"/g,'"');
    return s;
  },
  normalized(s) {
    return (s||"").toLowerCase().replace(/\s+/g," ").trim();
  }
};

// ==== Storage ====
const Store = {
  load() {
    this.problems = JSON.parse(localStorage.getItem("problems")||"null");
    this.history = JSON.parse(localStorage.getItem("history")||"null");
    this.apiKey  = localStorage.getItem("apiKey") || "";
    if (!this.problems) {
      // Load builtin CSV once
      fetch("resources/builtin_problems.csv").then(r=>r.text()).then(txt=>{
        const rows = CSV.parse(txt);
        const header = rows[0]||[];
        const jpIdx = header.indexOf("jp"); const enIdx = header.indexOf("en");
        const out = [];
        for (let i=1;i<rows.length;i++){
          const cols = rows[i]; if (!cols) continue;
          const jp = (cols[jpIdx]||"").trim(); const en = (cols[enIdx]||"").trim();
          if (jp && en) out.push({id:crypto.randomUUID(), jp, en});
        }
        this.problems = out;
        this.saveProblems();
        UI.refreshProblems();
        Practice.pickRandom();
      });
    } else {
      UI.refreshProblems();
      Practice.pickRandom();
    }
    if (!this.history) { this.history = []; this.saveHistory(); }
    UI.setApiKey(this.apiKey);
    UI.refreshHistory();
  },
  saveProblems() { localStorage.setItem("problems", JSON.stringify(this.problems)); },
  saveHistory() { localStorage.setItem("history", JSON.stringify(this.history)); },
  saveApiKey(k){ this.apiKey = k; localStorage.setItem("apiKey", k||""); },
  addRecord(problemID, userAnswer, correct){
    this.history.unshift({ id: crypto.randomUUID(), problemID, timestamp: Date.now(), userAnswer, correct });
    this.saveHistory();
  },
  importCSVText(text){
    const rows = CSV.parse(text);
    const header = rows[0]||[];
    const jpIdx = header.indexOf("jp"); const enIdx = header.indexOf("en");
    if (jpIdx<0 || enIdx<0) throw new Error("CSVヘッダーに jp,en が必要です");
    let added = 0;
    const exists = new Set(this.problems.map(p=>TOKENS.normalized(p.en)));
    for (let i=1;i<rows.length;i++){
      const cols = rows[i]; if (!cols) continue;
      const jp = (cols[jpIdx]||"").trim(); const en = (cols[enIdx]||"").trim();
      if (!jp || !en) continue;
      if (exists.has(TOKENS.normalized(en))) continue;
      this.problems.push({id:crypto.randomUUID(), jp, en});
      exists.add(TOKENS.normalized(en));
      added++;
    }
    this.saveProblems();
    return added;
  },
  exportJSON(){
    const bundle = {
      exportedAt: new Date().toISOString(),
      problems: this.problems,
      history: this.history
    };
    const blob = new Blob([JSON.stringify(bundle,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `waei_export_${Date.now()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
};

// ==== CSV tiny parser ====
const CSV = {
  parse(text){
    const rows = [];
    let i=0, field="", row=[], inQuotes=false;
    while (i<text.length){
      const c = text[i];
      if (c === '"'){
        if (inQuotes && text[i+1] === '"'){ field += '"'; i+=2; continue; }
        inQuotes = !inQuotes; i++; continue;
      }
      if (c === "," && !inQuotes){ row.push(field); field=""; i++; continue; }
      if ((c === "\n" || c === "\r") && !inQuotes){
        row.push(field); field="";
        if (row.length>1 || row[0] !== "") rows.push(row);
        row=[]; i++;
        // swallow \r\n
        if (c === "\r" && text[i] === "\n") i++;
        continue;
      }
      field += c; i++;
    }
    if (field.length || row.length){ row.push(field); rows.push(row); }
    if (!rows.length) throw new Error("CSVが空です");
    return rows;
  }
};

// ==== Practice logic ====
const Practice = {
  current: null, pool: [], answer: [],
  pickRandom(){
    if (!Store.problems || !Store.problems.length){ UI.showNoProblems(); return; }
    this.current = Store.problems[Math.floor(Math.random() * Store.problems.length)];
    UI.setJP(this.current.jp);
    this.resetTokens();
    UI.clearResult();
  },
  resetTokens(){
    this.pool = TOKENS.tokenize(this.current.en); this.pool = this.pool.sort(()=>Math.random()-0.5);
    this.answer = [];
    UI.renderPool(this.pool); UI.renderAnswer(this.answer);
  },
  undo(){
    if (this.answer.length){ const t = this.answer.pop(); this.pool.push(t); UI.renderPool(this.pool); UI.renderAnswer(this.answer); }
  },
  shuffle(){ this.pool = this.pool.sort(()=>Math.random()-0.5); UI.renderPool(this.pool); },
  tapPool(idx){
    const [t] = this.pool.splice(idx,1); this.answer.push(t);
    UI.renderPool(this.pool); UI.renderAnswer(this.answer);
  },
  tapAnswer(idx){
    const [t] = this.answer.splice(idx,1); this.pool.push(t);
    UI.renderPool(this.pool); UI.renderAnswer(this.answer);
  },
  check(){
    const ans = TOKENS.detokenize(this.answer);
    const ok = TOKENS.normalized(ans) === TOKENS.normalized(this.current.en);
    Store.addRecord(this.current.id, ans, ok);
    UI.showResult(ok, this.current.en);
    UI.refreshHistory();
    this.explain(ans, ok);
  },
  async explain(userEN, ok){
    UI.showExplaining(true);
    const key = Store.apiKey;
    if (!key){
      UI.setExplanation("（APIキー未設定のため、解説自動生成はスキップされました）");
      UI.showExplaining(false);
      return;
    }
    try {
      const prompt = `あなたは英語学習者向けに、語順の理由を日本語で分かりやすく解説する先生です。
次の日本文に対応する英語の正解と、ユーザーが並べた英文があります。
1) 正解かどうかを一言で述べて、
2) 主要な語順（主語/動詞/目的語/修飾語）と品詞の働き、
3) 似た誤りを避けるコツ、
を簡潔に200〜300字で説明してください。

日本文: ${this.current.jp}
正解の英語: ${this.current.en}
ユーザーの英語: ${userEN}`;

      const resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      });
      if (!resp.ok){
        const t = await resp.text();
        throw new Error(`OpenAI API error: ${t}`);
      }
      const data = await resp.json();
      let text = "";
      if (data?.output?.content){
        text = data.output.content.map(c=>c.text||"").join("\n").trim();
      } else if (data?.choices?.[0]?.message?.content){
        text = data.choices[0].message.content;
      }
      UI.setExplanation(text || "（解説の取得に失敗しました）");
    } catch (e){
      UI.setExplanation("解説の取得に失敗しました: " + e.message + "\n\n※ ブラウザからの直接呼び出しはCORSやキー漏洩の観点で非推奨です。必要に応じてプロキシ（例：Cloudflare Workers）を使ってください。");
    } finally {
      UI.showExplaining(false);
    }
  }
};

// ==== UI ====
const UI = {
  els: {},
  init(){
    // Tabs
    document.querySelectorAll("nav button").forEach(btn=>{
      btn.addEventListener("click", () => {
        document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab").forEach(s=>s.classList.remove("active"));
        document.getElementById(tab).classList.add("active");
      });
    });

    // Practice refs
    this.els.jp = document.getElementById("jpText");
    this.els.pool = document.getElementById("tokenPool");
    this.els.ans = document.getElementById("answerArea");
    this.els.result = document.getElementById("result");
    this.els.explainWrap = document.getElementById("explanationWrap");
    this.els.explain = document.getElementById("explanation");

    document.getElementById("undoBtn").onclick = ()=>Practice.undo();
    document.getElementById("resetBtn").onclick = ()=>Practice.resetTokens();
    document.getElementById("shuffleBtn").onclick = ()=>Practice.shuffle();
    document.getElementById("checkBtn").onclick = ()=>Practice.check();
    document.getElementById("nextBtn").onclick = ()=>Practice.pickRandom();

    // Problems
    this.els.problemsList = document.getElementById("problemsList");
    const pSearch = document.getElementById("problemSearch");
    pSearch.addEventListener("input", ()=>this.refreshProblems(pSearch.value));
    document.getElementById("csvBtn").onclick = ()=>document.getElementById("csvInput").click();
    document.getElementById("csvInput").addEventListener("change", async (e)=>{
      const file = e.target.files?.[0]; if (!file) return;
      const text = await file.text();
      try{
        const added = Store.importCSVText(text);
        alert(`インポート成功：${added}件追加`);
        this.refreshProblems(pSearch.value);
      } catch (e){
        alert("インポート失敗: " + e.message);
      }
      e.target.value = "";
    });

    // History
    this.els.histList = document.getElementById("historyList");
    const histFilter = document.getElementById("histFilter");
    const histSearch = document.getElementById("histSearch");
    histFilter.addEventListener("change", ()=>this.refreshHistory());
    histSearch.addEventListener("input", ()=>this.refreshHistory());
    this.els.histFilter = histFilter;
    this.els.histSearch = histSearch;

    // Settings
    const apiKey = document.getElementById("apiKey");
    document.getElementById("saveKeyBtn").onclick = ()=>{ Store.saveApiKey(apiKey.value.trim()); alert("保存しました"); };
    document.getElementById("deleteKeyBtn").onclick = ()=>{ Store.saveApiKey(""); apiKey.value=""; alert("削除しました"); };
    document.getElementById("exportBtn").onclick = ()=>Store.exportJSON();
    document.getElementById("resetAllBtn").onclick = ()=>{
      if (confirm("問題・履歴・APIキーをすべて削除します。よろしいですか？")){
        localStorage.removeItem("problems");
        localStorage.removeItem("history");
        localStorage.removeItem("apiKey");
        location.reload();
      }
    };
    this.els.apiKey = apiKey;

    // Install hint (iOS Safari shows native flow)
    const ih = document.getElementById("installHint");
    if (window.matchMedia('(display-mode: standalone)').matches) { ih.classList.add("hidden"); }
    else { ih.classList.remove("hidden"); ih.onclick = ()=>alert("Safariの共有ボタン → 『ホーム画面に追加』からインストールできます。"); }

    // SW
    if ("serviceWorker" in navigator){
      window.addEventListener("load", ()=>{
        navigator.serviceWorker.register("sw.js");
      });
    }

    Store.load();
  },
  setJP(text){ this.els.jp.textContent = text; },
  renderPool(pool){
    this.els.pool.innerHTML = "";
    pool.forEach((t,i)=>{
      const b = document.createElement("button"); b.className="token"; b.textContent=t;
      b.onclick = ()=>Practice.tapPool(i);
      this.els.pool.appendChild(b);
    });
  },
  renderAnswer(ans){
    this.els.ans.innerHTML = "";
    ans.forEach((t,i)=>{
      const b = document.createElement("button"); b.className="token"; b.textContent=t;
      b.onclick = ()=>Practice.tapAnswer(i);
      this.els.ans.appendChild(b);
    });
  },
  showResult(ok, correctEN){
    this.els.result.className = "result " + (ok?"ok":"ng");
    this.els.result.textContent = ok ? "正解！" : "不正解：正解は " + correctEN;
  },
  clearResult(){
    this.els.result.className = "result";
    this.els.result.textContent = "";
    this.els.explainWrap.classList.add("hidden");
    this.els.explain.textContent = "";
  },
  showExplaining(isLoading){
    if (isLoading){ this.els.explainWrap.classList.remove("hidden"); this.els.explain.textContent = "解説を生成中…"; }
  },
  setExplanation(text){
    this.els.explainWrap.classList.remove("hidden");
    this.els.explain.textContent = text || "（解説なし）";
  },
  refreshProblems(q=""){
    const key = (q||"").toLowerCase();
    const list = (Store.problems||[]).filter(p=>!key || p.jp.toLowerCase().includes(key) || p.en.toLowerCase().includes(key));
    this.els.problemsList.innerHTML = "";
    list.forEach(p=>{
      const d = document.createElement("div"); d.className="item";
      d.innerHTML = `<div class="meta">ID: ${p.id}</div>
                     <div>${p.jp}</div>
                     <div class="en">${p.en}</div>`;
      this.els.problemsList.appendChild(d);
    });
  },
  refreshHistory(){
    const filter = this.els.histFilter.value;
    const key = (this.els.histSearch.value||"").toLowerCase();
    const base = Store.history || [];
    const list = base.filter(rec => {
      if (filter==="correct" && !rec.correct) return false;
      if (filter==="wrong" && rec.correct) return false;
      if (!key) return true;
      const p = Store.problems.find(x=>x.id===rec.problemID);
      return (p?.jp||"").toLowerCase().includes(key) || (p?.en||"").toLowerCase().includes(key) || (rec.userAnswer||"").toLowerCase().includes(key);
    });
    this.els.histList.innerHTML = "";
    list.forEach(rec=>{
      const p = Store.problems.find(x=>x.id===rec.problemID);
      const d = document.createElement("div"); d.className="item";
      const dt = new Date(rec.timestamp);
      d.innerHTML = `<div class="meta">
          <span>${rec.correct ? "正解" : "不正解"}</span>
          <span>${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</span>
        </div>
        <div>${p?.jp||"(削除済み問題)"}</div>
        <div class="ans">あなたの解答：${rec.userAnswer}</div>
        <div class="en">正解：${p?.en||""}</div>`;
      this.els.histList.appendChild(d);
    });
  },
  setApiKey(k){ this.els.apiKey.value = k||""; },
  showNoProblems(){
    this.setJP("（問題がありません。問題タブからCSVを追加してください）");
    this.renderPool([]); this.renderAnswer([]);
  }
};

window.addEventListener("DOMContentLoaded", ()=>UI.init());
