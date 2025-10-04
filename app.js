import { DeckScheduler } from './js/scheduler.js';
import { PracticeNavigator } from './js/practice_navigator.js';
import { initSwipeNavigation } from './js/swipe-nav.js';
import { getExplanation } from './js/explain.js';

const $  = (s,p=document)=>p.querySelector(s);
const $$ = (s,p=document)=>Array.from(p.querySelectorAll(s));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');

// --- Install PWA -------------------------------------------------------------
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false;});
$('#installBtn').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; }};

// --- App state ---------------------------------------------------------------
let problems=[], scheduler=null, nav=null, current=null, voices=[];
let currentDeckId='builtin';
const settings={ jpVoice:'', enVoice:'', delayJPEN:1, delayNext:1, repeatCount:1, volume:1, model:'gpt-4o-mini' };
let bgStarted=false;

// --- Utils -------------------------------------------------------------------
const toast=(m)=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1200);};
const normalizeEN=(s='')=>s.replace(/[’‘']/g,"'").replace(/\s+/g,' ').trim();
const escapeHtml=(s='')=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const scrollToView=(el)=>el&&el.scrollIntoView({behavior:'smooth',block:'center'});

// --- Tabs --------------------------------------------------------------------
function switchTab(name){
  $$('nav.tabs button').forEach(b=>b.classList.remove('active'));
  $$('main .tab').forEach(s=>s.hidden=true);
  $(`nav.tabs button[data-tab="${name}"]`).classList.add('active');
  $(`#tab-${name}`).hidden=false;
}
$$('nav.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));

// --- Load problems -----------------------------------------------------------
async function loadBuiltin(){
  const txt=await fetch('./data/builtin.csv?'+Date.now()).then(r=>r.text());
  const rows=txt.split(/\r?\n/).filter(Boolean).slice(1);
  problems=rows.map((l,i)=>{const m=l.split(/,(.+)/);return {id:'builtin:'+i,jp:(m[0]||'').trim(),en:(m[1]||'').trim()};});
  currentDeckId='builtin';
  afterLoaded();
}
$('#addBuiltin').onclick=loadBuiltin;

$('#csvInput').addEventListener('change',async (e)=>{
  const f=e.target.files[0]; if(!f) return;
  const txt=await f.text();
  const rows=txt.split(/\r?\n/).filter(Boolean).slice(1);
  problems=rows.map((l,i)=>{
    const m=l.split(/,(.+)/);
    const jp=(m[0]||'').replace(/^"|"$/g,'').trim();
    const en=(m[1]||'').replace(/^"|"$/g,'').trim();
    return {id:'csv:'+i,jp,en};
  }).filter(x=>x.en);
  currentDeckId='csv:'+(f.name||'dataset');
  afterLoaded();
});

function afterLoaded(){
  renderProblems();
  scheduler=new DeckScheduler({items:problems,deckId:currentDeckId});
  nav=new PracticeNavigator({getNextItem:()=>scheduler.next(),onRender:renderPractice,deckId:currentDeckId});
  nav.start();
  updateCounters();
  toast('問題を読み込みました');
  switchTab('problems');
}

// --- Problems list -----------------------------------------------------------
function renderProblems(){
  const q=($('#searchProblems').value||'').toLowerCase();
  const list=$('#problemsList'); list.innerHTML='';
  problems.forEach((p,i)=>{
    if(q && !(p.jp+' '+p.en).toLowerCase().includes(q)) return;
    const div=document.createElement('div'); div.className='item';
    div.id='prob-'+i;
    div.innerHTML=`
      <div class="jp strong">${escapeHtml(p.jp)}</div>
      <div class="en muted">${escapeHtml(p.en)}</div>
      <div class="row">
        <button class="btn ghost" data-play="${i}">読み上げ</button>
        <button class="btn pri"   data-practice="${i}">この問題で練習</button>
      </div>`;
    list.appendChild(div);
  });
}
$('#searchProblems').addEventListener('input',renderProblems);

$('#problemsList').addEventListener('click',(e)=>{
  const play=e.target.closest('[data-play]');
  const go  =e.target.closest('[data-practice]');
  if(play){ const i=+play.dataset.play; scrollToView($('#prob-'+i)); speakPair(problems[i]); }
  if(go){ const i=+go.dataset.practice; nav.clear(); nav.history.push({item:problems[i]}); nav.pos=nav.history.length-1; nav._save(); nav._renderCurrent(); switchTab('practice'); scrollToView($('#practice-root')); }
});

$('#playAllProblems').onclick=async()=>{
  if(!problems.length) return;
  for(let i=0;i<problems.length;i++){
    scrollToView($('#prob-'+i));
    await speakPair(problems[i]);
    if(!$('#autoPlayProblems').checked) break;
    await sleep(settings.delayNext*1000);
  }
};

// --- Practice UI -------------------------------------------------------------
function shuffleTokens(en){ const t=en.split(/\s+/).filter(Boolean); const a=t.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return {tokens:t, shuffled:a}; }

function renderPractice(item){
  current=item;
  $('#jpText').textContent=item.jp||'';

  const { shuffled } = shuffleTokens(item.en);
  const host=$('#tokens'); host.innerHTML='';

  const pool=document.createElement('div'); pool.id='tokenPool'; Object.assign(pool.style,{display:'flex',flexWrap:'wrap',gap:'10px'});
  const line=document.createElement('div'); line.id='answerLine'; line.className='sentence';
  Object.assign(line.style,{minHeight:'48p
