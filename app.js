/* 和英正順アプリ v11 - Precise drag-to-insert caret (other specs unchanged) */
(function(){
  'use strict';

  const K = {
    DATASETS: 'woa.datasets.v2',
    SETTINGS: 'woa.settings.v2',
    HISTORY:  'woa.history.v2',
    STATE:    'woa.state.v2'
  };

  const el = {
    tabs: document.querySelectorAll('.tab-btn'),
    sections: {
      practice: document.getElementById('practice'),
      problems: document.getElementById('problems'),
      catalog: document.getElementById('catalog'),
      history: document.getElementById('history'),
      settings: document.getElementById('settings')
    },
    jpText: document.getElementById('jpText'),
    wordBank: document.getElementById('wordBank'),
    answerArea: document.getElementById('answerArea'),
    resultBox: document.getElementById('resultBox'),
    explainBox: document.getElementById('explainBox'),
    checkBtn: document.getElementById('checkBtn'),
    resetBtn: document.getElementById('resetBtn'),
    nextBtn: document.getElementById('nextBtn'),
    prevBtn: document.getElementById('prevBtn'),
    speakBtn: document.getElementById('speakBtn'),
    // Problems
    folderPath: document.getElementById('folderPath'),
    csvFiles: document.getElementById('csvFiles'),
    uploadCsvBtn: document.getElementById('uploadCsvBtn'),
    uploadLog: document.getElementById('uploadLog'),
    datasetList: document.getElementById('datasetList'),
    // History
    clearHistBtn: document.getElementById('clearHistBtn'),
    historyList: document.getElementById('historyList'),
    histFilters: document.getElementById('histFilters'),
    // Settings
    delayJaToEn: document.getElementById('delayJaToEn'),
    delayBetweenQs: document.getElementById('delayBetweenQs'),
    jaVoice: document.getElementById('jaVoice'),
    enVoice: document.getElementById('enVoice'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    settingsSaved: document.getElementById('settingsSaved'),
    delaysInfo: document.getElementById('delaysInfo'),
    // Catalog
    catalogTree: document.getElementById('catalogTree'),
    catalogList: document.getElementById('catalogList'),
    catalogPlayAll: document.getElementById('catalogPlayAll'),
    catalogStop: document.getElementById('catalogStop'),
    catalogStatus: document.getElementById('catalogStatus'),
    // Self eval
    selfEval: document.getElementById('selfEval')
  };

  let datasets = load(K.DATASETS) || {};
  let settings = Object.assign({delayJaToEn:1, delayBetweenQs:1, jaVoiceURI:null, enVoiceURI:null}, load(K.SETTINGS) || {});
  let history = load(K.HISTORY) || [];
  let state = Object.assign({currentPath:null, index:0}, load(K.STATE) || {});
  let orderCache = {};
  let historyFilter = 'all';
  let pendingHistoryId = null;

  function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function load(key){ try { return JSON.parse(localStorage.getItem(key)); } catch(e){ return null; } }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab').forEach(sec => sec.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // CSV
  function parseCSV(text){
    const rows = []; let i=0, field='', row=[], inQuotes=false;
    while(i<text.length){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){ if(text[i+1] === '"'){ field+='"'; i++; } else { inQuotes=false; } }
        else { field += c; }
      }else{
        if(c === '"'){ inQuotes = true; }
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else if(c === '\r'){}
        else { field += c; }
      }
      i++;
    }
    if(field.length>0 || row.length>0){ row.push(field); rows.push(row); }
    return rows;
  }

  // Tokenize
  function tokenize(en){
    const tokens = [];
    const parts = en.trim().split(/\s+/);
    for(const part of parts){
      const m = part.match(/^(.+?)([,.!?;:])?$/);
      if(m){ const w=m[1]; if(w) tokens.push(w); if(m[2]) tokens.push(m[2]); }
      else tokens.push(part);
    }
    return tokens;
  }
  function shuffle(a){ const b=a.slice(); for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }

  // Voices
  let availableVoices = [];
  function loadVoices(){ availableVoices = speechSynthesis.getVoices(); populateVoiceSelects(); }
  function populateVoiceSelects(){
    const jaOpts = availableVoices.filter(v => /ja/i.test(v.lang));
    const enOpts = availableVoices.filter(v => /^en[-_]/i.test(v.lang));
    function fill(select, list, savedURI){
      if(!select) return;
      select.innerHTML = '';
      list.forEach(v => { const opt=document.createElement('option'); opt.value=v.voiceURI; opt.textContent=`${v.name} (${v.lang})`; select.appendChild(opt); });
      if(savedURI) select.value = savedURI;
    }
    fill(el.jaVoice, jaOpts, settings.jaVoiceURI);
    fill(el.enVoice, enOpts, settings.enVoiceURI);
  }
  if('speechSynthesis' in window){ loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }
  function say(text, lang, uri){
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if(uri){ const v = availableVoices.find(v=>v.voiceURI===uri); if(v) u.voice = v; }
      u.onend = resolve; speechSynthesis.speak(u);
    });
  }

  // Order & current
  function getOrder(path){
    const ds = datasets[path]; if(!ds) return [];
    if(ds.mode==='random'){ if(!orderCache[path]) orderCache[path]=shuffle([...Array(ds.items.length).keys()]); return orderCache[path]; }
    return [...Array(ds.items.length).keys()];
  }
  function getCurrentItem(){
    const ds = datasets[state.currentPath]; if(!ds || !ds.items.length) return null;
    const ord = getOrder(state.currentPath); const idx = ord[state.index] ?? 0;
    return Object.assign({__realIndex: idx}, ds.items[idx]);
  }

  // Build QA
  function clearQA(){ el.wordBank.innerHTML=''; el.answerArea.innerHTML=''; el.resultBox.textContent=''; el.resultBox.className='result'; el.explainBox.textContent=''; el.selfEval && el.selfEval.classList.add('hidden'); }
  function loadCurrentQuestion(){
    const it = getCurrentItem(); clearQA();
    if(!it){ el.jpText.textContent='「問題」タブでデータセットを選んでください。'; return; }
    el.jpText.textContent = it.jp;
    const scrambled = shuffle(tokenize(it.en));
    scrambled.forEach(t=> el.wordBank.appendChild(createToken(t, 'bank')) );
    el.delaysInfo.textContent = `現在の遅延設定: 日→英 ${settings.delayJaToEn}s, 次の問題まで ${settings.delayBetweenQs}s`;
  }

  // Drag & drop + tap (with insertion caret)
  let dragInfo=null;
  const dropCaret = document.createElement('div');
  dropCaret.className = 'drop-caret';

  function containerAtPoint(x,y){
    const ansR=el.answerArea.getBoundingClientRect(), bankR=el.wordBank.getBoundingClientRect();
    if(x>ansR.left && x<ansR.right && y>ansR.top && y<ansR.bottom) return el.answerArea;
    if(x>bankR.left && x<bankR.right && y>bankR.top && y<bankR.bottom) return el.wordBank;
    return null;
  }
  function placeCaret(container, x){
    const kids=[...container.children].filter(c=> c.classList && c.classList.contains('token') && (!dragInfo || c!==dragInfo.el));
    let placed=false;
    for(const c of kids){
      const r=c.getBoundingClientRect();
      if(x < r.left + r.width/2){ container.insertBefore(dropCaret, c); placed=true; break; }
    }
    if(!placed) container.appendChild(dropCaret);
  }
  function clearCaret(){ if(dropCaret.parentElement) dropCaret.parentElement.removeChild(dropCaret); }

  function makeDraggable(tokenEl){
    tokenEl.addEventListener('pointerdown', (ev)=>{
      tokenEl.setPointerCapture(ev.pointerId);
      dragInfo={el:tokenEl};
      tokenEl.classList.add('dragging');
    });
    tokenEl.addEventListener('pointermove', (ev)=>{
      if(!dragInfo) return;
      const x=ev.clientX, y=ev.clientY;
      const cont = containerAtPoint(x,y);
      if(cont){ placeCaret(cont, x); }
      else { clearCaret(); }
    });
    tokenEl.addEventListener('pointerup', ()=>{
      if(!dragInfo) return;
      if(dropCaret.parentElement){
        dropCaret.parentElement.insertBefore(tokenEl, dropCaret);
        clearCaret();
      }
      tokenEl.classList.remove('dragging');
      dragInfo=null;
    });
  }
  function createToken(text, cls){
    const t=document.createElement('button'); t.type='button'; t.className='token '+cls; t.textContent=text;
    t.addEventListener('click', ()=>{ if(t.parentElement===el.wordBank) el.answerArea.appendChild(t); else el.wordBank.appendChild(t); });
    makeDraggable(t); return t;
  }

  // Swipe
  (function(){
    let x0=null,y0=null,t0=0; const area=document.getElementById('qaArea');
    area.addEventListener('touchstart', (e)=>{ if(e.touches.length===1){ x0=e.touches[0].clientX; y0=e.touches[0].clientY; t0=Date.now(); } }, {passive:true});
    area.addEventListener('touchend', (e)=>{ if(x0==null) return; const dt=Date.now()-t0; const t=e.changedTouches[0]; const dx=t.clientX-x0, dy=t.clientY-y0; if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy) && dt<800){ if(dx<0) nextQuestion(); else prevQuestion(); } x0=y0=null; }, {passive:true});
  })();

  // Practice actions
  function nextQuestion(){ const ds=datasets[state.currentPath]; if(!ds) return; const ord=getOrder(state.currentPath); state.index=(state.index+1)%ord.length; save(K.STATE,state); loadCurrentQuestion(); }
  function prevQuestion(){ const ds=datasets[state.currentPath]; if(!ds) return; const ord=getOrder(state.currentPath); state.index=(state.index-1+ord.length)%ord.length; save(K.STATE,state); loadCurrentQuestion(); }
  function getAnswerText(){ const words=[...el.answerArea.querySelectorAll('.token')].map(t=>t.textContent); return words.join(' ').replace(/\s+([,.!?;:])/g,'$1').trim(); }
  function normalize(s){ return (s||'').replace(/\s+/g,' ').trim(); }

  function pushHistory(item, user, ok){
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    history.unshift({id, ts:Date.now(), path:state.currentPath, idx:item.__realIndex, jp:item.jp, en:item.en, ex:item.ex, user, ok, grade:null});
    history = history.slice(0,1000);
    save(K.HISTORY, history);
    return id;
  }
  function currentGradeLabel(g){
    return g==='perfect'?'完璧': g==='good'?'良い': g==='uncertain'?'自信なし': g==='bad'?'ダメ': '';
  }
  function renderHistory(){
    el.historyList.innerHTML='';
    const list = history.filter(h => historyFilter==='all' ? true : h.grade === historyFilter);
    list.forEach((h)=>{
      const con=document.createElement('div'); con.className='hist-item';
      const top=document.createElement('div'); top.className='hist-top';
      const title=document.createElement('div'); title.className='hist-title'; const when=new Date(h.ts).toLocaleString(); title.textContent=`[${h.ok?'〇':'×'}] ${when} — ${h.path}`;
      if(h.grade){ const tag=document.createElement('span'); tag.className='hist-tag '+h.grade; tag.textContent=currentGradeLabel(h.grade); title.appendChild(tag); }
      const actions=document.createElement('div'); actions.className='hist-actions';
      const again=document.createElement('button'); again.textContent='この問題で練習'; again.addEventListener('click', ()=>{ state.currentPath=h.path; const pos=getOrder(h.path).indexOf(h.idx); state.index=Math.max(0,pos); save(K.STATE,state); switchTo('practice'); loadCurrentQuestion(); });
      const speak=document.createElement('button'); speak.textContent='読み上げ'; speak.addEventListener('click', async ()=>{ await say(h.jp,'ja-JP',settings.jaVoiceURI||el.jaVoice.value); await new Promise(r=>setTimeout(r, Math.max(0.5,settings.delayJaToEn)*1000)); await say(h.en,'en-US',settings.enVoiceURI||el.enVoice.value); });
      actions.appendChild(again); actions.appendChild(speak);
      top.appendChild(title); top.appendChild(actions);
      const jp=document.createElement('div'); jp.textContent=h.jp; jp.className='bold';
      const en=document.createElement('div'); en.textContent=h.en;
      const user=document.createElement('div'); user.textContent='あなたの解答: '+(h.user||'(未入力)');
      const ex=document.createElement('div'); ex.textContent=h.ex; ex.className='hint';
      con.appendChild(top); con.appendChild(jp); con.appendChild(en); con.appendChild(user); con.appendChild(ex);
      el.historyList.appendChild(con);
    });
  }
  function switchTo(tab){ document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab)); document.querySelectorAll('.tab').forEach(sec=>sec.classList.toggle('active', sec.id===tab)); }

  // Event bindings
  el.nextBtn.addEventListener('click', nextQuestion);
  el.prevBtn.addEventListener('click', prevQuestion);
  el.resetBtn.addEventListener('click', loadCurrentQuestion);
  el.speakBtn.addEventListener('click', async ()=>{
    const it=getCurrentItem(); if(!it) return;
    const d1=Math.max(0.5,Math.min(10,Number(el.delayJaToEn.value||settings.delayJaToEn)));
    const d2=Math.max(0.5,Math.min(10,Number(el.delayBetweenQs.value||settings.delayBetweenQs)));
    await say(it.jp,'ja-JP',settings.jaVoiceURI||el.jaVoice.value);
    await new Promise(r=>setTimeout(r,d1*1000));
    await say(it.en,'en-US',settings.enVoiceURI||el.enVoice.value);
    setTimeout(()=>{ nextQuestion(); }, d2*1000); // only on TTS
  });
  el.checkBtn.addEventListener('click', ()=>{
    const it=getCurrentItem(); if(!it) return;
    const user=getAnswerText(); const ok=normalize(user)===normalize(it.en);
    el.resultBox.textContent= ok? '正解！':'不正解…';
    el.resultBox.className='result ' + (ok?'ok':'ng');
    el.explainBox.textContent = `正解: ${it.en}\n\n解説:\n${it.ex||'(なし)'}`;
    pendingHistoryId = pushHistory(it, user, ok);
    renderHistory();
    el.selfEval && el.selfEval.classList.remove('hidden');
  });
  el.clearHistBtn.addEventListener('click', ()=>{ if(confirm('履歴を全て削除しますか？')){ history=[]; save(K.HISTORY,history); renderHistory(); }});

  // Self-eval buttons
  if(el.selfEval){
    el.selfEval.addEventListener('click', (e)=>{
      const b = e.target.closest('.sev-btn'); if(!b) return;
      const g = b.dataset.grade;
      if(pendingHistoryId){
        const idx = history.findIndex(h=>h.id===pendingHistoryId);
        if(idx>=0){ history[idx].grade = g; save(K.HISTORY, history); }
        pendingHistoryId = null;
      }
      el.selfEval.classList.add('hidden');
      renderHistory();
    });
  }

  // History filter buttons
  if(el.histFilters){
    el.histFilters.addEventListener('click', (e)=>{
      const b = e.target.closest('.hf-btn'); if(!b) return;
      historyFilter = b.dataset.filter || 'all';
      Array.from(el.histFilters.querySelectorAll('.hf-btn')).forEach(x=>x.classList.toggle('active', x===b));
      renderHistory();
    });
  }

  // Settings
  el.saveSettingsBtn.addEventListener('click', ()=>{
    settings.delayJaToEn=Math.max(0.5,Math.min(10,Number(el.delayJaToEn.value)));
    settings.delayBetweenQs=Math.max(0.5,Math.min(10,Number(el.delayBetweenQs.value)));
    settings.jaVoiceURI=el.jaVoice.value||null; settings.enVoiceURI=el.enVoice.value||null;
    save(K.SETTINGS,settings); el.settingsSaved.textContent='保存しました。'; setTimeout(()=>el.settingsSaved.textContent='',1500);
    el.delaysInfo.textContent = `現在の遅延設定: 日→英 ${settings.delayJaToEn}s, 次の問題まで ${settings.delayBetweenQs}s`;
  });

  // Upload & Dataset list (with delete)
  el.uploadCsvBtn.addEventListener('click', async ()=>{
    const files=el.csvFiles.files; const folder=(el.folderPath.value||'').trim().replace(/^\/+|\/+$/g,'');
    if(!files.length){ el.uploadLog.textContent='CSVファイルを選択してください。'; return; }
    let log='';
    for(const file of files){
      const text=await file.text(); const rows=parseCSV(text); const rows2=rows.filter(r=>r.join('').trim().length>0);
      if(rows2.length && rows2[0].length>=2 && /jp/i.test(rows2[0][0]) && /en/i.test(rows2[0][1])) rows2.shift();
      const items=rows2.map(r=>({jp:r[0]||'', en:r[1]||'', ex:r[2]||''})).filter(x=>x.jp && x.en);
      const dsPath=(folder?folder+'/':'') + file.name.replace(/\.csv$/i,'');
      datasets[dsPath]=datasets[dsPath]||{items:[], mode:'ordered'}; datasets[dsPath].items=items; save(K.DATASETS,datasets);
      log+=`✅ ${file.name} を ${dsPath} として保存 (${items.length} 問)\n`;
    }
    el.uploadLog.textContent = log || '完了'; refreshDatasetsUI();
  });
  function renderDatasetList(){
    el.datasetList.innerHTML='';
    Object.keys(datasets).sort().forEach(path=>{
      const row=document.createElement('div'); row.className='row';
      const pathSpan=document.createElement('div'); pathSpan.className='path'; pathSpan.textContent=path + `（${datasets[path].items.length}問）`;
      const sel=document.createElement('select'); sel.innerHTML='<option value="ordered">順番通り</option><option value="random">ランダム</option>'; sel.value=datasets[path].mode||'ordered';
      sel.addEventListener('change', ()=>{ datasets[path].mode=sel.value; save(K.DATASETS,datasets); orderCache[path]=null; });
      const go=document.createElement('button'); go.textContent='このセットで練習';
      function startPractice(){ state.currentPath=path; state.index=0; save(K.STATE,state); orderCache[path]=null; switchTo('practice'); loadCurrentQuestion(); }
      go.addEventListener('click', startPractice); pathSpan.addEventListener('click', startPractice);
      const del=document.createElement('button'); del.textContent='削除'; del.className='danger';
      del.addEventListener('click', ()=>{
        if(!confirm(`${path} を削除しますか？（データセットのみ削除。履歴は残ります）`)) return;
        delete datasets[path];
        save(K.DATASETS, datasets);
        delete orderCache[path];
        if(state.currentPath === path){
          const keys = Object.keys(datasets);
          state.currentPath = keys.length ? keys[0] : null;
          state.index = 0;
          save(K.STATE, state);
          loadCurrentQuestion();
        }
        try{
          if(typeof catalogPath !== 'undefined' && catalogPath === path){
            catalogPath = null;
            if(el.catalogList) el.catalogList.innerHTML='';
            if(el.catalogStatus) el.catalogStatus.textContent='データセットを選択してください。';
          }
        }catch(_){}
        refreshDatasetsUI();
      });
      row.appendChild(pathSpan); row.appendChild(sel); row.appendChild(go); row.appendChild(del);
      el.datasetList.appendChild(row);
    });
  }
  function refreshDatasetsUI(){ renderDatasetList(); try{ renderCatalogTree(); }catch(e){} }

  // Catalog (tree) + list + playback with autoscroll
  let catalogPath=null, catalogAbort={stop:false}, catalogPlayingIdx=-1;
  function buildTree(paths){
    const root={}; for(const p of paths){ const parts=p.split('/').filter(Boolean); let node=root; for(let i=0;i<parts.length;i++){ const part=parts[i]; node[part]=node[part]||{__children__:{}, __full__: parts.slice(0,i+1).join('/')}; node=node[part].__children__; } } return root;
  }
  function renderCatalogTree(){
    const paths=Object.keys(datasets); const tree=buildTree(paths); const c=el.catalogTree; if(!c) return; c.innerHTML='';
    (function walk(node, parent){
      Object.keys(node).sort().forEach(name=>{
        const n=node[name]; const full=n.__full__; const children=n.__children__; const hasChildren=children&&Object.keys(children).length>0;
        const item=document.createElement('div'); item.className='tree-item'; item.textContent=name; if(hasChildren){ parent.appendChild(item); const folder=document.createElement('div'); folder.className='tree-folder'; parent.appendChild(folder); walk(children, folder); } else { item.dataset.path=full; parent.appendChild(item); item.addEventListener('click', ()=>{ catalogPath=item.dataset.path; highlightCatalogPath(); renderCatalogList(); }); }
      });
    })(tree, c);
    highlightCatalogPath();
  }
  function highlightCatalogPath(){ if(!el.catalogTree) return; [...el.catalogTree.querySelectorAll('.tree-item')].forEach(e=>{ e.style.background = (e.dataset.path===catalogPath)? '#e8f0ff':''; }); }
  function renderCatalogList(){
    el.catalogList.innerHTML='';
    if(!catalogPath || !datasets[catalogPath]){ el.catalogStatus.textContent='データセットを選択してください。'; return; }
    el.catalogStatus.textContent='';
    datasets[catalogPath].items.forEach((it,idx)=>{
      const con=document.createElement('div'); con.className='hist-item'; con.dataset.idx=idx;
      const head=document.createElement('div'); head.className='hist-top';
      const title=document.createElement('div'); title.className='hist-title'; title.textContent=`#${idx+1}`;
      const act=document.createElement('div'); act.className='hist-actions';
      const btn=document.createElement('button'); btn.textContent='この問題を再生'; btn.addEventListener('click', ()=> playOneAtIndex(idx));
      act.appendChild(btn); head.appendChild(title); head.appendChild(act);
      const jp=document.createElement('div'); jp.textContent=it.jp; jp.className='bold';
      const en=document.createElement('div'); en.textContent=it.en;
      con.appendChild(head); con.appendChild(jp); con.appendChild(en);
      el.catalogList.appendChild(con);
    });
  }
  function highlightCatalogPlaying(idx){
    catalogPlayingIdx = idx;
    const nodes=[...el.catalogList.children];
    nodes.forEach((n,i)=> n.classList.toggle('playing', i===idx));
  }
  function scrollCatalogTo(idx){
    const node=el.catalogList.children[idx];
    if(node && node.scrollIntoView){ try{ node.scrollIntoView({behavior:'smooth', block:'center'}); }catch(e){ node.scrollIntoView(); } }
  }
  async function playOneAtIndex(i){
    if(!catalogPath || !datasets[catalogPath] || !datasets[catalogPath].items[i]) return;
    const item=datasets[catalogPath].items[i];
    highlightCatalogPlaying(i); scrollCatalogTo(i);
    const d1=Math.max(0.5,Math.min(10,Number(el.delayJaToEn.value||settings.delayJaToEn)));
    await say(item.jp,'ja-JP',settings.jaVoiceURI||el.jaVoice.value);
    await new Promise(r=>setTimeout(r,d1*1000));
    await say(item.en,'en-US',settings.enVoiceURI||el.enVoice.value);
  }
  async function playAll(path){
    if(!path || !datasets[path] || !datasets[path].items.length){ el.catalogStatus.textContent='再生するデータがありません。'; return; }
    el.catalogStatus.textContent='連続再生中…'; catalogAbort.stop=false;
    const d2=Math.max(0.5,Math.min(10,Number(el.delayBetweenQs.value||settings.delayBetweenQs)));
    for(let i=0;i<datasets[path].items.length;i++){
      if(catalogAbort.stop){ el.catalogStatus.textContent='停止しました。'; highlightCatalogPlaying(-1); return; }
      await playOneAtIndex(i);
      if(i<datasets[path].items.length-1){ await new Promise(r=>setTimeout(r,d2*1000)); }
    }
    el.catalogStatus.textContent='完了しました。'; highlightCatalogPlaying(-1);
  }
  el.catalogPlayAll && el.catalogPlayAll.addEventListener('click', ()=>{ if(!catalogPath){ el.catalogStatus.textContent='データセットを選択してください。'; return; } playAll(catalogPath); });
  el.catalogStop && el.catalogStop.addEventListener('click', ()=>{ catalogAbort.stop=true; });

  // Settings UI & demo
  function initSettingsUI(){ el.delayJaToEn.value=settings.delayJaToEn; el.delayBetweenQs.value=settings.delayBetweenQs; }
  function ensureDemoData(){
    if(Object.keys(datasets).length) return;
    datasets["デモ/医療/ALT基礎"]={ mode:'ordered', items:[
      {jp:"皮弁は安定した血管茎で一貫した血流を持ちます。", en:"The flap has consistent blood flow with a stable vascular pedicle.", ex:"consistent blood flow=一定の血流。vascular pedicle=血管茎。with a ... pedicle=付帯状況のwith句。"},
      {jp:"皮弁は乳房の自然な円錐形に合わせて整形できます。", en:"The flap can be shaped to mimic the natural conical form of the breast.", ex:"can be shaped=受動態。mimic=模倣する。conical form=円錐形。"},
      {jp:"涙液は涙腺で産生され、眼表面に分泌されます。", en:"Tears are produced by the lacrimal glands and secreted onto the ocular surface.", ex:"be produced by=受動態。lacrimal glands=涙腺。onto the ocular surface=眼表面へ。"}
    ]};
    save(K.DATASETS,datasets);
  }
  function refreshAll(){ refreshDatasetsUI(); renderHistory(); el.delaysInfo.textContent = `現在の遅延設定: 日→英 ${settings.delayJaToEn}s, 次の問題まで ${settings.delayBetweenQs}s`; }
  function start(){
    ensureDemoData(); initSettingsUI();
    if(!state.currentPath){ const first=Object.keys(datasets)[0]; if(first){ state.currentPath=first; state.index=0; save(K.STATE,state);} }
    loadCurrentQuestion(); refreshAll(); try{ renderCatalogTree(); }catch(e){}
  }
  start();

})();