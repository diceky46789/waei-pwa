// js/scheduler.js
export class DeckScheduler {
  constructor({ items, deckId, storage = window.localStorage }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("DeckScheduler: items is empty.");
    }
    this.items = items;
    this.n = items.length;
    this.deckId = String(deckId || this._defaultDeckId(items));
    this.storage = storage;
    this.key = `deckScheduler:${this.deckId}`;
    const checksum = this._checksum(items);
    this.state = this._loadState(checksum) || this._newState(checksum);
  }
  next() {
    const { perm, ptr, round } = this.state;
    const i = perm[ptr];
    const item = this.items[i];
    this.state.ptr++;
    if (this.state.ptr >= this.n) {
      this.state.perm = this._shuffled(this.n);
      this.state.ptr = 0;
      this.state.round = round + 1;
    }
    this._saveState();
    return { item, index: i, round };
  }
  remaining() { return this.n - this.state.ptr; }
  reset() {
    this.state.perm = this._shuffled(this.n);
    this.state.ptr = 0;
    this.state.round = 1;
    this._saveState();
  }
  getState() { return { ...this.state }; }
  _defaultDeckId(items) {
    try {
      const a = this._itemKey(items[0]);
      const b = this._itemKey(items[items.length - 1]);
      return `deck_${items.length}_${this._hash(a + "|" + b).slice(0,8)}`;
    } catch { return `deck_${items.length}`; }
  }
  _itemKey(x) {
    if (x == null) return "";
    if (typeof x === "string") return x;
    if (typeof x === "object") {
      return [x.id, x.jp, x.en, x.text, x.question, x.sentence].filter(Boolean).join("|");
    }
    return String(x);
  }
  _checksum(items) {
    try {
      const blob = items.map((x, idx) => `${idx}:${this._itemKey(x)}`).join("||");
      return this._hash(blob);
    } catch { return this._hash(String(items.length)); }
  }
  _hash(str) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ("0000000" + (hash >>> 0).toString(16)).slice(-8);
  }
  _loadState(checksum) {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.n !== this.n || s.checksum !== checksum || !Array.isArray(s.perm) || typeof s.ptr !== "number") {
        return null;
      }
      if (s.ptr < 0 || s.ptr >= this.n) s.ptr = 0;
      return s;
    } catch { return null; }
  }
  _newState(checksum) {
    return { n: this.n, checksum, perm: this._shuffled(this.n), ptr: 0, round: 1 };
  }
  _saveState() {
    try { this.storage.setItem(this.key, JSON.stringify(this.state)); } catch {}
  }
  _shuffled(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
if (typeof window !== 'undefined') {
  window.DeckScheduler = DeckScheduler;
}
