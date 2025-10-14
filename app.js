/* 和英正順アプリ - 要件対応版 */
(function(){
  'use strict';

  /*** Storage Keys ***/
  const K = {
    DATASETS: 'woa.datasets.v2',     // { path: { items:[{jp,en,ex}], mode:'ordered'|'random' } }
    SETTINGS: 'woa.settings.v2',     // { delayJaToEn, delayBetweenQs, jaVoiceURI, enVoiceURI }
    HISTORY:  'woa.history.v2',      // [{ts, path, idx, jp, en, ex, user, ok}...]
    STATE:    'woa.state.v2'         // { currentPath, index }
  };

  /*** Elements ***/
  const el = {
    tabs: document.querySelectorAll('.tab-btn'),
    sections: {
      practice: document.getElementById('practice'),
      problems: document.getElementById('problems'),
      history: document.getElementById('history'),
      settings: document.getElementById('settings')
    },
    datasetTree: document.getElementById('datasetTree'),
    datasetList: document.getElementById('datasetList'),
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
    folderPath: document.getElementById('folderPath'),
    csvFiles: document.getElementById('csvFiles'),
    uploadCsvBtn: document.getElementById('uploadCsvBtn'),
    uploadLog: document.getElementById('uploadLog'),
    clearHistBtn: document.getElementById('clearHistBtn'),
    historyList: document.getElementById('historyList'),
    delayJaToEn: document.getElementById('delayJaToEn'),
    delayBetweenQs: document.getElementById('delayBetweenQs'),
    jaVoice: document.getElementById('jaVoice'),
    enVoice: document.getElementById('enVoice'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    settingsSaved: document.getElementById('settingsSaved'),
    delaysInfo: document.getElementById('delaysInfo')
  };

  /*** State ***/
  let datasets = load(K.DATASETS) || {};
  let settings = Object.assign({delayJaToEn:1, delayBetweenQs:1, jaVoiceURI:null, enVoiceURI:null}, load(K.SETTINGS) || {});
  let history = load(K.HISTORY) || [];
  let state = Object.assign({currentPath:null, index:0}, load(K.STATE) || {});
  let orderCache = {}; // cache of current randomized order per path

  function save(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }
  function load(key){
    try { return JSON.parse(localStorage.getItem(key)); } catch(e){ return null; }
  }

  /*** Tabs ***/
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab').forEach(sec => sec.classList.remove('active'));
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  /*** Dataset Tree ***/
  function buildTree(paths){
    const root = {};
    for(const p of paths){
      const parts = p.split('/').filter(Boolean);
      let node = root;
      for(let i=0;i<parts.length;i++){
        const part = parts[i];
        node[part] = node[part] || {__children__: {}, __full__: parts.slice(0,i+1).join('/')};
        node = node[part].__children__;
      }
    }
    return root;
  }
  function renderTree(container, tree, prefix=''){
    container.innerHTML = '';
    function walk(node, parentEl){
      for(const name of Object.keys(node).sort()){
        const n = node[name];
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.textContent = name;
        item.dataset.path = n.__full__;
        parentEl.appendChild(item);
        item.addEventListener('click', ()=>{
          state.currentPath = item.dataset.path;
          state.index = 0;
          save(K.STATE, state);
          orderCache[state.currentPath] = null; // reset order
          loadCurrentQuestion();
          highlightCurrentPath();
        });
        const children = n.__children__;
        if(children && Object.keys(children).length){
          const folder = document.createElement('div');
          folder.className = 'tree-folder';
          parentEl.appendChild(folder);
          walk(children, folder);
        }
      }
    }
    walk(tree, container);
    highlightCurrentPath();
  }
  function highlightCurrentPath(){
    Array.from(document.querySelectorAll('.tree-item')).forEach(elm => {
      if(elm.dataset.path === state.currentPath) elm.style.background = '#e8f0ff';
      else elm.style.background = '';
    });
  }

  /*** Dataset List (order settings) ***/
  function renderDatasetList(){
    el.datasetList.innerHTML = '';
    Object.keys(datasets).sort().forEach(path => {
      const row = document.createElement('div');
      row.className = 'row';
      const pathSpan = document.createElement('div');
      pathSpan.className = 'path';
      pathSpan.textContent = path + `（${datasets[path].items.length}問）`;
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="ordered">順番通り</option><option value="random">ランダム</option>';
      sel.value = datasets[path].mode || 'ordered';
      sel.addEventListener('change', ()=>{
        datasets[path].mode = sel.value;
        save(K.DATASETS, datasets);
        orderCache[path] = null;
      });
      row.appendChild(pathSpan);
      row.appendChild(sel);
      el.datasetList.appendChild(row);
    });
  }

  /*** CSV Parser (RFC4180-ish) ***/
  function parseCSV(text){
    const rows = [];
    let i=0, field='', row=[], inQuotes=false;
    while(i<text.length){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += c; }
      }else{
        if(c === '"'){ inQuotes = true; }
        else if(c === ','){ row.push(field); field=''; }
        else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
        else if(c === '\r'){ /* skip */ }
        else { field += c; }
      }
      i++;
    }
    if(field.length>0 || row.length>0){ row.push(field); rows.push(row); }
    return rows;
  }

  /*** Tokenization ***/
  function tokenize(en){
    // Split by space but keep punctuation as separate tokens
    const tokens = [];
    const parts = en.trim().split(/\s+/);
    for(const part of parts){
      // Separate trailing punctuation , . ! ? ; :
      const m = part.match(/^(.+?)([,.!?;:])?$/);
      if(m){
        const w = m[1];
        if(w) tokens.push(w);
        if(m[2]) tokens.push(m[2]);
      }else{
        tokens.push(part);
      }
    }
    return tokens;
  }

  /*** Build Bank/Answer ***/
  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function clearQA(){
    el.wordBank.innerHTML='';
    el.answerArea.innerHTML='';
    el.resultBox.textContent='';
    el.resultBox.className='result';
    el.explainBox.textContent='';
  }

  /*** Drag & Drop (mobile friendly via pointer events) ***/
  let dragInfo = null;
  function makeDraggable(tokenEl){
    tokenEl.addEventListener('pointerdown', (ev)=>{
      tokenEl.setPointerCapture(ev.pointerId);
      dragInfo = { el: tokenEl, originParent: tokenEl.parentElement, isBank: tokenEl.classList.contains('bank'), startX: ev.clientX, startY: ev.clientY };
      tokenEl.classList.add('dragging');
    });
    tokenEl.addEventListener('pointermove', (ev)=>{
      if(!dragInfo || dragInfo.el!==tokenEl) return;
      const x = ev.clientX, y = ev.clientY;
      // find insertion position in answer area under pointer
      const answerRect = el.answerArea.getBoundingClientRect();
      if(x>answerRect.left && x<answerRect.right && y>answerRect.top && y<answerRect.bottom){
        // over answer: show placeholder
        let placed = false;
        const children = Array.from(el.answerArea.children).filter(c=>c.classList.contains('token'));
        for(const child of children){
          const r = child.getBoundingClientRect();
          if(x < r.left + r.width/2){
            el.answerArea.insertBefore(tokenEl, child);
            placed = true; break;
          }
        }
        if(!placed) el.answerArea.appendChild(tokenEl);
      }else{
        // over bank?
        const bankRect = el.wordBank.getBoundingClientRect();
        if(x>bankRect.left && x<bankRect.right && y>bankRect.top && y<bankRect.bottom){
          let placed=false;
          const kids = Array.from(el.wordBank.children).filter(c=>c.classList.contains('token'));
          for(const child of kids){
            const r = child.getBoundingClientRect();
            if(x < r.left + r.width/2){
              el.wordBank.insertBefore(tokenEl, child);
              placed=true; break;
            }
          }
          if(!placed) el.wordBank.appendChild(tokenEl);
        }
      }
    });
    tokenEl.addEventListener('pointerup', ()=>{
      if(dragInfo && dragInfo.el===tokenEl){
        tokenEl.classList.remove('dragging');
        dragInfo = null;
      }
    });
  }

  function createToken(text, cls){
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'token ' + cls;
    t.textContent = text;
    // tap to move between bank <-> answer
    t.addEventListener('click', ()=>{
      if(t.parentElement === el.wordBank) el.answerArea.appendChild(t);
      else el.wordBank.appendChild(t);
    });
    makeDraggable(t);
    return t;
  }

  /*** Voices ***/
  let availableVoices = [];
  function loadVoices(){
    availableVoices = speechSynthesis.getVoices();
    populateVoiceSelects();
  }
  function populateVoiceSelects(){
    const jaOpts = availableVoices.filter(v => /ja/i.test(v.lang));
    const enOpts = availableVoices.filter(v => /^en[-_]/i.test(v.lang));
    function fill(select, list, savedURI){
      select.innerHTML = '';
      list.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})`;
        select.appendChild(opt);
      });
      if(savedURI){
        select.value = savedURI;
      }
    }
    fill(el.jaVoice, jaOpts, settings.jaVoiceURI);
    fill(el.enVoice, enOpts, settings.enVoiceURI);
  }
  if('speechSynthesis' in window){
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function say(text, lang, uri){
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if(uri){
        const v = availableVoices.find(v=>v.voiceURI===uri);
        if(v) u.voice = v;
      }
      u.onend = resolve;
      speechSynthesis.speak(u);
    });
  }

  async function speakCurrent(){
    const item = getCurrentItem();
    if(!item) return;
    const d1 = Math.max(0.5, Math.min(10, Number(el.delayJaToEn.value || settings.delayJaToEn)));
    const jp = item.jp;
    const en = item.en;
    await say(jp, 'ja-JP', settings.jaVoiceURI || el.jaVoice.value);
    await new Promise(r=>setTimeout(r, d1*1000));
    await say(en, 'en-US', settings.enVoiceURI || el.enVoice.value);
  }

  /*** Ordering ***/
  function getOrder(path){
    const ds = datasets[path];
    if(!ds) return [];
    if(ds.mode==='random'){
      if(!orderCache[path]){
        orderCache[path] = shuffle([...Array(ds.items.length).keys()]);
      }
      return orderCache[path];
    }else{
      return [...Array(ds.items.length).keys()];
    }
  }

  function getCurrentItem(){
    const ds = datasets[state.currentPath];
    if(!ds || !ds.items.length) return null;
    const ord = getOrder(state.currentPath);
    const idx = ord[state.index] ?? 0;
    return Object.assign({__realIndex: idx}, ds.items[idx]);
  }

  function loadCurrentQuestion(){
    const it = getCurrentItem();
    clearQA();
    if(!it){
      el.jpText.textContent = 'データセットを選択してください。';
      return;
    }
    el.jpText.textContent = it.jp;
    const tokens = tokenize(it.en);
    const scrambled = shuffle(tokens);
    for(const t of scrambled){
      el.wordBank.appendChild(createToken(t, 'bank'));
    }
    el.delaysInfo.textContent = `現在の遅延設定: 日→英 ${settings.delayJaToEn}s, 次の問題まで ${settings.delayBetweenQs}s`;
  }

  function nextQuestion(){
    const ds = datasets[state.currentPath];
    if(!ds) return;
    const ord = getOrder(state.currentPath);
    state.index = (state.index + 1) % ord.length;
    save(K.STATE, state);
    loadCurrentQuestion();
  }
  function prevQuestion(){
    const ds = datasets[state.currentPath];
    if(!ds) return;
    const ord = getOrder(state.currentPath);
    state.index = (state.index - 1 + ord.length) % ord.length;
    save(K.STATE, state);
    loadCurrentQuestion();
  }

  /*** Swipe Navigation ***/
  (function setupSwipe(){
    let x0=null, y0=null, t0=0;
    const area = document.getElementById('qaArea');
    area.addEventListener('touchstart', (e)=>{
      if(e.touches.length===1){
        x0 = e.touches[0].clientX;
        y0 = e.touches[0].clientY;
        t0 = Date.now();
      }
    }, {passive:true});
    area.addEventListener('touchend', (e)=>{
      if(x0==null) return;
      const dt = Date.now()-t0;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - x0;
      const dy = touch.clientY - y0;
      if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 800){
        if(dx < 0) nextQuestion(); else prevQuestion();
      }
      x0 = y0 = null;
    }, {passive:true});
  })();

  /*** Check ***/
  function getAnswerText(){
    const words = Array.from(el.answerArea.querySelectorAll('.token')).map(t=>t.textContent);
    return words.join(' ').replace(/\s+([,.!?;:])/g,'$1').trim();
  }
  function normalize(s){
    return s.replace(/\s+/g,' ').trim();
  }

  function pushHistory(item, user, ok){
    history.unshift({
      ts: Date.now(),
      path: state.currentPath,
      idx: item.__realIndex,
      jp: item.jp, en: item.en, ex: item.ex,
      user, ok
    });
    history = history.slice(0, 1000);
    save(K.HISTORY, history);
  }

  function renderHistory(){
    el.historyList.innerHTML = '';
    history.forEach((h,i)=>{
      const con = document.createElement('div');
      con.className = 'hist-item';
      const top = document.createElement('div');
      top.className = 'hist-top';
      const title = document.createElement('div');
      title.className = 'hist-title';
      const when = new Date(h.ts).toLocaleString();
      title.textContent = `[${h.ok?'〇':'×'}] ${when} — ${h.path}`;
      const actions = document.createElement('div');
      actions.className = 'hist-actions';
      const again = document.createElement('button');
      again.textContent = 'この問題で練習';
      again.addEventListener('click', ()=>{
        state.currentPath = h.path;
        const ord = getOrder(h.path);
        // find position of __realIndex within current order
        const pos = ord.indexOf(h.idx);
        state.index = Math.max(0, pos);
        save(K.STATE, state);
        switchTo('practice');
        loadCurrentQuestion();
      });
      const speak = document.createElement('button');
      speak.textContent = '読み上げ';
      speak.addEventListener('click', async ()=>{
        await say(h.jp, 'ja-JP', settings.jaVoiceURI || el.jaVoice.value);
        await new Promise(r=>setTimeout(r, Math.max(0.5, settings.delayJaToEn)*1000));
        await say(h.en, 'en-US', settings.enVoiceURI || el.enVoice.value);
      });
      actions.appendChild(again);
      actions.appendChild(speak);
      top.appendChild(title);
      top.appendChild(actions);
      const jp = document.createElement('div'); jp.textContent = h.jp; jp.className='bold';
      const en = document.createElement('div'); en.textContent = h.en;
      const user = document.createElement('div'); user.textContent = 'あなたの解答: ' + (h.user || '(未入力)');
      const ex = document.createElement('div'); ex.textContent = h.ex; ex.className='hint';
      con.appendChild(top); con.appendChild(jp); con.appendChild(en); con.appendChild(user); con.appendChild(ex);
      el.historyList.appendChild(con);
    });
  }

  function switchTo(tabName){
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab===tabName);
    });
    document.querySelectorAll('.tab').forEach(sec=>{
      sec.classList.toggle('active', sec.id===tabName);
    });
  }

  /*** Event bindings ***/
  el.nextBtn.addEventListener('click', nextQuestion);
  el.prevBtn.addEventListener('click', prevQuestion);
  el.resetBtn.addEventListener('click', loadCurrentQuestion);
  el.speakBtn.addEventListener('click', speakCurrent);
  el.checkBtn.addEventListener('click', ()=>{
    const it = getCurrentItem();
    if(!it) return;
    const user = getAnswerText();
    const ok = normalize(user) === normalize(it.en);
    el.resultBox.textContent = ok ? '正解！' : '不正解…';
    el.resultBox.className = 'result ' + (ok?'ok':'ng');
    el.explainBox.textContent = `正解: ${it.en}\n\n解説:\n${it.ex || '(なし)'}`;
    pushHistory(it, user, ok);
    renderHistory();
setTimeout(()=>{ nextQuestion(); }, d2*1000);
  });

  el.clearHistBtn.addEventListener('click', ()=>{
    if(confirm('履歴を全て削除しますか？')){
      history = [];
      save(K.HISTORY, history);
      renderHistory();
    }
  });

  el.saveSettingsBtn.addEventListener('click', ()=>{
    settings.delayJaToEn = Math.max(0.5, Math.min(10, Number(el.delayJaToEn.value)));
    settings.delayBetweenQs = Math.max(0.5, Math.min(10, Number(el.delayBetweenQs.value)));
    settings.jaVoiceURI = el.jaVoice.value || null;
    settings.enVoiceURI = el.enVoice.value || null;
    save(K.SETTINGS, settings);
    el.settingsSaved.textContent = '保存しました。';
    setTimeout(()=> el.settingsSaved.textContent='', 1500);
    el.delaysInfo.textContent = `現在の遅延設定: 日→英 ${settings.delayJaToEn}s, 次の問題まで ${settings.delayBetweenQs}s`;
  });

  /*** CSV Upload ***/
  el.uploadCsvBtn.addEventListener('click', async ()=>{
    const files = el.csvFiles.files;
    const folder = (el.folderPath.value || '').trim().replace(/^\/+|\/+$/g,'');
    if(!files.length){ el.uploadLog.textContent = 'CSVファイルを選択してください。'; return; }
    let log = '';
    for(const file of files){
      const text = await file.text();
      const rows = parseCSV(text);
      // remove empty rows
      const rows2 = rows.filter(r=> r.join('').trim().length>0 );
      // header detection
      if(rows2.length && rows2[0].length>=2 && /jp/i.test(rows2[0][0]) && /en/i.test(rows2[0][1])){
        rows2.shift();
      }
      const items = rows2.map(r=>({ jp: r[0]||'', en: r[1]||'', ex: r[2]||'' })).filter(x=>x.jp && x.en);
      const dsPath = (folder? folder + '/':'') + file.name.replace(/\.csv$/i,'');
      datasets[dsPath] = datasets[dsPath] || {items:[], mode:'ordered'};
      datasets[dsPath].items = items;
      save(K.DATASETS, datasets);
      log += `✅ ${file.name} を ${dsPath} として保存 (${items.length} 問)\n`;
    }
    el.uploadLog.textContent = log || '完了';
    refreshDatasetsUI();
  });

  function refreshDatasetsUI(){
    try{ renderCatalogTree(); }catch(e){}

    const paths = Object.keys(datasets);
    renderDatasetList();
    renderTree(el.datasetTree, buildTree(paths));
  }

  /*** Init UI ***/
  function initSettingsUI(){
    el.delayJaToEn.value = settings.delayJaToEn;
    el.delayBetweenQs.value = settings.delayBetweenQs;
  }

  function ensureDemoData(){
    if(Object.keys(datasets).length) return;
    datasets["デモ/医療/ALT基礎"] = {
      mode: 'ordered',
      items: [
        {jp:"皮弁は安定した血管茎で一貫した血流を持ちます。", en:"The flap has consistent blood flow with a stable vascular pedicle.", ex:"consistent blood flow=一定の血流。vascular pedicle=血管茎。with a ... pedicle=付帯状況を表すwith句。"},
        {jp:"皮弁は乳房の自然な円錐形に合わせて整形できます。", en:"The flap can be shaped to mimic the natural conical form of the breast.", ex:"can be shaped=受動態。mimic=模倣する。conical form=円錐形。"},
        {jp:"涙液は涙腺で産生され、眼表面に分泌されます。", en:"Tears are produced by the lacrimal glands and secreted onto the ocular surface.", ex:"be produced by=受動態。lacrimal glands=涙腺。onto the ocular surface=眼表面へ。"}
      ]
    };
    save(K.DATASETS, datasets);
  }

  
  /*** Catalog (問題一覧) ***/
  let catalogPath = null;
  let catalogAbort = { stop:false };

  // Elements for catalog (gracefully skip if not present)
  const catTreeEl = document.getElementById('catalogTree');
  const catListEl = document.getElementById('catalogList');
  const catPlayAllEl = document.getElementById('catalogPlayAll');
  const catStopEl = document.getElementById('catalogStop');
  const catStatusEl = document.getElementById('catalogStatus');

  function renderCatalogTree(){
    if(!catTreeEl) return;
    const paths = Object.keys(datasets);
    const tree = (function build(paths){
      const root = {};
      for(const p of paths){
        const parts = p.split('/').filter(Boolean);
        let node = root;
        for(let i=0;i<parts.length;i++){
          const part = parts[i];
          node[part] = node[part] || {__children__: {}, __full__: parts.slice(0,i+1).join('/')};
          node = node[part].__children__;
        }
      }
      return root;
    })(paths);
    catTreeEl.innerHTML = '';
    (function walk(node, parentEl){
      for(const name of Object.keys(node).sort()){
        const n = node[name];
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.textContent = name;
        item.dataset.path = n.__full__;
        parentEl.appendChild(item);
        item.addEventListener('click', ()=>{
          catalogPath = item.dataset.path;
          Array.from(catTreeEl.querySelectorAll('.tree-item')).forEach(e=>{
            e.style.background = (e.dataset.path===catalogPath)? '#e8f0ff':'';
          });
          renderCatalogList();
        });
        const children = n.__children__;
        if(children && Object.keys(children).length){
          const folder = document.createElement('div');
          folder.className = 'tree-folder';
          parentEl.appendChild(folder);
          walk(children, folder);
        }
      }
    })(tree, catTreeEl);
  }

  function renderCatalogList(){
    if(!catListEl) return;
    catListEl.innerHTML = '';
    if(!catalogPath || !datasets[catalogPath]){
      if(catStatusEl) catStatusEl.textContent = 'データセットを選択してください。';
      return;
    }
    if(catStatusEl) catStatusEl.textContent = '';
    const items = datasets[catalogPath].items;
    items.forEach((it, idx)=>{
      const con = document.createElement('div');
      con.className = 'hist-item';
      const head = document.createElement('div');
      head.className = 'hist-top';
      const title = document.createElement('div');
      title.className = 'hist-title';
      title.textContent = `#${idx+1}`;
      const act = document.createElement('div');
      act.className = 'hist-actions';
      const btn = document.createElement('button');
      btn.textContent = 'この問題を再生';
      btn.addEventListener('click', ()=> playOne(it));
      act.appendChild(btn);
      head.appendChild(title);
      head.appendChild(act);
      const jp = document.createElement('div'); jp.textContent = it.jp; jp.className='bold';
      const en = document.createElement('div'); en.textContent = it.en;
      con.appendChild(head); con.appendChild(jp); con.appendChild(en);
      catListEl.appendChild(con);
    });
  }

  async function playOne(item){
    const d1 = Math.max(0.5, Math.min(10, Number(el.delayJaToEn.value || settings.delayJaToEn)));
    await say(item.jp, 'ja-JP', settings.jaVoiceURI || el.jaVoice.value);
    await new Promise(r=>setTimeout(r, d1*1000));
    await say(item.en, 'en-US', settings.enVoiceURI || el.enVoice.value);
  }

  async function playAll(path){
    if(!path || !datasets[path] || !datasets[path].items.length){
      if(catStatusEl) catStatusEl.textContent = '再生するデータがありません。';
      return;
    }
    if(catStatusEl) catStatusEl.textContent = '連続再生中…';
    catalogAbort.stop = false;
    const d2 = Math.max(0.5, Math.min(10, Number(el.delayBetweenQs.value || settings.delayBetweenQs)));
    for(let i=0;i<datasets[path].items.length;i++){
      if(catalogAbort.stop){ if(catStatusEl) catStatusEl.textContent = '停止しました。'; return; }
      await playOne(datasets[path].items[i]);
      if(i < datasets[path].items.length-1){
        await new Promise(r=>setTimeout(r, d2*1000));
      }
    }
    if(catStatusEl) catStatusEl.textContent = '完了しました。';
  }

  // Hook buttons if present
  if(catPlayAllEl){
    catPlayAllEl.addEventListener('click', ()=>{
      if(!catalogPath){ if(catStatusEl) catStatusEl.textContent = 'データセットを選択してください。'; return; }
      playAll(catalogPath);
    });
  }
  if(catStopEl){
    catStopEl.addEventListener('click', ()=>{ catalogAbort.stop = true; });
  }
function start(){
    ensureDemoData();
    refreshDatasetsUI();
    initSettingsUI();
    // load initial if any
    if(!state.currentPath){
      state.currentPath = Object.keys(datasets)[0];
      state.index = 0;
      save(K.STATE, state);
    }
    loadCurrentQuestion();
    renderHistory();
  }

  start();

})();