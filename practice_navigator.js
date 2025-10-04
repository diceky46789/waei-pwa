export class PracticeNavigator{
  constructor({getNextItem, onRender, deckId='default', persist=true, storage=window.localStorage}){
    if(typeof getNextItem!=='function') throw new Error('getNextItem required');
    if(typeof onRender!=='function') throw new Error('onRender required');
    this.getNextItem=getNextItem; this.onRender=onRender; this.deckId=String(deckId);
    this.persist=persist; this.storage=storage; this.key=`practiceHistory:${this.deckId}`;
    this.history=[]; this.pos=-1; this.#load();
  }
  start(){ if(this.history.length===0) this.#push(); this.#render(); }
  current(){ return (this.pos<0||this.pos>=this.history.length)?null:this.history[this.pos]; }
  next(){ if(this.pos<this.history.length-1){ this.pos++; this.#save(); this.#render(); return this.current(); } this.#push(); this.#render(); return this.current(); }
  prev(){ if(this.pos>0){ this.pos--; this.#save(); this.#render(); } return this.current(); }
  clear(){ this.history=[]; this.pos=-1; this.#save(); }
  #push(){ const got=this.getNextItem(); const item=(got&&typeof got==='object'&&'item'in got)?got.item:got; this.history.push({item}); this.pos=this.history.length-1; this.#save(); }
  #render(){ const cur=this.current(); if(cur) this.onRender(cur.item); }
  #load(){ if(!this.persist) return; try{ const raw=this.storage.getItem(this.key); if(!raw) return; const s=JSON.parse(raw); if(Array.isArray(s.history)&&typeof s.pos==='number'){ this.history=s.history; this.pos=Math.min(Math.max(0,s.pos),this.history.length-1);} }catch{} }
  #save(){ if(!this.persist) return; try{ this.storage.setItem(this.key, JSON.stringify({history:this.history,pos:this.pos})); }catch{} }
}
if(typeof window!=='undefined'){ window.PracticeNavigator=PracticeNavigator; }
