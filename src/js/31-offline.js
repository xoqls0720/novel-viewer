/* ================= 작품 통째로 받기 =================
   드라이브·OneDrive·PC 서재의 작품은 회차를 열 때마다 하나씩 받는다. 800화짜리를 하나씩 여는 대신
   회차 목록의 '전체 받기'로 한 번에 받아 두면 기기(IndexedDB dcache)에 남는다.
   받다 멈춰도 받은 데까지는 남고, 다시 누르면 안 받은 것만 이어 받는다(이미 받은 파일은 캐시가 바로 돌려준다).
   받아 둔 것은 주소(출처)마다 따로 남는다. http 주소는 서비스 워커가 없어 PC 가 꺼지면 앱 자체가 열리지 않는다(dlNote). */
const DLA = {on: false, stop: false, full: false, done: 0, fail: 0, total: 0, key: '', msg: '', chunk: 8 * 1048576};
const DL_ZIP = /\.(epub|zip|cbz)$/i;
const DL_WORKERS = 6;
const dlSleep = ms => new Promise(res => setTimeout(res, ms));
const dlEkey = f => relPath(f) + '|' + f.size + '|' + f.lastModified;   // readEpub 의 ez:/ze: 열쇠와 같은 꼬리
const dlKeys = async () => new Set(await idb.tx('readonly', s => s.getAllKeys(), 'dcache'));
const dlHas = async k => (await idb.tx('readonly', s => s.getKey(k), 'dcache')) === k;   // 없으면 idb.tx 는 undefined 가 아니라 요청 객체를 돌려준다
const dlRanged = f => !!(f.remote && (f.rangeUrl || f.streamUrl));   // 구간으로 읽는 파일 (아니면 파일 통째로 기기에 남는다)
// 영상: 수백 MB 를 한 번에 받으면 폰 메모리가 모자라고 끊기면 처음부터다 → 조각(vc:)으로 받아 두고, 다 받으면 표시(vd:)를 남긴다
const dlVtail = f => f.cacheKey + '|' + f.size + '|' + f.lastModified;
const vcKey = (f, i) => 'vc:' + dlVtail(f) + '|' + i;
const vdKey = f => 'vd:' + dlVtail(f);

// 받을 거리: 멀리 있는(remote) 파일들. EPUB·zip 은 통째가 아니라 안의 글·그림을 받는다(글은 readEpub 이 texts 로 남긴다)
function dlPlan(w){
  const seen = new Set(); const files = [], epubs = [], videos = []; let bytes = 0, eps = 0;
  for (const ep of w.eps || []){
    const vid = ep.type === 'video';
    const list = vid ? [...(ep.subs || []), ep.cover].filter(Boolean) : ep.type === 'imgs' ? ep.files : ep.file ? [ep.file] : [];
    let mine = 0;
    if (vid && ep.file?.isLazy && ep.file.remote && ep.file.size !== 0 && !seen.has(ep.file.cacheKey)){ seen.add(ep.file.cacheKey); videos.push(ep.file); bytes += ep.file.size || 0; mine++; }
    for (const f of list){
      if (!f?.isLazy || !f.remote || f.size === 0) continue;   // 빈 파일은 기기에 남지 않아 '받아 둠'이 영영 안 된다
      const k = (DL_ZIP.test(f.name) ? 'E|' : '') + (f.cacheKey || relPath(f));
      mine++; if (seen.has(k)) continue; seen.add(k);
      if (DL_ZIP.test(f.name)) epubs.push(f); else files.push(f);
      bytes += f.size || 0;
    }
    if (mine) eps++;
  }
  return {files, epubs, videos, bytes, eps, total: files.length + epubs.length + videos.length};
}
// 얼마나 받아 뒀나 (단추 이름에 쓴다)
async function dlState(w){
  const plan = dlPlan(w); if (!plan.total) return null;
  let have = 0;
  try{
    const keys = await dlKeys();
    for (const f of plan.files) if (f.cacheKey && keys.has(f.cacheKey)) have++;
    for (const f of plan.epubs) if (keys.has('zd:' + dlEkey(f))) have++;
    for (const f of plan.videos) if (keys.has(dlRanged(f) ? vdKey(f) : f.cacheKey)) have++;
  }catch{}
  return {...plan, have};
}
const KEPT = 'nvdl.kept';
const keptMap = () => { try{ return JSON.parse(localStorage.getItem(KEPT)) || {}; }catch{ return {}; } };
function keptSet(key, on){ const m = keptMap(); if (!!m[key] === !!on) return; if (on) m[key] = 1; else delete m[key]; try{ localStorage.setItem(KEPT, JSON.stringify(m)); }catch{} renderLib(); }
window.nvKept = key => !!keptMap()[key];
window.nvKeptClear = () => { localStorage.removeItem(KEPT); renderLib(); };
const dlSize = n => !n ? '' : n >= 900 * 1048576 ? (n / 1073741824).toFixed(1) + 'GB' : Math.max(1, Math.round(n / 1048576)) + 'MB';
// 이 주소에서 받아 둔 것을 어디까지 쓸 수 있는지 (주소마다 저장소가 따로이고, http 는 PC 없이 앱이 뜨지 않는다)
function dlNote(){
  if (!LAN_BASE) return '받아 두면 인터넷 없이도 바로 열려요.';
  if (location.protocol !== 'https:') return '이 주소(http)는 PC 가 켜져 있어야 앱이 열려요. 받아 두면 다시 받지 않아 빨라지지만, PC 없이는 못 읽어요.\nPC 없이 읽으려면 웹 버전에 구글 드라이브 서재를 연결해서 받아 두세요.';
  if (/trycloudflare\.com$/i.test(location.hostname)) return '이 주소는 PC 를 다시 켜면 바뀌고, 바뀌면 받아 둔 것이 보이지 않아요.\nPC 없이 오래 읽으려면 웹 버전에 구글 드라이브 서재를 연결해서 받아 두세요.';
  return '받아 두면 PC 없이도 바로 열려요.';
}
let dlTickAt = 0;
const dlTick = () => { if (Date.now() - dlTickAt > 250){ dlTickAt = Date.now(); dlBtn(); } };

async function dlRange(f, a, b){
  const src = f.rangeUrl ? await f.rangeUrl() : f.streamUrl;
  const x = typeof src === 'string' ? {url: src, headers: {}} : src;
  const r = await fetch(x.url, {headers: {...x.headers, Range: `bytes=${a}-${b}`}});
  if (r.status === 401){ gdForget(); throw new Error('auth'); }
  if (r.status !== 206 && !(r.ok && a === 0 && b >= f.size - 1)) throw new Error('read ' + r.status);
  return r.blob();
}
async function dlVideo(f){
  if (!dlRanged(f)){ const b = await f.blob(); if (b?.size && !(await dlHas(f.cacheKey))) throw new Error('full'); return; }   // OneDrive: 구간 주소가 없어 통째로
  const n = Math.max(1, Math.ceil(f.size / DLA.chunk)), keys = await dlKeys();
  const todo = Array.from({length: n}, (_, i) => i).filter(i => !keys.has(vcKey(f, i)));
  DLA.total += todo.length;   // 진행 막대가 조각마다 움직이게
  for (const i of todo){
    if (DLA.stop) return;
    const blob = await dlRange(f, i * DLA.chunk, Math.min(f.size, (i + 1) * DLA.chunk) - 1);
    try{ await idb.tx('readwrite', s => s.put({id: vcKey(f, i), blob}), 'dcache'); }catch{ throw new Error('full'); }
    DLA.done++; dlTick();
  }
  await idb.tx('readwrite', s => s.put({id: vdKey(f), n, type: DRV_MIME[(f.name.split('.').pop() || '').toLowerCase()] || 'video/mp4'}), 'dcache');
}
// 받아 둔 영상: 조각을 이어 붙인 파일. 조각은 기기 안에 그대로 있어 메모리를 먹지 않고, 앞뒤로 넘길 수 있다
async function dlVideoBlob(f){
  if (!f?.isLazy || !f.remote || !f.cacheKey) return null;
  try{
    const m = await idb.tx('readonly', s => s.get(vdKey(f)), 'dcache'); if (!m?.n) return null;
    const parts = []; for (let i = 0; i < m.n; i++){ const c = await idb.tx('readonly', s => s.get(vcKey(f, i)), 'dcache'); if (!c?.blob) return null; parts.push(c.blob); }
    return new Blob(parts, {type: m.type});
  }catch{ return null; }
}
async function dlOne(u){
  const f = u.f;
  if (f.lan) f._save = true;   // PC 서재 파일은 받아 두기에서만 기기에 남긴다
  if (u.video) return dlVideo(f);
  if (!u.epub){ const b = await f.blob(); if (b?.size && f.cacheKey && !(await dlHas(f.cacheKey))) throw new Error('full'); return; }
  // EPUB: 글은 readEpub 이 기기에 남기고, 그림은 읽으면 entCached 가 남긴다. 구간으로 읽지 않는 것은 파일 통째로 이미 남아 있다
  const e = await readEpub(f);
  if (dlRanged(f)){
    const names = [...new Set(e.chapters.flatMap(c => c.imgs))];
    const pre = 'ze:' + dlEkey(f) + '|'; const keys = await dlKeys();
    const todo = names.filter(n => !keys.has(pre + n));
    DLA.total += todo.length;   // 큰 웹툰 EPUB 은 파일 하나에 그림 수천 장: 진행 막대가 그림마다 움직이게
    for (let a = 0; a < todo.length && !DLA.stop; a += 48){
      const part = todo.slice(a, a + 48);
      try{ await e.zip.prefetch?.(part); }catch{}   // 디스크에서 붙어 있는 그림은 묶어서 몇 번에 받는다
      let k = 0;
      await Promise.all(Array.from({length: 6}, async () => { while (k < part.length && !DLA.stop){ await e.zip.file(part[k++])?.async('blob'); DLA.done++; dlTick(); } }));
    }
    if (DLA.stop) return;
    const now = await dlKeys(); if (names.some(n => !now.has(pre + n))) throw new Error('full');
  }
  await idb.tx('readwrite', s => s.put({id: 'zd:' + dlEkey(f)}), 'dcache');   // 다 받았다는 표시
}
// 구글 토큰이 끝났으면(웹) 화면 누름으로 새로 받을 때까지 기다린다. 받았으면 true
async function dlWaitToken(){
  gdArmRenew();
  DLA.msg = '구글 연결이 끝났어요 · 화면을 한 번 누르면 이어서 받아요'; dlBtn();
  const until = Date.now() + 10 * 60e3;
  while (!DLA.stop && Date.now() < until){
    if (GD.token && Date.now() < GD.exp - 60000){ DLA.msg = ''; return true; }
    await dlSleep(800);
  }
  DLA.msg = ''; return false;
}
async function dlRun(w){
  const plan = dlPlan(w); if (!plan.total) return;
  const size = dlSize(plan.bytes);
  if (!confirm(`'${w.name}' ${plan.eps.toLocaleString()}화를 이 기기에 받아 둘까요?\n(파일 ${plan.total.toLocaleString()}개${size ? ' · 약 ' + size : ''})${plan.videos.length ? `\n영상 ${plan.videos.length}편도 함께 받아요. 와이파이를 추천해요.` : ''}\n\n${dlNote()}\n받는 동안 앱을 켜 두세요.`)) return;
  try{ await navigator.storage?.persist?.(); }catch{}
  try{ const e = await navigator.storage?.estimate?.();   // 자리가 모자랄 것 같으면 미리 알린다
    if (e?.quota && plan.bytes && e.quota - e.usage < plan.bytes * 1.2 && !confirm(`기기 저장 공간이 모자랄 수 있어요 (남은 ${dlSize(e.quota - e.usage)} · 받을 약 ${size}). 그래도 받을까요?`)) return; }catch{}
  Object.assign(DLA, {on: true, stop: false, full: false, done: 0, fail: 0, total: plan.total, key: w.key, msg: ''});
  dlBtn();
  let lock = null; try{ lock = await navigator.wakeLock?.request('screen'); }catch{}   // 화면이 꺼지면 폰이 앱을 멈춘다
  const queue = [...plan.files.map(f => ({f})), ...plan.epubs.map(f => ({f, epub: true})), ...plan.videos.map(f => ({f, video: true}))];
  const worker = async () => {
    while (!DLA.stop && queue.length){
      const u = queue.shift();
      try{ await dlOne(u); if (!DLA.stop) DLA.done++; }
      catch(e){
        if (e?.message === 'auth' && !DESKTOP){ queue.unshift(u); if (!(await dlWaitToken())) DLA.stop = true; continue; }
        if (e?.message === 'full'){ DLA.full = true; DLA.stop = true; continue; }
        u.n = (u.n || 0) + 1;
        if (u.n < 3){ await dlSleep(1500 * u.n); queue.push(u); continue; }   // 잠깐 끊김·요청 한도는 다시 해 본다
        DLA.fail++;
      }
      dlTick();
    }
  };
  await Promise.all(Array.from({length: DL_WORKERS}, worker));
  try{ await lock?.release(); }catch{}
  DLA.on = false; await dlBtn(); showStore();
  const st = await dlState(w); const left = st ? st.total - st.have : 0; keptSet(w.key, !left);
  if (DLA.full) toast('기기 저장 공간이 모자라 멈췄어요. 받은 데까지는 남아 있어요');
  else if (DLA.stop) toast('받기를 멈췄어요. 받은 데까지는 기기에 남아요');
  else if (left) toast(`받기 끝 · ${left.toLocaleString()}개는 받지 못했어요. 다시 누르면 안 받은 것만 이어 받아요`);
  else toast(`'${w.name}'을 기기에 다 받아 뒀어요`);
}
// 받아 둔 것 지우기 (이 작품 것만)
async function dlDelete(w){
  const plan = dlPlan(w);
  if (!confirm(`'${w.name}'의 받아 둔 파일을 기기에서 지울까요? (메모·진도는 남아요)`)) return;
  const mine = new Set([...plan.files, ...plan.epubs, ...plan.videos].map(f => f.cacheKey).filter(Boolean));
  const vids = new Set(plan.videos.map(dlVtail));
  const pre = plan.epubs.map(dlEkey);
  const keys = await idb.tx('readonly', s => s.getAllKeys(), 'dcache').catch(() => []);
  const del = keys.filter(k => typeof k === 'string' && (mine.has(k) || (k.startsWith('vd:') && vids.has(k.slice(3))) || (k.startsWith('vc:') && vids.has(k.slice(3, k.lastIndexOf('|')))) || pre.some(p => k === 'zd:' + p || k === 'ez:' + p || k.startsWith('ze:' + p + '|'))));
  await idb.tx('readwrite', s => { for (const k of del) s.delete(k); }, 'dcache');
  keptSet(w.key, false); toast(`${del.length.toLocaleString()}개를 지웠어요`); showStore(); dlBtn();
}
// 단추·진행 막대 (회차 목록 위)
let dlBtnToken = 0;
async function dlBtn(){
  const b = $('#epDl'), row = $('#epDlRow'); if (!b || !cur) return;
  const w = cur;
  if (DLA.on && DLA.key === w.key){
    b.hidden = false; b.classList.remove('ok'); b.textContent = '멈추기'; row.hidden = false;
    row.querySelector('i').style.width = DLA.total ? Math.round(DLA.done / DLA.total * 100) + '%' : '0';
    row.querySelector('span').textContent = DLA.msg || `받는 중… ${DLA.done.toLocaleString()} / ${DLA.total.toLocaleString()}${DLA.fail ? ` · 못 받음 ${DLA.fail}` : ''}`;
    return;
  }
  const tok = ++dlBtnToken;
  const st = await dlState(w);
  if (tok !== dlBtnToken || cur !== w || (DLA.on && DLA.key === w.key)) return;
  row.hidden = true;
  if (!st){ b.hidden = true; return; }
  b.hidden = false;
  keptSet(w.key, st.have >= st.total);
  if (st.have >= st.total){ b.classList.add('ok'); b.textContent = '받아 둠 ✓'; b.title = '누르면 받아 둔 것을 지워요'; }
  else { b.classList.remove('ok'); b.textContent = st.have ? '마저 받기' : '전체 받기'; b.title = `${st.eps.toLocaleString()}화를 기기에 받아 둬요`; }
}
$('#epDl').onclick = () => {
  if (!cur) return;
  if (DLA.on){ if (DLA.key === cur.key) DLA.stop = true; else toast('다른 작품을 받는 중이에요'); return; }
  if ($('#epDl').classList.contains('ok')) return dlDelete(cur);
  dlRun(cur);
};
{ const _r = renderEpList; renderEpList = function(){ _r(); dlBtn(); }; }
// 다음 화 미리 받기: 멀리 있는 작품(드라이브·PC 서재)은 회차를 열면 다음 화를 조용히 받아 둔다 — 넘길 때 기다리지 않는다
// (글은 통째로, 그림 화는 앞 석 장만: 데이터를 아끼면서 첫 장은 바로 뜨게)
async function dlaNext(w, i){
  if (DLA.on) return;   // 전체 받기 중에는 끼어들지 않는다
  const ep = w.eps[i + 1]; if (!ep || ep.type === 'video') return;
  try{
    if (ep.type === 'imgs'){ for (const f of ep.files.slice(0, 3)){ if (w !== cur || DLA.on) return; if (f?.isLazy && f.remote) await f.blob(); } }
    else if (ep.file?.isLazy && ep.file.remote && !DL_ZIP.test(ep.file.name)) await ep.file.blob();
  }catch{}
}
// 못 연 화(인터넷·PC 가 끊겼는데 받아 두지 않은 화)는 앞 화면을 그대로 두지 않고 알린다
const dlOpenFail = e => { console.warn(e); toast(LAN_BASE ? '이 화를 열지 못했어요. PC 가 켜져 있는지 봐 주세요' : '이 화를 열지 못했어요. 인터넷 연결을 봐 주세요'); };
{ const _o = openEp; openEp = async function(...a){
  let r; try{ r = await _o(...a); }catch(e){ return dlOpenFail(e); }
  if (cur && curEp >= 0) setTimeout(() => { if (cur) dlaNext(cur, curEp); }, 800); return r; }; }
{ const _w = openWork; openWork = async function(w){ try{ return await _w(w); }catch(e){ dlOpenFail(e); } }; }
window.nvDl = {run: dlRun, plan: dlPlan, state: dlState, note: dlNote, DLA};   // 시험용
