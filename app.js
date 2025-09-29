
// ===== Helpers (apostrophe-safe) =====
const TOKENS = {
  tokenize(s){
    if(!s) return [];
    let t=s;
    const marks=[",",".","!","?",";",";",":","(",")","\"","[","]"]; // keep apostrophes
    for(const m of marks) t=t.split(m).join(` ${m} `);
    return t.split(/\s+/).filter(Boolean);
  },
  detokenize(a){
    if(!a||!a.length) return "";
    let s=a.join(" ");
    s=s.replace(/ \./g,".").replace(/ ,/g,",").replace(/ !/g,"!").replace(/ \?/g,"?")
       .replace(/ ;/g,";").replace(/ :/g,":").replace(/ \)/g,")").replace(/\( /g,"(")
       .replace(/ \]/g,"]").replace(/\[ /g,"[").replace(/ \"/g,'"');
    s=s.replace(/(\w)\s+'\s+(\w)/g,"$1'$2").replace(/(\w)\s+’\s+(\w)/g,"$1’$2");
    return s;
  },
  normalized(s){
    if(!s) return "";
    let t=s.normalize ? s.normalize("NFKC") : s;
    t=t.replace(/[\u2018\u2019\u02BC\u2032]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,"-");
    t=t.replace(/(\w)\s*'\s*(\w)/g,"$1'$2");
    t=t.replace(/\s+([.,!?;:%)\]\}])/g,"$1").replace(/([(\[\{])\s+/g,"$1");
    t=t.replace(/\u00A0/g," ").replace(/\s+/g," ").trim().toLowerCase();
    return t;
  }
};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

// ===== Storage =====
const Store={
  load(){
    this.problems=JSON.parse(localStorage.getItem("problems")||"null");
    this.history=JSON.parse(localStorage.getItem("history")||"null");
    this.apiKey=localStorage.getItem("apiKey")||"";
    this.delayJPEN=clamp(parseFloat(localStorage.getItem("delayJPEN")||"1.0"),0.5,10);
    this.delayNextJP=clamp(parseFloat(localStorage.getItem("delayNextJP")||"2.0"),0.5,10);
    this.ttsMode=localStorage.getItem("ttsMode")||"audio"; // default to audio
    this.ttsEndpoint=localStorage.getItem("ttsEndpoint")||"";
    this.repeatCount=clamp(parseInt(localStorage.getItem("repeatCount")||"1"),1,10);
    this.baseVolume=clamp(parseFloat(localStorage.getItem("baseVolume")||"1.0"),0,1);
    this.boostDb=clamp(parseInt(localStorage.getItem("boostDb")||"0"),0,12);

    if(!this.problems){
      fetch("resources/builtin_problems.csv").then(r=>r.text()).then(txt=>{
        const rows=CSV.parse(txt), h=rows[0]; const ji=h.indexOf("jp"), ei=h.indexOf("en"); const out=[];
        for(let i=1;i<rows.length;i++){ const c=rows[i]; if(!c) continue; const jp=(c[ji]||"").trim(), en=(c[ei]||"").trim(); if(jp&&en) out.push({id:crypto.randomUUID(),jp,en}); }
        this.problems=out; this.saveProblems(); UI.refreshProblems(); Practice.pickRandom();
      });
    } else { UI.refreshProblems(); Practice.pickRandom(); }

    if(!this.history){ this.history=[]; this.saveHistory(); }

    UI.setApiKey(this.apiKey);
    UI.initDelayControls(this.delayJPEN,this.delayNextJP);
    UI.initTTSMode(this.ttsMode,this.ttsEndpoint);
    UI.initAudioControls(this.repeatCount,this.baseVolume,this.boostDb);
    UI.refreshHistory();
  },
  saveProblems(){ localStorage.setItem("problems",JSON.stringify(this.problems)); },
  saveHistory(){ localStorage.setItem("history",JSON.stringify(this.history)); },
  saveApiKey(k){ this.apiKey=k; localStorage.setItem("apiKey",k||""); },
  setDelayJPEN(v){ this.delayJPEN=clamp(parseFloat(v)||1.0,0.5,10); localStorage.setItem("delayJPEN",this.delayJPEN); },
  setDelayNextJP(v){ this.delayNextJP=clamp(parseFloat(v)||2.0,0.5,10); localStorage.setItem("delayNextJP",this.delayNextJP); },
  setTTSMode(m){ this.ttsMode=m; localStorage.setItem("ttsMode",m); },
  setTTSEndpoint(url){ this.ttsEndpoint=url.trim(); localStorage.setItem("ttsEndpoint",this.ttsEndpoint); },
  setRepeatCount(n){ this.repeatCount=clamp(parseInt(n)||1,1,10); localStorage.setItem("repeatCount",this.repeatCount); },
  setBaseVolume(v){ this.baseVolume=clamp(parseFloat(v)||1,0,1); localStorage.setItem("baseVolume",this.baseVolume); },
  setBoostDb(db){ this.boostDb=clamp(parseInt(db)||0,0,12); localStorage.setItem("boostDb",this.boostDb); AudioTTS.applyBoost(this.boostDb); },
  addRecord(id,ans,ok){ this.history.unshift({id:crypto.randomUUID(),problemID:id,timestamp:Date.now(),userAnswer:ans,correct:ok}); this.saveHistory(); },
  importCSVText(text){
    const rows=CSV.parse(text), h=rows[0]; const ji=h.indexOf("jp"), ei=h.indexOf("en"); if(ji<0||ei<0) throw new Error("CSVヘッダーに jp,en が必要です");
    let added=0; const exists=new Set(this.problems.map(p=>TOKENS.normalized(p.en)));
    for(let i=1;i<rows.length;i++){ const c=rows[i]; if(!c) continue; const jp=(c[ji]||"").trim(), en=(c[ei]||"").trim(); if(!jp||!en) continue; if(exists.has(TOKENS.normalized(en))) continue; this.problems.push({id:crypto.randomUUID(),jp,en}); exists.add(TOKENS.normalized(en)); added++; }
    this.saveProblems(); return added;
  },
  exportJSON(){
    const bundle={exportedAt:new Date().toISOString(),problems:this.problems,history:this.history,delayJPEN:this.delayJPEN,delayNextJP:this.delayNextJP,ttsMode:this.ttsMode,ttsEndpoint:this.ttsEndpoint,repeatCount:this.repeatCount,baseVolume:this.baseVolume,boostDb:this.boostDb};
    const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`waei_v3_2_export_${Date.now()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
};

// ===== CSV =====
const CSV={
  parse(text){
    const rows=[]; let i=0,f="",row=[],q=false;
    while(i<text.length){
      const c=text[i];
      if(c=='"'){ if(q && text[i+1]=='"'){ f+='"'; i+=2; continue; } q=!q; i++; continue; }
      if(c=="," && !q){ row.push(f); f=""; i++; continue; }
      if((c=="\n"||c=="\r") && !q){ row.push(f); f=""; if(row.length>1||row[0]!="") rows.push(row); row=[]; i++; if(c=="\r"&&text[i]=="\n") i++; continue; }
      f+=c; i++;
    }
    if(f.length||row.length){ row.push(f); rows.push(row); }
    if(!rows.length) throw new Error("CSVが空です"); return rows;
  }
};

// ===== Voice Picker (WebSpeech fallback) =====
const VoicePicker = (()=>{
  let voicesCache=[]; let readyResolve; const ready=new Promise(res=>readyResolve=res);
  function loadVoices(){ const v=speechSynthesis.getVoices(); if(v&&v.length){ voicesCache=v; readyResolve(); } }
  speechSynthesis.onvoiceschanged=loadVoices; loadVoices();
  function prefer(names=[], langPrefix=""){
    for(const n of names){ const hit=voicesCache.find(v=>v.name && v.name.toLowerCase().includes(n.toLowerCase())); if(hit) return hit; }
    if(langPrefix){ const hit=voicesCache.find(v=>v.lang && v.lang.toLowerCase().startsWith(langPrefix.toLowerCase())); if(hit) return hit; }
    return null;
  }
  async function pick(lang){
    await ready;
    if(lang.startsWith("ja")) return prefer(["Kyoko","Otoya","Fiona","Hattori"],"ja")||null;
    if(lang.startsWith("en")) return prefer(["Samantha","Alex","Ava","Daniel","Karen","Moira"],"en")||null;
    return voicesCache.find(v=>v.lang && v.lang.toLowerCase().startsWith(lang.toLowerCase()))||null;
  }
  return { pick, ready };
})();

// ===== WebSpeech TTS (foreground) =====
const WebSpeechTTS={
  cancel(){ speechSynthesis.cancel(); },
  async speak(text,lang){
    await VoicePicker.ready;
    return new Promise(async res=>{
      const u=new SpeechSynthesisUtterance(text);
      const voice=await VoicePicker.pick(lang);
      if(voice) u.voice=voice; else u.lang=lang;
      u.rate=1; u.pitch=1; u.volume=Store.baseVolume; // 0..1
      u.onend=()=>res(); u.onerror=()=>res();
      speechSynthesis.speak(u);
    });
  }
};

// ===== Background Audio TTS (server-generated + WebAudio boost) =====
const AudioTTS={
  audio: null, ctx:null, source:null, gainNode:null, playing:false,
  ensureAudio(){
    if(!this.audio){
      this.audio=document.getElementById("ttsAudio");
      this.audio.volume = Store.baseVolume; // 0..1
    }
    if(!this.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.source = this.ctx.createMediaElementSource(this.audio);
      this.gainNode = this.ctx.createGain();
      this.source.connect(this.gainNode).connect(this.ctx.destination);
      this.applyBoost(Store.boostDb);
    }
  },
  applyBoost(db){
    if(!this.gainNode) return;
    const gain = Math.pow(10, (db||0) / 20); // 0 dB -> x1, 6 dB -> x2
    this.gainNode.gain.value = gain;
  },
  setBaseVolume(v){
    if(this.audio) this.audio.volume = v; // 0..1
  },
  async fetchURL(lang,text){
    const endpoint=(Store.ttsEndpoint||"").trim();
    if(!endpoint) throw new Error("TTSエンドポイントが未設定です（設定タブで保存してください）");
    const url = endpoint.replace("{lang}", encodeURIComponent(lang)).replace("{text}", encodeURIComponent(text));
    return url;
  },
  async playOnce(lang,text,metaTitle){
    this.ensureAudio();
    if(this.ctx?.state==="suspended"){ try{ await this.ctx.resume(); }catch{} }
    const src=await this.fetchURL(lang,text);
    if('mediaSession' in navigator){
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metaTitle || text, artist: "Waei Trainer", album: "Practice",
        artwork: [{src:"icons/icon-180.png", sizes:"180x180", type:"image/png"}]
      });
      navigator.mediaSession.setActionHandler('play', ()=>{ this.audio?.play(); this.playing=true; });
      navigator.mediaSession.setActionHandler('pause', ()=>{ this.audio?.pause(); this.playing=false; });
      navigator.mediaSession.setActionHandler('stop', ()=>{ this.stop(); });
    }
    return new Promise(async resolve=>{
      const onend=()=>{ this.audio.removeEventListener("ended", onend); resolve(); };
      this.audio.addEventListener("ended", onend);
      this.audio.src=src;
      try{ await this.audio.play(); this.playing=true; }catch(e){ resolve(); }
    });
  },
  stop(){
    try{ this.audio?.pause(); }catch{}
    if(this.audio){ this.audio.src=""; }
    this.playing=false;
  }
};

// ===== Unified TTS facade =====
const TTS={
  cancel(){ WebSpeechTTS.cancel(); AudioTTS.stop(); },
  wait(ms){ return new Promise(r=>setTimeout(r,ms)); },
  async speak(text,lang){
    if(Store.ttsMode==="audio"){ AudioTTS.setBaseVolume(Store.baseVolume); await AudioTTS.playOnce(lang,text,text); }
    else { await WebSpeechTTS.speak(text,lang); }
  },
  async seqOnce(jp,en){
    if(Store.ttsMode==="audio"){
      AudioTTS.setBaseVolume(Store.baseVolume);
      await AudioTTS.playOnce("ja-JP", jp, jp);
      await this.wait(Store.delayJPEN*1000);
      await AudioTTS.playOnce("en-US", en, en);
    }else{
      await WebSpeechTTS.speak(jp,"ja-JP");
      await this.wait(Store.delayJPEN*1000);
      await WebSpeechTTS.speak(en,"en-US");
    }
  },
  async seqRepeat(jp,en,repeat){
    repeat = Math.max(1, Math.min(10, repeat|0));
    for(let i=0;i<repeat;i++){
      await this.seqOnce(jp,en);
      if(i<repeat-1) await this.wait(Store.delayNextJP*1000);
    }
  }
};

// ===== Practice =====
const Practice={
  current:null,pool:[],answer:[],
  pickRandom(){
    if(!Store.problems||!Store.problems.length){ UI.showNoProblems(); return; }
    this.current=Store.problems[Math.floor(Math.random()*Store.problems.length)];
    UI.setJP(this.current.jp); this.resetTokens(); UI.clearResult();
  },
  setProblemById(id){
    const p=Store.problems.find(x=>x.id===id); if(!p) return;
    this.current=p; UI.setJP(p.jp); this.resetTokens(); UI.clearResult(); UI.switchTab("practice");
  },
  resetTokens(){
    this.pool=TOKENS.tokenize(this.current.en).sort(()=>Math.random()-0.5);
    this.answer=[]; UI.renderPool(this.pool); UI.renderAnswer(this.answer);
  },
  undo(){ if(this.answer.length){ const t=this.answer.pop(); this.pool.push(t); UI.renderPool(this.pool); UI.renderAnswer(this.answer); } },
  shuffle(){ this.pool=this.pool.sort(()=>Math.random()-0.5); UI.renderPool(this.pool); },
  tapPool(i){ const [t]=this.pool.splice(i,1); this.answer.push(t); UI.renderPool(this.pool); UI.renderAnswer(this.answer); },
  tapAnswer(i){ const [t]=this.answer.splice(i,1); this.pool.push(t); UI.renderPool(this.pool); UI.renderAnswer(this.answer); },
  check(){
    const ans=TOKENS.detokenize(this.answer);
    const ok=TOKENS.normalized(ans)===TOKENS.normalized(this.current.en);
    Store.addRecord(this.current.id, ans, ok);
    UI.showResult(ok, this.current.en);
    UI.refreshHistory();
    this.explain(ans, ok);
  },
  async explain(userEN, ok){
    UI.showExplaining(true);
    const key=Store.apiKey;
    if(!key){ UI.setExplanation("（APIキー未設定のため、解説自動生成はスキップされました）"); UI.showExplaining(false); return; }
    try{
      const prompt=`あなたは英語学習者向けに、語順の理由を日本語で分かりやすく解説する先生です。
日本文: ${this.current.jp}
正解の英語: ${this.current.en}
ユーザーの英語: ${userEN}`;
      const resp = await fetch("https://api.openai.com/v1/responses", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${key}`, "Content-Type":"application/json" },
        body: JSON.stringify({ model:"gpt-4.1-mini", input:[{role:"user",content:prompt}], temperature:0.2 })
      });
      if(!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      let text="";
      if (data?.output?.content) text = data.output.content.map(c=>c.text||"").join("\n").trim();
      else if (data?.choices?.[0]?.message?.content) text = data.choices[0].message.content;
      UI.setExplanation(text || "（解説の取得に失敗しました）");
    }catch(e){ UI.setExplanation("解説の取得に失敗しました: " + e.message); }
    finally{ UI.showExplaining(false); }
  }
};

// ===== List Autoplay Controller =====
const ListAuto={
  running:false, abort:false,
  stop(){ this.abort=true; this.running=false; TTS.cancel(); },
  async playItemsJPEN(items){
    this.abort=false; this.running=true;
    for (const it of items){
      if(this.abort) break;
      const jp = it.jp; const en = it.en;
      if(!jp || !en) continue;
      await TTS.seqRepeat(jp,en,Store.repeatCount);
      if(this.abort) break;
      await TTS.wait(Store.delayNextJP*1000);
    }
    this.running=false;
  }
};

// ===== UI =====
const UI={
  els:{},
  lastProblems:[], lastHistory:[],
  init(){
    document.querySelectorAll("nav button").forEach(btn=>{
      btn.addEventListener("click",()=>{
        document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        const tab=btn.dataset.tab;
        document.querySelectorAll(".tab").forEach(s=>s.classList.remove("active"));
        document.getElementById(tab).classList.add("active");
      });
    });

    this.els.jp=document.getElementById("jpText");
    this.els.pool=document.getElementById("tokenPool");
    this.els.ans=document.getElementById("answerArea");
    this.els.result=document.getElementById("result");
    this.els.explainWrap=document.getElementById("explanationWrap");
    this.els.explain=document.getElementById("explanation");

    document.getElementById("undoBtn").onclick=()=>Practice.undo();
    document.getElementById("resetBtn").onclick=()=>Practice.resetTokens();
    document.getElementById("shuffleBtn").onclick=()=>Practice.shuffle();
    document.getElementById("checkBtn").onclick=()=>Practice.check();
    document.getElementById("nextBtn").onclick=()=>Practice.pickRandom();

    document.getElementById("speakJPBtn").onclick=async()=>{ ListAuto.stop(); await TTS.speak(Practice.current.jp,"ja-JP"); };
    document.getElementById("speakENBtn").onclick=async()=>{ ListAuto.stop(); await TTS.speak(Practice.current.en,"en-US"); };
    document.getElementById("speakSeqBtn").onclick=async()=>{
      ListAuto.stop();
      await TTS.seqRepeat(Practice.current.jp, Practice.current.en, Store.repeatCount);
    };
    document.getElementById("stopSpeakBtn").onclick=()=>{ ListAuto.stop(); };

    // Problems
    this.els.problemsList=document.getElementById("problemsList");
    const pSearch=document.getElementById("problemSearch");
    pSearch.addEventListener("input", ()=>this.refreshProblems(pSearch.value));
    document.getElementById("problemsPlayAllBtn").onclick=()=>{
      if(!this.lastProblems.length){ alert("一覧が空です"); return; }
      ListAuto.playItemsJPEN(this.lastProblems);
    };
    document.getElementById("problemsStopBtn").onclick=()=>ListAuto.stop();

    document.getElementById("csvBtn").onclick=()=>document.getElementById("csvInput").click();
    document.getElementById("csvInput").addEventListener("change", async (e)=>{
      const file=e.target.files?.[0]; if(!file) return;
      const text=await file.text();
      try{ const added=Store.importCSVText(text); alert(`インポート成功：${added}件追加`); this.refreshProblems(pSearch.value); }
      catch(err){ alert("インポート失敗: " + err.message); }
      e.target.value="";
    });

    // History
    this.els.histList=document.getElementById("historyList");
    const histFilter=document.getElementById("histFilter");
    const histSearch=document.getElementById("histSearch");
    histFilter.addEventListener("change", ()=>this.refreshHistory());
    histSearch.addEventListener("input", ()=>this.refreshHistory());
    document.getElementById("historyPlayAllBtn").onclick=()=>{
      if(!this.lastHistory.length){ alert("一覧が空です"); return; }
      ListAuto.playItemsJPEN(this.lastHistory);
    };
    document.getElementById("historyStopBtn").onclick=()=>ListAuto.stop();

    // Settings
    const apiKey=document.getElementById("apiKey");
    document.getElementById("saveKeyBtn").onclick=()=>{ Store.saveApiKey(apiKey.value.trim()); alert("保存しました"); };
    document.getElementById("deleteKeyBtn").onclick=()=>{ Store.saveApiKey(""); apiKey.value=""; alert("削除しました"); };

    const saveTtsEndpoint=document.getElementById("saveTtsEndpoint");
    saveTtsEndpoint.onclick=()=>{
      const val=document.getElementById("ttsEndpoint").value.trim();
      Store.setTTSEndpoint(val);
      alert("TTSエンドポイントを保存しました");
    };

    // Delay & Audio controls
    const s1=document.getElementById("delayJPEN"), s2=document.getElementById("delayNextJP"),
          v1=document.getElementById("delayJPENVal"), v2=document.getElementById("delayNextJPVal");
    s1.addEventListener("input", ()=>v1.textContent=s1.value+"s");
    s2.addEventListener("input", ()=>v2.textContent=s2.value+"s");
    s1.addEventListener("change", ()=>Store.setDelayJPEN(s1.value));
    s2.addEventListener("change", ()=>Store.setDelayNextJP(s2.value));
    this.els.delayJPEN=s1; this.els.delayNextJP=s2; this.els.delayJPENVal=v1; this.els.delayNextJPVal=v2;

    const rc=document.getElementById("repeatCount"), rcv=document.getElementById("repeatCountVal");
    rc.addEventListener("input", ()=>rcv.textContent=rc.value+"回");
    rc.addEventListener("change", ()=>Store.setRepeatCount(rc.value));

    const bv=document.getElementById("baseVolume"), bvv=document.getElementById("baseVolumeVal");
    bv.addEventListener("input", ()=>{ bvv.textContent=bv.value; AudioTTS.setBaseVolume(parseFloat(bv.value)); });
    bv.addEventListener("change", ()=>Store.setBaseVolume(bv.value));

    const bd=document.getElementById("boostDb"), bdv=document.getElementById("boostDbVal");
    bd.addEventListener("input", ()=>{ bdv.textContent=bd.value+" dB"; AudioTTS.applyBoost(parseInt(bd.value)); });
    bd.addEventListener("change", ()=>Store.setBoostDb(bd.value));

    // TTS mode radios
    document.querySelectorAll('input[name="ttsMode"]').forEach(r=>{
      r.addEventListener("change", ()=>{ Store.setTTSMode(r.value); });
    });

    // Install hint & SW
    const ih=document.getElementById("installHint");
    if (window.matchMedia('(display-mode: standalone)').matches) { ih.classList.add("hidden"); }
    else { ih.classList.remove("hidden"); ih.onclick=()=>alert("Safariの共有ボタン → 『ホーム画面に追加』からインストールできます。"); }
    if ("serviceWorker" in navigator){ window.addEventListener("load", ()=> navigator.serviceWorker.register("sw.js")); }

    Store.load();
  },

  setJP(t){ this.els.jp.textContent=t; },
  renderPool(pool){
    this.els.pool.innerHTML="";
    pool.forEach((t,i)=>{
      const b=document.createElement("button"); b.className="token"; b.textContent=t;
      b.onclick=()=>Practice.tapPool(i);
      this.els.pool.appendChild(b);
    });
  },
  renderAnswer(ans){
    this.els.ans.innerHTML="";
    ans.forEach((t,i)=>{
      const b=document.createElement("button"); b.className="token"; b.textContent=t;
      b.onclick=()=>Practice.tapAnswer(i);
      this.els.ans.appendChild(b);
    });
  },
  showResult(ok, correctEN){
    this.els.result.className="result "+(ok?"ok":"ng");
    this.els.result.textContent = ok ? "正解！" : "不正解：正解は " + correctEN;
  },
  clearResult(){
    this.els.result.className="result"; this.els.result.textContent="";
    this.els.explainWrap.classList.add("hidden"); this.els.explain.textContent="";
  },
  showExplaining(b){
    if (b){ this.els.explainWrap.classList.remove("hidden"); this.els.explain.textContent="解説を生成中…"; }
  },
  setExplanation(text){
    this.els.explainWrap.classList.remove("hidden");
    this.els.explain.textContent = text || "（解説なし）";
  },

  refreshProblems(q=""){
    const key=(q||"").toLowerCase();
    const list=(Store.problems||[]).filter(p=>!key || p.jp.toLowerCase().includes(key) || p.en.toLowerCase().includes(key));
    this.lastProblems=list.map(p=>({jp:p.jp,en:p.en,id:p.id}));
    this.els.problemsList.innerHTML="";
    list.forEach(p=>{
      const d=document.createElement("div"); d.className="item";
      d.innerHTML = `<div class="meta">ID: ${p.id}</div>
        <div>${p.jp}</div>
        <div class="en">${p.en}</div>
        <div class="tts-mini">
          <button class="mini-jp">JP▶︎</button>
          <button class="mini-en">EN▶︎</button>
          <button class="mini-seq">JP→EN▶︎</button>
        </div>`;
      d.addEventListener("click", ()=>Practice.setProblemById(p.id));
      d.querySelector(".mini-jp").addEventListener("click", async (e)=>{ e.stopPropagation(); ListAuto.stop(); await TTS.speak(p.jp,"ja-JP"); });
      d.querySelector(".mini-en").addEventListener("click", async (e)=>{ e.stopPropagation(); ListAuto.stop(); await TTS.speak(p.en,"en-US"); });
      d.querySelector(".mini-seq").addEventListener("click", async (e)=>{ e.stopPropagation(); ListAuto.stop(); await TTS.seqRepeat(p.jp,p.en,Store.repeatCount); });
      this.els.problemsList.appendChild(d);
    });
  },

  refreshHistory(){
    const filter = document.getElementById("histFilter").value;
    const key=(document.getElementById("histSearch").value||"").toLowerCase();
    const base=Store.history||[];
    const filtered=base.filter(rec=>{
      if (filter==="correct" && !rec.correct) return false;
      if (filter==="wrong" && rec.correct) return false;
      return true;
    });
    const list = filtered.filter(rec=>{
      if(!key) return true;
      const p=Store.problems.find(x=>x.id===rec.problemID);
      return (p?.jp||"").toLowerCase().includes(key) || (p?.en||"").toLowerCase().includes(key) || (rec.userAnswer||"").toLowerCase().includes(key);
    });

    this.els.histList.innerHTML="";
    this.lastHistory=[];
    list.forEach(rec=>{
      const p=Store.problems.find(x=>x.id===rec.problemID);
      const d=document.createElement("div"); d.className="item";
      const dt=new Date(rec.timestamp);
      const jp = p?.jp || "(削除済み問題)";
      const en = p?.en || "";
      if(p?.jp && p?.en) this.lastHistory.push({jp:p.jp,en:p.en,id:p.id});
      d.innerHTML=`<div class="meta">
        <span>${rec.correct ? "正解" : "不正解"}</span>
        <span>${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</span>
      </div>
      <div>${jp}</div>
      <div class="ans">あなたの解答：${rec.userAnswer}</div>
      <div class="en">正解：${en}</div>
      <div class="tts-mini">
        <button class="mini-jp">JP▶︎</button>
        <button class="mini-en">EN▶︎</button>
        <button class="mini-seq">JP→EN▶︎</button>
      </div>`;
      d.addEventListener("click", ()=>{ if(p?.id) Practice.setProblemById(p.id); });
      d.querySelector(".mini-jp").addEventListener("click", async (e)=>{ e.stopPropagation(); ListAuto.stop(); if(jp) await TTS.speak(jp,"ja-JP"); });
      d.querySelector(".mini-en").addEventListener("click", async (e)=>{ e.stopPropagation(); ListAuto.stop(); if(en) await TTS.speak(en,"en-US"); });
      d.querySelector(".mini-seq").addEventListener("click", async (e)=>{ e.stopPropagation(); ListAuto.stop(); if(jp && en) await TTS.seqRepeat(jp,en,Store.repeatCount); });
      this.els.histList.appendChild(d);
    });
  },

  setApiKey(k){ this.els.apiKey.value=k||""; },
  initDelayControls(d1,d2){
    document.getElementById("delayJPEN").value=d1;
    document.getElementById("delayNextJP").value=d2;
    document.getElementById("delayJPENVal").textContent=d1+"s";
    document.getElementById("delayNextJPVal").textContent=d2+"s";
  },
  initAudioControls(repeatCount,baseVolume,boostDb){
    const rc=document.getElementById("repeatCount"), rcv=document.getElementById("repeatCountVal");
    rc.value = repeatCount; rcv.textContent = repeatCount + "回";
    const bv=document.getElementById("baseVolume"), bvv=document.getElementById("baseVolumeVal");
    bv.value = baseVolume; bvv.textContent = parseFloat(baseVolume).toFixed(2);
    const bd=document.getElementById("boostDb"), bdv=document.getElementById("boostDbVal");
    bd.value = boostDb; bdv.textContent = boostDb + " dB";
  },
  initTTSMode(mode, endpoint){
    document.querySelectorAll('input[name="ttsMode"]').forEach(r=>{ r.checked = (r.value===mode); });
    document.getElementById("ttsEndpoint").value = endpoint || "";
  },
  showNoProblems(){
    this.setJP("（問題がありません。問題タブからCSVを追加してください）");
    this.renderPool([]); this.renderAnswer([]);
  },
  switchTab(id){
    document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
    document.querySelector(`nav button[data-tab="${id}"]`)?.classList.add("active");
    document.querySelectorAll(".tab").forEach(s=>s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }
};

window.addEventListener("DOMContentLoaded", ()=>UI.init());
