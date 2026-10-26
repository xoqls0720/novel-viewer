/* ================= 작품 동기화: 이 기기의 작품 파일을 구글 드라이브(앱 전용 칸)에 올려 다른 기기에서도 보게 한다 ================= */
// 올리는 쪽: 불러온 작품을 파일 단위로 올린다. 웹툰·만화 회차의 이미지는 회차마다 묶어서(압축 없이) 한 파일로 올려 요청 수를 줄인다.
// 받는 쪽: 목록(library.json)과 작품별 목록(LW-…)만 먼저 받고, 파일은 열 때 그 화만 받아 기기에 남긴다.
// 이 기기에 원본(내 컴퓨터 폴더·불러온 파일)이 있는 작품은 원본을 쓴다. 올릴지 여부·제외 목록은 기기마다 따로 저장한다.
const LS = {busy: false, cancel: false, files: null, idx: null, wj: new Map(), state: new Map(), inflight: new Map(), zips: new Map(), asked: false, timer: null};
const h53 = (str, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++){ const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
const libBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + 'GB' : n >= 1048576 ? Math.round(n / 1048576) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const IMG_MIME = {jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp'};
const workFiles = w => [w.cover, w.info, ...w.eps.flatMap(e => e.file ? [e.file] : e.files || [])].filter(Boolean);
// 올리는 동안 원본이 바뀌어도 한 파일이 어긋나지 않게, 100MB 아래는 메모리로 복사해서 올린다
const libSnap = async b => b.size <= 100e6 ? new Blob([await b.arrayBuffer()], {type: b.type}) : b;
const libMine = w => !workFiles(w).some(f => f.remote);   // 드라이브 폴더·받아 온 작품은 올리지 않는다
const libSize = w => workFiles(w).reduce((s, f) => s + (f.size || 0), 0);
function libStatus(t){ LS.status = t; const el = $('#libSyncStat'); if (el) el.textContent = t; }

// 작품 하나를 올릴 조각으로 나눈다: 파일 하나, 또는 같은 회차 이미지 묶음(약 40MB·120장씩)
function libItems(w){
  const out = [];
  const mt = f => f.isLazy ? (f.lastModified || 0) : 0;   // 기기에 저장해 둔 파일은 다시 열 때마다 수정 시각이 바뀌어 비교에서 뺀다
  const one = f => out.push({id: relPath(f), type: 'file', rels: [relPath(f)], size: f.size || 0, mt: mt(f), blob: async () => libSnap(await realBlob(f))});
  if (w.cover) one(w.cover); if (w.info) one(w.info);
  for (const e of w.eps){
    if (e.file){ one(e.file); continue; }
    let part = [], bytes = 0;
    const flush = () => { if (!part.length) return; const fs = part; out.push({id: 'pack:' + relPath(fs[0]), type: 'pack', rels: fs.map(relPath), size: fs.reduce((s, f) => s + (f.size || 0), 0), mt: Math.max(...fs.map(mt)), blob: () => libPack(fs)}); part = []; bytes = 0; };
    for (const f of e.files || []){ part.push(f); bytes += f.size || 0; if (bytes > 40e6 || part.length >= 120) flush(); }
    flush();
  }
  return out;
}
const packEntry = (rel, i) => String(i).padStart(4, '0') + '_' + rel.split('/').pop();
async function libPack(fs){
  const zip = new JSZip(); let i = 0;
  for (const f of fs) zip.file(packEntry(relPath(f), i++), await (await realBlob(f)).arrayBuffer(), {binary: true});
  return await zip.generateAsync({type: 'blob', compression: 'STORE'});
}

/* ---------- 올리기 ---------- */
async function libIdxSet(files, key, entry){
  const cur = (await gdGet(files, 'library.json').catch(() => null)) || {v: 1, works: {}};
  if (entry) cur.works[key] = entry; else delete cur.works[key];
  await gdPut(files, 'library.json', new Blob([JSON.stringify(cur)], {type: 'application/json'}));
  LS.idx = cur; return cur;
}
async function libRetry(fn){ let err; for (let i = 0; i < 3; i++){ try{ return await fn(); }catch(e){ err = e; if (e.message === 'auth' || e.message === 'scope') throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); } } throw err; }
async function libPushWork(files, w, idx){
  const items = libItems(w); const sig = h53(items.map(i => `${i.id}:${i.size}:${i.mt}`).join('|'));
  if (idx.works[w.key]?.sig === sig){ LS.state.set(w.key, 'done'); return; }
  const fname = 'LW-' + h53(w.key);
  let wj = LS.wj.get(w.key) || (idx.works[w.key] && files.has(fname) ? await gdGet(files, fname).catch(() => null) : null) || {v: 1, key: w.key, name: w.name, kind: w.kind, items: []};
  const have = new Map(wj.items.map(i => [i.id, i]));
  const todo = items.filter(it => { const o = have.get(it.id); return !(o && o.size === it.size && o.mt === it.mt && files.has(o.f)); });
  const save = async complete => {
    wj.t = Date.now(); wj.name = w.name; wj.kind = w.kind; wj.items = items.map(i => have.get(i.id)).filter(Boolean);
    await libRetry(() => gdPut(files, fname, new Blob([JSON.stringify(wj)], {type: 'application/json'})));
    const entry = {file: fname, t: wj.t, n: w.eps.length, bytes: wj.items.reduce((s, i) => s + i.size, 0), sig: complete ? sig : null, name: w.name};
    idx.works[w.key] = entry; await libRetry(() => libIdxSet(files, w.key, entry)); LS.wj.set(w.key, wj);
  };
  LS.state.set(w.key, 'up'); let done = 0, since = 0, stop = null; const left = todo.reduce((s, i) => s + i.size, 0); let sent = 0;
  const q = [...todo];
  await Promise.all(Array.from({length: Math.min(3, q.length)}, async () => {
    while (q.length && !LS.cancel && !stop){
      const it = q.shift(); const f = 'LF-' + h53(w.key + '|' + it.id);
      try{
        const blob = await it.blob(); await libRetry(() => gdPut(files, f, blob));
        have.set(it.id, {id: it.id, type: it.type, f, fid: files.get(f)?.id, size: it.size, mt: it.mt, rels: it.rels});
        done++; since++; sent += it.size; libStatus(`작품 올리는 중 · ${w.name} ${done}/${todo.length} · ${libBytes(Math.max(0, left - sent))} 남음`);
      }catch(e){ stop = e; }
    }
  }));
  if (stop){ LS.state.set(w.key, 'err'); await save(false).catch(() => {}); throw stop; }
  await save(!LS.cancel); LS.state.set(w.key, LS.cancel ? 'wait' : 'done');
}
async function libPush(files){
  const idx = (await gdGet(files, 'library.json').catch(() => null)) || {v: 1, works: {}}; LS.idx = idx;
  const ex = new Set(store.get('lib.exclude', []));
  const list = works.filter(w => libMine(w) && !ex.has(w.key));
  for (const w of list) if (!LS.state.has(w.key) || LS.state.get(w.key) !== 'done') LS.state.set(w.key, 'wait');
  for (const w of list){ if (LS.cancel) break; await libPushWork(files, w, idx); }
}

/* ---------- 받기 ---------- */
function libRefetch(name){ return gdList().then(m => { LS.files = m; return m.get(name)?.id; }); }
async function libBlob(it){
  try{ const c = await idb.tx('readonly', s => s.get('LF:' + it.f), 'dcache'); if (c && c.mtime === it.mt && c.size === it.size) return c.blob; }catch{}
  if (LS.inflight.has(it.f)) return LS.inflight.get(it.f);
  const p = (async () => {
    let r; try{ r = await gdFetch(`${GD_API}/files/${it.fid}?alt=media`); }
    catch(e){ if (!/404/.test(e.message)) throw e; const id = await libRefetch(it.f); if (!id) throw new Error('클라우드에 파일이 없어요'); r = await gdFetch(`${GD_API}/files/${id}?alt=media`); }
    const b = await r.blob();
    try{ await idb.tx('readwrite', s => s.put({id: 'LF:' + it.f, blob: b, mtime: it.mt, size: it.size}), 'dcache'); }catch{}
    return b;
  })().finally(() => LS.inflight.delete(it.f));
  LS.inflight.set(it.f, p); return p;
}
async function libZip(it){
  if (LS.zips.has(it.f)) return LS.zips.get(it.f);
  const z = await JSZip.loadAsync(await libBlob(it)); LS.zips.set(it.f, z); while (LS.zips.size > 3) LS.zips.delete(LS.zips.keys().next().value); return z;
}
function libLazy(wj){
  const out = [];
  for (const it of wj.items){
    if (it.type === 'file'){ out.push(Object.assign(new LazyFile({name: it.rels[0].split('/').pop(), size: it.size, rel: it.rels[0], mtime: it.mt, get: () => libBlob(it)}), {remote: true})); continue; }
    it.rels.forEach((rel, i) => out.push(Object.assign(new LazyFile({name: rel.split('/').pop(), size: 0, rel, mtime: it.mt, get: async () => {
      const f = (await libZip(it)).file(packEntry(rel, i)); if (!f) throw new Error('묶음 안에 없어요');
      return new Blob([await f.async('arraybuffer')], {type: IMG_MIME[rel.split('.').pop().toLowerCase()] || ''});
    }}), {remote: true})));
  }
  return out;
}
async function libWork(e, files){
  try{ const c = await idb.tx('readonly', s => s.get('LW:' + e.file), 'dcache'); if (c && c.t === e.t) return c.wj; }catch{}
  if (!files) return null;
  const wj = await gdGet(files, e.file).catch(() => null); if (!wj) return null;
  try{ await idb.tx('readwrite', s => s.put({id: 'LW:' + e.file, wj, t: e.t}), 'dcache'); }catch{}
  return wj;
}
async function libBuild(idx, files){
  const add = [], mark = [];
  for (const [key, e] of Object.entries(idx.works || {})){
    const have = works.find(w => w.key === key);
    if (have && (!have.pulledT || have.pulledT >= e.t)) continue;   // 이 기기에 원본이 있거나 이미 최신이면 그대로
    const wj = await libWork(e, files); if (!wj?.items?.length) continue;
    add.push(...libLazy(wj)); mark.push([key, e.t]);
  }
  if (add.length){ await addFiles(add, {persist: false, quiet: true, fromLib: true}); for (const [k, t] of mark){ const w = works.find(x => x.key === k); if (w) w.pulledT = t; } }
  // 클라우드에서 지워진 작품은 받아 둔 목록에서도 뺀다
  const gone = works.filter(w => w.pulledT && !idx.works?.[w.key]); if (gone.length){ works = works.filter(w => !gone.includes(w)); renderLib(); }
}
async function libPull(files){
  const idx = await gdGet(files, 'library.json').catch(() => null); if (!idx) return;
  LS.idx = idx; try{ await idb.tx('readwrite', s => s.put({id: '__libidx', idx, t: Date.now()}), 'dcache'); }catch{}
  await libBuild(idx, files);
}
async function libBuildCached(){ try{ const c = await idb.tx('readonly', s => s.get('__libidx'), 'dcache'); if (c?.idx){ LS.idx = c.idx; await libBuild(c.idx, null); renderLibSync(); } }catch{} }

/* ---------- 돌리기 ---------- */
async function libRun(files){
  if (LS.busy || !gdReady()) return; LS.busy = true; LS.cancel = false; renderLibSync();
  try{
    files = files || await gdList(); LS.files = files;
    await libPull(files);
    if (store.get('lib.sync', false)) await libPush(files);
    const n = Object.keys(LS.idx?.works || {}).length;
    libStatus(LS.cancel ? '올리기를 멈췄어요' : `작품 ${n}개가 클라우드에 있어요 · ${new Date().toLocaleTimeString('ko-KR', {hour: 'numeric', minute: '2-digit'})}`);
  }catch(e){
    libStatus(/403/.test(e.message) ? '클라우드 저장 공간이 부족하거나 권한이 없어요 (구글 드라이브 용량을 확인해 주세요)' : /auth|scope|setup/.test(e.message) ? '구글 로그인이 필요해요. 설정 탭에서 연결을 눌러 주세요' : '작품 동기화가 멈췄어요 (' + e.message + ')');
  }finally{ LS.busy = false; renderLibSync(); }
}
window.libAfterSync = files => { libRun(files); if (DESKTOP && store.get('lib.sync', null) === null && !LS.asked && works.some(libMine)){ LS.asked = true; setTimeout(() => libEnable(), 800); } };
window.libSoon = () => { if (!gdReady() || !store.get('lib.sync', false)) return; clearTimeout(LS.timer); LS.timer = setTimeout(() => libRun(), 20000); };

/* ---------- 화면 ---------- */
async function libQuota(){ try{ const q = (await (await gdFetch(`${GD_API}/about?fields=storageQuota`)).json()).storageQuota; return q?.limit ? {free: +q.limit - +q.usage} : null; }catch{ return null; } }
async function libEnable(){
  const ex = new Set(store.get('lib.exclude', [])); const mine = works.filter(w => libMine(w) && !ex.has(w.key)); const total = mine.reduce((s, w) => s + libSize(w), 0);
  if (!gdReady()) { toast('먼저 설정 탭에서 구글 드라이브 동기화를 연결해 주세요'); $('#libSyncOn').checked = false; return false; }
  if (!mine.length){ store.set('lib.sync', true); toast('올릴 작품이 생기면 저절로 올려요'); renderLibSync(); return true; }
  const q = await libQuota();
  const ok = confirm(`작품 ${mine.length}개(${libBytes(total)})를 구글 드라이브의 앱 전용 칸에 올려요.\n다른 기기에서도 같은 작품이 보이고, 기기마다 열 때 그 화만 받아요.` + (q ? `\n\n드라이브 남은 공간: ${libBytes(Math.max(0, q.free))}` + (q.free < total ? '\n⚠ 남은 공간이 올릴 용량보다 적어요. 일부 작품만 골라 올리는 편이 좋아요.' : '') : '') + '\n\n올릴까요? (용량이 크면 몇 시간 걸려요. 컴퓨터를 켜 둔 채로 두면 이어서 올라가요)');
  store.set('lib.sync', ok); $('#libSyncOn').checked = ok; renderLibSync(); if (ok) libRun(); return ok;
}
function renderLibSync(){
  const on = $('#libSyncOn'); if (!on) return; on.checked = !!store.get('lib.sync', false);
  $('#libSyncStop').hidden = !LS.busy; $('#libSyncNow').disabled = LS.busy;
  if (!LS.status && !gdReady()) libStatus('설정 탭에서 구글 드라이브 동기화를 먼저 연결해 주세요');
  const ex = new Set(store.get('lib.exclude', [])); const idx = LS.idx?.works || {}; const box = $('#libSyncList'); box.innerHTML = '';
  const row = (w, mine) => {
    const e = idx[w.key]; const st = LS.state.get(w.key); const d = document.createElement('div'); d.className = 'lsw';
    const label = mine ? (e?.sig ? '올림' : st === 'up' ? '올리는 중' : e ? '일부 올림' : on.checked && !ex.has(w.key) ? '대기' : '올리지 않음') : '클라우드에서 받는 작품';
    d.innerHTML = `${mine ? '<input type="checkbox">' : ''}<span class="n"></span><span class="s"></span><span class="b"></span>${e ? '<button data-a="del">클라우드에서 지우기</button>' : ''}`;
    d.querySelector('.n').textContent = w.name; d.querySelector('.s').textContent = (mine ? libBytes(libSize(w)) + ' · ' : e ? libBytes(e.bytes || 0) + ' · ' : '') + label;
    const cb = d.querySelector('input'); if (cb){ cb.checked = !ex.has(w.key); cb.onchange = () => { const s = new Set(store.get('lib.exclude', [])); cb.checked ? s.delete(w.key) : s.add(w.key); store.set('lib.exclude', [...s]); renderLibSync(); if (cb.checked) libSoon(); }; }
    const del = d.querySelector('[data-a=del]'); if (del) del.onclick = () => libCloudDelete(w.key, w.name, mine);
    box.append(d);
  };
  for (const w of works.filter(libMine)) row(w, true);
  for (const w of works.filter(x => x.pulledT)) row(w, false);
  if (!box.children.length) box.innerHTML = '<div class="hint">불러온 작품이 없어요.</div>';
}
async function libCloudDelete(key, name, mine){
  if (LS.busy) return toast('지금 동기화 중이라 끝난 뒤에 지울 수 있어요');
  if (!confirm(`'${name}'을 구글 드라이브(클라우드)에서 지울까요?\n이 기기의 원본 파일은 그대로 두고, 다른 기기의 목록에서 빠져요.` + (mine ? '\n다시 올리지 않도록 이 기기에서는 제외해 둘게요.' : ''))) return;
  try{
    const files = await gdList(); const idx = (await gdGet(files, 'library.json')) || {works: {}}; const e = idx.works[key];
    if (e){ const wj = await gdGet(files, e.file).catch(() => null); for (const it of wj?.items || []) await gdDel(files, it.f); await gdDel(files, e.file); await libIdxSet(files, key, null); LS.wj.delete(key); }
    if (mine){ const s = new Set(store.get('lib.exclude', [])); s.add(key); store.set('lib.exclude', [...s]); }
    works = works.filter(w => !(w.pulledT && w.key === key)); renderLib(); toast('클라우드에서 지웠어요');
  }catch(e){ toast('지우지 못했어요 (' + e.message + ')'); }
  renderLibSync();
}
$('#libSyncOn').onchange = () => { if ($('#libSyncOn').checked) libEnable(); else { store.set('lib.sync', false); LS.cancel = true; renderLibSync(); } };
$('#libSyncNow').onclick = () => { if (!gdReady()) return toast('먼저 설정 탭에서 구글 드라이브 동기화를 연결해 주세요'); libRun(); };
$('#libSyncStop').onclick = () => { LS.cancel = true; libStatus('멈추는 중… (올리던 파일이 끝나면 멈춰요)'); };
$('#btnLink').addEventListener('click', renderLibSync);
setTimeout(libBuildCached, 700);
