const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm";
const DEFAULT_MODEL = 'claude-opus-5-5';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k, d){ try{ const v = localStorage.getItem('nv.'+k); return v===null ? d : JSON.parse(v); }catch{ return d; } },
  set(k, v){
    try{ localStorage.setItem('nv.'+k, JSON.stringify(v)); }catch{ toast('브라우저 저장 공간이 꽉 찼어요. 설정 탭에서 백업 후 정리해 주세요.'); return; }
    if (!k.startsWith('__') && !/^(apiKey|gemKey|grKey|olOk)$/.test(k) && !k.startsWith('gd.')){ const ts = this.get('__ts', {}); ts[k] = Date.now(); try{ localStorage.setItem('nv.__ts', JSON.stringify(ts)); }catch{} window.gdSoon?.(); }
  }
};
function tomb(kind, id){ const t = store.get('__tomb', {notes:[], scraps:[]}); t[kind] = [...new Set([...(t[kind]||[]), id])].slice(-2000); store.set('__tomb', t); window.gdSoon?.(); }
const IMG = /\.(jpe?g|png|webp|gif|bmp)$/i;
const natural = (a,b) => a.localeCompare(b, 'ko', {numeric:true, sensitivity:'base'});
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(()=>el.classList.remove('show'), 2600); }
const isMobile = () => matchMedia('(max-width:1100px)').matches;   // CSS의 덮개 배치 기준과 같아야 한다
const isTouch = () => matchMedia('(pointer:coarse)').matches;
const tts = window.speechSynthesis || null;
const copy = t => { navigator.clipboard?.writeText(t).then(() => toast('복사했어요'), () => toast('복사하지 못했어요')); };

/* ================= 기기 저장소 (IndexedDB) ================= */
const idb = {
  db: null,
  async open(){
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => { const r = indexedDB.open('nv', 5); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', {keyPath:'path'}); if (!db.objectStoreNames.contains('scraps')) db.createObjectStore('scraps', {keyPath:'id'}); if (!db.objectStoreNames.contains('snaps')) db.createObjectStore('snaps', {keyPath:'id'}); if (!db.objectStoreNames.contains('texts')) db.createObjectStore('texts', {keyPath:'k'}); if (!db.objectStoreNames.contains('dcache')) db.createObjectStore('dcache', {keyPath:'id'}); }; r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); this.db = null; }; res(r.result); }; r.onerror = () => rej(r.error); r.onblocked = () => toast('다른 Novelist 창을 닫고 다시 열어 주세요'); });
    return this.db;
  },
  async tx(mode, fn, name = 'files'){ const db = await this.open(); return await new Promise((res, rej) => { const t = db.transaction(name, mode); const out = fn(t.objectStore(name)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  async putMany(files){ for (let i=0; i<files.length; i+=50){ const part = files.slice(i, i+50); await this.tx('readwrite', s => { for (const f of part) s.put({path: relPath(f), blob: f, name: f.name}); }); } },
  async all(){ return await this.tx('readonly', s => s.getAll()); },
  async delPrefix(prefix){ const keys = await this.tx('readonly', s => s.getAllKeys()); const del = keys.filter(k => k === prefix || k.startsWith(prefix + '/')); await this.tx('readwrite', s => { for (const k of del) s.delete(k); }); return del.length; },
  async clear(){ await this.tx('readwrite', s => s.clear()); },
};
const relPath = f => f._rel || f.webkitRelativePath || f.name;
async function showStore(){
  try{ const e = await navigator.storage?.estimate?.(); const n = await idb.tx('readonly', s => s.count()); $('#storeInfo').textContent = `저장한 파일 ${n.toLocaleString()}개` + (e ? ` · 사용 ${(e.usage/1048576).toFixed(0)}MB / 가능 ${(e.quota/1073741824).toFixed(1)}GB` : ''); }catch{ $('#storeInfo').textContent = '이 브라우저는 기기 저장을 지원하지 않아요'; }
}

