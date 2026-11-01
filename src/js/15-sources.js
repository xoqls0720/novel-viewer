/* ================= 작품 폴더 연결 (내 컴퓨터 폴더 · 구글 드라이브 폴더) ================= */
// 한 번 연결해 두면 켤 때마다 저절로 불러온다. 파일은 그 자리에 두고, 열 때 그 화만 읽는다.
// 연결 목록은 기기마다 따로(store 'lib.sources'): {id, kind:'disk'|'drive', name, path?, folderId?, t}
function libSources(){ return store.get('lib.sources', []).filter(s => s.id !== '__pending'); }
function libSave(list){ store.set('lib.sources', list); renderSources(); }
// 드라이브 폴더 고르기를 끝내지 않고 꺼진 자국('__pending')이 남으면 읽기 권한을 계속 달라고 해서, PC 는 다시 쓰는 토큰이 맞지 않아 구글 연결이 저절로 꺼졌다
if (store.get('lib.sources', []).some(s => s.id === '__pending')) store.set('lib.sources', libSources());

/* ---------- 내 컴퓨터 폴더 (윈도우 프로그램) ---------- */
async function diskFiles(src){
  const list = await window.nvDesktop.libScan(src.path);
  // 성인 폴더 안의 '만화'·'영상'을 따로 연결했으면 경로 앞에 '성인/' 을 붙여 성인 칸으로 모은다
  const parent = src.path.split(/[\\/]/).slice(-2, -1)[0];
  if (parent === '성인') for (const f of list) f.rel = '성인/' + f.rel;
  // abs: 영상은 통째로 읽지 않고 이 주소로 흘려 보며 재생한다(앞뒤로 넘기기 됨)
  return list.map(f => Object.assign(new LazyFile({name: f.rel.split('/').pop(), size: f.size, mtime: f.mtime, rel: f.rel,
    get: async () => { const r = await fetch('app://novel/__disk/?p=' + encodeURIComponent(f.abs)); if (!r.ok) throw new Error('읽지 못했어요'); return r.blob(); }}), {abs: f.abs, streamUrl: 'app://novel/__disk/?p=' + encodeURIComponent(f.abs)}));
}

/* ---------- 구글 드라이브 폴더 ---------- */
const DRIVE_FOLDER = 'application/vnd.google-apps.folder';
async function driveList(q){
  const out = []; let page = '';
  do{
    const r = await gdFetch(`${GD_API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,shortcutDetails,parents)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`);
    const j = await r.json(); out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page);
  return out;
}
// 폴더 아래를 모두 훑어 파일 목록(경로 포함)을 만든다. 한 번 만든 목록은 기기에 저장해 다음엔 바로 쓴다.
// 폴더 40개를 한 번에 묻는다(parents 로 어느 폴더 것인지 가른다): 폴더 2천 개 서재도 요청 수십 번이면 끝난다
const DRV_KIND = /^(성인|노벨|소설|novel|웹툰|webtoon|만화|망가|manga|comic|영상|video|갤러리)$/i;
async function driveIndex(src, onProgress){
  // 연결한 폴더가 '만화'·'웹툰' 같은 종류 폴더가 아니면(예: 서재를 통째로 담은 '노벨리스트') 경로에서 빼서, PC 와 같은 '만화/작품' 경로·열쇠가 되게 한다
  // (예전엔 '노벨리스트' 의 '노벨' 때문에 그 안의 만화·웹툰이 모두 소설로 잡혔다)
  const files = [], seen = new Set(); let level = [{id: src.folderId, path: DRV_KIND.test(src.name) ? src.name : ''}], folders = 0;
  while (level.length){
    const next = [], groups = []; for (let i = 0; i < level.length; i += 40) groups.push(level.slice(i, i + 40));
    let gi = 0;
    const worker = async () => {
      while (gi < groups.length){
        const g = groups[gi++].filter(x => !seen.has(x.id)); if (!g.length) continue; g.forEach(x => seen.add(x.id)); folders += g.length;
        const pathOf = new Map(g.map(x => [x.id, x.path]));
        for (const f of await driveList('(' + g.map(x => `'${x.id}' in parents`).join(' or ') + ') and trashed=false')){
          const parent = (f.parents || []).find(p => pathOf.has(p)); if (!parent) continue; const path = pathOf.get(parent);
          const target = f.mimeType === 'application/vnd.google-apps.shortcut' ? f.shortcutDetails : null;
          const sub = path ? path + '/' + f.name : f.name;
          if (f.mimeType === DRIVE_FOLDER || target?.targetMimeType === DRIVE_FOLDER){ next.push({id: target?.targetId || f.id, path: sub}); continue; }
          if (target || f.mimeType.startsWith('application/vnd.google-apps.')) continue;   // 구글 문서 등은 건너뛴다
          files.push({id: f.id, rel: path ? sub : '낱개/' + f.name, size: +f.size || 0, mtime: Date.parse(f.modifiedTime) || 0});
        }
        onProgress?.(folders, files.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    level = next;
  }
  // 같은 이름이 겹치면 뒤에 번호를 붙인다
  const used = new Set(); for (const f of files){ let r = f.rel, k = 2; while (used.has(r)) r = f.rel.replace(/(\.[^./]+)?$/, ` (${k++})$1`); f.rel = r; used.add(r); }
  return files;
}
// 드라이브 파일을 구간(Range)으로 읽는 주소: 토큰을 주소에 붙여서 <video> 와 구간 읽기가 그대로 쓴다 (토큰은 한 시간짜리)
const driveMediaUrl = id => `${GD_API}/files/${id}?alt=media&supportsAllDrives=true&access_token=${encodeURIComponent(GD.token)}`;
// 한 번 받은 파일은 기기(IndexedDB 'dcache')에 남겨서 다음엔 인터넷 없이도 연다
const DRV_INFLIGHT = new Map();
function driveBlob(f){
  if (!DRV_INFLIGHT.has(f.id)) DRV_INFLIGHT.set(f.id, driveBlob0(f).finally(() => DRV_INFLIGHT.delete(f.id)));
  return DRV_INFLIGHT.get(f.id);
}
async function driveBlob0(f){
  try{ const c = await idb.tx('readonly', s => s.get(f.id), 'dcache'); if (c && c.mtime === f.mtime) return c.blob; }catch{}
  const r = await gdFetch(`${GD_API}/files/${f.id}?alt=media&supportsAllDrives=true`);
  const b = await r.blob();
  try{ await idb.tx('readwrite', s => s.put({id: f.id, blob: b, mtime: f.mtime}), 'dcache'); }catch{}
  return b;
}
function driveLazy(idx){
  return idx.map(f => { const lf = Object.assign(new LazyFile({name: f.rel.split('/').pop(), size: f.size, mtime: f.mtime, rel: f.rel, get: () => driveBlob(f)}), {remote: true});
    // 큰 EPUB·zip 은 필요한 구간만 (통째로 받지 않는다). 영상도 이 주소로 흘려 본다
    lf.rangeUrl = async () => { await gdToken(false); return driveMediaUrl(f.id); };
    Object.defineProperty(lf, 'streamUrl', {get: () => GD.token && Date.now() < GD.exp - 60000 ? driveMediaUrl(f.id) : undefined});
    return lf; });
}
// 드라이브에서 무엇이 바뀌었는지 묻는 표(changes). 목록을 만들기 전에 받아 두고, 다음에 이것으로 '바뀐 게 있나'만 싸게 묻는다
const drvChangeMark = async () => (await (await gdFetch(`${GD_API}/changes/startPageToken?supportsAllDrives=true`)).json()).startPageToken || '';
async function drvChanged(ct){
  if (!ct) return true;
  const j = await (await gdFetch(`${GD_API}/changes?pageToken=${encodeURIComponent(ct)}&pageSize=1&spaces=drive&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=changes(fileId),newStartPageToken,nextPageToken`)).json();
  return j.changes?.length ? true : j.newStartPageToken || ct;   // 바뀐 게 없으면 새 표를 돌려준다
}
async function driveIndexSave(src){
  const ct = await drvChangeMark().catch(() => '');
  const idx = await driveIndex(src, (d, n) => srcStatus(src.id, `목록 받는 중… 폴더 ${d}개 · 파일 ${n}개`));
  try{ await idb.tx('readwrite', s => s.put({id: '__idx2:' + src.id, files: idx, t: Date.now(), ct}), 'dcache'); }catch{}
  return idx;
}
// 켤 때는 이 기기에 저장해 둔 목록으로 서재를 바로 보이고, 그다음 드라이브에 새로 올라간·지운 작품을 뒤에서 맞춘다 (예전엔 한 번 받은 목록을 '새로 고침' 전까지 그대로 써서 나중에 올라간 작품이 안 보였다)
async function driveFiles(src, refresh){
  let rec = null;
  if (!refresh){ try{ rec = await idb.tx('readonly', s => s.get('__idx2:' + src.id), 'dcache'); }catch{} }
  if (rec?.files){ setTimeout(() => driveRefresh(src), 1200); return driveLazy(rec.files); }
  return driveLazy(await driveIndexSave(src));
}
// 작품 단위 열쇠: '만화/작품', 성인은 '성인/만화/작가' (그 아래 회차·파일이 바뀌면 그 작품만 다시 묶는다)
// (파일 이름은 넣지 않는다: '낱개/책.epub' 은 '낱개' 한 묶음이라, 하나만 다시 넣으면 나머지가 빠진다)
const drvWorkOf = rel => { const s = rel.split('/'); return s.slice(0, Math.min(s.length - 1, s[0] === '성인' ? 3 : 2)).join('/'); };
const DRV_REF = {busy: new Set(), t: {}, loaded: new Set()};
async function driveRefresh(src, {force = false} = {}){
  if (DRV_REF.busy.has(src.id) || !libSources().some(s => s.id === src.id)) return;
  DRV_REF.busy.add(src.id);
  try{
    let rec = null; try{ rec = await idb.tx('readonly', s => s.get('__idx2:' + src.id), 'dcache'); }catch{}
    if (!rec?.files) return;
    if (!force){
      const ch = await drvChanged(rec.ct);
      if (ch !== true){ DRV_REF.t[src.id] = Date.now(); if (ch !== rec.ct) try{ await idb.tx('readwrite', s => s.put({...rec, ct: ch}), 'dcache'); }catch{} return; }
    }
    const idx = await driveIndexSave(src); DRV_REF.t[src.id] = Date.now();
    const sig = f => f.rel + '|' + f.size + '|' + f.mtime;
    const oldSig = new Set(rec.files.map(sig)), newSig = new Set(idx.map(sig));
    const touched = new Set([...rec.files.filter(f => !newSig.has(sig(f))), ...idx.filter(f => !oldSig.has(sig(f)))].map(f => drvWorkOf(f.rel)));
    srcStatus(src.id, `파일 ${idx.length.toLocaleString()}개 · ${new Date().toLocaleTimeString('ko-KR', {hour: 'numeric', minute: '2-digit'})}`);
    if (!touched.size) return;
    // 지워진 작품은 서재에서 빼고, 바뀌거나 새로 올라간 작품만 다시 묶는다
    const alive = new Set(idx.map(f => drvWorkOf(f.rel)));
    const gone = w => w.paths?.length && w.eps.every(e => [e.file, ...(e.files || [])].every(f => !f || f.remote)) && w.paths.every(p => touched.has(drvWorkOf(p)) && !alive.has(drvWorkOf(p)));
    const before = works.length; for (let i = works.length - 1; i >= 0; i--) if (gone(works[i])) works.splice(i, 1);
    const add = idx.filter(f => touched.has(drvWorkOf(f.rel)));
    if (add.length) await addFiles(driveLazy(add), {persist: false, quiet: true}); else renderLib();
    const n = add.length ? new Set(add.map(f => drvWorkOf(f.rel))).size : 0;
    if (n || works.length < before) toast(`드라이브에서 작품 ${n ? n + '개를 새로 맞췄어요' : (before - works.length) + '개가 빠졌어요'}`);
  }catch(e){ if (e.message === 'auth') DRV_REF.wait = true; }   // 토큰이 끝났다 → 화면을 한 번 누르면(새 토큰) 이어서
  finally{ DRV_REF.busy.delete(src.id); }
}
// 앱으로 돌아왔을 때(5분 넘게 지났으면) · 새 토큰을 받은 뒤에 드라이브 서재를 다시 맞춘다
window.drvRefreshAll = (minAge = 0) => { DRV_REF.wait = false; for (const s of libSources()) if (s.kind === 'drive' && Date.now() - (DRV_REF.t[s.id] || 0) > minAge) driveRefresh(s); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !DESKTOP) window.drvRefreshAll(5 * 60e3); });

/* ---------- 불러오기 ---------- */
const SRC_STATE = {};
function srcStatus(id, t){ SRC_STATE[id] = t; const el = document.querySelector(`[data-src="${id}"] .st`); if (el) el.textContent = t; }
// 내 컴퓨터 폴더가 옮겨졌으면(바탕 화면 → OneDrive 등) 같은 이름의 폴더를 찾아 이어 붙인다. 작품 열쇠는 폴더 이름으로 만들어서 진도·메모가 그대로 이어진다.
async function diskRelink(src){
  const info = await window.nvDesktop.libInfo?.(src.path); if (!info || info.exists) return true;
  srcStatus(src.id, '폴더가 옮겨졌는지 찾는 중…');
  const found = await window.nvDesktop.libFind?.(src.path);
  if (!found){ src.missing = true; srcStatus(src.id, '폴더를 찾을 수 없어요 → "다시 고르기"'); renderSources(); return false; }
  const list = libSources(); const me = list.find(x => x.id === src.id); if (me){ me.path = found; delete me.missing; } src.path = found; delete src.missing;
  libSave(list); toast(`'${src.name}' 폴더가 옮겨져서 새 자리로 다시 연결했어요`);
  return true;
}
async function loadSource(src, {refresh = false, quiet = true} = {}){
  try{
    if (src.kind === 'disk' && !(await diskRelink(src))) return;
    srcStatus(src.id, '불러오는 중…');
    const files = src.kind === 'disk' ? await diskFiles(src) : src.kind === 'onedrive' ? await odFiles(src, refresh) : await driveFiles(src, refresh);
    const before = works.length;
    await addFiles(files, {persist: false, quiet: true}); DRV_REF.loaded.add(src.id);
    srcStatus(src.id, `파일 ${files.length.toLocaleString()}개 · ${new Date().toLocaleTimeString('ko-KR', {hour: 'numeric', minute: '2-digit'})}`);
    if (!quiet) toast(`${src.name}: 작품 ${works.length - before > 0 ? (works.length - before) + '개를 새로 ' : ''}불러왔어요`);
  }catch(e){
    const login = /auth|scope|setup|popup|timeout/.test(e.message); if (login && src.kind === 'drive') DRV_REF.wait = true;
    const who = src.kind === 'onedrive' ? 'Microsoft' : '구글';
    srcStatus(src.id, login ? `${who} 연결이 필요해요 → 위 단추로 다시 연결` : '불러오지 못했어요 (' + e.message + ')');
    if (!quiet) toast(login ? `${src.kind === 'onedrive' ? 'OneDrive' : '구글 드라이브'}에 다시 연결해 주세요 (설정 탭 → 연결)` : `${src.name}을 불러오지 못했어요`);
  }
}
async function loadAllSources(){
  for (const s of libSources()){
    if (s.kind === 'disk' && !DESKTOP) continue;
    if (s.kind === 'drive' && !gdReady()) { srcStatus(s.id, '설정 탭에서 구글 드라이브를 먼저 연결해 주세요'); continue; }
    if (s.kind === 'onedrive' && !(odReady() && odLinked())) { srcStatus(s.id, '설정 탭에서 OneDrive를 먼저 연결해 주세요'); continue; }
    await loadSource(s);
  }
  driveAutoLink();
}
// 폰·웹: 구글로 맞추는데 드라이브 서재를 아직 연결하지 않았으면, 내 드라이브 맨 위의 '노벨리스트' 폴더(PC 가 받는 곳)를 찾아 저절로 연결한다
const DRV_HOME = ['노벨리스트', 'Novelist'];
async function driveAutoLink(){
  if (DESKTOP || !gdLinked() || SYNC_OD() || libSources().some(s => s.kind === 'drive') || store.get('lib.driveAuto', true) === false) return;
  try{
    const q = `'root' in parents and mimeType='${DRIVE_FOLDER}' and trashed=false and (${DRV_HOME.map(n => `name='${n}'`).join(' or ')})`;
    const f = (await driveList(q))[0]; if (!f || libSources().some(s => s.kind === 'drive')) return;
    const src = {id: uid(), kind: 'drive', name: f.name, folderId: f.id, t: Date.now()};
    libSave([...libSources(), src]); toast(`구글 드라이브의 '${f.name}' 폴더를 서재로 연결했어요`);
    await loadSource(src, {quiet: false});
  }catch(e){ if (e.message === 'auth' || e.message === 'scope') DRV_REF.wait = true; }
}
// 새 토큰을 받은 뒤(웹: 화면을 누른 뒤): 못 불러온 드라이브 서재는 불러오고, 불러온 것은 바뀐 것만 맞춘다
window.drvAfterToken = force => {
  if (!DRV_REF.wait && !force) return; DRV_REF.wait = false;
  for (const s of libSources()) if (s.kind === 'drive') DRV_REF.loaded.has(s.id) ? driveRefresh(s) : loadSource(s);
  driveAutoLink();
};

/* ---------- 화면 ---------- */
function renderSources(){
  const box = $('#srcList'); if (!box) return; const list = libSources();
  box.innerHTML = list.length ? '' : '<div class="hint">아직 연결한 폴더가 없어요.</div>';
  for (const s of list){
    const d = document.createElement('div'); d.className = 'src'; d.dataset.src = s.id;
    d.innerHTML = `<div class="nm"><b></b><span class="k">${({disk: '내 컴퓨터', onedrive: 'OneDrive'})[s.kind] || '구글 드라이브'}</span></div><div class="hint p"></div><div class="hint st"></div><div class="row tight"><button data-a="re">새로 고침</button>${s.kind === 'disk' ? '<button data-a="pick">다시 고르기</button>' : ''}<button data-a="rm">연결 끊기</button></div>`;
    d.querySelector('b').textContent = s.name; d.querySelector('.p').textContent = s.kind === 'disk' ? s.path : '';
    d.querySelector('.st').textContent = SRC_STATE[s.id] || '';
    d.querySelector('[data-a=re]').onclick = () => loadSource(s, {refresh: true, quiet: false});
    const pk = d.querySelector('[data-a=pick]'); if (pk) pk.onclick = async () => { const p = await window.nvDesktop.libRepick?.(s.path); if (!p) return; const list = libSources(); const me = list.find(x => x.id === s.id); if (me){ me.path = p; delete me.missing; } libSave(list); loadSource(me || s, {quiet: false}); };
    d.querySelector('[data-a=rm]').onclick = async () => {
      if (!confirm(`'${s.name}' 연결을 끊을까요? (원래 파일은 그대로 있어요. 메모·진도도 남아요)`)) return;
      libSave(libSources().filter(x => x.id !== s.id)); if (s.kind === 'drive') store.set('lib.driveAuto', false);   // 끊었으면 다시 저절로 잇지 않는다
      if (s.kind === 'drive' || s.kind === 'onedrive') try{ await idb.tx('readwrite', st => st.delete('__idx2:' + s.id), 'dcache'); }catch{}
      toast('연결을 끊었어요. 다시 켜면 목록에서 빠져요');
    };
    box.append(d);
  }
  $('#srcDisk').hidden = !DESKTOP;
}
$('#btnLink').onclick = () => { $('#app').classList.remove('show-side'); const open = $('#linkSheet').classList.contains('open'); closeSheets(); if (!open){ $('#linkSheet').classList.add('open'); $('#drvBrowse').hidden = true; renderSources(); } };
$('#linkClose').onclick = closeSheets;
$('#srcDisk').onclick = async () => {
  const p = await window.nvDesktop.libPick(); if (!p) return;
  if (libSources().some(s => s.kind === 'disk' && s.path === p)) return toast('이미 연결한 폴더예요');
  // '노벨'·'만화'·'웹툰'이 바로 아래에 있으면 하나씩 따로 연결한다(종류가 맞게 나뉘게)
  const kids = ((await window.nvDesktop.libInfo?.(p))?.dirs || []).filter(n => KIND_DIR.test(n));
  const sep = p.includes('\\') ? '\\' : '/';
  const add = (kids.length ? kids.map(n => p + sep + n) : [p]).filter(x => !libSources().some(s => s.kind === 'disk' && s.path === x)).map(x => ({id: uid(), kind: 'disk', name: x.split(/[\\/]/).pop(), path: x, t: Date.now()}));
  if (!add.length) return toast('이미 연결한 폴더예요');
  libSave([...libSources(), ...add]); if (kids.length) toast(`${add.map(s => s.name).join('·')} 폴더를 따로 연결했어요`);
  for (const src of add) await loadSource(src, {quiet: false});
};
// 드라이브 폴더 고르기: 내 드라이브(또는 공유 문서함)에서 폴더를 따라 들어가 '이 폴더 연결'
const DRV = {stack: []};
$('#srcDrive').onclick = async () => {
  if (!gdReady()) return toast(!gdClientId() ? '설정 → 기기끼리 맞추기 → 고급에 구글 클라이언트 ID를 넣어 주세요' : '구글 드라이브는 https 주소(설치한 앱)에서 연결할 수 있어요');
  // 읽기 권한을 함께 받도록 임시로 표시해 두고 로그인
  store.set('lib.sources', [...libSources(), {id: '__pending', kind: 'drive'}]);
  try{ gdForget(); await gdToken(true); }
  catch(e){ store.set('lib.sources', libSources().filter(s => s.id !== '__pending')); return /nosecret/.test(e.message) ? gdNeedSecret() : toast('구글 로그인을 마치지 못했어요 (' + e.message + ')'); }
  DRV.kind = 'drive'; DRV.stack = [{id: 'root', name: '내 드라이브'}]; $('#drvBrowse').hidden = false; drvRender();
};
async function drvRender(){
  const here = DRV.stack.at(-1); const box = $('#drvList');
  $('#drvPath').textContent = DRV.stack.map(x => x.name).join(' › ');
  $('#drvUp').disabled = DRV.stack.length < 2; $('#drvPick').disabled = here.id === 'root' || here.id === 'shared';
  box.innerHTML = '<div class="hint">불러오는 중…</div>';
  if (DRV.kind === 'od'){ $('#drvPick').disabled = false; try{ const fs = await odFolders(here.id); box.innerHTML = ''; for (const f of fs){ const d = document.createElement('div'); d.className = 'it'; d.innerHTML = `<svg class="i"><use href="#i-folder"/></svg><span></span><small class="hint" style="margin-left:auto">${f.n ?? ''}</small>`; d.querySelector('span').textContent = f.name; d.onclick = () => { DRV.stack.push({id: f.id, name: f.name}); drvRender(); }; box.append(d); } if (!fs.length) box.innerHTML = '<div class="hint">안에 폴더가 없어요. 이 폴더를 연결하면 돼요.</div>'; }catch(e){ box.innerHTML = `<div class="hint">목록을 받지 못했어요 (${esc(e.message)})</div>`; } return; }
  try{
    const q = here.id === 'shared' ? `sharedWithMe and mimeType='${DRIVE_FOLDER}' and trashed=false` : `'${here.id}' in parents and mimeType='${DRIVE_FOLDER}' and trashed=false`;
    const fs = (await driveList(q)).sort((a, b) => natural(a.name, b.name));
    box.innerHTML = '';
    if (here.id === 'root') fs.unshift({id: 'shared', name: '공유 문서함', _virtual: true});
    for (const f of fs){ const d = document.createElement('div'); d.className = 'it'; d.innerHTML = `<svg class="i"><use href="#i-folder"/></svg><span></span>`; d.querySelector('span').textContent = f.name; d.onclick = () => { DRV.stack.push({id: f.id, name: f.name}); drvRender(); }; box.append(d); }
    if (!fs.length) box.innerHTML = '<div class="hint">안에 폴더가 없어요. 이 폴더를 연결하면 돼요.</div>';
  }catch(e){ box.innerHTML = `<div class="hint">목록을 받지 못했어요 (${esc(e.message)})</div>`; }
}
$('#drvUp').onclick = () => { if (DRV.stack.length > 1){ DRV.stack.pop(); drvRender(); } };
$('#drvCancel').onclick = () => { $('#drvBrowse').hidden = true; store.set('lib.sources', libSources().filter(s => s.id !== '__pending')); };
$('#drvPick').onclick = () => {
  const here = DRV.stack.at(-1);
  if (DRV.kind === 'od') return here.id === 'root' ? toast('OneDrive 맨 위는 너무 커요. 작품 폴더로 들어가서 연결해 주세요') : odPick(here);
  const list = libSources().filter(s => s.id !== '__pending');
  if (list.some(s => s.kind === 'drive' && s.folderId === here.id)) return toast('이미 연결한 폴더예요');
  const src = {id: uid(), kind: 'drive', name: here.name, folderId: here.id, t: Date.now()}; store.set('lib.driveAuto', true);
  libSave([...list, src]); $('#drvBrowse').hidden = true; loadSource(src, {quiet: false});
};
renderSources();
// 켜면 저장해 둔 작품을 불러온 다음, 연결한 폴더도 불러온다
setTimeout(loadAllSources, 600);
