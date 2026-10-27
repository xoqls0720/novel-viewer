/* ================= OneDrive: 기기끼리 맞추기 · 작품 폴더 연결 ================= */
// 로그인은 마이크로소프트 계정(PKCE, 비밀번호 없음). 웹·아이패드는 이 페이지로 돌아오는 방식, 윈도우 프로그램은 기본 브라우저 + localhost.
// 맞추기 파일은 OneDrive '앱/Novelist' 폴더(approot)에만 쓰고, 작품 폴더는 읽기만 한다.
// 다시 쓰는 토큰(refresh token)은 'nv.' 밖에 둬서 백업·동기화 파일에 섞이지 않게 한다.
const OD_CLIENT_ID = 'ff9f05a4-fea1-4696-b178-4978ba3d2a01';   // 앱 등록 후 여기에 넣으면 기기마다 ID를 넣지 않아도 된다(비밀 값이 아니다)
var OD = {token: null, exp: 0, warned: false};
function odClient(){ return store.get('od.client', '') || OD_CLIENT_ID; }
function odAuthBase(){ return 'https://login.microsoftonline.com/consumers/oauth2/v2.0'; }
function odGraph(){ return 'https://graph.microsoft.com/v1.0'; }
function odScope(){ return 'Files.Read Files.ReadWrite.AppFolder offline_access'; }
function odRedirect(){ return location.origin + location.pathname.replace(/index\.html$/, ''); }   // 앱 등록에는 폴더 주소(…/novel-viewer/) 하나만 넣으면 되게
function odWebOk(){ return location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); }
function odReady(){ return !!odClient() && (DESKTOP || odWebOk()); }
function SYNC_OD(){ return store.get('sync.backend', '') === 'od'; }
// 앞 파일의 시작 코드에서 불릴 수 있어 const 대신 함수로 둔다
function odRtGet(){ try{ return localStorage.getItem('nvod.rt') || ''; }catch{ return ''; } }
function odRtSet(v){ try{ v ? localStorage.setItem('nvod.rt', v) : localStorage.removeItem('nvod.rt'); }catch{} }
function odLinked(){ return DESKTOP ? !!store.get('od.linked', false) : !!odRtGet(); }

/* ---------- 로그인 ---------- */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function odPkce(){ const v = b64url(crypto.getRandomValues(new Uint8Array(32))); const c = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))); return {v, c}; }
async function odLoginRedirect(silent = false){
  const {v, c} = await odPkce(); const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem('nvod.pkce', JSON.stringify({v, state, silent}));
  const q = new URLSearchParams({client_id: odClient(), response_type: 'code', redirect_uri: odRedirect(), scope: odScope(), code_challenge: c, code_challenge_method: 'S256', state, response_mode: 'query'});
  if (silent) q.set('prompt', 'none');
  location.assign(`${odAuthBase()}/authorize?${q}`);
}
async function odTokenReq(params){
  const r = await fetch(`${odAuthBase()}/token`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: odClient(), scope: odScope(), ...params})});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error === 'invalid_grant' ? 'auth' : (j.error || 'token ' + r.status)); return j;
}
function odKeep(j){ OD.token = j.access_token || j.token; OD.exp = Date.now() + (j.expires_in || j.expires || 3600) * 1000; if (j.refresh_token) odRtSet(j.refresh_token); return OD.token; }
// 로그인하고 돌아왔을 때(주소에 ?code= 가 붙어 온다)
async function odHandleReturn(){
  const u = new URL(location.href); const code = u.searchParams.get('code'), err = u.searchParams.get('error');
  const saved = JSON.parse(sessionStorage.getItem('nvod.pkce') || 'null');
  if (!saved || (!code && !err)) return false;
  sessionStorage.removeItem('nvod.pkce');
  history.replaceState(null, '', odRedirect() + location.hash);
  if (u.searchParams.get('state') !== saved.state) return false;
  if (err){ odStatus(saved.silent ? 'Microsoft 로그인이 다시 필요해요 → "연결"' : '연결하지 못했어요 (' + err + ')'); return false; }
  try{
    odKeep(await odTokenReq({grant_type: 'authorization_code', code, redirect_uri: odRedirect(), code_verifier: saved.v}));
    if (!store.get('sync.backend', '')) store.set('sync.backend', 'od');
    odUI(); if (!saved.silent) toast('OneDrive에 연결했어요');
    if (SYNC_OD()) setTimeout(() => gdSync(false), 300);
    if (store.get('od.afterLogin', '') === 'browse'){ store.set('od.afterLogin', ''); setTimeout(() => odBrowseOpen(), 400); }
    return true;
  }catch(e){ odStatus('연결하지 못했어요 (' + e.message + ')'); return false; }
}
async function odToken(interactive){
  if (OD.token && Date.now() < OD.exp - 60000) return OD.token;
  if (!odReady()) throw new Error('setup');
  if (DESKTOP){
    let r = await window.nvDesktop.odToken?.(odClient(), odScope()).catch(() => null);
    if (!r && interactive){ toast('기본 브라우저에서 Microsoft 로그인을 마쳐 주세요'); r = await window.nvDesktop.odLogin(odClient(), odScope()); }
    if (!r) throw new Error('auth');
    store.set('od.linked', true); return odKeep(r);
  }
  const rt = odRtGet();
  if (rt){ try{ return odKeep(await odTokenReq({grant_type: 'refresh_token', refresh_token: rt})); }catch(e){ if (e.message === 'auth') odRtSet(''); else throw e; } }
  // 다시 쓰는 토큰이 만료됐으면(웹은 하루) 한 번 조용히 다녀온다: 마이크로소프트에 로그인돼 있으면 바로 돌아온다
  // 읽는 중에는 화면이 바뀌면 안 되니, 작품을 열기 전(켜자마자)에만 한다
  if (interactive || (!cur && store.get('od.silentT', 0) < Date.now() - 10 * 60000 && store.get('od.everLinked', false))){
    store.set('od.silentT', Date.now()); await odLoginRedirect(!interactive); await new Promise(() => {});
  }
  throw new Error('auth');
}
async function odFetch(url, opt = {}, interactive = false){
  const t = await odToken(interactive);
  const r = await fetch(url.startsWith('http') ? url : odGraph() + url, {...opt, headers: {...(opt.headers || {}), Authorization: 'Bearer ' + t}});
  if (r.status === 401){ OD.token = null; throw new Error('auth'); }
  if (r.status === 429 || r.status === 503){ const s = +(r.headers.get('Retry-After') || 3); await new Promise(z => setTimeout(z, Math.min(30, s) * 1000)); return odFetch(url, opt, interactive); }
  if (!r.ok) throw new Error('onedrive ' + r.status);
  return r;
}

/* ---------- 앱 전용 폴더 파일 (09-sync.js 의 gdList·gdPut·gdGet·gdDel 과 같은 모양) ---------- */
async function odList(){
  const map = new Map(); let url = '/me/drive/special/approot/children?$top=999&$select=id,name,size,lastModifiedDateTime,file';
  while (url){ const j = await (await odFetch(url)).json(); for (const f of j.value || []) if (f.file) map.set(f.name, {id: f.id, name: f.name}); url = j['@odata.nextLink'] || ''; }
  return map;
}
const odPath = name => '/me/drive/special/approot:/' + encodeURIComponent(name) + ':';
async function odPut(files, name, blob){
  if (blob.size <= 4 * 1048576){
    const it = await (await odFetch(odPath(name) + '/content', {method: 'PUT', body: blob, headers: {'Content-Type': blob.type || 'application/octet-stream'}})).json();
    files.set(name, {id: it.id, name}); return;
  }
  // 4MB 넘는 그림은 나눠 올린다 (조각은 320KiB 배수)
  const s = await (await odFetch(odPath(name) + '/createUploadSession', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({item: {'@microsoft.graph.conflictBehavior': 'replace'}})})).json();
  const CH = 320 * 1024 * 15; let it = null;
  for (let at = 0; at < blob.size; at += CH){
    const part = blob.slice(at, Math.min(blob.size, at + CH));
    const r = await fetch(s.uploadUrl, {method: 'PUT', body: part, headers: {'Content-Range': `bytes ${at}-${at + part.size - 1}/${blob.size}`}});
    if (!r.ok && r.status !== 202) throw new Error('upload ' + r.status);
    if (r.status === 200 || r.status === 201) it = await r.json();
  }
  if (it) files.set(name, {id: it.id, name});
}
// 내려받기는 미리 서명된 주소(@microsoft.graph.downloadUrl)로 한다: /content 는 다른 곳으로 넘겨서 브라우저가 막는다
async function odDownloadUrl(id){ const j = await (await odFetch(`/me/drive/items/${id}?$select=id,@microsoft.graph.downloadUrl`)).json(); return j['@microsoft.graph.downloadUrl']; }
async function odGet(files, name, as = 'json'){
  const f = files.get(name); if (!f) return null;
  const r = await fetch(await odDownloadUrl(f.id)); if (!r.ok) throw new Error('download ' + r.status);
  return as === 'json' ? r.json() : r.blob();
}
async function odDel(files, name){ const f = files.get(name); if (f){ await odFetch(`/me/drive/items/${f.id}`, {method: 'DELETE'}).catch(() => {}); files.delete(name); } }

/* ---------- 작품 폴더 (OneDrive) ---------- */
// 폴더 아래 전부를 delta 로 한 번에 받는다(개인 OneDrive). 안 되면 폴더마다 따라 내려간다.
async function odIndex(src, onProgress){
  const items = new Map(); let url = `/me/drive/items/${src.folderId}/delta?$select=id,name,size,file,folder,parentReference,lastModifiedDateTime,deleted`; let n = 0;
  try{
    while (url){ const j = await (await odFetch(url)).json(); for (const it of j.value || []){ if (it.deleted) items.delete(it.id); else items.set(it.id, it); } n += (j.value || []).length; onProgress?.(n); url = j['@odata.nextLink'] || ''; }
  }catch(e){ if (e.message === 'auth') throw e; return odIndexWalk(src, onProgress); }
  const pathOf = new Map([[src.folderId, src.name]]);
  const resolve = id => { if (pathOf.has(id)) return pathOf.get(id); const it = items.get(id); if (!it) return null; const pp = resolve(it.parentReference?.id); const p = pp === null ? null : pp + '/' + it.name; pathOf.set(id, p); return p; };
  const files = [];
  for (const it of items.values()){ if (!it.file || it.id === src.folderId) continue; const pp = resolve(it.parentReference?.id); if (pp) files.push({id: it.id, rel: pp + '/' + it.name, size: it.size || 0, mtime: Date.parse(it.lastModifiedDateTime) || 0}); }
  return files;
}
async function odIndexWalk(src, onProgress){
  const files = [], queue = [{id: src.folderId, path: src.name}];
  const worker = async () => {
    while (queue.length){
      const {id, path} = queue.shift(); let url = `/me/drive/items/${id}/children?$top=999&$select=id,name,size,file,folder,lastModifiedDateTime`;
      while (url){ const j = await (await odFetch(url)).json(); for (const it of j.value || []){ if (it.folder) queue.push({id: it.id, path: path + '/' + it.name}); else if (it.file) files.push({id: it.id, rel: path + '/' + it.name, size: it.size || 0, mtime: Date.parse(it.lastModifiedDateTime) || 0}); } url = j['@odata.nextLink'] || ''; }
      onProgress?.(files.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return files;
}
// 웹툰 한 화의 그림 수십 장을 열 때 주소를 20개씩 묶어 받는다 ($batch)
const ODQ = {wait: [], t: 0};
function odUrlBatched(id){
  return new Promise((res, rej) => { ODQ.wait.push({id, res, rej}); clearTimeout(ODQ.t); ODQ.t = setTimeout(odFlushUrls, ODQ.wait.length >= 20 ? 0 : 25); });
}
async function odFlushUrls(){
  const all = ODQ.wait.splice(0);
  for (let i = 0; i < all.length; i += 20){
    const part = all.slice(i, i + 20);
    try{
      const j = await (await odFetch('/$batch', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({requests: part.map((q, k) => ({id: String(k), method: 'GET', url: `/me/drive/items/${q.id}?$select=id,@microsoft.graph.downloadUrl`}))})})).json();
      const by = new Map((j.responses || []).map(r => [r.id, r]));
      part.forEach((q, k) => { const r = by.get(String(k)); const u = r?.status === 200 && r.body?.['@microsoft.graph.downloadUrl']; u ? q.res(u) : odDownloadUrl(q.id).then(q.res, q.rej); });
    }catch(e){ part.forEach(q => q.rej(e)); }
  }
}
const OD_INFLIGHT = new Map();
function odBlob(f){ if (!OD_INFLIGHT.has(f.id)) OD_INFLIGHT.set(f.id, odBlob0(f).finally(() => OD_INFLIGHT.delete(f.id))); return OD_INFLIGHT.get(f.id); }
async function odBlob0(f){
  const key = 'od:' + f.id;
  try{ const c = await idb.tx('readonly', s => s.get(key), 'dcache'); if (c && c.mtime === f.mtime) return c.blob; }catch{}
  const r = await fetch(await odUrlBatched(f.id)); if (!r.ok) throw new Error('download ' + r.status);
  const b = await r.blob();
  try{ await idb.tx('readwrite', s => s.put({id: key, blob: b, mtime: f.mtime}), 'dcache'); }catch{}
  return b;
}
async function odFiles(src, refresh){
  let idx = null;
  if (!refresh){ try{ idx = (await idb.tx('readonly', s => s.get('__idx:' + src.id), 'dcache'))?.files; }catch{} }
  if (!idx){
    idx = await odIndex(src, n => srcStatus(src.id, `목록 받는 중… 항목 ${n.toLocaleString()}개`));
    try{ await idb.tx('readwrite', s => s.put({id: '__idx:' + src.id, files: idx, t: Date.now()}), 'dcache'); }catch{}
  }
  return idx.map(f => Object.assign(new LazyFile({name: f.rel.split('/').pop(), size: f.size, mtime: f.mtime, rel: f.rel, get: () => odBlob(f)}), {remote: true}));
}
// '노벨'·'만화'·'웹툰' 같은 종류 폴더가 바로 아래에 있으면 하나씩 따로 연결한다(종류가 맞게 나뉘게)
const KIND_DIR = /^(노벨|소설|novel|만화|망가|manga|comic|웹툰|webtoon)s?$/i;

/* ---------- 폴더 고르기 화면 (연결 시트의 드라이브 고르기 칸을 같이 쓴다) ---------- */
async function odBrowseOpen(){
  if (!odClient()){ openTool('set'); $('#odSetup').open = true; $('#odClient').focus(); return toast('설정 탭에서 OneDrive 클라이언트 ID를 먼저 넣어 주세요'); }
  if (!odReady()) return toast('OneDrive는 https 주소(설치한 앱)나 윈도우 프로그램에서 연결할 수 있어요');
  if (!odLinked()){ store.set('od.afterLogin', 'browse'); try{ await odToken(true); }catch(e){ return toast('Microsoft 로그인을 마치지 못했어요 (' + e.message + ')'); } }
  if (!$('#linkSheet').classList.contains('open')){ closeSheets(); $('#linkSheet').classList.add('open'); renderSources(); }
  DRV.kind = 'od'; DRV.stack = [{id: 'root', name: 'OneDrive'}]; $('#drvBrowse').hidden = false; drvRender();
}
async function odFolders(id){
  const out = []; let url = id === 'root' ? '/me/drive/root/children?$top=999&$select=id,name,folder' : `/me/drive/items/${id}/children?$top=999&$select=id,name,folder`;
  while (url){ const j = await (await odFetch(url)).json(); for (const it of j.value || []) if (it.folder) out.push({id: it.id, name: it.name, n: it.folder.childCount}); url = j['@odata.nextLink'] || ''; }
  return out.sort((a, b) => natural(a.name, b.name));
}
async function odPick(here){
  const list = libSources().filter(s => s.id !== '__pending');
  let targets = [here];
  try{ const subs = (await odFolders(here.id)).filter(f => KIND_DIR.test(f.name)); if (subs.length) targets = subs; }catch{}
  const add = targets.filter(t => !list.some(s => s.kind === 'onedrive' && s.folderId === t.id)).map(t => ({id: uid(), kind: 'onedrive', name: t.name, folderId: t.id, t: Date.now()}));
  if (!add.length) return toast('이미 연결한 폴더예요');
  libSave([...list, ...add]); $('#drvBrowse').hidden = true;
  if (targets.length > 1) toast(`${add.map(s => s.name).join('·')} 폴더를 따로 연결했어요`);
  for (const s of add) await loadSource(s, {quiet: false});
}

/* ---------- 설정 화면 ---------- */
function odStatus(t){ const el = $('#odStatus'); if (el) el.textContent = t; }
function odUI(){
  const linked = odLinked();
  $('#odClient').value = store.get('od.client', '');
  $('#odRedirWeb').textContent = odWebOk() ? odRedirect() : 'https://xoqls0720.github.io/novel-viewer/';
  $('#odSetup').hidden = !!OD_CLIENT_ID && !store.get('od.client', '');
  $('#odConnect').hidden = linked; $('#odNow').hidden = !linked; $('#odOut').hidden = !linked;
  $('#odUse').checked = SYNC_OD();
  if (linked) store.set('od.everLinked', true);
  if (!odClient()) odStatus('처음 한 번 앱 등록이 필요해요'); else if (!linked) odStatus(odReady() ? '연결 전' : 'https 주소에서 열어 주세요');
  else { const last = store.get('gd.last', 0); odStatus(SYNC_OD() && last ? '마지막 ' + new Date(last).toLocaleString('ko-KR', {month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : '연결됨'); }
}
$('#odSave').onclick = () => { store.set('od.client', $('#odClient').value.trim()); odUI(); toast('저장했어요'); };
$('#odConnect').onclick = async () => {
  if ($('#odClient').value.trim() && $('#odClient').value.trim() !== store.get('od.client', '')) store.set('od.client', $('#odClient').value.trim());
  if (!odClient()){ $('#odSetup').open = true; $('#odClient').focus(); return toast('먼저 앱 등록에서 받은 클라이언트 ID를 넣어 주세요'); }
  if (!odReady()) return toast('OneDrive는 https 주소(설치한 앱)나 윈도우 프로그램에서 연결할 수 있어요');
  store.set('sync.backend', 'od');
  try{ await odToken(true); odUI(); toast('OneDrive에 연결했어요'); gdSync(false); }catch(e){ odStatus('연결하지 못했어요 (' + e.message + ')'); }
};
$('#odNow').onclick = () => { if (!SYNC_OD()){ store.set('sync.backend', 'od'); odUI(); } gdSync(true); };
$('#odOut').onclick = async () => {
  if (!confirm('이 기기에서 OneDrive 연결을 끊을까요? (OneDrive에 맞춰 둔 파일은 남아요)')) return;
  odRtSet(''); OD.token = null; store.set('od.linked', false); store.set('od.everLinked', false); try{ await window.nvDesktop?.odLogout?.(); }catch{}
  if (SYNC_OD()) store.set('sync.backend', ''); odUI(); toast('연결을 끊었어요');
};
$('#odUse').onchange = () => { store.set('sync.backend', $('#odUse').checked ? 'od' : ''); odUI(); toast($('#odUse').checked ? 'OneDrive로 맞춰요' : 'OneDrive 맞추기를 껐어요'); };
$('#srcOd').onclick = () => odBrowseOpen();
odUI();
odHandleReturn();
