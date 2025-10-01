// app.js
import { DeckScheduler } from './js/scheduler.js';
import { PracticeNavigator } from './js/practice_navigator.js';
import { initSwipeNavigation } from './js/swipe-nav.js';
import { getExplanation } from './js/explain.js';

const $ = (sel, p=document) => p.querySelector(sel);
const $$ = (sel, p=document) => Array.from(p.querySelectorAll(sel));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; $('#installBtn').hidden=false; });
$('#installBtn').onclick = async () => { if(deferredPrompt){deferredPrompt.prompt(); await deferredPrompt.userChoice;} };

let problems=[], scheduler=null, nav=null, currentDeckId='builtin', current=null, voices=[];
let settings = { jpVoice:'', enVoice:'', delayJPEN:1.0, delayNext:1.0, repeatCount:1, volume:1, model:'gpt-4o-mini' };

function showToast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 1400); }
function normalizeEN(s=''){ return s.replace(/[’‘']/g, "'").replace(/\s+/g,' ').trim(); }
function shuffleTokens(en){ const tokens=en.split(/\s+/).filter(Boolean); const a=tokens.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return {tokens, shuffled:a}; }
function escapeHtml(s=''){ return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function smoothScrollInto(el){ if(!el) return; el.scrollIntoView({behavior:'smooth', block:'center'}); }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

// Tabs
$$('nav.tabs button').forEach(btn => btn.onclick = () => {
  $$('nav.tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.tab;
  $$('main .tab').forEach(s=>s.hidden=true);
  $('#tab-'+tab).hidden=false;
});

// Built-in CSV
async function loadBuiltin(){
  const txt = await fetch('./data/builtin.csv?'+Date.now()).then(r=>r.text());
  const rows = txt.split(/\r?\n/).filter(l=>l.trim()).slice(1);
  problems = rows.map((line,i)=>{
    const m = line.split(/,(.+)/); const jp=(m[0]||'').trim(); const en=(m[1]||'').trim();
    return { id:'builtin:'+i, jp, en };
  });
  currentDeckId='builtin'; afterDataLoaded();
}
$('#addBuiltin').onclick = loadBuiltin;

// CSV import
$('#csvInput').addEventListener('change', async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  const txt=await f.text(); const lines=txt.split(/\r?\n/).filter(l=>l.trim()); const rows=lines.slice(1);
  problems = rows.map((line,i)=>{ const m=line.split(/,(.+)/); const jp=(m[0]||'').replace(/^"|"$/g,'').trim(); const en=(m[1]||'').replace(/^"|"$/g,'').trim(); return { id:'csv:'+i, jp, en}; }).filter(x=>x.en);
  currentDeckId = 'csv:'+(f.name||'dataset'); afterDataLoaded();
});

function afterDataLoaded(){
  renderProblems();
  scheduler = new DeckScheduler({ items: problems, deckId: currentDeckId });
  nav = new PracticeNavigator({ getNextItem: ()=>scheduler.next(), onRender: renderPractice, deckId: currentDeckId });
  nav.start();
  updateCounters(); showToast('問題を読み込みました');
  switchTab('problems');
}

// Problems
function renderProblems(){
  const q = ($('#searchProblems').value||'').toLowerCase(); const list=$('#problemsList'); list.innerHTML='';
  problems.forEach((p,idx)=>{
    if (q && !(p.jp+' '+p.en).toLowerCase().includes(q)) return;
    const div=document.createElement('div'); div.className='item';
    div.innerHTML = `<div><strong>${escapeHtml(p.jp)}</strong></div>
      <div class="muted">${escapeHtml(p.en)}</div>
      <div class="controls">
        <button class="btn" data-play="${idx}">読み上げ</button>
        <button class="btn pri" data-practice="${idx}">この問題で練習</button>
      </div>`;
    list.appendChild(div);
  });
}
$('#searchProblems').addEventListener('input', renderProblems);
$('#problemsList').addEventListener('click', (e)=>{
  const play=e.target.closest('[data-play]'); const go=e.target.closest('[data-practice]');
  if (play){ const idx=+play.dataset.play; speakPair(problems[idx]); }
  else if (go){ const idx=+go.dataset.practice; nav.clear(); nav.history.push({ item: problems[idx], meta:{ index:idx } }); nav.pos=nav.history.length-1; nav._save(); nav._renderCurrent(); switchTab('practice'); smoothScrollInto($('#practice-root')); }
});
$('#playAllProblems').onclick = async ()=>{
  const items = problems.slice(); const auto=$('#autoPlayProblems').checked;
  for (const it of items){ await speakPair(it); if (!auto) break; await sleep(settings.delayNext*1000); }
};

// Practice
function renderPractice(item){
  current=item; $('#jpText').textContent=item.jp||'';
  const { tokens, shuffled } = shuffleTokens(item.en); const container=$('#tokens'); container.innerHTML='';
  let selected=[];
  shuffled.forEach(tk=>{ const b=document.createElement('button'); b.className='btn'; b.textContent=tk; b.onclick=()=>{ selected.push(tk); b.disabled=true; container.querySelector('.answer-line').textContent=selected.join(' '); }; container.appendChild(b); });
  const line=document.createElement('div'); line.className='answer-line sentence'; line.style.marginTop='12px'; container.appendChild(line);
  $('#answerCard').style.display='none'; updateCounters();
}
$('#checkBtn').onclick = ()=>{
  const ans=normalizeEN(current.en); const user=normalizeEN($('#tokens .answer-line').textContent||'');
  const ok = ans===user; $('#answerCard').style.display='block'; $('#answer').textContent=current.en; $('#answerCard').scrollIntoView({behavior:'smooth', block:'center'});
  pushHistory({ ...current, correct: ok, user }); showToast(ok?'正解！':'もう一度');
};
$('#revealBtn').onclick = ()=>{ $('#answerCard').style.display='block'; $('#answer').textContent=current.en; };
$('#speakJP').onclick = ()=> speakText(current.jp, 'ja');
$('#speakEN').onclick = ()=> speakText(current.en, 'en');
$('#explainBtn').onclick = async ()=>{
  settings.model = $('#modelSel').value;
  try{ $('#explainBtn').disabled=true; const text = await getExplanation({ jp: current.jp, en: current.en, model: settings.model });
    $('#answerCard').style.display='block'; $('#answer').textContent=current.en; $('#explain').textContent=text;
  }catch(e){ alert('解説の取得に失敗: '+e.message); } finally{ $('#explainBtn').disabled=false; }
};
$('#nextBtn').onclick = ()=> nav.next();
$('#prevBtn').onclick = ()=> nav.prev();
initSwipeNavigation({ container: $('#practice-root'), onSwipeLeft: ()=>nav.next(), onSwipeRight: ()=>nav.prev() });

// History
let historyArr = JSON.parse(localStorage.getItem('history')||'[]');
function pushHistory(entry){ entry.ts=Date.now(); historyArr.unshift(entry); if(historyArr.length>1000) historyArr.pop(); localStorage.setItem('history', JSON.stringify(historyArr)); renderHistory(); }
function renderHistory(){
  const q = ($('#searchHistory').value||'').toLowerCase(); const list=$('#historyList'); list.innerHTML='';
  historyArr.forEach((h,idx)=>{
    if (q && !((h.jp||'')+' '+(h.en||'')+' '+(h.user||'')).toLowerCase().includes(q)) return;
    const div=document.createElement('div'); div.className='item'; const date=new Date(h.ts).toLocaleString();
    div.innerHTML = `<div><strong>${escapeHtml(h.jp||'')}</strong></div>
      <div class="muted">${escapeHtml(h.en||'')}</div>
      <div class="meta">${h.correct?'◯':'×'} ／ ${date}</div>
      <div class="controls">
        <button class="btn" data-replay="${idx}">読み上げ</button>
        <button class="btn pri" data-again="${idx}">この問題で練習</button>
      </div>`;
    list.appendChild(div);
  });
}
$('#searchHistory').addEventListener('input', renderHistory);
$('#historyList').addEventListener('click', (e)=>{
  const replay=e.target.closest('[data-replay]'); const again=e.target.closest('[data-again]');
  if (replay){ const idx=+replay.dataset.replay; speakPair(historyArr[idx]); }
  else if (again){ const idx=+again.dataset.again; nav.clear(); nav.history.push({ item: historyArr[idx], meta:{from:'history'} }); nav.pos=nav.history.length-1; nav._save(); nav._renderCurrent(); switchTab('practice'); smoothScrollInto($('#practice-root')); }
});
$('#clearHistory').onclick = ()=>{ if(confirm('履歴をすべて削除しますか？')){ historyArr=[]; localStorage.setItem('history','[]'); renderHistory(); } };

// Settings
$('#saveKey').onclick = ()=>{ const v=($('#apiKey').value||'').trim(); if(!/^sk-/.test(v)) { alert('sk- から始まるキーを入力'); return; } localStorage.setItem('openai_api_key', v); showToast('APIキーを保存しました'); $('#apiKey').value=''; };
$('#testExplain').onclick = async ()=>{ try{ const t=await getExplanation({ jp:'舌部分切除後、RFFFで再建した。', en:'We inset a radial forearm free flap after partial glossectomy.', model: settings.model }); alert('OK\n\n'+t); }catch(e){ alert('NG: '+e.message); } };
function loadVoices(){ voices=window.speechSynthesis.getVoices(); populateVoiceSelects(); }
function populateVoiceSelects(){ const jpSel=$('#jpVoice'), enSel=$('#enVoice'); jpSel.innerHTML=''; enSel.innerHTML='';
  voices.forEach(v=>{ const opt=document.createElement('option'); opt.value=v.name; opt.textContent=`${v.name} (${v.lang})`; if(v.lang.startsWith('ja')) jpSel.appendChild(opt.cloneNode(true)); if(v.lang.startsWith('en')) enSel.appendChild(opt); });
  if(!settings.jpVoice){ const v=voices.find(v=>v.lang.startsWith('ja')); if(v) settings.jpVoice=v.name; }
  if(!settings.enVoice){ const v=voices.find(v=>v.lang.startsWith('en-US')) || voices.find(v=>v.lang.startsWith('en')); if(v) settings.enVoice=v.name; }
  jpSel.value=settings.jpVoice||''; enSel.value=settings.enVoice||'';
}
window.speechSynthesis.onvoiceschanged=loadVoices; setTimeout(loadVoices, 300);
$('#jpVoice').onchange = (e)=> settings.jpVoice = e.target.value;
$('#enVoice').onchange = (e)=> settings.enVoice = e.target.value;
$('#delayJPEN').onchange = (e)=> settings.delayJPEN = clamp(+e.target.value, 0.5, 10);
$('#delayNext').onchange = (e)=> settings.delayNext = clamp(+e.target.value, 0.5, 10);
$('#repeatCount').onchange = (e)=> settings.repeatCount = clamp(Math.round(+e.target.value), 1, 10);
$('#volume').onchange = (e)=> settings.volume = clamp(+e.target.value, 0, 1);
async function speakPair(it){ await speakText(it.jp,'ja'); await sleep(settings.delayJPEN*1000); await speakText(it.en,'en'); }
async function speakText(text, lang){
  if(!text) return;
  for(let k=0;k<settings.repeatCount;k++){
    await new Promise((resolve)=>{
      const u=new SpeechSynthesisUtterance(text);
      const lst=window.speechSynthesis.getVoices();
      const vname=(lang==='ja')?settings.jpVoice:settings.enVoice;
      const v=lst.find(x=>x.name===vname) || lst.find(x=>x.lang.startsWith(lang));
      if (v) u.voice=v; u.lang=v? v.lang : (lang==='ja'?'ja-JP':'en-US'); u.rate=1.0; u.pitch=1.0; u.volume=settings.volume;
      u.onend=()=>resolve(); u.onerror=()=>resolve(); try{ window.speechSynthesis.speak(u); }catch{ resolve(); }
    });
  }
}
$('#playPracticeAuto').onclick = async ()=>{ if(!current) return; await speakPair(current); };

function updateCounters(){ if(!scheduler) return; const s=scheduler.state; $('#deckInfo').textContent=currentDeckId; $('#roundInfo').textContent='Round '+s.round; $('#remainInfo').textContent='残り '+scheduler.remaining(); }
function switchTab(name){ $$('nav.tabs button').forEach(b=>b.classList.remove('active')); $$('main .tab').forEach(s=>s.hidden=true); $('nav.tabs button[data-tab="'+name+'"]').classList.add('active'); $('#tab-'+name).hidden=false; }

// History init & initial data
renderHistory(); loadBuiltin();
