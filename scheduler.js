export class DeckScheduler{
  constructor({items, deckId, storage=window.localStorage}){
    if(!Array.isArray(items)||!items.length) throw new Error('empty deck');
    this.items=items; this.n=items.length;
    this.deckId=String(deckId||'deck'); this.storage=storage; this.key=`deckScheduler:${this.deckId}`;
    const cs=this.#checksum(items);
    this.state=this.#load(cs)||this.#new(cs);
  }
  next(){
    const {perm,ptr,round}=this.state; const i=perm[ptr]; const item=this.items[i];
    this.state.ptr++; if(this.state.ptr>=this.n){ this.state.perm=this.#shuffle(this.n); this.state.ptr=0; this.state.round=round+1; }
    this.#save(); return {item,index:i,round};
  }
  remaining(){ return this.n-this.state.ptr; }
  reset(){ this.state.perm=this.#shuffle(this.n); this.state.ptr=0; this.state.round=1; this.#save(); }
  #new(cs){ return {n:this.n,checksum:cs,perm:this.#shuffle(this.n),ptr:0,round:1}; }
  #save(){ try{ this.storage.setItem(this.key, JSON.stringify(this.state)); }catch{} }
  #load(cs){ try{ const raw=this.storage.getItem(this.key); if(!raw) return null; const s=JSON.parse(raw);
    if(s.n!==this.n||s.checksum!==cs||!Array.isArray(s.perm)||typeof s.ptr!=='number') return null;
    if(s.ptr<0||s.ptr>=this.n) s.ptr=0; return s; }catch{ return null; } }
  #checksum(items){ try{ return this.#hash(items.map((x,i)=>i+':'+this.#itemKey(x)).join('||')); }catch{ return this.#hash(String(items.length)); } }
  #itemKey(x){ if(!x) return ''; if(typeof x==='string') return x; if(typeof x==='object'){ return [x.id,x.jp,x.en,x.text,x.question,x.sentence].filter(Boolean).join('|'); } return String(x); }
  #shuffle(n){ const a=Array.from({length:n},(_,i)=>i); for(let i=n-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  #hash(s){ let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return String(h); }
}
if(typeof window!=='undefined'){ window.DeckScheduler=DeckScheduler; }
