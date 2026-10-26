/* ================= 구글 드라이브 동기화 ================= */
// 드라이브의 앱 전용 숨은 폴더(appDataFolder)만 쓴다. 작품 파일·API 키는 올리지 않는다.
const GD = {token: null, exp: 0, client: null, busy: false, timer: null};
const GD_API = 'https://www.googleapis.com/drive/v3', GD_UP = 'https://www.googleapis.com/upload/drive/v3';
function gdStatus(t){ $('#gdStatus').textContent = t; }
function gdReady(){ return location.protocol === 'https:' && store.get('gd.client', ''); }
async function gdLoadGIS(){
  if (window.google?.accounts?.oauth2) return;
  await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
}
async function gdToken(interactive){
  if (GD.token && Date.now() < GD.exp - 60000) return GD.token;
  const cached = JSON.parse(sessionStorage.getItem('nv.gdTok') || 'null'); if (cached && Date.now() < cached.exp - 60000){ GD.token = cached.t; GD.exp = cached.exp; return GD.token; }
  if (!gdReady()) throw new Error('setup');
  await gdLoadGIS();
  return await new Promise((res, rej) => {
    GD.client = google.accounts.oauth2.initTokenClient({client_id: store.get('gd.client',''), scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: r => { if (r.error){ rej(new Error(r.error)); return; } GD.token = r.access_token; GD.exp = Date.now() + r.expires_in*1000; sessionStorage.setItem('nv.gdTok', JSON.stringify({t: GD.token, exp: GD.exp})); res(GD.token); },
      error_callback: e => rej(new Error(e?.type || 'popup'))});
    GD.client.requestAccessToken({prompt: interactive ? 'consent' : ''});
    setTimeout(() => rej(new Error('timeout')), 90000);
  });
}
async function gdFetch(url, opt = {}, interactive = false){
  const t = await gdToken(interactive);
  const r = await fetch(url, {...opt, headers: {...(opt.headers||{}), Authorization: 'Bearer ' + t}});
  if (r.status === 401){ GD.token = null; sessionStorage.removeItem('nv.gdTok'); throw new Error('auth'); }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}
async function gdList(){
  const out = []; let page = '';
  do { const r = await (await gdFetch(`${GD_API}/files?spaces=appDataFolder&pageSize=1000&orderBy=modifiedTime desc&fields=nextPageToken,files(id,name,modifiedTime)${page ? '&pageToken=' + page : ''}`)).json(); out.push(...r.files); page = r.nextPageToken; } while (page);
  const map = new Map();
  for (const f of out){ if (!map.has(f.name)) map.set(f.name, f); else gdFetch(`${GD_API}/files/${f.id}`, {method:'DELETE'}).catch(()=>{}); }
  return map;
}
async function gdPut(files, name, blob){
  const f = files.get(name);
  if (f){ await gdFetch(`${GD_UP}/files/${f.id}?uploadType=media`, {method:'PATCH', body: blob}); return; }
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({name, parents:['appDataFolder']})], {type:'application/json'}));
  fd.append('file', blob);
  const r = await (await gdFetch(`${GD_UP}/files?uploadType=multipart&fields=id,name,modifiedTime`, {method:'POST', body: fd})).json(); files.set(name, r);
}
async function gdGet(files, name, as = 'json'){ const f = files.get(name); if (!f) return null; const r = await gdFetch(`${GD_API}/files/${f.id}?alt=media`); return as === 'json' ? r.json() : r.blob(); }
async function gdDel(files, name){ const f = files.get(name); if (f){ await gdFetch(`${GD_API}/files/${f.id}`, {method:'DELETE'}).catch(()=>{}); files.delete(name); } }
const DEVICE_ONLY = /^(apiKey|gemKey|grKey|olOk|__ts|theme|spent|st\.bk\.|set\.(stNoSide|stNoInsp|stTw|stStart|olUrl|keepLocal|fs|lh|pgap|col|wcol|dimLv|fit|spread|rtl|indent|rfont|align|weight|ls|margin|warm|wake|gap|pageAnim|tapMode|autoNext|autoSpeed|ttsRate|libSort|pagedDefault|coach)|gd\.)/;
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
  const fname = k => 'txt-' + k.replace('/', '_') + '.txt'; const res = {up: 0, down: 0, conflict: 0};
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
const mergeById = (a, b, tomb) => { const m = new Map(); for (const x of [...(a||[]), ...(b||[])]) { const o = m.get(x.id); if (!o || (x.t||0) > (o.t||0)) m.set(x.id, x); } return [...m.values()].filter(x => !tomb.has(x.id)); };
async function gdSync(interactive = false){
  if (GD.busy) return; if (!gdReady()){ if (interactive) toast(location.protocol !== 'https:' ? '구글 드라이브 동기화는 https 주소(앱으로 설치한 뷰어)에서만 돼요' : '먼저 클라이언트 ID를 넣고 연결해 주세요'); return; }
  GD.busy = true; gdStatus('동기화 중…');
  try{
    if (interactive) await gdToken(true);
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
        if (k.startsWith('read.')){ merged[k] = JSON.stringify([...new Set([...JSON.parse(lv), ...JSON.parse(rv)])]); continue; }
        if (k.startsWith('pos.')){ const a = JSON.parse(lv), b = JSON.parse(rv); merged[k] = (b.t||0) > (a.t||0) ? rv : lv; continue; }
        if (k === 'naiHist'){ const a = JSON.parse(lv), b = JSON.parse(rv); const m = new Map([...a, ...b].map(x => [x.t, x])); merged[k] = JSON.stringify([...m.values()].sort((x,y)=>y.t-x.t).slice(0,30)); continue; }
      }catch{}
      const lt = local.ts[k] || 0, rt = remote.ts?.[k] || 0;
      merged[k] = rt > lt ? rv : lv; mts[k] = Math.max(lt, rt);
      // 긴 글(원고·메모)은 진 쪽을 버리지 않고 따로 남긴다
      if ((k === 'wIn' || (k.startsWith('st.txt.') && !k.endsWith('.other'))) && lv !== rv){ const loser = rt > lt ? lv : rv; try{ if (JSON.parse(loser).trim()){ merged[k + '.other'] = loser; conflicts.push(k); } }catch{} }
    }
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
    // 5) 합친 상태 올리기
    const ls = localState().ls;
    await gdPut(files, 'state.json', new Blob([JSON.stringify({v:1, updated: Date.now(), ls, ts: store.get('__ts', {}), scraps: metas, texts: tx.index})], {type:'application/json'}));
    localStorage.setItem('nv.gd.last', JSON.stringify(Date.now()));
    gdStatus(`마지막 동기화 ${new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'})} · 원고 올림 ${tx.up} · 받음 ${tx.down}${tx.conflict ? ` · 겹침 ${tx.conflict}` : ''} · 장면 올림 ${up} · 받음 ${down}`);
    applySettingsFromStore(); renderLib(); renderNotes(); renderScraps(); renderNaiHist();
  }catch(e){
    const needLogin = e.message === 'auth' || /popup|access_denied|interaction|timeout/.test(e.message);
    gdStatus(e.message === 'setup' ? '설정이 필요해요' : needLogin ? '구글 로그인이 필요해요. 설정 탭에서 "연결"을 눌러 주세요' : '동기화하지 못했어요 (' + e.message + ')');
    if (needLogin && interactive === false && !GD.warned){ GD.warned = true; toast('구글 드라이브 동기화가 멈췄어요. 설정 → 연결을 눌러 주세요'); }
  }finally{ GD.busy = false; }
}
window.gdSoon = () => { if (!gdReady() || !$('#gdAuto').checked) return; clearTimeout(GD.timer); GD.timer = setTimeout(() => gdSync(false), 45000); };
function applySettingsFromStore(){
  for (const id of SETTINGS){ const el = $('#'+id); const v = store.get('set.'+id, null); if (v === null) continue; if (el.type === 'checkbox') el.checked = v; else el.value = v; }
  for (const id of ['naiChars','naiStyle','naiNeg']){ const v = store.get('set.'+id, null); if (v !== null && document.activeElement !== $('#'+id)) $('#'+id).value = v; }
  if (document.activeElement !== $('#wIn')) $('#wIn').value = store.get('wIn', '');
  $('#wInOther').hidden = !store.get('wIn.other', '');
  applyView(); aiHint(); window.stRefresh?.();
}
$('#gdClient').value = store.get('gd.client', '');
$('#gdAuto').checked = store.get('gd.auto', true);
$('#gdOrigin').textContent = location.origin.startsWith('http') ? location.origin : '(https 주소에서 열어야 보여요)';
$('#gdSave').onclick = () => { store.set('gd.client', $('#gdClient').value.trim()); toast('저장했어요'); };
$('#gdConnect').onclick = async () => { store.set('gd.client', $('#gdClient').value.trim()); try{ await gdToken(true); gdStatus('연결됐어요'); gdSync(true); }catch(e){ gdStatus('연결하지 못했어요 (' + e.message + ')'); } };
$('#gdNow').onclick = () => gdSync(true);
$('#gdAuto').onchange = () => store.set('gd.auto', $('#gdAuto').checked);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && gdReady() && $('#gdAuto').checked && GD.token) gdSync(false); });
if (gdReady()){ gdLoadGIS().catch(()=>{}); if ($('#gdAuto').checked) setTimeout(() => gdSync(false), 3000); }
{ const last = store.get('gd.last', 0); if (last) gdStatus('마지막 동기화 ' + new Date(last).toLocaleString('ko-KR')); else if (location.protocol !== 'https:') gdStatus('https 주소(앱으로 설치한 뷰어)에서 켤 수 있어요'); }

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

