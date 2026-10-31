/* ================= 구글 드라이브 동기화 ================= */
// 드라이브의 앱 전용 숨은 폴더(appDataFolder)만 쓴다. 이 앱만 읽을 수 있는 칸이다.
// API 키는 켜 두었을 때만(keys.json) 맞추고, 백업 파일에는 넣지 않는다. Ollama 주소·고른 AI는 기기마다 따로다.
const GD = {token: null, exp: 0, client: null, busy: false, timer: null, armed: false, tried: 0};
const GD_API = 'https://www.googleapis.com/drive/v3', GD_UP = 'https://www.googleapis.com/upload/drive/v3';
function gdStatus(t){ if (SYNC_OD()){ odStatus(t); return; } $('#gdStatus').textContent = t; }   // OneDrive로 맞출 때는 그쪽 칸에 쓴다
const DESKTOP = !!window.nvDesktop;   // 윈도우 프로그램(Electron)으로 열었을 때
// 구글 OAuth 클라이언트 ID(웹 애플리케이션). 비밀이 아니라 코드에 둔다: 기기마다 넣지 않고 '구글로 시작하기' 한 번이면 된다.
// 설정 → 고급에 다른 ID를 넣으면(gd.client) 그걸 쓴다.
const GD_CLIENT_ID = '652688327379-6ldakpv06ne7oclhbsopqvbolj5us7qk.apps.googleusercontent.com';
const gdClientId = () => store.get('gd.client', '') || GD_CLIENT_ID;
function gdReady(){ return (location.protocol === 'https:' || DESKTOP) && !!gdClientId(); }
// 이 기기에서 한 번이라도 연결했으면 켤 때·돌아올 때·고칠 때 저절로 맞춘다 (예전 판은 gd.last 만 있었다)
const gdLinked = () => gdReady() && store.get('gd.linked', !!store.get('gd.last', 0));
async function gdLoadGIS(){
  if (window.google?.accounts?.oauth2) return;
  await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
}
// 드라이브 작품 폴더를 연결했으면 읽기 권한도 함께 받는다
const SC_APP = 'https://www.googleapis.com/auth/drive.appdata', SC_READ = 'https://www.googleapis.com/auth/drive.readonly';
function gdScopes(){ return store.get('lib.sources', []).some(s => s.kind === 'drive') ? SC_APP + ' ' + SC_READ : SC_APP; }
function gdScopeOk(granted){ return !granted || gdScopes().split(' ').every(s => granted.includes(s)); }
// 받은 토큰은 이 기기에만(gd.* 는 맞추기·백업에서 빠진다) 둬서, 앱을 다시 켜도 한 시간 안이면 바로 맞춘다
function gdKeep(t, exp){ GD.token = t; GD.exp = exp; store.set('gd.tok', {t, exp, s: gdScopes()}); }
function gdForget(){ GD.token = null; GD.exp = 0; localStorage.removeItem('nv.gd.tok'); }
// 웹: 구글 로그인 창은 누름(탭·클릭) 안에서만 열린다. 토큰이 끝났으면 바로 열지 않고, 다음에 화면을 누를 때 조용히 다시 받는다
function gdAsk(prompt){
  return new Promise((res, rej) => {
    GD.client = google.accounts.oauth2.initTokenClient({client_id: gdClientId(), scope: gdScopes(), include_granted_scopes: true,
      callback: r => { if (r.error){ rej(new Error(r.error)); return; } gdKeep(r.access_token, Date.now() + r.expires_in*1000); res(GD.token); },
      error_callback: e => rej(new Error(e?.type || 'popup'))});
    GD.client.requestAccessToken({prompt});
    setTimeout(() => rej(new Error('timeout')), 90000);
  });
}
function gdArmRenew(){
  const want = () => !SYNC_OD() && (gdLinked() || store.get('lib.sources', []).some(s => s.kind === 'drive'));   // 맞추기 또는 드라이브 작품 폴더
  if (GD.armed || DESKTOP || !want()) return; GD.armed = true;
  const go = () => {
    removeEventListener('pointerup', go, true); GD.armed = false;
    if (!want() || GD.busy) return;
    gdLoadGIS().then(() => gdAsk('')).then(() => { if (gdLinked()) gdSync(false); }).catch(() => {});
  };
  addEventListener('pointerup', go, true);
}
async function gdToken(interactive){
  if (GD.token && Date.now() < GD.exp - 60000) return GD.token;
  const cached = store.get('gd.tok', null); if (cached && Date.now() < cached.exp - 60000 && cached.s === gdScopes()){ GD.token = cached.t; GD.exp = cached.exp; return GD.token; }
  if (!gdReady()) throw new Error('setup');
  if (DESKTOP){
    // 프로그램에서는 기본 브라우저로 로그인하고, 다시 쓸 수 있는 토큰·보안 비밀번호는 프로그램이 윈도우 암호화로 이 PC에만 보관한다
    const id = gdClientId(), old = store.get('gd.secret', '');   // old: 예전 판이 화면 저장소에 둔 비밀번호(옮기는 중)
    let r = await window.nvDesktop.gdToken(id, old).catch(e => { if (/invalid_grant|nosecret/.test(e.message)) return null; throw e; });   // 인터넷이 끊긴 것은 로그인 문제가 아니다
    if (r && !gdScopeOk(r.scope)) r = null;   // 작품 폴더(드라이브 읽기) 권한이 새로 필요해진 경우
    if (!r && interactive){ toast('기본 브라우저에서 구글 로그인을 마쳐 주세요'); r = await window.nvDesktop.gdLogin(id, old, gdScopes()); }
    if (!r) throw new Error('auth');
    GD.token = r.token; GD.exp = Date.now() + r.expires * 1000; return GD.token;
  }
  if (!interactive && !navigator.userActivation?.isActive){ gdArmRenew(); throw new Error('auth'); }
  await gdLoadGIS();
  return gdAsk('');
}
async function gdFetch(url, opt = {}, interactive = false){
  const t = await gdToken(interactive);
  const r = await fetch(url, {...opt, headers: {...(opt.headers||{}), Authorization: 'Bearer ' + t}});
  if (r.status === 401){ gdForget(); gdArmRenew(); throw new Error('auth'); }
  if (r.status === 403 && /insufficient|scope/i.test(await r.clone().text())){ gdForget(); throw new Error('scope'); }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}
/* ---------- PC로 맞추기: 이 PC(윈도우 프로그램)의 userData/pcsync 를 맞추는 곳으로 쓴다 ----------
   PC 는 프로그램 안(IPC)으로, 폰·아이패드는 PC 주소(/t/<열쇠>/lan/sync)로. 구글 드라이브·OneDrive 와 같은 파일 모양이라
   아래 합치기 코드를 그대로 쓴다. 로그인이 필요 없고, 파일은 PC 밖으로 나가지 않는다. */
let SYNC_FORCE = '';   // 'pc' 인 동안은 gdList·gdPut·gdGet·gdDel 이 PC 로 간다
const PC = {timer: null, last: 0};
const pcBase = () => (location.pathname.match(/^(\/t\/[^/]+)\//) || [])[1] || '';   // 폰: PC 주소로 열었을 때 (앞 파일에서도 쓰려고 함수로)
const pcOn = () => !!pcBase() || (DESKTOP && !!window.nvDesktop?.pcSyncList && store.get('sync.pc', true));
async function pcList(){
  const arr = pcBase() ? await (await fetch(pcBase() + '/lan/sync', {cache: 'no-store'})).json() : await window.nvDesktop.pcSyncList();
  return new Map(arr.map(f => [f.name, {id: f.name, name: f.name, modifiedTime: new Date(f.mtime).toISOString()}]));
}
async function pcPut(files, name, blob){
  if (pcBase()){ const r = await fetch(pcBase() + '/lan/sync/file?n=' + encodeURIComponent(name), {method: 'PUT', body: blob}); if (!r.ok) throw new Error('pc ' + r.status); }
  else await window.nvDesktop.pcSyncPut(name, new Uint8Array(await blob.arrayBuffer()));
  files.set(name, {id: name, name, modifiedTime: new Date().toISOString()});
}
async function pcGet(files, name, as = 'json'){
  if (!files.has(name)) return null;
  let blob;
  if (pcBase()){ const r = await fetch(pcBase() + '/lan/sync/file?n=' + encodeURIComponent(name), {cache: 'no-store'}); if (!r.ok) return null; blob = await r.blob(); }
  else { const u8 = await window.nvDesktop.pcSyncGet(name); if (!u8) return null; blob = new Blob([u8]); }
  return as === 'json' ? JSON.parse(await blob.text()) : blob;
}
async function pcDel(files, name){
  if (pcBase()) await fetch(pcBase() + '/lan/sync/file?n=' + encodeURIComponent(name), {method: 'DELETE'}).catch(() => {});
  else await window.nvDesktop.pcSyncDel(name).catch(() => {});
  files.delete(name);
}
function pcStatus(t){ const el = $('#pcSyncStat'); if (el) el.textContent = t; }
async function pcSync(){
  if (!pcOn()) return;
  if (GD.busy){ clearTimeout(PC.timer); PC.timer = setTimeout(pcSync, 5000); return; }   // 구글·OneDrive 맞추기가 도는 중이면 조금 뒤에
  SYNC_FORCE = 'pc';
  try{ await gdSync(false); } finally { SYNC_FORCE = ''; }
}
async function gdList(){
  if (SYNC_FORCE === 'pc') return pcList();
  if (SYNC_OD()) return odList();   // 23-onedrive.js: 같은 모양의 파일 목록
  const out = []; let page = '';
  do { const r = await (await gdFetch(`${GD_API}/files?spaces=appDataFolder&pageSize=1000&orderBy=modifiedTime desc&fields=nextPageToken,files(id,name,modifiedTime)${page ? '&pageToken=' + page : ''}`)).json(); out.push(...r.files); page = r.nextPageToken; } while (page);
  const map = new Map();
  for (const f of out){ if (!map.has(f.name)) map.set(f.name, f); else gdFetch(`${GD_API}/files/${f.id}`, {method:'DELETE'}).catch(()=>{}); }
  return map;
}
async function gdPut(files, name, blob){
  if (SYNC_FORCE === 'pc') return pcPut(files, name, blob);
  if (SYNC_OD()) return odPut(files, name, blob);
  const f = files.get(name);
  if (f){ await gdFetch(`${GD_UP}/files/${f.id}?uploadType=media`, {method:'PATCH', body: blob}); return; }
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({name, parents:['appDataFolder']})], {type:'application/json'}));
  fd.append('file', blob);
  const r = await (await gdFetch(`${GD_UP}/files?uploadType=multipart&fields=id,name,modifiedTime`, {method:'POST', body: fd})).json(); files.set(name, r);
}
async function gdGet(files, name, as = 'json'){ if (SYNC_FORCE === 'pc') return pcGet(files, name, as); if (SYNC_OD()) return odGet(files, name, as); const f = files.get(name); if (!f) return null; const r = await gdFetch(`${GD_API}/files/${f.id}?alt=media`); return as === 'json' ? r.json() : r.blob(); }
async function gdDel(files, name){ if (SYNC_FORCE === 'pc') return pcDel(files, name); if (SYNC_OD()) return odDel(files, name); const f = files.get(name); if (f){ await gdFetch(`${GD_API}/files/${f.id}`, {method:'DELETE'}).catch(()=>{}); files.delete(name); } }
const DEVICE_ONLY = /^(apiKey|gemKey|grKey|naiKey|olOk|tr\.key\.|__ts|__kts|theme|spent|st\.bk\.|lib\.|set\.(stRefPane|provider|aiProv|wProv|naiProv|stProv|olModel|stNoSide|stNoInsp|stTw|stStart|olUrl|keepLocal|fs|lh|pgap|col|wcol|dimLv|fit|spread|rtl|indent|rfont|align|weight|ls|margin|warm|wake|gap|pageAnim|tapMode|autoNext|autoSpeed|ttsRate|libSort|pagedDefault|coach|asSpeed|phoneView)|gd\.|od\.|sync\.)/;
function localState(){
  const ls = {}; for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if (!k.startsWith('nv.')) continue; const kk = k.slice(3); if (!DEVICE_ONLY.test(kk)) ls[kk] = localStorage.getItem(k); }
  return {ls, ts: store.get('__ts', {})};
}
// 순서가 있는 목록 합치기: 새로 저장한 쪽 순서를 따르고, 다른 쪽에만 있는 항목은 앞 항목 뒤에 끼운다
function mergeOrdered(newer, older, dead){
  const byId = new Map(); for (const x of [...older, ...newer]){ const o = byId.get(x.id); if (!o || (x.t || 0) >= (o.t || 0)) byId.set(x.id, x); }
  const out = newer.filter(x => !dead.has(x.id)).map(x => byId.get(x.id)); const have = new Set(out.map(x => x.id));
  older.forEach((x, i) => { if (have.has(x.id) || dead.has(x.id)) return; let pos = i === 0 ? 0 : out.length; for (let j = i - 1; j >= 0; j--){ const k = out.findIndex(y => y.id === older[j].id); if (k >= 0){ pos = k + 1; break; } } out.splice(pos, 0, byId.get(x.id)); have.add(x.id); });
  return out;
}
async function gdSyncTexts(files, rIdx, dead){
  await txtReady(); try{ stFlush(); }catch{} await txtFlushNow();
  const fname = k => 'txt-' + k.replace(/[:/\\]/g, '_') + '.txt';   // OneDrive 가 ':' 를 거부해서 전부 '_' 로 (필사 열쇠 fs:작품:회차)
  const res = {up: 0, down: 0, conflict: 0};
  const getText = async k => { const b = await gdGet(files, fname(k), 'blob'); return b ? await b.text() : null; };
  for (const k of dead){ if (TXT.cache.has(k)){ TXT.cache.delete(k); await idb.tx('readwrite', s => s.delete(k), 'texts'); } if (files.has(fname(k))) await gdDel(files, fname(k)); delete rIdx[k]; }
  for (const k of new Set([...TXT.cache.keys(), ...Object.keys(rIdx)])){
    const l = TXT.cache.get(k), r = rIdx[k];
    if (l && !r){ await gdPut(files, fname(k), new Blob([l.text], {type:'text/plain'})); l.syncedT = l.t; TXT.dirty.add(k); res.up++; continue; }
    if (!l){ const t = await getText(k); if (t !== null){ TXT.cache.set(k, {k, text: t, t: r, syncedT: r}); TXT.dirty.add(k); res.down++; } continue; }
    const base = l.syncedT || 0, lc = l.t > base, rc = r > base;
    if (lc && rc){
      const t = await getText(k);
      if (t !== null && t !== l.text){ if (r > l.t){ l.other = l.text; l.text = t; } else { l.other = t; await gdPut(files, fname(k), new Blob([l.text], {type:'text/plain'})); } res.conflict++; }
      l.t = Math.max(l.t, r); l.syncedT = l.t; TXT.dirty.add(k);
    } else if (rc){ const t = await getText(k); if (t !== null){ l.text = t; l.t = r; l.syncedT = r; TXT.dirty.add(k); res.down++; } }
    else if (lc){ await gdPut(files, fname(k), new Blob([l.text], {type:'text/plain'})); l.syncedT = l.t; TXT.dirty.add(k); res.up++; }
  }
  await txtFlushNow();
  if (res.conflict) toast('두 기기에서 따로 고친 회차가 있어서 진 쪽을 "다른 기기 원고"로 남겨 뒀어요');
  return {...res, index: Object.fromEntries([...TXT.cache].map(([k, r]) => [k, r.syncedT || r.t]))};
}
// API 키 맞추기: 키마다 마지막으로 바꾼 시각이 늦은 쪽을 따른다(지운 것도 빈 값으로 전해진다)
// 번역 AI 키(tr.key.*)도 함께: 어느 기기에서 넣든 다른 기기에서 바로 쓴다
const SYNC_KEYS = ['apiKey', 'gemKey', 'grKey', 'naiKey', 'tr.key.openrouter', 'tr.key.cerebras', 'tr.key.mistral', 'tr.key.github', 'tr.key.deepl', 'tr.key.microsoft', 'tr.key.custom'];
async function gdSyncKeys(files){
  const remote = (await gdGet(files, 'keys.json').catch(() => null)) || {v: 1, keys: {}, ts: {}};
  const lt = store.get('__kts', {}); let up = false, down = 0;
  for (const k of SYNC_KEYS){
    const l = lt[k] || 0, r = remote.ts?.[k] || 0;
    if (r > l){ try{ localStorage.setItem('nv.' + k, JSON.stringify(remote.keys[k] ?? '')); }catch{} lt[k] = r; down++; }
    else if (l > r){ remote.keys[k] = store.get(k, ''); remote.ts[k] = l; up = true; }
    else if (!l && !r && store.get(k, '')){ lt[k] = Date.now(); remote.keys[k] = store.get(k, ''); remote.ts[k] = lt[k]; up = true; }   // 예전에 넣어 둔 키
  }
  try{ localStorage.setItem('nv.__kts', JSON.stringify(lt)); }catch{}
  if (up) await gdPut(files, 'keys.json', new Blob([JSON.stringify({v: 1, keys: remote.keys, ts: remote.ts})], {type: 'application/json'}));
  if (down){ KEY_IDS.forEach(keySaved); aiHint(); if (store.get('apiKey', '')) loadSDK().catch(() => {}); }
  return down;
}
const mergeById = (a, b, tomb) => { const m = new Map(); for (const x of [...(a||[]), ...(b||[])]) { const o = m.get(x.id); if (!o || (x.t||0) > (o.t||0)) m.set(x.id, x); } return [...m.values()].filter(x => !tomb.has(x.id)); };
async function gdSync(interactive = false){
  if (GD.busy) return;
  const pc = SYNC_FORCE === 'pc', od = !pc && SYNC_OD();
  if (!pc && (od ? !odReady() : !gdReady())){ if (interactive) toast(od ? 'OneDrive 연결 설정(클라이언트 ID)을 먼저 마쳐 주세요' : location.protocol !== 'https:' ? '구글 드라이브 동기화는 https 주소(앱으로 설치한 뷰어)에서만 돼요' : '설정 → 기기끼리 맞추기 → 고급에 구글 클라이언트 ID를 넣어 주세요'); return; }
  GD.busy = true; if (pc) pcStatus('PC와 맞추는 중…'); else { GD.tried = Date.now(); gdStatus('동기화 중…'); }
  try{
    if (!pc){ if (od) await odToken(interactive); else if (interactive) await gdToken(true); }
    const files = await gdList();
    const remote = (await gdGet(files, 'state.json')) || {ls:{}, ts:{}, scraps:[]};
    const local = localState();
    // 1) 지운 기록 합치기
    const tl = JSON.parse(local.ls.__tomb || '{}'), tr = JSON.parse(remote.ls?.__tomb || '{}');
    const tomb = {notes: [], scraps: []}; for (const k of new Set([...Object.keys(tl), ...Object.keys(tr)])) tomb[k] = [...new Set([...(tl[k] || []), ...(tr[k] || [])])].slice(-2000);
    const tn = new Set(tomb.notes), tsc = new Set(tomb.scraps);
    // 2) 값 합치기
    for (const k of Object.keys(remote.ls || {})) if (DEVICE_ONLY.test(k)) delete remote.ls[k];
    const keys = new Set([...Object.keys(local.ls), ...Object.keys(remote.ls || {})]);
    const conflicts = [];
    const merged = {}, mts = {...remote.ts, ...local.ts};
    for (const k of keys){
      const lv = local.ls[k], rv = remote.ls?.[k];
      if (k === '__tomb'){ merged[k] = JSON.stringify(tomb); continue; }
      if (lv === undefined){ merged[k] = rv; mts[k] = remote.ts?.[k] || 0; continue; }
      if (rv === undefined){ merged[k] = lv; continue; }
      try{
        if (k.startsWith('notes.')){ merged[k] = JSON.stringify(mergeById(JSON.parse(lv), JSON.parse(rv), tn)); continue; }
        // 집필실 작품·회차·설정집 목록은 항목(id)마다 합친다: 두 기기에서 따로 만든 회차가 사라지지 않게
        if (k === 'st.projects' || k.startsWith('st.eps.') || k.startsWith('st.bible.')){
          const a = JSON.parse(lv), b = JSON.parse(rv);
          if (Array.isArray(a) && Array.isArray(b)){ const kind = k === 'st.projects' ? 'projects' : k.startsWith('st.eps.') ? 'eps' : 'bible'; const lt0 = local.ts[k] || 0, rt0 = remote.ts?.[k] || 0; merged[k] = JSON.stringify(rt0 > lt0 ? mergeOrdered(b, a, new Set(tomb[kind] || [])) : mergeOrdered(a, b, new Set(tomb[kind] || []))); mts[k] = Math.max(lt0, rt0); continue; }
        }
        if (k === 'ideas'){ merged[k] = JSON.stringify(mergeById(JSON.parse(lv), JSON.parse(rv), new Set(tomb.ideas || [])).sort((x, y) => y.t - x.t)); continue; }
        if (k.startsWith('read.')){ merged[k] = JSON.stringify([...new Set([...JSON.parse(lv), ...JSON.parse(rv)])]); continue; }
        if (k.startsWith('pos.')){ const a = JSON.parse(lv), b = JSON.parse(rv); merged[k] = (b.t||0) > (a.t||0) ? rv : lv; continue; }
        if (k === 'naiHist'){ const a = JSON.parse(lv), b = JSON.parse(rv); const m = new Map([...a, ...b].map(x => [x.t, x])); merged[k] = JSON.stringify([...m.values()].sort((x,y)=>y.t-x.t).slice(0,30)); continue; }
      }catch{}
      const lt = local.ts[k] || 0, rt = remote.ts?.[k] || 0;
      merged[k] = rt > lt ? rv : lv; mts[k] = Math.max(lt, rt);
      // 긴 글(원고·메모)은 진 쪽을 버리지 않고 따로 남긴다
      if ((k === 'wIn' || (k.startsWith('st.txt.') && !k.endsWith('.other'))) && lv !== rv){ const loser = rt > lt ? lv : rv; try{ if (JSON.parse(loser).trim()){ merged[k + '.other'] = loser; conflicts.push(k); } }catch{} }
    }
    const lsChanged = Object.entries(merged).some(([k, v]) => v !== undefined && v !== null && v !== local.ls[k]);   // 받은 것이 있는지 (없으면 화면을 다시 그리지 않는다)
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== null){ try{ localStorage.setItem('nv.' + k, v); }catch{ toast('브라우저 저장 공간이 부족해 일부를 합치지 못했어요'); } }
    try{ localStorage.setItem('nv.__ts', JSON.stringify(mts)); }catch{}
    if (conflicts.length) toast('다른 기기에서 쓴 원고가 있어서 "다른 기기 글"로 따로 남겨 뒀어요');
    // 3) 장면 노트(그림) 합치기
    let localScraps = []; try{ localScraps = await idb.tx('readonly', st => st.getAll(), 'scraps'); }catch{}
    const lmap = new Map(localScraps.map(x => [x.id, x])), rmap = new Map((remote.scraps || []).map(x => [x.id, x]));
    for (const id of tsc){ if (lmap.has(id)){ await idb.tx('readwrite', st => st.delete(id), 'scraps'); lmap.delete(id); } if (files.has(`scrap-${id}.jpg`)){ await gdDel(files, `scrap-${id}.jpg`); await gdDel(files, `thumb-${id}.jpg`); await gdDel(files, `base-${id}.jpg`); } rmap.delete(id); }
    let up = 0, down = 0;
    for (const [id, r] of rmap){
      const l = lmap.get(id);
      if (!l || (r.t||0) > (l.t||0)){
        const [blob, thumb, base] = await Promise.all([gdGet(files, `scrap-${id}.jpg`, 'blob'), gdGet(files, `thumb-${id}.jpg`, 'blob'), gdGet(files, `base-${id}.jpg`, 'blob')]);
        if (blob){ await idb.tx('readwrite', st => st.put({...r, blob, thumb: thumb || blob, base: base || null}), 'scraps'); lmap.set(id, {...r}); down++; }
      }
    }
    const metas = [];
    for (const [id, l] of lmap){
      const r = rmap.get(id); const full = l.blob ? l : (await idb.tx('readonly', st => st.get(id), 'scraps'));
      if (!full) continue;
      if (!r || (full.t||0) > (r.t||0)){
        await gdPut(files, `scrap-${id}.jpg`, full.blob); await gdPut(files, `thumb-${id}.jpg`, full.thumb || full.blob); if (full.base) await gdPut(files, `base-${id}.jpg`, full.base); up++;
      }
      const {blob, thumb, base, strokes, ...meta} = full; metas.push(meta);
    }
    // 4) 집필실 원고 합치기: 회차마다 파일 하나. 두 기기에서 따로 고쳤으면 진 쪽을 '다른 기기 원고'로 남긴다
    const tx = await gdSyncTexts(files, remote.texts || {}, new Set(tomb.texts || []));
    const kd = (pc || store.get('gd.syncKeys', true)) ? await gdSyncKeys(files) : 0;   // PC로 맞출 때는 늘 키도 (PC 밖으로 나가지 않는다)
    // 5) 합친 상태 올리기
    const ls = localState().ls;
    // PC 와는 30초마다 맞추니, 올릴 것이 없으면 state.json 을 다시 쓰지 않는다
    const same = pc && JSON.stringify(ls) === JSON.stringify(remote.ls || {}) && JSON.stringify(metas) === JSON.stringify(remote.scraps || []) && JSON.stringify(tx.index) === JSON.stringify(remote.texts || {});
    if (!same) await gdPut(files, 'state.json', new Blob([JSON.stringify({v:1, updated: Date.now(), ls, ts: store.get('__ts', {}), scraps: metas, texts: tx.index})], {type:'application/json'}));
    const sum = `원고 올림 ${tx.up} · 받음 ${tx.down}${tx.conflict ? ` · 겹침 ${tx.conflict}` : ''}${kd ? ` · API 키 받음 ${kd}` : ''} · 장면 올림 ${up} · 받음 ${down}`;
    if (pc){ PC.last = Date.now(); pcStatus(`PC와 맞춤 ${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})} · ${sum}`); }
    else { localStorage.setItem('nv.gd.last', JSON.stringify(Date.now())); if (!od){ store.set('gd.linked', true); GD.warned = false; gdUI(); } gdStatus(`마지막 동기화 ${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})} · ${sum}`); }
    if (!pc || lsChanged || down || tx.down || kd){ applySettingsFromStore(); renderLib(); renderNotes(); renderScraps(); renderNaiHist(); }
    if (!od && !pc) window.libAfterSync?.(files);   // 작품 파일 동기화(17-libsync.js). OneDrive·PC 는 작품 폴더를 바로 쓰니 올리지 않는다
    if (od) odUI();
  }catch(e){
    if (pc){ pcStatus('PC와 맞추지 못했어요 (' + e.message + ')'); return; }
    const needLogin = e.message === 'auth' || /popup|access_denied|interaction|timeout/.test(e.message);
    if (!od && needLogin && GD.armed){ gdStatus('화면을 한 번 누르면 이어서 맞춰요'); return; }   // 웹: 토큰이 끝났다 → 다음 누름 때 조용히
    if (!od && /nosecret/.test(e.message)){ gdNeedSecret(); return; }
    if (!od && needLogin && interactive === false && DESKTOP){ store.set('gd.linked', false); gdUI(); }   // 다시 쓰는 토큰이 끊겼다 → 단추를 다시 보인다
    gdStatus(e.message === 'setup' ? '설정이 필요해요' : needLogin ? (od ? 'Microsoft 로그인이 필요해요. 설정 탭에서 "연결"을 눌러 주세요' : '구글 로그인이 필요해요. "구글로 시작하기"를 눌러 주세요') : '동기화하지 못했어요 (' + e.message + ')');
    if (needLogin && interactive === false && !GD.warned){ GD.warned = true; toast(od ? 'OneDrive 동기화가 멈췄어요. 설정 → 연결을 눌러 주세요' : '구글 드라이브 동기화가 멈췄어요. 설정 → 구글로 시작하기를 눌러 주세요'); }
  }finally{ GD.busy = false; }
}
function syncOn(){ return SYNC_OD() ? odReady() && odLinked() : gdLinked() && $('#gdAuto').checked; }
window.gdSoon = () => {
  if (pcOn()){ clearTimeout(PC.timer); PC.timer = setTimeout(pcSync, 3000); }   // PC 와는 곧바로(3초 뒤)
  if (!syncOn()) return; clearTimeout(GD.timer); GD.timer = setTimeout(() => gdSync(false), 15000);   // 고치고 15초 조용하면
};
// PC로 맞추기: 켤 때, 30초마다, 화면으로 돌아올 때, 폰이 PC 에 올렸을 때
if (pcOn()){
  setTimeout(pcSync, 2500);
  setInterval(() => { if (document.visibilityState === 'visible') pcSync(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (pcOn()) pcSync(); });
  window.nvDesktop?.onPcSyncChanged?.(() => { clearTimeout(PC.timer); PC.timer = setTimeout(pcSync, 500); });
}
window.nvPcSync = pcSync; window.nvStore = store;   // 시험용
if ($('#pcSyncBox')){ $('#pcSyncBox').hidden = !pcOn(); $('#pcSyncNow').onclick = () => pcSync(); }
function applySettingsFromStore(){
  for (const id of SETTINGS){ const el = $('#'+id); const v = store.get('set.'+id, null); if (v === null) continue; if (el.type === 'checkbox') el.checked = v; else el.value = v; }
  for (const id of ['naiChars','naiStyle','naiNeg']){ const v = store.get('set.'+id, null); if (v !== null && document.activeElement !== $('#'+id)) $('#'+id).value = v; }
  if (document.activeElement !== $('#wIn')) $('#wIn').value = store.get('wIn', '');
  $('#wInOther').hidden = !store.get('wIn.other', '');
  applyView(); aiHint(); window.stRefresh?.();
}
// 처음 화면(홈·서재)의 '구글로 시작하기' 띠: 아직 연결 전이고 '나중에'를 누르지 않았을 때만
const gdHelloOn = () => gdReady() && !gdLinked() && !SYNC_OD() && !pcBase() && !store.get('gd.later', false);
function gdUI(){
  const on = gdLinked() && !SYNC_OD();
  $('#gdConnect').hidden = on; $('#gdNow').hidden = !on; $('#gdOut').hidden = !on; $('#gdOpts').hidden = !on;
  $$('.gd-hello').forEach(el => el.hidden = !gdHelloOn());
}
const GD_HAS_SECRET = '보안 비밀번호: 이 PC에 저장돼 있어요';
async function gdSaveSecret(){
  const v = $('#gdSecret').value.trim(); if (!DESKTOP || !v) return;
  await window.nvDesktop.gdSecret(v).catch(() => {}); $('#gdSecret').value = ''; $('#gdSecret').placeholder = GD_HAS_SECRET;
}
function gdNeedSecret(){
  $('#gdAdv').open = true; $('#gdSecret').focus();
  gdStatus('이 PC에서 처음 한 번만: 고급 칸에 클라이언트 보안 비밀번호를 넣고 다시 눌러 주세요');
  toast('이 PC에서 처음 한 번만 보안 비밀번호가 필요해요 (설정 → 고급)');
}
// 구글로 시작하기: 로그인 한 번 → 바로 맞추고, 그다음부터는 저절로
async function gdStart(){
  if (!gdReady()){ window.nvGo?.('set'); $('#gdAdv').open = true; return toast(!DESKTOP && location.protocol !== 'https:' ? '구글 드라이브 동기화는 https 주소(앱으로 설치한 뷰어)에서만 돼요' : '고급 칸에 구글 클라이언트 ID를 넣어 주세요'); }
  if (SYNC_OD()){ store.set('sync.backend', ''); odUI(); }
  if (DESKTOP) await gdSaveSecret();
  gdStatus('구글 로그인 중…');
  try{ await gdToken(true); }   // 웹은 누름 안에서 바로 로그인 창을 연다(앞에 기다리는 일이 없어야 팝업이 막히지 않는다)
  catch(e){ if (/nosecret/.test(e.message)) gdNeedSecret(); else gdStatus('연결하지 못했어요 (' + e.message + ')'); return; }
  store.set('gd.linked', true); store.set('gd.later', false); gdUI(); toast('구글 드라이브에 연결했어요. 이제 저절로 맞춰요'); gdSync(true);
}
$('#gdClient').value = store.get('gd.client', '');
if (GD_CLIENT_ID) $('#gdClient').placeholder = '기본값을 쓰는 중이에요 (비워 두면 돼요)';
$('#gdAuto').checked = store.get('gd.auto', true);
$('#gdOrigin').textContent = DESKTOP ? '윈도우 프로그램: 같은 클라이언트의 "승인된 리디렉션 URI"에 http://127.0.0.1:53682/' : location.origin.startsWith('http') ? location.origin : '(https 주소에서 열어야 보여요)';
if (DESKTOP){
  $$('.desktop-only').forEach(el => el.hidden = false);
  // 예전 판은 보안 비밀번호를 화면 저장소에 뒀다 → 프로그램의 암호화 칸(이 PC에만)으로 옮긴다
  const old = store.get('gd.secret', '');
  if (old && window.nvDesktop.gdSecret) window.nvDesktop.gdSecret(old).then(() => localStorage.removeItem('nv.gd.secret')).catch(() => {});
  window.nvDesktop.gdSecret?.().then(has => { if (has) $('#gdSecret').placeholder = GD_HAS_SECRET; }).catch(() => {});
}
$('#gdSave').onclick = async () => { store.set('gd.client', $('#gdClient').value.trim()); await gdSaveSecret(); gdUI(); toast('저장했어요'); };
$('#gdConnect').onclick = gdStart;
$$('.gd-hello .gd-start').forEach(b => b.onclick = gdStart);
$$('.gd-hello .gd-later').forEach(b => b.onclick = () => { store.set('gd.later', true); gdUI(); toast('설정 → 기기끼리 맞추기에서 언제든 시작할 수 있어요'); });
$('#gdNow').onclick = () => gdSync(true);
$('#gdOut').onclick = async () => {
  if (!confirm('이 기기에서 구글 드라이브 연결을 끊을까요?\n드라이브에 맞춰 둔 것과 이 기기의 내용은 그대로 남아요.')) return;
  gdForget(); store.set('gd.linked', false); if (DESKTOP) await window.nvDesktop.gdLogout().catch(() => {});
  gdUI(); gdStatus('연결을 끊었어요');
};
$('#gdAuto').onchange = () => store.set('gd.auto', $('#gdAuto').checked);
$('#gdKeys').checked = store.get('gd.syncKeys', true);
$('#gdKeys').onchange = () => { store.set('gd.syncKeys', $('#gdKeys').checked); toast($('#gdKeys').checked ? 'API 키도 기기끼리 맞춰요' : 'API 키는 이 기기에만 둬요'); };
// 맞추는 때: 켤 때(3초 뒤) · 앱으로 돌아올 때(1분 넘게 지났으면) · 고칠 때(gdSoon: 15초 조용하면) · 떠날 때(올리기)
const gdBack = () => { if (!SYNC_OD() && syncOn() && !GD.busy && Date.now() - GD.tried > 60000) gdSync(false); };
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden'){ if (syncOn() && (SYNC_OD() ? OD.token : GD.token)) gdSync(false); }
  else gdBack();
});
addEventListener('focus', gdBack);
if (!SYNC_OD() && gdReady() && !DESKTOP) gdLoadGIS().catch(()=>{});   // 미리 받아 둬야 단추를 누르는 순간 로그인 창이 열린다
if (!SYNC_OD() && gdLinked()){ if ($('#gdAuto').checked) setTimeout(() => gdSync(false), 3000); }
else if (SYNC_OD()) setTimeout(() => { if (syncOn() || (!DESKTOP && store.get('od.everLinked', false))) gdSync(false); }, 3000);
gdUI();
{ const last = store.get('gd.last', 0); if (last && gdLinked()) gdStatus('마지막 동기화 ' + new Date(last).toLocaleString('ko-KR')); else if (location.protocol !== 'https:' && !DESKTOP) gdStatus('https 주소(앱으로 설치한 뷰어)에서 켤 수 있어요'); }

if (store.get('apiKey','')) setTimeout(() => loadSDK().catch(()=>{}), 1200);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
(async () => {
  try{
    const saved = await idb.all();
    if (saved.length){
      const files = saved.map(r => { const f = new File([r.blob], r.name, {type: r.blob.type}); f._rel = r.path; return f; });
      await addFiles(files, {persist:false, quiet:true});
      toast(`저장해 둔 작품 ${works.length}개를 불러왔어요`);
    }
  }catch{}
})();

