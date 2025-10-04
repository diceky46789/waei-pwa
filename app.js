
// --- Tokenizer & Normalizer ---
const TOKENS={tokenize(s){if(!s)return[];let t=s;const m=[",",".","!","?",";",";",":","(",")","\"","[","]"];for(const x of m)t=t.split(x).join(` ${x} `);return t.split(/\s+/).filter(Boolean)},detokenize(a){if(!a||!a.length)return"";let s=a.join(" ");s=s.replace(/ \./g,".").replace(/ ,/g,",").replace(/ !/g,"!").replace(/ \?/g,"?").replace(/ ;/g,";").replace(/ :/g,":").replace(/ \)/g,")").replace(/\( /g,"(").replace(/ \]/g,"]").replace(/\[ /g,"[").replace(/ \"/g,'"');s=s.replace(/(\w)\s+'\s+(\w)/g,"$1'$2").replace(/(\w)\s+’\s+(\w)/g,"$1’$2");return s},normalized(s){if(!s)return"";let t=s.normalize?s.normalize("NFKC"):s;t=t.replace(/[\u2018\u2019\u02BC\u2032]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,"-");t=t.replace(/(\w)\s*'\s*(\w)/g,"$1'$2");t=t.replace(/\s+([.,!?;:%)\]\}])/g,"$1").replace(/([(\[\{])\s+/g,"$1");t=t.replace(/\u00A0/g," ").replace(/\s+/g," ").trim().toLowerCase();return t}};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const CSV={parse(text){const rows=[];let i=0,f="",row=[],q=false;while(i<text.length){const c=text[i];if(c=='"'){if(q&&text[i+1]=='"'){f+='"';i+=2;continue}q=!q;i++;continue}if(c==","&&!q){row.push(f);f="";i++;continue}if((c=="\n"||c=="\r")&&!q){row.push(f);f="";if(row.length>1||row[0]!="")rows.push(row);row=[];i++;if(c=="\r"&&text[i]=="\n")i++;continue}f+=c;i++}if(f.length||row.length){row.push(f);rows.push(row)}if(!rows.length)throw new Error("CSVが空です");return rows},make(data){const esc=v=>/[" ,\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;let out="jp,en\n";for(const r of data){out+=esc(r.jp)+","+esc(r.en)+"\n"}return out}};

// --- Persistent Store with Collections ---
const Store={
  load(){
    // collections: { name: Problem[] }, historyMap: { name: History[] }
    this.collections=JSON.parse(localStorage.getItem("collections")||"null");
    this.currentName=localStorage.getItem("currentCollection")||"Default";
    this.historyMap=JSON.parse(localStorage.getItem("historyMap")||"null");
    this.apiKey=localStorage.getItem("apiKey")||"";
    this.delayJPEN=clamp(parseFloat(localStorage.getItem("delayJPEN")||"1.0"),0.5,10);
    this.delayNextJP=clamp(parseFloat(localStorage.getItem("delayNextJP")||"2.0"),0.5,10);
    this.ttsMode=localStorage.getItem("ttsMode")||"audio";
    this.ttsEndpoint=localStorage.getItem("ttsEndpoint")||"";
    this.repeatCount=clamp(parseInt(localStorage.getItem("repeatCount")||"1"),1,10);
    this.baseVolume=clamp(parseFloat(localStorage.getItem("baseVolume")||"1.0"),0,1);
    this.boostDb=clamp(parseInt(localStorage.getItem("boostDb")||"0"),0,12);

    const firstSetup=async()=>{
      const rows=CSV.parse(await (await fetch("resources/builtin_problems.csv")).text());
      const ji=rows[0].indexOf("jp"), ei=rows[0].indexOf("en");
      const out=[];
      for(let i=1;i<rows.length;i++){const c=rows[i];const jp=(c[ji]||"").trim(),en=(c[ei]||"").trim();if(jp&&en)out.push({id:crypto.randomUUID(),jp,en})}
      this.collections={"Default":out};
      this.currentName="Default";
      this.historyMap={"Default":[]};
      this.persist();
    };

    if(!this.collections || !this.historyMap){
      // initialize
      this.collections={}; this.historyMap={}; this.currentName="Default";
      // load builtin then persist
      firstSetup();
    }

    UI.populateDatasets(Object.keys(this.collections), this.currentName);
    UI.setApiKey(this.apiKey);
    UI.initDelayControls(this.delayJPEN,this.delayNextJP);
    UI.initTTSMode(this.ttsMode,this.ttsEndpoint);
    UI.initAudioControls(this.repeatCount,this.baseVolume,this.boostDb);
    UI.refreshProblems();
    UI.refreshHistory();
    Practice.pickRandom();
  },
  persist(){
    localStorage.setItem("collections",JSON.stringify(this.collections));
    localStorage.setItem("currentCollection",this.currentName);
    localStorage.setItem("historyMap",JSON.stringify(this.historyMap));
  },
  get problems(){ return this.collections[this.currentName]||[] },
  set problems(v){ this.collections[this.currentName]=v; this.persist(); },
  get history(){ return this.historyMap[this.currentName]||[] },
  set history(v){ this.historyMap[this.currentName]=v; this.persist(); },

  createCollection(name){
    if(!name||this.collections[name]) return false;
    this.collections[name]=[]; this.historyMap[name]=[]; this.currentName=name; this.persist(); return true;
  },
  renameCollection(oldName,newName){
    if(!this.collections[oldName]||!newName||this.collections[newName]) return false;
    this.collections[newName]=this.collections[oldName];
    this.historyMap[newName]=this.historyMap[oldName]||[];
    delete this.collections[oldName]; delete this.historyMap[oldName];
    if(this.currentName===oldName) this.currentName=newName;
    this.persist(); return true;
  },
  deleteCollection(name){
    if(name==="Default") return false;
    delete this.collections[name]; delete this.historyMap[name];
    if(this.currentName===name) this.currentName="Default";
    this.persist(); return true;
  },
  switchCollection(name){
    if(!this.collections[name]) return false;
    this.currentName=name; this.persist(); return true;
  },

  // existing settings
  saveApiKey(k){this.apiKey=k;localStorage.setItem("apiKey",k||"")},
  setDelayJPEN(v){this.delayJPEN=clamp(parseFloat(v)||1.0,0.5,10);localStorage.setItem("delayJPEN",this.delayJPEN)},
  setDelayNextJP(v){this.delayNextJP=clamp(parseFloat(v)||2.0,0.5,10);localStorage.setItem("delayNextJP",this.delayNextJP)},
  setTTSMode(m){this.ttsMode=m;localStorage.setItem("ttsMode",m)},
  setTTSEndpoint(url){this.ttsEndpoint=url.trim();localStorage.setItem("ttsEndpoint",this.ttsEndpoint)},
  setRepeatCount(n){this.repeatCount=clamp(parseInt(n)||1,1,10);localStorage.setItem("repeatCount",this.repeatCount)},
  setBaseVolume(v){this.baseVolume=clamp(parseFloat(v)||1,0,1);localStorage.setItem("baseVolume",this.baseVolume)},
  setBoostDb(db){this.boostDb=clamp(parseInt(db)||0,0,12);localStorage.setItem("boostDb",this.boostDb)},
};

// --- Voice (unchanged) ---
const VoicePicker=(()=>{let voicesCache=[];let readyResolve;const ready=new Promise(res=>readyResolve=res);function loadVoices(){const v=speechSynthesis.getVoices();if(v&&v.length){voicesCache=v;readyResolve();}}speechSynthesis.onvoiceschanged=loadVoices;loadVoices();function prefer(names=[],langPrefix=""){for(const n of names){const hit=voicesCache.find(v=>v.name&&v.name.toLowerCase().includes(n.toLowerCase()));if(hit)return hit}if(langPrefix){const hit=voicesCache.find(v=>v.lang&&v.lang.toLowerCase().startsWith(langPrefix.toLowerCase()));if(hit)return hit}return null}async function pick(lang){await ready;if(lang.startsWith("ja"))return prefer(["Kyoko","Otoya","Fiona","Hattori","Kyoko (Enhanced)"],"ja")||null;if(lang.startsWith("en"))return prefer(["Samantha","Alex","Ava","Daniel","Karen","Moira","Victoria","Fred"],"en")||null;return voicesCache.find(v=>v.lang&&v.lang.toLowerCase().startsWith(lang.toLowerCase()))||null}return{pick,ready}})();
const WebSpeechTTS={cancel(){speechSynthesis.cancel()},async speak(text,lang){await VoicePicker.ready;return new Promise(async res=>{const u=new SpeechSynthesisUtterance(text);const voice=await VoicePicker.pick(lang);if(voice)u.voice=voice;else u.lang=lang;u.rate=1;u.pitch=1;u.volume=Store.baseVolume;u.onend=()=>res();u.onerror=()=>res();speechSynthesis.speak(u)})}};
const AudioTTS={audio:null,ctx:null,source:null,gainNode:null,ensureAudio(){if(!this.audio){this.audio=document.getElementById("ttsAudio");this.audio.volume=Store.baseVolume}if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;this.ctx=new AC();this.source=this.ctx.createMediaElementSource(this.audio);this.gainNode=this.ctx.createGain();this.source.connect(this.gainNode).connect(this.ctx.destination);this.applyBoost(Store.boostDb)}},applyBoost(db){if(!this.gainNode)return;const gain=Math.pow(10,(db||0)/20);this.gainNode.gain.value=gain},setBaseVolume(v){if(this.audio)this.audio.volume=v},async fetchURL(lang,text){const endpoint=(Store.ttsEndpoint||"").trim();if(!endpoint)throw new Error("TTSエンドポイントが未設定です（設定タブで保存してください）");return endpoint.replace("{lang}",encodeURIComponent(lang)).replace("{text}",encodeURIComponent(text))},async playOnce(lang,text){this.ensureAudio();if(this.ctx?.state==="suspended"){try{await this.ctx.resume()}catch{}}const src=await this.fetchURL(lang,text);return new Promise(async resolve=>{const onend=()=>{this.audio.removeEventListener("ended",onend);resolve()};this.audio.addEventListener("ended",onend);this.audio.src=src;try{await this.audio.play()}catch(e){resolve()}})},stop(){try{this.audio?.pause()}catch{}if(this.audio){this.audio.src=""}}};
const TTS={cancel(){WebSpeechTTS.cancel();AudioTTS.stop()},wait(ms){return new Promise(r=>setTimeout(r,ms))},async speak(text,lang){if(Store.ttsMode==="audio"){AudioTTS.setBaseVolume(Store.baseVolume);await AudioTTS.playOnce(lang,text)}else{await WebSpeechTTS.speak(text,lang)}},async seqOnce(jp,en){if(Store.ttsMode==="audio"){AudioTTS.setBaseVolume(Store.baseVolume);await AudioTTS.playOnce("ja-JP",jp);await this.wait(Store.delayJPEN*1000);await AudioTTS.playOnce("en-US",en)}else{await WebSpeechTTS.speak(jp,"ja-JP");await this.wait(Store.delayJPEN*1000);await WebSpeechTTS.speak(en,"en-US")}},async seqRepeat(jp,en,repeat){repeat=Math.max(1,Math.min(10,repeat|0));for(let i=0;i<repeat;i++){await this.seqOnce(jp,en);if(i<repeat-1)await this.wait(Store.delayNextJP*1000)}}};

// --- Practice ---
const Practice={current:null,pool:[],answer:[],pickRandom(){const arr=Store.problems;if(!arr||!arr.length){UI.showNoProblems();return}this.current=arr[Math.floor(Math.random()*arr.length)];UI.setJP(this.current.jp);this.resetTokens();UI.clearResult()},setProblemById(id){const p=(Store.problems||[]).find(x=>x.id===id);if(!p)return;this.current=p;UI.setJP(p.jp);this.resetTokens();UI.clearResult();UI.switchTab("practice")},resetTokens(){this.pool=TOKENS.tokenize(this.current.en).sort(()=>Math.random()-0.5);this.answer=[];UI.renderPool(this.pool);UI.renderAnswer(this.answer)},undo(){if(this.answer.length){const t=this.answer.pop();this.pool.push(t);UI.renderPool(this.pool);UI.renderAnswer(this.answer)}},shuffle(){this.pool=this.pool.sort(()=>Math.random()-0.5);UI.renderPool(this.pool)},tapPool(i){const [t]=this.pool.splice(i,1);this.answer.push(t);UI.renderPool(this.pool);UI.renderAnswer(this.answer)},tapAnswer(i){const [t]=this.answer.splice(i,1);this.pool.push(t);UI.renderPool(this.pool);UI.renderAnswer(this.answer)},check(){const ans=TOKENS.detokenize(this.answer);const ok=TOKENS.normalized(ans)===TOKENS.normalized(this.current.en);const rec={id:crypto.randomUUID(),problemID:this.current.id,timestamp:Date.now(),userAnswer:ans,correct:ok};Store.history=[rec,...(Store.history||[])];UI.showResult(ok,this.current.en);UI.refreshHistory();this.explain(ans,ok);if(ok&&document.getElementById("autoplayChk").checked){this.pickRandom()}},async explain(userEN,ok){UI.showExplaining(true);const key=Store.apiKey;if(!key){UI.setExplanation("（APIキー未設定のため、解説自動生成はスキップ）");UI.showExplaining(false);return}try{const prompt=`あなたは英語学習者向けに、語順の理由を日本語でわかりやすく解説する先生です。\\n日本文: ${this.current.jp}\\n正解の英語: ${this.current.en}\\nユーザーの英語: ${userEN}`;const resp=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4.1-mini",input:[{role:"user",content:prompt}],temperature:0.2})});if(!resp.ok)throw new Error(await resp.text());const data=await resp.json();let text="";if(data?.output?.content)text=data.output.content.map(c=>c.text||"").join("\\n").trim();else if(data?.choices?.[0]?.message?.content)text=data.choices[0].message.content;UI.setExplanation(text||"（解説なし）")}catch(e){UI.setExplanation("解説の取得に失敗しました: "+e.message)}finally{UI.showExplaining(false)}}}
/* --- Prev navigation (single clean block) --- */
(function(){
  function updatePrevBtn(){
    const b = document.getElementById("prevBtn");
    if (b) b.disabled = !(Practice.navBack && Practice.navBack.length);
  }
  Practice.navBack = Practice.navBack || [];

  if (!Practice._pickRandomOriginal_forPrev){
    Practice._pickRandomOriginal_forPrev = Practice.pickRandom.bind(Practice);
    Practice.pickRandom = function(){
      if (this.current && this.current.id) { this.navBack.push(this.current.id); }
      const r = this._pickRandomOriginal_forPrev();
      updatePrevBtn();
      return r;
    };
  }

  if (Practice.setProblemById && !Practice._setProblemByIdOriginal_forPrev){
    Practice._setProblemByIdOriginal_forPrev = Practice.setProblemById.bind(Practice);
    Practice.setProblemById = function(id){
      if (this.current && this.current.id) { this.navBack.push(this.current.id); }
      const r = this._setProblemByIdOriginal_forPrev(id);
      updatePrevBtn();
      return r;
    };
  }

  Practice.prev = function(){
    while (this.navBack && this.navBack.length){
      const id = this.navBack.pop();
      const arr = (Store.problems || []);
      const p = arr.find(x => x.id === id) || null;
      if (p){
        this.current = p;
        UI.setJP(p.jp);
        this.resetTokens();
        UI.clearResult();
        updatePrevBtn();
        return;
      }
    }
    updatePrevBtn();
    alert("前に表示した問題はありません");
  };

  // initialize button state on DOM ready
  window.addEventListener("DOMContentLoaded", updatePrevBtn);
})();
/* --- end prev navigation (single clean block) --- */
// --- List auto player (unchanged) ---
const ListAuto={abort:false,stop(){this.abort=true;TTS.cancel();UI.clearPlaying()},async playItemsJPEN(items,container){this.abort=false;for(const it of items){if(this.abort)break;UI.setPlaying(container,it.id);const{jp,en}=it;if(!jp||!en)continue;await TTS.seqRepeat(jp,en,Store.repeatCount);if(this.abort)break;await TTS.wait(Store.delayNextJP*1000)}UI.clearPlaying()}};

// --- UI ---
const UI={els:{},lastProblems:[],lastHistory:[],_playingEl:null,
  init(){
    document.querySelectorAll("nav button").forEach(btn=>{
      btn.addEventListener("click",()=>{
        document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        const tab=btn.dataset.tab;
        document.querySelectorAll(".tab").forEach(s=>s.classList.remove("active"));
        document.getElementById(tab).classList.add("active")
      })
    });
    // Dataset controls
    this.els.dsSelect=document.getElementById("datasetSelect");
    document.getElementById("addDatasetBtn").onclick=()=>{
      const name=prompt("新しいデータセット名を入力");
      if(!name)return;
      if(!Store.createCollection(name)) return alert("作成できません（重複名の可能性）");
      this.populateDatasets(Object.keys(Store.collections), Store.currentName);
      this.refreshProblems(); this.refreshHistory(); Practice.pickRandom();
    };
    document.getElementById("renameDatasetBtn").onclick=()=>{
      const old=this.els.dsSelect.value;
      const name=prompt("新しい名前", old);
      if(!name||name===old)return;
      if(!Store.renameCollection(old,name)) return alert("名称変更できません");
      this.populateDatasets(Object.keys(Store.collections), Store.currentName);
      this.refreshProblems(); this.refreshHistory(); Practice.pickRandom();
    };
    document.getElementById("deleteDatasetBtn").onclick=()=>{
      const name=this.els.dsSelect.value;
      if(name==="Default") return alert("Default は削除できません");
      if(confirm(`「${name}」を削除しますか？`)){
        if(!Store.deleteCollection(name)) return alert("削除できません");
        this.populateDatasets(Object.keys(Store.collections), Store.currentName);
        this.refreshProblems(); this.refreshHistory(); Practice.pickRandom();
      }
    };
    this.els.dsSelect.addEventListener("change",()=>{
      const n=this.els.dsSelect.value;
      if(Store.switchCollection(n)){
        this.refreshProblems(); this.refreshHistory(); Practice.pickRandom();
      }
    });

    // practice
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
    document.getElementById("prevBtn").onclick=()=>Practice.prev();
    document.getElementById("nextBtn").onclick=()=>Practice.pickRandom();
    document.getElementById("speakJPBtn").onclick=async()=>{ListAuto.stop();await TTS.speak(Practice.current.jp,"ja-JP")};
    document.getElementById("speakENBtn").onclick=async()=>{ListAuto.stop();await TTS.speak(Practice.current.en,"en-US")};
    document.getElementById("speakSeqBtn").onclick=async()=>{ListAuto.stop();await TTS.seqRepeat(Practice.current.jp,Practice.current.en,Store.repeatCount)};
    document.getElementById("stopSpeakBtn").onclick=()=>{ListAuto.stop()};

    // problems
    this.els.problemsList=document.getElementById("problemsList");
    const pSearch=document.getElementById("problemSearch");
    pSearch.addEventListener("input",()=>this.refreshProblems(pSearch.value));
    document.getElementById("problemsPlayAllBtn").onclick=()=>{if(!this.lastProblems.length){alert("一覧が空です");return}ListAuto.playItemsJPEN(this.lastProblems,this.els.problemsList)};
    document.getElementById("problemsStopBtn").onclick=()=>ListAuto.stop();
    document.getElementById("csvBtn").onclick=()=>document.getElementById("csvInput").click();
    document.getElementById("csvInput").addEventListener("change",async e=>{
      const file=e.target.files?.[0]; if(!file)return;
      const text=await file.text();
      try{
        const rows=CSV.parse(text),h=rows[0];
        const ji=h.indexOf("jp"),ei=h.indexOf("en");
        if(ji<0||ei<0) throw new Error("CSVヘッダーに jp,en が必要です");
        let added=0;
        const exists=new Set((Store.problems||[]).map(p=>TOKENS.normalized(p.en)));
        const arr=Store.problems||[];
        for(let i=1;i<rows.length;i++){
          const c=rows[i]; const jp=(c[ji]||"").trim(), en=(c[ei]||"").trim();
          if(!jp||!en) continue;
          if(exists.has(TOKENS.normalized(en))) continue;
          arr.push({id:crypto.randomUUID(), jp, en});
          exists.add(TOKENS.normalized(en)); added++;
        }
        Store.problems=arr;
        alert(`インポート成功：${added}件追加（データセット：${Store.currentName}）`);
        this.refreshProblems(pSearch.value);
      }catch(err){
        alert("インポート失敗: "+err.message);
      }
      e.target.value="";
    });
    document.getElementById("exportCsvBtn").onclick=()=>{
      const data=Store.problems||[];
      const csv=CSV.make(data);
      const blob=new Blob([csv],{type:"text/csv"});
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=`problems_${Store.currentName}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    // history
    this.els.histList=document.getElementById("historyList");
    const histFilter=document.getElementById("histFilter");
    const histSearch=document.getElementById("histSearch");
    histFilter.addEventListener("change",()=>this.refreshHistory());
    histSearch.addEventListener("input",()=>this.refreshHistory());
    document.getElementById("historyPlayAllBtn").onclick=()=>{if(!this.lastHistory.length){alert("一覧が空です");return}ListAuto.playItemsJPEN(this.lastHistory,this.els.histList)};
    document.getElementById("historyStopBtn").onclick=()=>ListAuto.stop();

    // settings
    const apiKey=document.getElementById("apiKey");
    document.getElementById("saveKeyBtn").onclick=()=>{Store.saveApiKey(apiKey.value.trim());alert("保存しました")};
    document.getElementById("deleteKeyBtn").onclick=()=>{Store.saveApiKey("");apiKey.value="";alert("削除しました")};
    document.getElementById("saveTtsEndpoint").onclick=()=>{const val=document.getElementById("ttsEndpoint").value.trim();Store.setTTSEndpoint(val);alert("TTSエンドポイントを保存しました")};

    // sliders
    const s1=document.getElementById("delayJPEN"), s2=document.getElementById("delayNextJP"),
          v1=document.getElementById("delayJPENVal"), v2=document.getElementById("delayNextJPVal");
    s1.addEventListener("input",()=>v1.textContent=s1.value+"s");
    s2.addEventListener("input",()=>v2.textContent=s2.value+"s");
    s1.addEventListener("change",()=>Store.setDelayJPEN(s1.value));
    s2.addEventListener("change",()=>Store.setDelayNextJP(s2.value));
    this.els.delayJPEN=s1; this.els.delayNextJP=s2; this.els.delayJPENVal=v1; this.els.delayNextJPVal=v2;

    const rc=document.getElementById("repeatCount"), rcv=document.getElementById("repeatCountVal");
    rc.addEventListener("input",()=>rcv.textContent=rc.value+"回");
    rc.addEventListener("change",()=>{Store.setRepeatCount(rc.value)});
    const bv=document.getElementById("baseVolume"), bvv=document.getElementById("baseVolumeVal");
    bv.addEventListener("input",()=>{bvv.textContent=bv.value});
    bv.addEventListener("change",()=>Store.setBaseVolume(bv.value));
    const bd=document.getElementById("boostDb"), bdv=document.getElementById("boostDbVal");
    bd.addEventListener("input",()=>{bdv.textContent=bd.value+" dB"});
    bd.addEventListener("change",()=>Store.setBoostDb(bd.value));
    document.querySelectorAll('input[name="ttsMode"]').forEach(r=>{r.addEventListener("change",()=>{Store.setTTSMode(r.value)})});

    // install hint
    const ih=document.getElementById("installHint");
    if(window.matchMedia('(display-mode: standalone)').matches){ ih.classList.add("hidden") }
    else { ih.classList.remove("hidden"); ih.onclick=()=>alert("Safariの共有→『ホーム画面に追加』") }

    if("serviceWorker" in navigator){
      const SW_VERSION="3.4.2";
      window.addEventListener("load", async()=>{
        try{
          const reg = await navigator.serviceWorker.register("sw.js?v="+SW_VERSION);
          // Try to get latest immediately
          reg.update();
          // When a new SW is waiting, tell it to skip waiting
          if (reg.waiting) reg.waiting.postMessage({type:"SKIP_WAITING"});
          // If a new controller takes over, reload to use fresh files
          navigator.serviceWorker.addEventListener("controllerchange", ()=>location.reload());
          // Also check for updates whenever tab becomes visible
          document.addEventListener("visibilitychange", ()=>{
            if(document.visibilityState==="visible") reg.update();
          });
        }catch(e){ console.warn("SW register failed:", e); }
      });
    }

    // kick
    Store.load();
  },
  populateDatasets(names, current){
    this.els.dsSelect.innerHTML="";
    names.sort().forEach(n=>{
      const opt=document.createElement("option"); opt.value=n; opt.textContent=n;
      if(n===current) opt.selected=true;
      this.els.dsSelect.appendChild(opt);
    });
  },
  setJP(t){ this.els.jp.textContent=t },
  renderPool(pool){ this.els.pool.innerHTML=""; pool.forEach((t,i)=>{ const b=document.createElement("button"); b.className="token"; b.textContent=t; b.onclick=()=>Practice.tapPool(i); this.els.pool.appendChild(b) }) },
  renderAnswer(ans){ this.els.ans.innerHTML=""; ans.forEach((t,i)=>{ const b=document.createElement("button"); b.className="token"; b.textContent=t; b.onclick=()=>Practice.tapAnswer(i); this.els.ans.appendChild(b) }) },
  showResult(ok,correctEN){ this.els.result.className="result "+(ok?"ok":"ng"); this.els.result.textContent=ok?"正解！":"不正解：正解は "+correctEN },
  clearResult(){ this.els.result.className="result"; this.els.result.textContent=""; this.els.explainWrap.classList.add("hidden"); this.els.explain.textContent="" },
  showExplaining(b){ if(b){ this.els.explainWrap.classList.remove("hidden"); this.els.explain.textContent="解説を生成中…" } },
  setExplanation(t){ this.els.explainWrap.classList.remove("hidden"); this.els.explain.textContent=t||"（解説なし）" },

  refreshProblems(q=""){
    const key=(q||"").toLowerCase();
    const list=(Store.problems||[]).filter(p=>!key||p.jp.toLowerCase().includes(key)||p.en.toLowerCase().includes(key));
    this.lastProblems=list.map(p=>({jp:p.jp,en:p.en,id:p.id}));
    this.els.problemsList.innerHTML="";
    list.forEach(p=>{
      const d=document.createElement("div"); d.className="item"; d.dataset.id=p.id;
      d.innerHTML=`<div class="meta">ID: ${p.id}・DS: ${Store.currentName}</div><div>${p.jp}</div><div class="en">${p.en}</div>
      <div class="tts-mini"><button class="mini-jp">JP▶︎</button><button class="mini-en">EN▶︎</button><button class="mini-seq">JP→EN▶︎</button></div>`;
      d.addEventListener("click",()=>Practice.setProblemById(p.id));
      d.querySelector(".mini-jp").addEventListener("click",async e=>{e.stopPropagation();ListAuto.stop();await TTS.speak(p.jp,"ja-JP")});
      d.querySelector(".mini-en").addEventListener("click",async e=>{e.stopPropagation();ListAuto.stop();await TTS.speak(p.en,"en-US")});
      d.querySelector(".mini-seq").addEventListener("click",async e=>{e.stopPropagation();ListAuto.stop();await TTS.seqRepeat(p.jp,p.en,Store.repeatCount)});
      this.els.problemsList.appendChild(d);
    });
  },

  refreshHistory(){
    const filter=document.getElementById("histFilter").value;
    const key=(document.getElementById("histSearch").value||"").toLowerCase();
    const base=Store.history||[];
    const filtered=base.filter(rec=>{
      if(filter==="correct"&&!rec.correct) return false;
      if(filter==="wrong"&&rec.correct) return false;
      return true;
    });
    const list=filtered.filter(rec=>{
      if(!key)return true;
      const p=(Store.problems||[]).find(x=>x.id===rec.problemID);
      return (p?.jp||"").toLowerCase().includes(key)||(p?.en||"").toLowerCase().includes(key)||(rec.userAnswer||"").toLowerCase().includes(key)
    });
    this.els.histList.innerHTML=""; this.lastHistory=[];
    list.forEach(rec=>{
      const p=(Store.problems||[]).find(x=>x.id===rec.problemID);
      const d=document.createElement("div"); d.className="item"; d.dataset.id=p?.id||"";
      const dt=new Date(rec.timestamp);
      const jp=p?.jp||"(削除済み問題)", en=p?.en||"";
      if(p?.jp&&p?.en) this.lastHistory.push({jp:p.jp,en:p.en,id:p.id});
      d.innerHTML=`<div class="meta"><span>${rec.correct?"正解":"不正解"}</span><span>${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}</span>・DS: ${Store.currentName}</div>
      <div>${jp}</div><div class="ans">あなたの解答：${rec.userAnswer}</div><div class="en">正解：${en}</div>
      <div class="tts-mini"><button class="mini-jp">JP▶︎</button><button class="mini-en">EN▶︎</button><button class="mini-seq">JP→EN▶︎</button></div>`;
      d.addEventListener("click",()=>{if(p?.id)Practice.setProblemById(p.id)});
      d.querySelector(".mini-jp").addEventListener("click",async e=>{e.stopPropagation();ListAuto.stop();if(jp)await TTS.speak(jp,"ja-JP")});
      d.querySelector(".mini-en").addEventListener("click",async e=>{e.stopPropagation();ListAuto.stop();if(en)await TTS.speak(en,"en-US")});
      d.querySelector(".mini-seq").addEventListener("click",async e=>{e.stopPropagation();ListAuto.stop();if(jp&&en)await TTS.seqRepeat(jp,en,Store.repeatCount)});
      this.els.histList.appendChild(d);
    });
  },

  setPlaying(container,id){ this.clearPlaying(container); if(!container)return; const el=container.querySelector(`.item[data-id="${CSS.escape(id)}"]`); if(el){ el.classList.add("playing"); el.scrollIntoView({behavior:"smooth",block:"center"}); this._playingEl=el } },
  clearPlaying(container){ if(container){ container.querySelectorAll(".item.playing").forEach(x=>x.classList.remove("playing")) } else { document.querySelectorAll(".item.playing").forEach(x=>x.classList.remove("playing")) } this._playingEl=null },

  setApiKey(k){ document.getElementById("apiKey").value=k||"" },
  initDelayControls(d1,d2){ document.getElementById("delayJPEN").value=d1; document.getElementById("delayNextJP").value=d2; document.getElementById("delayJPENVal").textContent=d1+"s"; document.getElementById("delayNextJPVal").textContent=d2+"s" },
  initAudioControls(rep,vol,boost){ document.getElementById("repeatCount").value=rep; document.getElementById("repeatCountVal").textContent=rep+"回"; document.getElementById("baseVolume").value=vol; document.getElementById("baseVolumeVal").textContent=vol.toFixed(2); document.getElementById("boostDb").value=boost; document.getElementById("boostDbVal").textContent=boost+" dB" },
  initTTSMode(mode,endpoint){ document.querySelectorAll('input[name="ttsMode"]').forEach(r=>{ r.checked=(r.value===mode) }); document.getElementById("ttsEndpoint").value=endpoint||"" },

  showNoProblems(){ this.setJP("（データセットに問題がありません。問題タブからCSVを追加）"); this.renderPool([]); this.renderAnswer([]) },
  switchTab(id){ document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active")); document.querySelector(`nav button[data-tab="${id}"]`)?.classList.add("active"); document.querySelectorAll(".tab").forEach(s=>s.classList.remove("active")); document.getElementById(id).classList.add("active") }
};

window.addEventListener("DOMContentLoaded",()=>UI.init());
