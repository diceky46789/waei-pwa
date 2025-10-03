// js/practice_navigator.js
export class PracticeNavigator {
  constructor({ getNextItem, onRender, deckId = 'default', persist = true, storage = window.localStorage }) {
    if (typeof getNextItem !== 'function') throw new Error('PracticeNavigator: getNextItem is required');
    if (typeof onRender !== 'function') throw new Error('PracticeNavigator: onRender is required');
    this.getNextItem=getNextItem; this.onRender=onRender; this.deckId=String(deckId);
    this.persist=persist; this.storage=storage; this.key=`practiceHistory:${this.deckId}`;
    this.history=[]; this.pos=-1; this._load();
  }
  start(){ if(this.history.length===0) this._pushFromSource(); this._renderCurrent(); }
  current(){ if(this.pos<0||this.pos>=this.history.length) return null; return this.history[this.pos]; }
  next(){ if(this.pos<this.history.length-1){ this.pos++; this._save(); this._renderCurrent(); return this.current(); }
    this._pushFromSource(); this._renderCurrent(); return this.current(); }
  prev(){ if(this.pos>0){ this.pos--; this._save(); this._renderCurrent(); } return this.current(); }
  clear(){ this.history=[]; this.pos=-1; this._save(); }
  _pushFromSource(){ const got=this.getNextItem(); let item=got, meta=null;
    if(got && typeof got==='object' && 'item' in got){ item=got.item; meta={ index:got.index, round:got.round }; }
    this.history.push({ item, meta }); this.pos=this.history.length-1; this._save(); }
  _renderCurrent(){ const cur=this.current(); if(cur) this.onRender(cur.item); }
  _load(){ if(!this.persist) return; try{ const raw=this.storage.getItem(this.key); if(!raw) return; const s=JSON.parse(raw);
    if(Array.isArray(s.history) && typeof s.pos==='number'){ this.history=s.history; this.pos=Math.min(Math.max(0,s.pos), this.history.length-1); } }catch{} }
  _save(){ if(!this.persist) return; try{ this.storage.setItem(this.key, JSON.stringify({history:this.history,pos:this.pos})); }catch{} }
}
if (typeof window!=='undefined'){ window.PracticeNavigator = PracticeNavigator; }
