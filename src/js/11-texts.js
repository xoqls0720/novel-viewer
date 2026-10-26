/* ================= 원고 저장소 (IndexedDB 'texts') ================= */
// 원고는 용량이 넉넉한 IndexedDB에 둔다. 메모리에 한 번 읽어 두고, 고치면 바로 기기에 쓴다.
const TXT = {cache: new Map(), dirty: new Set(), timer: null, ready: null};
const txtK = (pid, eid) => `${pid}/${eid}`;
function txtReady(){
  return TXT.ready ??= (async () => {
    try{
      const all = await idb.tx('readonly', s => s.getAll(), 'texts');
      for (const r of all) TXT.cache.set(r.k, r);
      // 예전 판(localStorage)에 있던 원고를 옮긴다
      const old = []; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k.startsWith('nv.st.txt.')) old.push(k); }
      for (const k of old){
        const [pid, eid, other] = k.slice('nv.st.txt.'.length).split('.');
        let v = null; try{ v = JSON.parse(localStorage.getItem(k)); }catch{}
        const key = txtK(pid, eid); const r = TXT.cache.get(key) || {k: key, text: '', t: Date.now(), syncedT: 0};
        if (other === 'other'){ if (v) r.other = v; } else if (typeof v === 'string' && !TXT.cache.has(key)) r.text = v;
        if (typeof v === 'string' || other === 'other'){ TXT.cache.set(key, r); TXT.dirty.add(key); }
      }
      if (TXT.dirty.size) await txtFlushNow();
      for (const k of old) localStorage.removeItem(k);
    }catch(e){ console.warn('texts', e); }
  })();
}
function txtGet(pid, eid){ return TXT.cache.get(txtK(pid, eid))?.text || ''; }
function txtOther(pid, eid){ return TXT.cache.get(txtK(pid, eid))?.other || ''; }
function txtSet(pid, eid, text, {other} = {}){
  const k = txtK(pid, eid); const r = TXT.cache.get(k) || {k, text: '', t: 0, syncedT: 0};
  if (other !== undefined){ r.other = other; } else { if (r.text === text) return; r.text = text; r.t = Date.now(); }
  TXT.cache.set(k, r); TXT.dirty.add(k);
  clearTimeout(TXT.timer); TXT.timer = setTimeout(txtFlushNow, 300);
  window.gdSoon?.();
}
function txtDel(pid, eid){ const k = txtK(pid, eid); TXT.cache.delete(k); TXT.dirty.delete(k); idb.tx('readwrite', s => s.delete(k), 'texts').catch(() => {}); tomb('texts', k); }
async function txtFlushNow(){
  clearTimeout(TXT.timer); if (!TXT.dirty.size) return;
  const ks = [...TXT.dirty]; TXT.dirty.clear();
  try{ await idb.tx('readwrite', s => { for (const k of ks){ const r = TXT.cache.get(k); if (r) s.put(r); } }, 'texts'); }
  catch{ ks.forEach(k => TXT.dirty.add(k)); toast('기기에 원고를 저장하지 못했어요. 저장 공간을 확인해 주세요'); }
}
addEventListener('pagehide', () => { txtFlushNow(); });

