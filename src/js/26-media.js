/* ================= 영상 · 세로/펼침 바꾸기 · 무료 번역(Ollama) · 받은 작품 자동 반영 ================= */

/* ---------- 영상 회차 ---------- */
// 연결한 폴더의 영상은 통째로 읽지 않고 app://novel/__disk/ 주소로 흘려 보며 재생한다(윈도우 프로그램).
// 자막(srt·vtt)이 옆에 있으면 붙이고, 번역해 둔 한국어 자막이 있으면 그것을 먼저 보여 준다.
const srtToVtt = t => 'WEBVTT\n\n' + t.replace(/\r/g, '').replace(/^\d+\n(?=\d\d:)/gm, '').replace(/(\d\d:\d\d:\d\d),(\d{3})/g, '$1.$2').trim() + '\n';
async function subText(f){ const t = await decodeText(f); return /^WEBVTT/.test(t.trim()) ? t : srtToVtt(t); }
const vtime = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function addTrack(v, label, vtt, lang = 'ko', on = false){
  [...v.querySelectorAll('track')].filter(t => t.label === label).forEach(t => t.remove());
  const t = document.createElement('track'); t.kind = 'subtitles'; t.label = label; t.srclang = lang; t.src = url(new Blob([vtt], {type: 'text/vtt'}));
  v.append(t);
  if (on) setTimeout(() => { for (const tr of v.textTracks) tr.mode = tr.label === label ? 'showing' : 'disabled'; vSubSync(v); }, 60);
  return t;
}
// 자막 고르기 칸을 지금 붙은 자막대로 다시 채운다
function vSubSync(v){
  const sel = $('#vSub'); if (!sel || !v) return;
  const tracks = [...v.textTracks];
  sel.innerHTML = '<option value="-1">자막 끄기</option>' + tracks.map((t, i) => `<option value="${i}">${esc(t.label || `자막 ${i + 1}`)}</option>`).join('');
  sel.value = String(tracks.findIndex(t => t.mode === 'showing'));
  sel.hidden = !tracks.length;
}
async function renderVideo(ep, pos = {}){
  const r = $('#reader'); r.innerHTML = '';
  const box = document.createElement('div'); box.className = 'vbox';
  const v = document.createElement('video'); v.controls = true; v.playsInline = true; v.preload = 'metadata'; v.tabIndex = -1;
  const f = ep.file;
  v.src = f.streamUrl || url(await realBlob(f));
  v.playbackRate = store.get('set.vRate', 1);
  // 그 글의 표지 그림을 재생 전 화면으로 (만화 칸에 따로 나오던 영상 표지)
  if (ep.cover){ try{ v.poster = ep.cover.streamUrl || url(await realBlob(ep.cover)); }catch{} }
  box.append(v);
  // 위 줄: 제목 · 10초 뒤로 · 재생 · 10초 앞으로 · 속도 · 자막 · 번역 · 전체 화면 · 다음
  const bar = document.createElement('div'); bar.className = 'vinfo';
  bar.innerHTML = `<b></b><span class="vt hint">0:00 / 0:00</span><span style="flex:1"></span>
    <button data-a="back" title="10초 뒤로 (← 또는 J)">« 10초</button>
    <button data-a="play" title="재생·멈춤 (스페이스 또는 K)">▶</button>
    <button data-a="fwd" title="10초 앞으로 (→ 또는 L)">10초 »</button>
    <select id="vRate" title="재생 속도">${[0.5, 0.75, 1, 1.25, 1.5, 2].map(x => `<option value="${x}">${x}배</option>`).join('')}</select>
    <select id="vSub" title="자막" hidden></select>
    <button data-a="tr" title="이 영상을 한국어 자막으로 (내 컴퓨터 AI, 무료)">한국어 자막 만들기</button>
    <button data-a="full" title="전체 화면 (Enter)">전체 화면</button>
    <button data-a="next" title="다음 영상 ( ] )">다음</button>`;
  bar.querySelector('b').textContent = ep.label || ep.name;
  bar.querySelector('#vRate').value = String(v.playbackRate);
  bar.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'back') vSeek(v, -10); else if (a === 'fwd') vSeek(v, 10);
    else if (a === 'play') v.paused ? v.play().catch(() => {}) : v.pause();
    else if (a === 'full') (document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen?.());
    else if (a === 'next') openEp(curEp + 1);
    else if (a === 'tr') translateVideo(ep, v, e.target.closest('button'));
  };
  bar.querySelector('#vRate').onchange = e => { v.playbackRate = +e.target.value; store.set('set.vRate', v.playbackRate); };
  bar.querySelector('#vSub').onchange = e => { [...v.textTracks].forEach((t, i) => t.mode = i === +e.target.value ? 'showing' : 'disabled'); };
  box.append(bar); r.append(box);
  // 자막: 저장해 둔 한국어 번역본 → 옆에 있던 자막 파일들
  const ko = store.get('trsub.' + subKey(ep), null) || await trCacheGet('vsub:' + subKey(ep));
  if (ko) addTrack(v, '한국어 (번역)', ko, 'ko', true);
  for (const [i, s] of (ep.subs || []).entries()){
    try{ addTrack(v, s.name.replace(/^.*?\.([^.]+)\.(srt|vtt)$/i, '$1') || `자막 ${i + 1}`, await subText(s), 'und', !ko && i === 0); }catch{}
  }
  setTimeout(() => vSubSync(v), 100);
  const tl = bar.querySelector('.vt'), pb = bar.querySelector('[data-a=play]');
  const tick = () => { tl.textContent = `${vtime(v.currentTime)} / ${vtime(v.duration)}`; pb.textContent = v.paused ? '▶' : '❚❚'; };
  for (const ev of ['timeupdate', 'play', 'pause', 'loadedmetadata', 'seeked']) v.addEventListener(ev, tick);
  // 이어 보기: 지난번 본 자리부터 (끝 5초 안이면 처음부터)
  if (pos.vt) v.addEventListener('loadedmetadata', () => { if (pos.vt < (v.duration || 0) - 5) v.currentTime = pos.vt; }, {once: true});
  let lastSave = 0;
  v.addEventListener('timeupdate', () => { if (Date.now() - lastSave > 5000){ lastSave = Date.now(); savePos(); } });
  v.addEventListener('pause', savePos);
  v.addEventListener('error', () => { const c = v.error?.code; toast(c === 4 ? '이 영상 형식은 재생할 수 없어요(코덱). 파일 탐색기에서 다른 플레이어로 열어 주세요' : '영상을 읽는 중 문제가 생겼어요. 다시 열어 보세요'); });
  v.addEventListener('ended', () => { markRead(curEp); if ($('#autoNext').value === 'auto' && cur.eps[curEp + 1]) openEp(curEp + 1); });
  // 영상 위 클릭이 읽는 화면의 쪽 넘기기로 새지 않게
  box.addEventListener('click', e => e.stopPropagation());
  box.addEventListener('dblclick', e => { e.stopPropagation(); if (e.target === v) (document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen?.()); });
  $('#pane-stat').innerHTML = `<h3>${esc(ep.name)}</h3><div class="hint">영상 회차예요. 스페이스·K 재생/멈춤, ← → (J·L) 10초, ↑ ↓ 소리, Enter 전체 화면, [ ] 이전·다음 영상.</div>`;
}
function vSeek(v, d){ if (!v) return; const t = Math.min(Math.max(0, v.currentTime + d), (v.duration || 1e9) - 0.2); v.currentTime = t; toast(`${d > 0 ? '+' : ''}${d}초 · ${vtime(t)}`); }
const subKey = ep => (cur?.key || '') + '|' + (ep.file?.name || ep.name);

/* ---------- 만화: 세로 스크롤 ↔ 펼침 ---------- */
// 지금 보고 있는 그림 번호 (펼침이면 그 쪽, 세로면 화면 가운데 그림)
function curImgIndex(){
  if ($('#reader .manga')) return mangaPos;
  const imgs = $$('#reader .webtoon img'); if (!imgs.length) return 0;
  const rb = $('#reader').getBoundingClientRect(); const mid = rb.top + rb.height / 2;
  for (let i = 0; i < imgs.length; i++){ const b = imgs[i].getBoundingClientRect(); if (b.bottom >= mid) return i; }
  return imgs.length - 1;
}
function flowSwitchTo(mode){
  if (!cur) return;
  const ep = cur.eps[curEp];
  if (!ep || isText(ep)) return openEp(curEp, {f: getFrac()});
  const i = curImgIndex();
  openEp(curEp, mode === 'manga' ? {page: i} : {img: i, off: 0});
}
function updateFlowBtn(){
  const b = $('#btnFlow'); if (!b) return;
  const ep = cur?.eps?.[curEp];
  b.hidden = !cur || !ep || isText(ep) || ep.type === 'video';
  const scroll = !!$('#reader .webtoon');
  b.title = scroll ? '한 쪽씩 펼쳐 보기 (V)' : '세로로 이어서 스크롤 (V)';
  b.querySelector('use')?.setAttribute('href', scroll ? '#i-book' : '#i-scroll');
}
async function toggleFlow(){
  if (!cur) return;
  const next = $('#reader .webtoon') ? 'manga' : 'webtoon';
  $('#mode').value = next; store.set('set.mode.' + cur.kind, next);
  await flowSwitchTo(next); updateFlowBtn();
  toast(next === 'webtoon' ? '세로 스크롤로 봐요 (다음에도 이렇게 열려요)' : '한 쪽씩 펼쳐 봐요');
}
$('#btnFlow')?.addEventListener('click', toggleFlow);
document.addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.key === 'v' || e.key === 'V') && cur && !$('#btnFlow')?.hidden){ e.preventDefault(); toggleFlow(); }
  // 영상: 읽는 화면의 쪽 넘기기(스페이스·→ 가 다음 화로 넘어가던 문제)보다 먼저 받아 여기서 끝낸다
  const v = $('#reader video'); if (!v || atHome() || atLib()) return;
  const k = e.key, K = k.length === 1 ? k.toLowerCase() : k;
  const done = () => { e.preventDefault(); e.stopImmediatePropagation(); };
  if (k === ' ' || K === 'k'){ done(); v.paused ? v.play().catch(() => {}) : v.pause(); }
  else if (k === 'ArrowRight' || K === 'l'){ done(); vSeek(v, e.shiftKey ? 30 : 10); }
  else if (k === 'ArrowLeft' || K === 'j'){ done(); vSeek(v, e.shiftKey ? -30 : -10); }
  else if (k === 'ArrowUp'){ done(); v.volume = Math.min(1, v.volume + 0.1); toast(`소리 ${Math.round(v.volume * 100)}%`); }
  else if (k === 'ArrowDown'){ done(); v.volume = Math.max(0, v.volume - 0.1); toast(`소리 ${Math.round(v.volume * 100)}%`); }
  else if (K === 'm'){ done(); v.muted = !v.muted; toast(v.muted ? '소리 끔' : '소리 켬'); }
  else if (k === 'Enter'){ done(); document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen?.(); }
  else if (k === 'Home'){ done(); v.currentTime = 0; }
  else if (k === 'PageDown' || k === 'PageUp' || k === 'End'){ done(); }
}, true);

/* ---------- 무료 번역 (내 컴퓨터 GPU 의 번역 엔진 + Ollama) ---------- */
// 만화·웹툰: 번역 엔진(translator/server.py)이 말풍선 글자를 찾아 읽고, 한 쪽을 통째로 앞 쪽 문맥과 함께 한국어로 옮긴 뒤,
//            원문을 지우고 그 자리에 한국어를 넣은 그림을 돌려준다. 화면은 그 그림으로 바꿔 보여 준다(원문 보기로 되돌림).
// 영상: 엔진이 음성을 듣고(Whisper) 한국어 자막을 만든다. 자막 파일이 이미 있으면 그 자막을 바로 옮긴다(더 빠르고 정확).
// 인터넷 번역기를 쓰지 않아 돈이 들지 않고, 그림·영상이 밖으로 나가지 않는다.
// 폰·아이패드(같은 와이파이 손님)는 노트북의 번역 엔진을 노트북 서버를 거쳐 쓴다
const TRS = (typeof LAN_BASE !== 'undefined' && LAN_BASE) ? LAN_BASE + '/tr' : 'http://127.0.0.1:8790';
const TR = {auto: store.get('set.trAuto', false), on: store.get('set.trShow', true), busy: false, queue: [], ctx: new Map(), ready: false, last: null};
const trLang = () => store.get('set.trLang', 'auto');
// 번역 AI: 내 컴퓨터(무료·무제한) 또는 무료 사용량이 있는 서비스들, 유료 Claude. 키는 이 기기에만 남는다(백업·동기화 안 됨).
const TR_PROV = [
  {id: 'local', name: '내 컴퓨터 (무료·무제한)'},
  {id: 'gemini', name: 'Gemini (무료 사용량)', key: 'gemKey', url: 'https://aistudio.google.com/apikey'},
  {id: 'groq', name: 'Groq (무료)', key: 'grKey', url: 'https://console.groq.com/keys'},
  {id: 'openrouter', name: 'OpenRouter 무료 모델', key: 'tr.key.openrouter', url: 'https://openrouter.ai/keys'},
  {id: 'cerebras', name: 'Cerebras (무료)', key: 'tr.key.cerebras', url: 'https://cloud.cerebras.ai/'},
  {id: 'mistral', name: 'Mistral (무료 요금제)', key: 'tr.key.mistral', url: 'https://console.mistral.ai/api-keys'},
  {id: 'github', name: 'GitHub Models (무료)', key: 'tr.key.github', url: 'https://github.com/settings/personal-access-tokens'},
  {id: 'deepl', name: 'DeepL (월 50만 자 무료)', key: 'tr.key.deepl', url: 'https://www.deepl.com/pro-api', mt: true},
  {id: 'microsoft', name: 'Microsoft 번역 (월 200만 자 무료)', key: 'tr.key.microsoft', url: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation', mt: true, region: true},
  {id: 'claude', name: 'Claude (유료)', key: 'apiKey', url: 'https://console.anthropic.com/settings/keys'},
  {id: 'custom', name: '직접 입력 (OpenAI 형식 주소)', key: 'tr.key.custom', base: true},
];
const trProvId = () => store.get('set.trProv', 'local');
const trProvDef = (id = trProvId()) => TR_PROV.find(p => p.id === id) || TR_PROV[0];
const trModel = (id = trProvId()) => store.get('set.trModel.' + id, id === 'local' ? store.get('set.trModel', '') : '');
// 이번 번역에 쓸 AI. 성인 작품은 (따로 허락하지 않았으면) 늘 내 컴퓨터 — 바깥 서비스는 이용 규칙상 거절하거나 막을 수 있다
function trProvCfg(){
  const d = trProvDef();
  if (d.id === 'local' || (isAdult(cur) && !store.get('set.trAdultCloud', false))) return {id: 'local'};
  return {id: d.id, key: d.key ? store.get(d.key, '') : '', model: trModel(d.id), base: store.get('set.trBase.' + d.id, ''), region: store.get('set.trRegion.' + d.id, '')};
}
const trByText = by => (by || []).map(x => { const [a, b] = x.split('→'); const n = id => (TR_PROV.find(p => p.id === id)?.name || id).replace(/\s*\(.*\)$/, ''); return b ? `${n(a)}가 거절·한도라 ${n(b)}` : n(a); }).join(', ');
async function trCacheGet(id){ try{ return (await idb.tx('readonly', s => s.get('tr:' + id), 'dcache'))?.v || null; }catch{ return null; } }
async function trCacheSet(id, v){ try{ await idb.tx('readwrite', s => s.put({id: 'tr:' + id, v}), 'dcache'); }catch{} }
async function trCacheDelPrefix(prefix){ try{ const keys = await idb.tx('readonly', s => s.getAllKeys(), 'dcache'); const del = keys.filter(k => String(k).startsWith('tr:' + prefix)); if (del.length) await idb.tx('readwrite', s => { for (const k of del) s.delete(k); }, 'dcache'); return del.length; }catch{ return 0; } }
// 번역해 둔 쪽 지우기: 이 기기와 PC(엔진이 저장한 것). keys 또는 prefix(작품|회차| 처럼 앞머리)
async function trForget({keys = [], prefix = ''} = {}){
  let n = 0;
  for (const k of keys) n += await trCacheDelPrefix('pg:' + k);
  if (prefix) n += await trCacheDelPrefix('pg:' + prefix);
  const r = await fetch(TRS + '/forget', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keys, prefix})}).then(r => r.json()).catch(() => ({removed: 0}));
  return n + (r.removed || 0);
}

/* 번역 칸 */
function trPanel(){
  let p = $('#trBox'); if (p) return p;
  p = document.createElement('div'); p.id = 'trBox'; p.className = 'trbox';
  p.innerHTML = `<div class="trh"><b>번역</b><span class="trw hint"></span><span style="flex:1"></span>
      <button data-a="orig" title="원문 그림과 번역 그림 바꿔 보기 (O)">원문 보기</button><button data-a="x" title="닫기">✕</button></div>
    <div class="trb"></div>
    <div class="trf">
      <label><input type="checkbox" id="trAuto"> 넘길 때마다 자동 번역</label>
      <button data-a="ep">이 화 전부 번역</button><button data-a="again" title="저장된 번역을 버리고 이 쪽을 처음부터">이 쪽 다시</button><button data-a="epAgain" title="저장된 번역을 버리고 이 화 전부를 처음부터">이 화 처음부터</button><button data-a="workClear" title="이 작품에 저장된 번역을 모두 지운다(PC·이 기기)">이 작품 번역 지우기</button>
      <span style="flex:1"></span>
      <select id="trLang" title="원문 언어"><option value="auto">언어 자동</option><option value="ja">일본어</option><option value="en">영어</option><option value="zh">중국어</option></select>
    </div>
    <div class="trf trai">
      <label title="번역 문장을 만들 AI">번역 AI <select id="trProv">${TR_PROV.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label>
      <button data-a="cfg" title="키·모델 설정">설정</button>
    </div>
    <div class="trcfg" hidden>
      <div class="trrow" data-k><label>키 <input id="trKey" type="password" autocomplete="off" spellcheck="false" placeholder="API 키"></label> <a id="trKeyUrl" target="_blank" rel="noopener">무료 키 받기</a></div>
      <div class="trrow" data-base><label>주소 <input id="trBase" spellcheck="false" placeholder="https://…/v1"></label></div>
      <div class="trrow" data-region><label>지역 <input id="trRegion" spellcheck="false" placeholder="koreacentral"></label></div>
      <div class="trrow" data-model><label>모델 <select id="trModelSel"><option value="">자동으로 고르기</option></select></label> <button data-a="models">목록 불러오기</button></div>
      <div class="trrow"><label><input type="checkbox" id="trAdultCloud"> 성인 작품도 이 AI 로 (거절되면 내 컴퓨터가 옮겨요)</label></div>
      <p class="hint" id="trCfgHint"></p>
    </div>`;
  document.body.append(p);
  p.querySelector('#trAuto').checked = TR.auto;
  p.querySelector('#trAuto').onchange = e => { TR.auto = e.target.checked; store.set('set.trAuto', TR.auto); if (TR.auto) trCurrent(); };
  p.querySelector('#trLang').value = trLang();
  p.querySelector('#trLang').onchange = e => store.set('set.trLang', e.target.value);
  p.querySelector('#trProv').value = trProvId();
  p.querySelector('#trProv').onchange = e => { store.set('set.trProv', e.target.value); trCfgSync(); trLoadModels(); };
  p.querySelector('#trKey').onchange = e => { const d = trProvDef(); if (d.key && e.target.value.trim()){ store.set(d.key, e.target.value.trim()); e.target.value = ''; trCfgSync(); trLoadModels(); toast('키를 저장했어요 (이 기기에만)'); } };
  p.querySelector('#trBase').onchange = e => { store.set('set.trBase.' + trProvId(), e.target.value.trim()); trLoadModels(); };
  p.querySelector('#trRegion').onchange = e => store.set('set.trRegion.' + trProvId(), e.target.value.trim());
  p.querySelector('#trModelSel').onchange = e => store.set('set.trModel.' + trProvId(), e.target.value);
  p.querySelector('#trAdultCloud').checked = store.get('set.trAdultCloud', false);
  p.querySelector('#trAdultCloud').onchange = e => store.set('set.trAdultCloud', e.target.checked);
  p.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'x'){ p.classList.remove('show'); }
    else if (a === 'orig') trToggleShow();
    else if (a === 'again') trCurrent(true);
    else if (a === 'ep') trWholeEp();
    else if (a === 'epAgain'){ if (confirm('이 화에 저장된 번역을 버리고 처음부터 다시 번역할까요?')) trWholeEp(true); }
    else if (a === 'workClear'){ if (cur && confirm(`"${cur.name}" 에 저장된 번역을 모두 지울까요? (그림 원본은 그대로)`)) trForget({prefix: cur.key + '|'}).then(n => { curImgs.forEach((it, i) => { it.trRes = null; it.trSrc = null; it.trP = null; trApply(i); }); toast(`번역 ${n}개를 지웠어요. 다시 번역할 수 있어요`); }); }
    else if (a === 'cfg'){ const c = p.querySelector('.trcfg'); c.hidden = !c.hidden; if (!c.hidden){ trCfgSync(); trLoadModels(); } }
    else if (a === 'models') trLoadModels(true);
  };
  trCfgSync();
  return p;
}
// 고른 AI 에 맞게 설정 칸을 보이고 감춘다
function trCfgSync(){
  const p = $('#trBox'); if (!p) return; const d = trProvDef();
  p.querySelector('[data-k]').hidden = !d.key;
  p.querySelector('#trKey').placeholder = d.key && store.get(d.key, '') ? '저장됨 (바꾸려면 새로 입력)' : 'API 키';
  const u = p.querySelector('#trKeyUrl'); u.hidden = !d.url; if (d.url) u.href = d.url;
  p.querySelector('[data-base]').hidden = !d.base; p.querySelector('#trBase').value = store.get('set.trBase.' + d.id, '');
  p.querySelector('[data-region]').hidden = !d.region; p.querySelector('#trRegion').value = store.get('set.trRegion.' + d.id, '');
  p.querySelector('[data-model]').hidden = !!d.mt;
  p.querySelector('#trCfgHint').textContent = d.id === 'local'
    ? '그림 읽기·글자 지우기·그리기는 늘 내 컴퓨터가 해요. 번역 문장만 고른 AI 가 만들어요(보내는 건 대사 글자뿐, 그림은 보내지 않아요).'
    : `${d.name}: 대사 글자만 보내요. 거절·사용량 초과·오류가 나면 그 쪽은 내 컴퓨터가 대신 옮겨요. 성인 작품은 아래를 켜지 않으면 늘 내 컴퓨터로 옮겨요.`;
}
// 고른 AI 의 모델 목록 (엔진이 그 서비스에 물어본다 — 모델 이름을 짐작하지 않는다)
async function trLoadModels(show = false){
  const p = $('#trBox'); if (!p) return; const d = trProvDef(); if (d.mt) return;
  const sel = p.querySelector('#trModelSel'); const want = trModel(d.id);
  const cfg = d.id === 'local' ? {id: 'local'} : {id: d.id, key: d.key ? store.get(d.key, '') : '', base: store.get('set.trBase.' + d.id, '')};
  if (d.key && !cfg.key){ sel.innerHTML = '<option value="">키를 먼저 넣어 주세요</option>'; return; }
  sel.innerHTML = '<option value="">불러오는 중…</option>';
  try{
    if (!(await fetch(TRS + '/health').then(r => r.ok).catch(() => false)) && !(await trEnsure())) throw new Error('번역 엔진이 꺼져 있어요');
    const j = await fetch(TRS + '/models', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({provider: cfg})}).then(r => r.json());
    sel.innerHTML = '<option value="">자동으로 고르기</option>' + (j.models || []).map(m => `<option>${esc(m)}</option>`).join('');
    sel.value = (j.models || []).includes(want) ? want : '';
    if (j.error && show) toast('모델 목록을 받지 못했어요: ' + j.error.slice(0, 80));
  }catch(e){ sel.innerHTML = '<option value="">자동으로 고르기</option>'; if (show) toast(e.message); }
}
function trShow(where, html){ const p = trPanel(); p.classList.add('show'); if (where != null) p.querySelector('.trw').textContent = where; p.querySelector('.trb').innerHTML = html; }

/* 엔진 준비: 설치(처음 한 번) → 켜기 */
async function trEnsure(){
  if (TR.ready && await fetch(TRS + '/health').then(r => r.ok).catch(() => false)) return true;
  if (!window.nvDesktop?.trStatus){
    if (TRS === 'http://127.0.0.1:8790'){ trShow('', '<p>번역 엔진은 윈도우 프로그램(Novelist)에서 쓸 수 있어요. 폰·아이패드는 PC 의 Novelist 주소로 열면 PC 엔진으로 번역해요.</p>'); return false; }
    // 폰·아이패드: PC 가 엔진을 켜 준다 (처음엔 10~20초)
    trShow(null, '<p class="hint">PC 번역 엔진을 켜는 중…</p>');
    const h = await fetch(TRS + '/health').then(r => r.ok ? r.json() : null).catch(() => null);
    if (!h){ trShow('', '<p>PC 에서 번역 엔진을 켜지 못했어요. PC 의 Novelist 에서 번역 엔진을 한 번 설치해 주세요.</p>'); return false; }
    TR.ready = true; return trOllamaCheck(h);
  }
  const st = await window.nvDesktop.trStatus();
  if (st.health){ TR.ready = true; return trOllamaCheck(st.health); }
  if (!st.installed){
    trShow('번역 엔진', `<p><b>무료 번역 엔진</b>을 처음 한 번 설치해요. 그림의 말풍선을 찾아 읽고, 원문을 지우고 한국어를 넣어 주고, 영상은 음성을 듣고 자막을 만들어요.</p>
      <p class="hint">내 컴퓨터 그래픽카드로 돌아가서 돈이 들지 않고, 그림·영상이 밖으로 나가지 않아요. 받는 양 약 5GB · 10~30분.</p>
      ${st.installing ? '<p class="hint">설치하는 중이에요…</p>' : '<button class="primary" id="trInstallBtn">번역 엔진 설치</button>'}<pre class="trlog" id="trLog"></pre>`);
    $('#trInstallBtn') && ($('#trInstallBtn').onclick = trInstall);
    return false;
  }
  trShow(null, '<p class="hint">번역 엔진 켜는 중… (처음엔 10초쯤)</p>');
  const r = await window.nvDesktop.trStart();
  if (!r.ok){ trShow(null, `<p>번역 엔진을 켜지 못했어요. ${esc(r.err || '')}</p>`); return false; }
  TR.ready = true;
  const h = await fetch(TRS + '/health').then(r => r.json()).catch(() => null);
  return trOllamaCheck(h);
}
async function trOllamaCheck(h){
  if (h?.ollama || trProvCfg().id !== 'local') return true;   // 바깥 AI 를 골랐으면 Ollama 없이도 된다
  if (!window.nvDesktop){ trShow(null, '<p>PC 의 <b>Ollama</b> 가 꺼져 있어요. PC 에서 켜거나, 번역 칸의 <b>번역 AI</b> 에서 다른 AI 를 골라 주세요.</p>'); return false; }
  trShow(null, `<p>번역 문장을 만드는 <b>Ollama</b> 가 꺼져 있어요. 켜거나, 아래 <b>번역 AI</b> 에서 무료 AI 를 골라도 돼요.</p><button class="primary" id="trOl">Ollama 켜기</button>`);
  $('#trOl').onclick = async () => { trShow(null, '<p class="hint">Ollama 켜는 중…</p>'); await window.nvDesktop.ollamaStart?.(); setTimeout(() => trCurrent(true), 5000); };
  return false;
}
let trInstallHooked = false;
async function trInstall(){
  if (!trInstallHooked && window.nvDesktop.onTrInstallLog){
    trInstallHooked = true;
    window.nvDesktop.onTrInstallLog(line => {
      const log = $('#trLog'); if (log){ log.textContent = (log.textContent + '\n' + line).split('\n').slice(-6).join('\n'); }
      const m = line.match(/^STEP (\d+)\/(\d+) (.*)$/); if (m) $('#trBox .trw').textContent = `설치 ${m[1]}/${m[2]} · ${m[3]}`;
      if (line === 'DONE'){ toast('번역 엔진을 설치했어요'); trCurrent(true); }
      else if (/^FAIL/.test(line)) trShow('설치 실패', '<p>설치가 끝나지 않았어요. 인터넷을 확인하고 다시 눌러 주세요(받은 것은 이어서 받아요).</p><button class="primary" id="trInstallBtn">다시 설치</button>'), $('#trInstallBtn').onclick = trInstall;
    });
  }
  const b = $('#trInstallBtn'); if (b){ b.disabled = true; b.textContent = '설치하는 중…'; }
  const r = await window.nvDesktop.trInstall();
  if (r && r.ok === false && r.err) trShow('설치', `<p>${esc(r.err)}</p>`);
}

/* 만화·웹툰 한 쪽 */
const blobB64 = async b => { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const trKey = (i, ep = cur?.eps?.[curEp]) => `${cur?.key}|${ep?.name}|${i}`;
// 쪽 하나 번역: 결과 그림을 curImgs[i] 에 붙여 둔다(trSrc). 같은 그림은 엔진이 저장해 둔 것을 바로 돌려준다.
async function trPage(i, {force = false, quiet = false} = {}){
  const it = curImgs[i]; if (!it) return null;
  if (it.trRes && !force) return it.trRes;
  if (it.trP && !force) return it.trP;
  const w = cur, ep = w.eps[curEp];
  it.trP = (async () => {
    const key = trPgKey(i);
    // 번역해 둔 쪽이 있으면 다시 옮기지 않는다 (이 기기 → PC 에 저장된 것). '다시 번역'(force)만 새로
    if (!force){ const s = await trSaved(key); if (s){ await trUse(w, ep, i, s, false); return s; } }
    else if (key) await trForget({keys: [key]});   // 처음부터: 저장분을 지우고
    const blob = await blobOf(it);
    const ctxKey = w.key;
    const lang = trLang() === 'auto' ? (TR.langOf?.[w.key] || 'auto') : trLang();   // 앞 쪽에서 알아낸 언어를 쓴다(쪽마다 0.5~1초 아낌)
    const body = {image: await blobB64(blob), lang, model: trModel('local'), provider: trProvCfg(), adult: isAdult(w), context: (TR.ctx.get(ctxKey) || []).slice(-16), key, force};
    const r = await fetch(TRS + '/page', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const j = await r.json().catch(() => ({error: '응답을 읽지 못했어요'}));
    if (!r.ok){ const e = new Error(j.error === 'ollama' ? 'ollama' : (j.error || '번역 실패')); throw e; }
    if (j.lang && /^(ja|en|zh)$/.test(j.lang)) (TR.langOf ||= {})[w.key] = j.lang;
    if (key && j.image) trCacheSet('pg:' + key, j);   // 이 기기에도 남겨 둔다 (엔진은 PC 에 남긴다)
    await trUse(w, ep, i, j, true);
    return j;
  })();
  try{ return await it.trP; } catch(e){ it.trP = null; throw e; }
}
// 쪽 열쇠: 작품|회차|그림 이름. PC 와 폰에서 같다(같은 폴더 이름으로 읽으니)
function trPgKey(i){ const it = curImgs[i], ep = cur?.eps?.[curEp]; return cur && ep && it ? `${cur.key}|${ep.name}|${it.name}` : ''; }
// 번역해 둔 쪽 찾기: 이 기기 → PC 디스크(윈도우 프로그램은 바로, 폰은 PC 주소로). 엔진은 켜지 않는다
async function trSaved(key){
  if (!key) return null;
  let j = await trCacheGet('pg:' + key); if (j) return j;
  try{
    if (window.nvDesktop?.trPageGet){ const s = await window.nvDesktop.trPageGet(key); j = s ? JSON.parse(s) : null; }
    else if (typeof LAN_BASE !== 'undefined' && LAN_BASE){ const r = await fetch(LAN_BASE + '/lan/trcache?k=' + encodeURIComponent(key), {cache: 'no-store'}); j = r.ok ? await r.json() : null; }
  }catch{ j = null; }
  if (j?.image){ trCacheSet('pg:' + key, j); return j; }
  return null;
}
// 번역 결과를 그 쪽에 붙이고(그림·대사), 보고 있으면 바로 바꿔 보여 준다
async function trUse(w, ep, i, j, fresh){
  const it = curImgs[i]; if (!it || w !== cur || w.eps[curEp] !== ep) return;
  if (j.image && !it.trSrc){ const b = await (await fetch('data:image/jpeg;base64,' + j.image)).blob(); it.trSrc = URL.createObjectURL(b); objectUrls.push(it.trSrc); }
  else if (j.image && fresh){ const b = await (await fetch('data:image/jpeg;base64,' + j.image)).blob(); it.trSrc = URL.createObjectURL(b); objectUrls.push(it.trSrc); }
  it.trRes = j; if (i === 0) window.nvTrFirstSrc = it.trSrc;   // 시험용
  const pairs = (j.blocks || []).map(b => [b.src, b.ko]); if (pairs.length) TR.ctx.set(w.key, [...(TR.ctx.get(w.key) || []), ...pairs].slice(-40));
  trApply(i);
}
// 회차를 열면: 번역해 둔 쪽은 버튼을 누르지 않아도 바로 한국어로 (번역으로 보기가 켜져 있을 때)
async function trSavedEp(){
  const w = cur, ep = w?.eps?.[curEp]; if (!ep || ep.type === 'video' || isText(ep) || !curImgs.length || !TR.on) return;
  const keys = curImgs.map((_, i) => trPgKey(i));
  let has = keys.map(() => false);
  try{
    if (window.nvDesktop?.trPageHas) has = await window.nvDesktop.trPageHas(keys);
    else if (typeof LAN_BASE !== 'undefined' && LAN_BASE) has = await fetch(LAN_BASE + '/lan/trcache', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keys})}).then(r => r.json());
  }catch{}
  let n = 0;
  for (let i = 0; i < keys.length; i++){
    if (w !== cur || w.eps[curEp] !== ep) return;
    if (curImgs[i]?.trRes) continue;
    const local = await trCacheGet('pg:' + keys[i]);
    if (!local && !has[i]) continue;
    const j = local || await trSaved(keys[i]); if (!j) continue;
    await trUse(w, ep, i, j, false); n++;
  }
  window.nvTrSavedN = n;   // 시험용
  if (n) toast(`번역해 둔 ${n}쪽을 한국어로 보여 줘요 (원문은 O 키·번역 칸의 '원문 보기')`);
}
// 화면에 번역 그림(또는 원문)을 보여 준다
function trApply(i){
  const it = curImgs[i]; if (!it) return;
  if (!it.origSrc && it.src) it.origSrc = it.src;
  const show = TR.on && it.trSrc ? it.trSrc : (it.origSrc || it.src);
  if (!show) return;
  it.src = show;
  const el = $(`#reader .webtoon img[data-i="${i}"]`); if (el && el.getAttribute('src')) el.src = show;
  if ($('#reader .manga') && (i === mangaPos || i === mangaPos + 1)) renderManga();
}
function trToggleShow(){
  TR.on = !TR.on; store.set('set.trShow', TR.on);
  curImgs.forEach((it, i) => { if (it.trSrc) trApply(i); });
  const b = $('#trBox [data-a=orig]'); if (b) b.textContent = TR.on ? '원문 보기' : '번역 보기';
  toast(TR.on ? '번역으로 보여요' : '원문으로 보여요');
}
function trLinesHtml(j){
  if (!j) return '';
  if (j.note) return `<p class="hint">${esc(j.note)}</p><button data-a="again">처음부터 다시 번역</button> <span class="hint">(더 민감하게 글자를 찾아요)</span>`;
  const lang = {ja: '일본어', en: '영어', zh: '중국어'}[j.lang] || j.lang;
  return `<p class="hint">${esc(lang)} → 한국어 · 대사 ${j.blocks.length}개${j.ms ? ` · ${(j.ms / 1000).toFixed(1)}초` : ''}${(j.by || []).length ? ` · ${esc(trByText(j.by))}` : (j.model ? ` · ${esc(j.model)}` : '')}</p>` +
    j.blocks.map(b => `<p><span class="o">${esc(b.src)}</span><span class="k">${esc(b.ko)}</span></p>`).join('');
}
async function trCurrent(force = false){
  if (!cur) return toast('작품을 먼저 열어 주세요');
  const ep = cur.eps[curEp];
  if (ep?.type === 'video') return translateVideo(ep, $('#reader video'), null);
  if (!ep || isText(ep) || !curImgs.length){ trShow('', '<p>그림 회차(만화·웹툰)나 영상에서 쓸 수 있어요.</p>'); return; }
  const i = curImgIndex(); const where = `${ep.label || ep.name} · ${i + 1}쪽`;
  trShow(where, curImgs[i].trRes && !force ? trLinesHtml(curImgs[i].trRes) : '<p class="hint">말풍선을 찾아 읽고 옮기는 중… (처음엔 모델을 불러오느라 30초쯤 걸려요)</p>');
  if (!(await trEnsure())) return;
  try{
    const j = await trPage(i, {force});
    if (curImgIndex() === i) trShow(where, trLinesHtml(j));
    trPrefetch(i);
  }catch(e){
    if (e.message === 'ollama') return trOllamaCheck(null);
    trShow(where, `<p>번역하지 못했어요: ${esc(e.message)}</p>`);
  }
}
// 자동 번역: 다음 두 쪽을 미리 옮겨 둔다(넘기면 바로 한국어)
// 쪽들을 차례로 옮긴다. 두 쪽씩 겹쳐 보냈더니 8GB 그래픽카드에서 서로 다퉈 오히려 느렸다(실측: 한 쪽씩 5.2초 → 두 쪽씩 8.9초, 2026-10-30)
async function trRun(idxs, opts = {}, onEach){
  const ep = cur.eps[curEp]; let next = 0, stop = false, done = 0;
  const worker = async () => {
    while (!stop && next < idxs.length){
      const k = idxs[next++];
      if (cur.eps[curEp] !== ep){ stop = true; return; }
      try{ await trPage(k, opts); }catch(e){ if (e.message === 'ollama'){ stop = true; throw e; } }
      done++; onEach?.(done, idxs.length);
    }
  };
  await worker();
}
async function trPrefetch(i){
  if (!TR.auto) return;
  const idxs = []; for (let k = i + 1; k <= Math.min(curImgs.length - 1, i + 4); k++) if (!curImgs[k]?.trRes) idxs.push(k);
  await trRun(idxs, {quiet: true}).catch(() => {});
}
async function trWholeEp(force = false){
  if (!cur || !curImgs.length) return;
  if (!(await trEnsure())) return;
  const ep = cur.eps[curEp]; const n = curImgs.length;
  if (force){ await trForget({prefix: `${cur.key}|${ep.name}|`}); curImgs.forEach((it, i) => { it.trRes = null; it.trSrc = null; it.trP = null; trApply(i); }); }
  const t0 = Date.now();
  trShow(`${ep.label || ep.name}`, `<p class="hint">이 화 전부 번역 중… 0 / ${n}쪽</p>`);
  try{ await trRun([...Array(n).keys()], {force}, d => trShow(`${ep.label || ep.name}`, `<p class="hint">이 화 전부 번역 중… ${d} / ${n}쪽 · ${Math.round((Date.now() - t0) / 1000)}초</p>`)); }
  catch(e){ if (e.message === 'ollama') return trOllamaCheck(null); }
  if (cur.eps[curEp] !== ep) return;
  trShow(`${ep.label || ep.name}`, `<p>이 화 ${n}쪽을 모두 옮겼어요. 넘기면서 보시면 돼요.</p>`);
}
// 쪽이 바뀌면: 번역해 둔 쪽은 바로 번역 그림으로, 자동이면 새로 옮긴다
let trT;
function trMaybe(){
  if (!cur) return;
  // 회차를 (다시) 열면 쪽 목록이 새로 생긴다: 그때 번역해 둔 쪽을 바로 한국어로
  if (curImgs.length && TR.epImgs !== curImgs){ TR.epImgs = curImgs; setTimeout(() => trSavedEp().catch(() => {}), 300); }
  clearTimeout(trT);
  trT = setTimeout(() => {
    const ep = cur?.eps?.[curEp]; if (!ep || ep.type === 'video' || isText(ep)) return;
    const i = curImgIndex(); const it = curImgs[i];
    if (it?.trSrc) trApply(i);
    if (TR.auto && $('#trBox')?.classList.contains('show')) trCurrent();
    else if (it?.trRes && $('#trBox')?.classList.contains('show')) trShow(`${ep.label || ep.name} · ${i + 1}쪽`, trLinesHtml(it.trRes));
  }, 500);
}
$('#btnTrans')?.addEventListener('click', () => trCurrent());
$('#reader').addEventListener('scroll', trMaybe, {passive: true});
document.addEventListener('keyup', e => { if (/Arrow|PageUp|PageDown| /.test(e.key)) trMaybe(); });
$('#reader').addEventListener('click', trMaybe);
document.addEventListener('keydown', e => { if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && curImgs.some(it => it.trSrc)){ e.preventDefault(); trToggleShow(); } });

/* 영상 */
async function translateVideo(ep, video, btn){
  if (!ep) return;
  if ((ep.subs || []).length) return translateSubs(ep, video, btn);   // 자막 파일이 있으면 그것을 옮긴다
  const p = ep.file?.abs || (TRS !== 'http://127.0.0.1:8790' && ep.file?.lanRel ? 'lan:' + ep.file.lanRel : '');   // 폰·아이패드: PC 가 경로를 찾는다
  if (!p){ trShow('영상', '<p>내 컴퓨터 폴더의 영상만 음성을 들어 자막을 만들 수 있어요.</p>'); return; }
  trShow('영상 자막', '<p class="hint">번역 엔진 준비 중…</p>');
  if (!(await trEnsure())) return;
  if (btn) btn.disabled = true;
  try{
    const {id, error} = await fetch(TRS + '/video', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: p, model: trModel('local'), provider: trProvCfg(), adult: isAdult(cur)})}).then(r => r.json());
    if (!id) throw new Error(error || '시작하지 못했어요');
    for (;;){
      await new Promise(r => setTimeout(r, 1500));
      const j = await fetch(TRS + '/job?id=' + id).then(r => r.json());
      trShow('영상 자막', `<p>${esc(j.msg || '')}</p><div class="trbar"><i style="width:${Math.round((j.progress || 0) * 100)}%"></i></div><p class="hint">영상은 계속 보셔도 돼요. 다 되면 한국어 자막이 켜져요.</p>`);
      if (j.state === 'done'){
        await trCacheSet('vsub:' + subKey(ep), j.vtt);
        if ($('#reader video') === video) addTrack(video, '한국어 (번역)', j.vtt, 'ko', true);
        trShow('영상 자막', `<p>한국어 자막을 만들었어요. ${esc(j.msg || '')}</p><p class="hint">영상 옆에 같은 이름의 .ko.vtt 로도 저장해 두었어요.</p>`);
        break;
      }
      if (j.state === 'error') throw new Error(j.msg);
    }
  }catch(e){ trShow('영상 자막', `<p>자막을 만들지 못했어요: ${esc(e.message)}</p>`); }
  finally{ if (btn) btn.disabled = false; }
}
// 자막 파일 번역: 30줄씩, 앞 줄을 문맥으로 (Ollama 직접)
async function translateSubs(ep, video, btn){
  const sub = (ep.subs || [])[0]; if (!sub) return;
  const vtt = await subText(sub);
  const items = vtt.split(/\n\n+/).map(b => b.split('\n')).filter(l => l.some(x => /-->/.test(x))).map(l => { const ti = l.findIndex(x => /-->/.test(x)); return {time: l[ti], text: l.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').trim()}; }).filter(c => c.text);
  if (!items.length) return toast('자막에 글자가 없어요');
  trShow('자막 번역', `<p class="hint">자막 ${items.length}줄을 옮기는 중…</p>`);
  if (btn) btn.disabled = true;
  try{
    if (!(await trEnsure())) return;
    // 엔진이 25줄씩 앞 줄을 문맥으로 옮긴다(고른 AI → 안 되면 내 컴퓨터)
    const r = await fetch(TRS + '/subs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({vtt, lang: trLang(), model: trModel('local'), provider: trProvCfg(), adult: isAdult(cur)})});
    const j = await r.json().catch(() => ({error: '응답을 읽지 못했어요'}));
    if (!r.ok || !j.vtt) throw new Error(j.error === 'ollama' ? 'Ollama 가 꺼져 있어요' : (j.error || '번역 실패'));
    await trCacheSet('vsub:' + subKey(ep), j.vtt);
    if (video) addTrack(video, '한국어 (번역)', j.vtt, 'ko', true);
    trShow('자막 번역', `<p>한국어 자막을 만들었어요 (${j.lines || items.length}줄${(j.by || []).length ? ' · ' + esc(trByText(j.by)) : ''}). 다음에 열 때도 이 자막이 나와요.</p>`);
  }catch(e){ trShow('자막 번역', `<p>번역하지 못했어요: ${esc(e.message)}</p>`); }
  finally{ if (btn) btn.disabled = false; }
}

/* ---------- 받은 작품 자동 반영 ---------- */
// 모아받기·토끼 다운로더가 연결한 폴더에 새로 받으면, 프로그램이 알려 줘서 그 폴더만 다시 읽는다.
if (window.nvDesktop?.onLibChanged){
  const pending = new Set(); let t = null;
  window.nvDesktop.onLibChanged(root => {
    pending.add(root); clearTimeout(t);
    t = setTimeout(async () => {
      const roots = [...pending]; pending.clear();
      const before = works.length; const counts = new Map(works.map(w => [w.key, w.eps.length]));
      for (const s of libSources()) if (s.kind === 'disk' && roots.some(r => r === s.path || s.path.startsWith(r) || r.startsWith(s.path))) await loadSource(s);
      const newWorks = works.length - before;
      const newEps = works.reduce((n, w) => n + Math.max(0, w.eps.length - (counts.get(w.key) ?? w.eps.length)), 0);
      if (newWorks || newEps) toast(`새로 받은 것이 서재에 들어왔어요${newWorks ? ` · 작품 ${newWorks}개` : ''}${newEps ? ` · 회차 ${newEps}개` : ''}`);
    }, 4000);
  });
}
// 받은 영상이 서재에 보이게 '영상' 폴더를 한 번 이어 준다: 보통 만화 옆의 영상, 성인\만화 옆의 성인\영상
setTimeout(async () => {
  if (!window.nvDesktop?.libSibling || store.get('set.videoLinked3', false)) return;
  store.set('set.videoLinked3', true);
  const disk = libSources().filter(s => s.kind === 'disk'); const added = [];
  for (const base of disk){
    if (!/[\\/](만화|노벨|웹툰)$/.test(base.path)) continue;
    const want = base.path.replace(/[^\\/]+$/, '영상');
    if (libSources().some(s => s.path === want) || added.some(s => s.path === want)) continue;
    const p = await window.nvDesktop.libSibling(base.path, '영상'); if (!p) continue;
    added.push({id: uid(), kind: 'disk', name: /[\\/]성인[\\/]/.test(p) ? '성인 영상' : '영상', path: p, t: Date.now()});
  }
  if (!added.length) return;
  libSave([...libSources(), ...added]); for (const s of added) await loadSource(s);
  toast(`받은 영상도 보이게 ${added.map(s => s.name).join('·')} 폴더를 이어 두었어요`);
}, 3000);

// 모아받기·토끼 다운로더가 받는 폴더(만화·웹툰·노벨·영상·갤러리·성인)를 모두 잇는다. 켤 때마다, 그리고 새 종류 폴더가 생기면 바로.
// 이미 이어진 폴더 안이면(예: 성인 아래 갤러리) 그대로 둔다. 받은 작품은 폴더 지켜보기(lib-changed)로 저절로 들어온다.
async function linkDownloaderFolders(quiet = false){
  if (!window.nvDesktop?.libDlFolders) return;
  const {dirs = []} = await window.nvDesktop.libDlFolders().catch(() => ({}));
  const norm = p => String(p || '').replace(/[\\/]+$/, '').toLowerCase();
  const covered = p => libSources().some(s => s.kind === 'disk' && (norm(p) === norm(s.path) || norm(p).startsWith(norm(s.path) + '\\') || norm(p).startsWith(norm(s.path) + '/')));
  const added = [];
  for (const d of dirs){
    if (covered(d) || added.some(s => norm(s.path) === norm(d))) continue;
    const p = await window.nvDesktop.libDlLink(d).catch(() => null); if (!p) continue;
    const name = p.split(/[\\/]/).pop(); const parent = p.split(/[\\/]/).slice(-2, -1)[0];
    added.push({id: uid(), kind: 'disk', name: parent === '성인' ? '성인 ' + name : name, path: p, t: Date.now()});
  }
  if (!added.length) return;
  libSave([...libSources(), ...added]); for (const s of added) await loadSource(s);
  if (!quiet) toast(`다운로더가 받는 ${added.map(s => s.name).join('·')} 폴더를 서재에 이었어요`);
}
setTimeout(() => linkDownloaderFolders(), 3500);
window.nvDesktop?.onLibDlNew?.(() => linkDownloaderFolders());

/* ---------- 서재: 종류 칸 (전체 · 소설 · 웹툰 · 만화 · 영상 · 성인) ---------- */
// '전체'에는 성인 작품이 없다. 성인 작품은 '성인' 칸을 눌렀을 때만 보이고, 검색·읽던 책 카드도 그 칸 안에서만.
// 프로그램을 켤 때마다 '전체'로 돌아간다(누가 서재를 열어도 곤란하지 않게).
const LIB_KINDS = [['all', '전체'], ['novel', '소설'], ['webtoon', '웹툰'], ['manga', '만화'], ['video', '영상'], ['adult', '성인']];
let libKind = (() => { const k = store.get('set.libKind', 'all'); return k === 'adult' ? 'all' : k; })();
const inKind = (w, k = libKind) => k === 'adult' ? isAdult(w) : !isAdult(w) && (k === 'all' || w.kind === k);
const allWorks = () => works;
window.nvAllWorks = allWorks;
const _renderLib0 = renderLib;
renderLib = function(){
  const all = works; works = all.filter(w => inKind(w));
  try{ _renderLib0(); } finally { works = all; }
  renderKinds();
};
function renderKinds(){
  const box = $('#libKinds'); if (!box) return;
  const n = k => works.filter(w => inKind(w, k)).length;
  box.innerHTML = '';
  for (const [k, label] of LIB_KINDS){
    const c = n(k); if (k !== 'all' && !c) continue;   // 없는 종류는 칸을 만들지 않는다
    const b = document.createElement('button'); b.className = 'kind-tab' + (k === libKind ? ' on' : '') + (k === 'adult' ? ' adult' : '');
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === libKind));
    b.innerHTML = `<span></span><em>${c}</em>`; b.querySelector('span').textContent = label;
    b.onclick = () => { libKind = k; store.set('set.libKind', k); renderLib(); $('#libPage')?.scrollTo?.(0, 0); };
    box.append(b);
  }
}
// 성인 작품을 읽다가 서재·홈으로 나오면 읽던 화면도 비운다(뒤에 비쳐 보이지 않게)
// (읽는 화면을 바꾸면 판이 닫혀서, 지우지 않고 클래스로 가린다. 성인 작품을 다시 열면 풀린다)
function hideAdultReader(){
  const hide = isAdult(cur) && (atHome() || atLib()) && libKind !== 'adult';
  if ($('#app').classList.contains('hide-adult') !== hide) $('#app').classList.toggle('hide-adult', hide);
}
new MutationObserver(hideAdultReader).observe($('#app'), {attributes: true, attributeFilter: ['class']});

// 시험·확장용 (모듈 밖에서 서재와 열기를 쓸 수 있게)
window.nvMedia = {works: () => works, openWork: w => openWork(w), translateNow: trCurrent, trPage, setKind: k => { libKind = k; renderLib(); }};

/* ---------- 화 고르기: 그림으로 보는 목차 (만화·웹툰·영상) ----------
   목차를 열면 화마다 작은 그림을 보여 준다. 만화·웹툰은 그 화 첫 쪽, 영상은 표지(없으면 영상 앞부분 한 장면).
   한 번 만든 작은 그림은 기기에 남겨서(dcache 'tr:th:') 다음엔 바로 나온다. */
const THUMB = {cache: new Map(), q: [], running: 0};
async function shrinkImg(blob, w = 240){
  const bm = await createImageBitmap(blob); const s = Math.min(1, w / bm.width);
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); bm.close?.();
  return c.toDataURL('image/jpeg', 0.78);
}
// 영상 앞부분 한 장면: 통째로 받지 않고 구간 읽기 주소(streamUrl)로 몇 초 지점만 읽어 그린다
function videoFrame(f){
  const src = f?.streamUrl || (f && !f.isLazy ? URL.createObjectURL(f) : '');
  if (!src) return Promise.resolve('');
  return new Promise(res => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true;
    let done = false;
    const fin = d => { if (done) return; done = true; try{ v.removeAttribute('src'); v.load(); }catch{} if (!f.streamUrl) URL.revokeObjectURL(src); res(d || ''); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(2, (v.duration || 0) * 0.1); };   // 맨 처음(검은 화면)보다 조금 뒤
    v.onseeked = () => { try{ const s = 240 / (v.videoWidth || 240); const c = document.createElement('canvas'); c.width = 240; c.height = Math.round((v.videoHeight || 135) * s); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); fin(c.toDataURL('image/jpeg', 0.78)); }catch{ fin(''); } };
    v.onerror = () => fin(''); setTimeout(() => fin(''), 15000);
    v.src = src;
  });
}
// 작은 그림 만들기는 두 개씩만 (영상 여러 개를 한꺼번에 열면 무거워서)
function thumbQueue(job){ return new Promise(res => { THUMB.q.push(async () => { try{ res(await job()); }catch{ res(''); } }); thumbPump(); }); }
function thumbPump(){ while (THUMB.running < 2 && THUMB.q.length){ const j = THUMB.q.shift(); THUMB.running++; j().finally(() => { THUMB.running--; thumbPump(); }); } }
function epThumb(w, ep){
  const id = `${w.key}|${ep.name}`;
  if (!THUMB.cache.has(id)) THUMB.cache.set(id, (async () => {
    const saved = await trCacheGet('th:' + id); if (saved) return saved;
    const d = await thumbQueue(async () => {
      if (ep.type === 'video') return ep.cover ? await shrinkImg(await realBlob(ep.cover)) : await videoFrame(ep.file);
      let blob = null;
      if (ep.type === 'imgs' && ep.files[0]) blob = await realBlob(ep.files[0]);
      else if (ep.type === 'epubpart'){ const e = await readEpub(ep.file); const p0 = e.parts[ep.idx]?.imgs?.[0]; if (p0) blob = await e.zip.file(p0).async('blob'); }
      return blob ? await shrinkImg(blob) : '';
    });
    if (d) trCacheSet('th:' + id, d);
    return d;
  })());
  return THUMB.cache.get(id);
}
const _renderEpList0 = renderEpList;
renderEpList = function(){
  const list = $('#epList');
  const visual = cur && cur.eps.length && cur.eps.every(e => e.type === 'video' || e.type === 'imgs' || e.type === 'epubpart');
  list.classList.toggle('epgrid', !!visual);
  if (!visual) return _renderEpList0();
  list.innerHTML = '';
  const q = $('#epFind').value.trim(); const read = new Set(store.get('read.' + cur.key, [])); const w = cur;
  const io = new IntersectionObserver(ents => { for (const en of ents){ if (!en.isIntersecting) continue; io.unobserve(en.target); const i = +en.target.dataset.i; epThumb(w, w.eps[i]).then(d => { const im = en.target.querySelector('img'); if (d && im){ im.src = d; en.target.classList.add('has'); } }); } }, {root: list, rootMargin: '200px'});
  const frag = document.createDocumentFragment();
  cur.eps.forEach((e, i) => {
    if (q && !(e.label || e.name).includes(q)) return;
    const d = document.createElement('div'); d.className = 'it ept' + (e.type === 'video' ? ' v' : '') + (i === curEp ? ' cur' : '') + (read.has(i) ? ' read' : ''); d.dataset.i = i;
    d.innerHTML = `<div class="th"><img alt="">${e.type === 'video' ? '<span class="pl">▶</span>' : ''}</div><div class="cap"><span class="no">${i + 1}</span><span class="nm"></span></div>`;
    d.querySelector('.nm').textContent = e.label || e.name;
    d.onclick = () => { closeSheets(); openEp(i); };
    frag.append(d); io.observe(d);
  });
  list.append(frag);
  if (epRev) [...list.children].reverse().forEach(c => list.append(c));
  list.querySelector('.cur')?.scrollIntoView({block: 'center'});
  epSplitBtn?.();
};
// 서재 카드: 표지 그림이 하나도 없는 영상 작품은 첫 영상의 앞부분 장면을 표지로
const _coverUrl0 = coverUrl;
coverUrl = function(w){
  const u = _coverUrl0(w); if (u || w.kind !== 'video' || w._vthumbP) return u;
  const ep = w.eps.find(e => e.type === 'video'); if (!ep) return u;
  w._vthumbP = epThumb(w, ep).then(d => { if (d){ w.coverUrl = d; renderLib(); } });
  return '';
};
window.nvEpThumb = epThumb;   // 시험용
