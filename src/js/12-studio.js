/* ================= 집필실 ================= */
const ST = {pid: null, eid: null, view: 'write', saveT: null, snapT: 0, lastText: '', abort: null, outKind: '', sel: null, tw: false, drag: null};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const DAYS = ['일','월','화','수','목','금','토'];
const STATUS = {draft:'초고', revise:'퇴고', done:'완료', posted:'연재함'};
const stCount = t => (t || '').replace(/\s/g, '').length;
const manuscriptPages = t => Math.ceil((t || '').replace(/\n+/g, '').length / 200);   // 200자 원고지 매수(대략)
const dkey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = () => dkey(new Date());
function stProjects(){ return store.get('st.projects', []); }
function stProj(){ return stProjects().find(p => p.id === ST.pid) || null; }
function stSaveProj(p){ p.t = Date.now(); const ps = stProjects(); const i = ps.findIndex(x => x.id === p.id); if (i >= 0) ps[i] = p; else ps.push(p); store.set('st.projects', ps); }
function stEps(pid = ST.pid){ return store.get('st.eps.' + pid, []) || []; }
function stSetEps(list, pid = ST.pid){ store.set('st.eps.' + pid, list); }
function stEp(){ return stEps().find(e => e.id === ST.eid) || null; }
function stPatchEp(patch){ const list = stEps(); const e = list.find(x => x.id === ST.eid); if (!e) return; Object.assign(e, patch, {t: Date.now()}); stSetEps(list); return e; }
function stBible(pid = ST.pid){ return store.get('st.bible.' + pid, []) || []; }
function stSetBible(list){ store.set('st.bible.' + ST.pid, list); }
function stEpText(eid){ return eid === ST.eid ? $('#stText').value : txtGet(ST.pid, eid); }

function stNewProject(name){
  const p = {id: uid(), name: name || '새 작품', genre: '', log: '', syn: '', min: 5000, max: 6000, daily: 3000, days: [1,2,3,4,5], rating: '15', style: 'commercial', cover: '', t: Date.now()};
  stSaveProj(p); ST.pid = p.id; ST.eid = null; stSetEps([]); stAddEp('1화'); return p;
}
function stAddEp(title, after = true){
  const list = stEps(); const curI = list.findIndex(e => e.id === ST.eid);
  const part = curI >= 0 ? list[curI].part || '' : list.at(-1)?.part || '';
  const e = {id: uid(), title: title || `${list.length + 1}화`, status: 'draft', chars: 0, syn: '', note: '', part, cast: [], t: Date.now()};
  if (after && curI >= 0 && curI < list.length - 1) list.splice(curI + 1, 0, e); else list.push(e);
  stSetEps(list); stOpenEp(e.id); return e;
}

/* ---------- 열고 닫기 ---------- */
async function stOpen(view){
  await txtReady(); navigator.storage?.persist?.().catch(() => {});
  $('#studio').hidden = false; document.body.style.overflow = 'hidden';
  try{ stopTTS(); }catch{}
  if (!stProjects().length) stNewProject('첫 작품');
  const last = store.get('st.cur', null);
  ST.pid = (last && stProjects().some(p => p.id === last.pid)) ? last.pid : stProjects()[0].id;
  const eps = stEps(); ST.eid = (last && last.pid === ST.pid && eps.some(e => e.id === last.eid)) ? last.eid : eps.at(-1)?.id || null;
  stApplyLayout(); stRenderSide(); stRenderEditor(); stSetView(view || 'write');
  aiHint();
}
function stClose(){ stFlush(); stSnap(false); $('#studio').hidden = true; document.body.style.overflow = ''; bkRun(); }
function stApplyLayout(){
  const s = $('#studio');
  if (isMobile()) s.classList.remove('noside', 'noinsp');
  else { s.classList.toggle('noside', store.get('set.stNoSide', false)); s.classList.toggle('noinsp', store.get('set.stNoInsp', false)); s.classList.remove('mside', 'minsp'); }
}
const VIEW_TITLE = {board:'카드보드', outline:'개요', bible:'설정집', stats:'통계', info:'작품 정보', diff:'판 비교'};
function stSetView(v){
  stFlush(); ST.view = v;
  $$('.st-rail [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $$('.st-view').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  $('#stTopWrite').hidden = v !== 'write'; $('#stTopOther').hidden = v === 'write'; $('#stMeter').hidden = v !== 'write';
  if (v !== 'write') $('#stFind').hidden = true;
  $('#stViewTitle').textContent = VIEW_TITLE[v] || '';
  ({board: stRenderBoard, outline: stRenderOutline, bible: stRenderBible, stats: stRenderStatsView, info: stRenderInfo})[v]?.();
  if (v === 'write'){ stGrow(); requestAnimationFrame(stHlRender); if (!isMobile()) setTimeout(() => $('#stText').focus({preventScroll: true}), 30); }
  if (v === 'info') bkStatus();
  $('#studio').classList.remove('mside');
}

/* ---------- 왼쪽: 작품·원고 목록 ---------- */
function stRenderSide(){ stRenderProjHead(); stRenderStats(); stRenderEps(); }
function hueOfName(s){ let h = 0; for (const ch of s || '') h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
function stCoverEl(el, p){
  el.style.setProperty('--h', hueOfName(p.name)); el.style.backgroundImage = p.cover ? `url("${p.cover}")` : '';
  el.textContent = p.cover ? '' : p.name.slice(0, 6);
}
function stRenderProjHead(){
  const p = stProj(); if (!p) return;
  $('#stProj').innerHTML = stProjects().map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('#stProj').value = ST.pid; stCoverEl($('#stCover'), p);
  $('#stProjMeta').textContent = p.log || p.genre || '작품 정보에서 로그라인을 적어 보세요';
  $('#stPageWork').textContent = p.name;
}
function nextPostDay(days){
  if (!days?.length) return null;
  const d = new Date(); for (let k = 0; k < 8; k++){ const x = new Date(d); x.setDate(d.getDate() + k); if (days.includes(x.getDay())) return k === 0 ? '오늘' : k === 1 ? '내일' : `${DAYS[x.getDay()]}요일`; }
  return null;
}
function stStreak(dl, goal){ let n = 0; const d = new Date(); if (!((dl[today()] || 0) >= goal)) d.setDate(d.getDate() - 1); while ((dl[dkey(d)] || 0) >= goal){ n++; d.setDate(d.getDate() - 1); } return n; }
function stRenderStats(){
  const p = stProj(); if (!p) return;
  const eps = stEps(); const dl = store.get('st.daily', {}); const t = dl[today()] || 0;
  const reserve = eps.filter(e => e.status === 'done').length, posted = eps.filter(e => e.status === 'posted').length;
  const streak = stStreak(dl, p.daily || 1);
  const pct = Math.min(100, Math.round(t / (p.daily || 1) * 100)); const nd = nextPostDay(p.days);
  $('#stStats').innerHTML = `오늘 <b>${t.toLocaleString()}</b> / ${(p.daily||0).toLocaleString()}자${streak ? ` · <b>${streak}일</b> 연속` : ''}
    <div class="st-bar"><i class="${pct >= 100 ? 'ok' : ''}" style="width:${pct}%"></i></div>
    <span class="term" data-term="비축분">비축</span> <b>${reserve}화</b> · 연재 ${posted}화 · 모두 ${eps.length}화${nd ? `<br>다음 연재 <b>${nd}</b>${reserve ? '' : ' · <span style="color:var(--warn)">비축분 없음</span>'}` : ''}`;
  // 백업이 오래되면 알린다
  const last = Math.max(store.get('st.bk.last', 0), store.get('st.bk.manual', 0), store.get('gd.last', 0));
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (days === null || days >= 3){ $('#stStats').insertAdjacentHTML('beforeend', `<br><span style="color:var(--warn)">${days === null ? '아직 백업한 적이 없어요' : `백업한 지 ${days}일`}</span> · <a href="#" id="stBkGo">백업 설정</a>`); $('#stBkGo').onclick = ev => { ev.preventDefault(); stSetView('info'); }; }
  bindTerms($('#stStats'));
}
function stRenderEps(){
  const box = $('#stEpList'); box.innerHTML = ''; const eps = stEps(); let part = null;
  eps.forEach((e, i) => {
    if ((e.part || '') !== part){ part = e.part || ''; if (part){ const h = document.createElement('div'); h.className = 'st-part'; h.textContent = part; box.append(h); } }
    const d = document.createElement('div'); d.className = 'st-it' + (e.id === ST.eid ? ' on' : ''); d.draggable = !isTouch(); d.dataset.id = e.id;
    d.innerHTML = `<span class="sdot ${e.status}" title="${STATUS[e.status]}"></span><span class="nm"></span><span class="n">${(e.chars||0).toLocaleString()}</span>`;
    d.querySelector('.nm').textContent = e.title || `${i+1}화`; d.title = e.syn || '';
    d.onclick = () => { stOpenEp(e.id); if (ST.view !== 'write') stSetView('write'); $('#studio').classList.remove('mside'); };
    stDnD(d, e.id); box.append(d);
  });
  if (!eps.length) box.innerHTML = '<div class="hint" style="padding:8px">아직 회차가 없어요</div>';
}
// 끌어서 순서 바꾸기(목록·카드보드 공통)
function stDnD(el, id){
  el.addEventListener('dragstart', ev => { ST.drag = id; ev.dataTransfer.effectAllowed = 'move'; try{ ev.dataTransfer.setData('text/plain', id); }catch{} });
  el.addEventListener('dragover', ev => { if (!ST.drag || ST.drag === id) return; ev.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', ev => { ev.preventDefault(); el.classList.remove('drop'); const from = ST.drag; ST.drag = null; if (!from || from === id) return; stMove(from, id); });
  el.addEventListener('dragend', () => { ST.drag = null; });
}
function stMove(fromId, toId){
  const list = stEps(); const a = list.findIndex(e => e.id === fromId), b = list.findIndex(e => e.id === toId); if (a < 0 || b < 0) return;
  const [x] = list.splice(a, 1); x.part = list[Math.min(b, list.length - 1)]?.part ?? x.part; list.splice(b, 0, x); stSetEps(list);
  stRenderEps(); if (ST.view === 'board') stRenderBoard(); if (ST.view === 'outline') stRenderOutline(); stPageNo();
}

/* ---------- 원고 ---------- */
function stOpenEp(eid){
  mirrorOn = null; ST.marks = [];
  stFlush(); if (ST.eid && ST.eid !== eid) stSnap(false);
  ST.eid = eid; store.set('st.cur', {pid: ST.pid, eid});
  stRenderEditor(); stRenderEps();
  if (!$('[data-ipane=mirror]').hidden) stRenderMirror();
}
function stPageNo(){ const list = stEps(); const i = list.findIndex(e => e.id === ST.eid); $('#stPageNo').textContent = i >= 0 ? `${i + 1} / ${list.length}` : ''; }
function stRenderEditor(){
  const e = stEp();
  for (const id of ['stText','stTitle','stStatus','stSyn','stPart','stNote']) $('#'+id).disabled = !e;
  $('#stText').value = e ? txtGet(ST.pid, ST.eid) : '';
  $('#stTitle').value = e?.title || ''; $('#stStatus').value = e?.status || 'draft';
  $('#stSyn').value = e?.syn || ''; $('#stPart').value = e?.part || ''; $('#stNote').value = e?.note || '';
  $('#stCrumbPart').textContent = e?.part ? e.part + ' ›' : '';
  ST.lastText = $('#stText').value; ST.snapT = Date.now();
  $('#stOtherBox').hidden = !(e && txtOther(ST.pid, ST.eid));
  $('#stEdWrap').scrollTop = 0; stPageNo(); stRenderCast(); stMeter(); stRenderSnaps();
  stGrow(); stRenderCmts(); requestAnimationFrame(stHlRender);
}
function stMeter(){
  const p = stProj(); const t = $('#stText').value; const a = analyze(t || ' ');
  const c = a.chars; const min = p?.min || 0, max = p?.max || 0;
  const pct = max ? Math.min(100, Math.round(c / max * 100)) : 0;
  const cls = max && c > max ? 'over' : min && c >= min ? 'ok' : '';
  const st = spec(); const r = p?.ref ? store.get('st.refstat.' + p.ref, null) : null;   // 참고 작품 평균
  $('#stMeter').innerHTML = `<span><b>${c.toLocaleString()}</b>${max ? ` / ${min.toLocaleString()}~${max.toLocaleString()}자` : '자'}</span>
    <span class="grow"><div class="st-bar"><i class="${cls}" style="width:${pct}%"></i></div></span>
    <span class="${t.trim() && (a.dlg < st.dmin || a.dlg > st.dmax) ? 'warn' : ''}"><span class="term" data-term="대사">대사</span> <b>${t.trim() ? a.dlg : 0}%</b></span>
    <span class="${a.median > st.para ? 'warn' : ''}"><span class="term" data-term="문단">문단</span> <b>${a.median}</b>자</span>
    <span><span class="term" data-term="원고지">원고지</span> <b>${manuscriptPages(t)}</b>매</span>
    ${r ? `<span class="hint" title="참고 작품 ${esc(r.name)} 앞 ${r.n}화 평균">참고 ${esc(r.name.slice(0, 6))}: ${r.chars.toLocaleString()}자 · 대사 ${r.dlg}% · 문단 ${r.median}자</span>` : ''}
    <span id="stSaved" class="hint">저장됨</span>`;
  bindTerms($('#stMeter'));
}
function stFlush(){ if (!ST.saveT) return; clearTimeout(ST.saveT); ST.saveT = null; stSaveText(); }
function stSaveText(){
  if (!ST.pid || !ST.eid) return;
  const t = $('#stText').value; const before = stCount(ST.lastText), after = stCount(t);
  txtSet(ST.pid, ST.eid, t);
  // AI·바꾸기·되돌리기로 늘어난 글자는 '오늘 쓴 글자'에 넣지 않는다
  if (after > before && !ST.quiet){ const dl = store.get('st.daily', {}); dl[today()] = (dl[today()] || 0) + (after - before); const keys = Object.keys(dl).sort(); while (keys.length > 400) delete dl[keys.shift()]; store.set('st.daily', dl); }
  ST.lastText = t; ST.quiet = false; stPatchEp({chars: after, t: Date.now()});
  $('#stSaved') && ($('#stSaved').textContent = '저장됨');
  stRenderStats(); const it = $('#stEpList .st-it.on .n'); if (it) it.textContent = after.toLocaleString();
  if (Date.now() - ST.snapT > 5 * 60000) stSnap(false);
}
$('#stText').addEventListener('input', () => {
  $('#stSaved') && ($('#stSaved').textContent = '저장 중…');
  clearTimeout(ST.saveT); ST.saveT = setTimeout(() => { ST.saveT = null; stSaveText(); }, 700);
  clearTimeout(stMeter._t); stMeter._t = setTimeout(stMeter, 250);
  if (ST.tw) stTypewriter();
});
for (const ev of ['click','keyup']) $('#stText').addEventListener(ev, () => { if (ST.tw) stTypewriter(); });
// 같은 글꼴의 보이지 않는 복사본으로 커서 줄 높이를 잰다
function caretY(ta, pos = ta.selectionEnd){
  const m = caretY.m ||= Object.assign(document.createElement('div'), {style: 'position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;top:0;left:-9999px'});
  if (!m.isConnected) document.body.append(m);
  const cs = getComputedStyle(ta); for (const k of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','boxSizing']) m.style[k] = cs[k];
  m.style.width = ta.clientWidth + 'px'; m.textContent = ta.value.slice(0, pos); const s = document.createElement('span'); s.textContent = '|'; m.append(s);
  return s.offsetTop;
}
function stTypewriter(){
  const wrap = $('#stEdWrap'), ta = $('#stText'); const y = ta.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop + caretY(ta);
  wrap.scrollTo({top: y - wrap.clientHeight * 0.42, behavior: 'smooth'});
}
function stScrollToCaret(){ const wrap = $('#stEdWrap'), ta = $('#stText'); const y = ta.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop + caretY(ta); wrap.scrollTop = y - wrap.clientHeight * 0.4; }
$('#stTw').onclick = () => { ST.tw = !ST.tw; store.set('set.stTw', ST.tw); $('#stTw').classList.toggle('on', ST.tw); toast(ST.tw ? '타자기 스크롤: 쓰는 줄이 화면 가운데에 머물러요' : '타자기 스크롤을 껐어요'); if (ST.tw) stTypewriter(); };
ST.tw = store.get('set.stTw', false); $('#stTw').classList.toggle('on', ST.tw);

$('#stTitle').addEventListener('input', () => { stPatchEp({title: $('#stTitle').value}); const nm = $('#stEpList .st-it.on .nm'); if (nm) nm.textContent = $('#stTitle').value; });
$('#stStatus').onchange = () => { stPatchEp({status: $('#stStatus').value}); stRenderEps(); stRenderStats(); };
const stInfoT = {}; const stInfoSave = (k, el) => () => { clearTimeout(stInfoT[k]); const eid = ST.eid; const val = el.value; stInfoT[k] = setTimeout(() => { const l = stEps(); const x = l.find(y => y.id === eid); if (!x) return; x[k] = val; stSetEps(l); if (k === 'part' && eid === ST.eid){ stRenderEps(); $('#stCrumbPart').textContent = el.value ? el.value + ' ›' : ''; } }, 400); };
$('#stSyn').addEventListener('input', stInfoSave('syn', $('#stSyn')));
$('#stNote').addEventListener('input', stInfoSave('note', $('#stNote')));
$('#stPart').addEventListener('input', stInfoSave('part', $('#stPart')));
function stRenderCast(){
  const box = $('#stCast'); const e = stEp(); const people = stBible().filter(b => b.kind === '인물' && (b.title || '').trim());
  if (!people.length){ box.innerHTML = '<span class="hint">설정집에 인물 카드를 만들면 여기서 고를 수 있어요. 고른 인물만 AI에게 자세히 보내요.</span>'; return; }
  box.innerHTML = people.map(b => `<label><input type="checkbox" value="${b.id}"${e?.cast?.includes(b.id) ? ' checked' : ''}><i style="${b.img ? `background-image:url('${b.img}')` : ''}"></i>${esc(b.title)}</label>`).join('');
  box.onchange = () => stPatchEp({cast: $$('#stCast input:checked').map(x => x.value)});
}
$('#stUp').onclick = () => { const list = stEps(); const i = list.findIndex(e => e.id === ST.eid); if (i > 0) stMove(ST.eid, list[i-1].id); };
$('#stDown').onclick = () => { const list = stEps(); const i = list.findIndex(e => e.id === ST.eid); if (i >= 0 && i < list.length - 1){ const [x] = list.splice(i, 1); list.splice(i + 1, 0, x); stSetEps(list); stRenderEps(); stPageNo(); } };
$('#stEpDel').onclick = async () => {
  const e = stEp(); if (!e) return;
  if (!confirm(`'${e.title}'을 지울까요? 원고도 함께 지워져요. (지우기 직전 판은 이 기기 판 기록에 남아요)`)) return;
  await stSnap(true); const list = stEps(); const i = list.findIndex(x => x.id === e.id); list.splice(i, 1); stSetEps(list);
  txtDel(ST.pid, e.id); tomb('eps', e.id);
  ST.eid = list[Math.min(i, list.length - 1)]?.id || null; store.set('st.cur', {pid: ST.pid, eid: ST.eid});
  stRenderEditor(); stRenderSide(); toast('지웠어요');
};

/* ---------- 찾기·바꾸기 ---------- */
function stFindOpen(){ if (ST.view !== 'write') stSetView('write'); $('#stFind').hidden = false; const s = stSelText(); if (s && s.length < 60 && !s.includes('\n')) $('#stFindQ').value = s; $('#stFindQ').focus(); $('#stFindQ').select(); stFindCount(); }
function stMatches(){ const q = $('#stFindQ').value; if (!q) return []; const t = $('#stText').value; const out = []; let i = t.indexOf(q); while (i >= 0){ out.push(i); i = t.indexOf(q, i + q.length); } return out; }
function stFindCount(){ const n = stMatches().length; $('#stFindN').textContent = $('#stFindQ').value ? `${n}곳` : ''; }
function stFindGo(dir){
  const q = $('#stFindQ').value; if (!q) return; const ta = $('#stText'); const ms = stMatches(); if (!ms.length){ $('#stFindN').textContent = '없어요'; return; }
  let k = dir > 0 ? ms.find(i => i >= ta.selectionEnd) : [...ms].reverse().find(i => i < ta.selectionStart);
  if (k === undefined) k = dir > 0 ? ms[0] : ms.at(-1);
  ta.focus({preventScroll: true}); ta.setSelectionRange(k, k + q.length); stScrollToCaret();
  $('#stFindN').textContent = `${ms.indexOf(k) + 1} / ${ms.length}`;
}
$('#stFindTg').onclick = () => $('#stFind').hidden ? stFindOpen() : ($('#stFind').hidden = true);
$('#stFindX').onclick = () => { $('#stFind').hidden = true; $('#stText').focus(); };
$('#stFindQ').addEventListener('input', stFindCount);
$('#stFindQ').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); stFindGo(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') $('#stFindX').click(); });
$('#stFindNext').onclick = () => stFindGo(1); $('#stFindPrev').onclick = () => stFindGo(-1);
$('#stRep1').onclick = () => { const ta = $('#stText'), q = $('#stFindQ').value, r = $('#stRepQ').value; if (!q) return; if (ta.value.slice(ta.selectionStart, ta.selectionEnd) !== q) return stFindGo(1); const s = ta.selectionStart; taReplace(s, s + q.length, r); stSaveText(); stMeter(); stFindGo(1); };
$('#stRepAll').onclick = async () => {
  const q = $('#stFindQ').value, r = $('#stRepQ').value; if (!q) return;
  if ($('#stFindAll').checked){
    stFlush(); let n = 0, eps = 0;
    for (const e of stEps()){ const t = stEpText(e.id); const c = t.split(q).length - 1; if (!c) continue; await stSnap(false, e.id); const nt = t.split(q).join(r); txtSet(ST.pid, e.id, nt); n += c; eps++; const list = stEps(); const x = list.find(y => y.id === e.id); x.chars = stCount(nt); stSetEps(list); }
    if (ST.eid){ taReplace(0, $('#stText').value.length, txtGet(ST.pid, ST.eid)); ST.lastText = $('#stText').value; }
    stMeter(); stRenderEps(); toast(n ? `${eps}개 회차에서 ${n}곳을 바꿨어요 (이전 판은 판 기록에)` : '찾는 말이 없어요'); return;
  }
  const ta = $('#stText'); const c = ta.value.split(q).length - 1; if (!c) return toast('찾는 말이 없어요');
  await stSnap(false); taReplace(0, ta.value.length, ta.value.split(q).join(r)); stSaveText(); stMeter(); stFindCount(); toast(`${c}곳을 바꿨어요 (이전 판은 판 기록에)`);
};

/* ---------- 카드보드·개요 ---------- */
function stRenderBoard(){
  const box = $('#stBoard'); box.innerHTML = ''; const list = stEps();
  list.forEach((e, i) => {
    const c = document.createElement('div'); c.className = 'st-ic ' + e.status; c.draggable = !isTouch();
    c.innerHTML = `<div class="h"><span class="no">${i+1}</span><b></b></div><textarea placeholder="줄거리를 적어 보세요"></textarea><div class="f"><span>${STATUS[e.status]}${e.part ? ' · ' + esc(e.part) : ''}</span><span>${(e.chars||0).toLocaleString()}자</span></div>`;
    c.querySelector('b').textContent = e.title; c.querySelector('textarea').value = e.syn || '';
    c.querySelector('b').onclick = () => { stOpenEp(e.id); stSetView('write'); };
    let t; c.querySelector('textarea').oninput = ev => { clearTimeout(t); t = setTimeout(() => { const l = stEps(); const x = l.find(y => y.id === e.id); if (x){ x.syn = ev.target.value; stSetEps(l); if (e.id === ST.eid) $('#stSyn').value = x.syn; } }, 400); };
    stDnD(c, e.id); box.append(c);
  });
  const add = document.createElement('div'); add.className = 'st-ic add'; add.textContent = '+ 새 회차'; add.onclick = () => { stAddEp(); stRenderBoard(); }; box.append(add);
}
function stRenderOutline(){
  const list = stEps(); const tb = $('#stOutline');
  tb.innerHTML = `<tr><th>#</th><th class="hide-m">부</th><th>제목</th><th>줄거리</th><th class="hide-m">상태</th><th>글자</th><th class="hide-m">고친 날</th></tr>`;
  list.forEach((e, i) => {
    const tr = document.createElement('tr'); if (e.id === ST.eid) tr.className = 'on';
    tr.innerHTML = `<td class="n">${i+1}</td><td class="hide-m"><input type="text"></td><td class="t"></td><td><textarea rows="1" placeholder="—"></textarea></td><td class="hide-m"><span class="sdot ${e.status}" style="display:inline-block;margin-right:5px"></span>${STATUS[e.status]}</td><td class="n">${(e.chars||0).toLocaleString()}</td><td class="n hide-m">${new Date(e.t).toLocaleDateString('ko-KR', {month:'numeric', day:'numeric'})}</td>`;
    tr.querySelector('.t').textContent = e.title; tr.querySelector('.t').onclick = () => { stOpenEp(e.id); stSetView('write'); };
    const pi = tr.querySelector('input'); pi.value = e.part || ''; pi.placeholder = '—';
    const ta = tr.querySelector('textarea'); ta.value = e.syn || '';
    let t; const sv = (k, el) => () => { clearTimeout(t); t = setTimeout(() => { const l = stEps(); const x = l.find(y => y.id === e.id); if (x){ x[k] = el.value; stSetEps(l); if (k === 'part') stRenderEps(); if (e.id === ST.eid) stRenderEditorInfo(); } }, 400); };
    ta.oninput = sv('syn', ta); pi.oninput = sv('part', pi);
    tb.append(tr);
  });
  const total = list.reduce((s, e) => s + (e.chars || 0), 0);
  const f = document.createElement('tr'); f.innerHTML = `<td></td><td class="hide-m"></td><td class="t">합계</td><td class="hint">${list.length}화 · 원고지 약 ${Math.round(total * 1.25 / 200).toLocaleString()}매</td><td class="hide-m"></td><td class="n"><b>${total.toLocaleString()}</b></td><td class="hide-m"></td>`; tb.append(f);
}
function stRenderEditorInfo(){ const e = stEp(); if (!e) return; if (document.activeElement !== $('#stSyn')) $('#stSyn').value = e.syn || ''; if (document.activeElement !== $('#stPart')) $('#stPart').value = e.part || ''; }

/* ---------- 설정집 ---------- */
let stBibleFilter = '';
const BIBLE_HINT = {작법:'기법:\n원문 예시:\n내 작품에 쓰는 법:', 인물:'나이·외형:\n성격(겉/속):\n말투·예시 대사:\n주인공과의 관계:\n숨긴 것:', 설정:'무엇인지:\n규칙·제한:\n누가 알고 있나:', 플롯:'사건:\n떡밥:\n언제 회수:', 메모:''};
function stRenderBible(){
  const all = stBible(); const kinds = ['인물','설정','플롯','작법','메모'];
  $('#stBibleChips').innerHTML = [['', `전체 ${all.length}`], ...kinds.map(k => [k, `${k} ${all.filter(b => b.kind === k).length}`])].map(([k, l]) => `<button data-k="${k}" class="${k === stBibleFilter ? 'on' : ''}">${l}</button>`).join('') + `<span class="grow"></span><button id="stMdImp" title="분석 보고서(.md)를 작법 카드로">분석 보고서 가져오기</button><button class="primary" id="stBibleNew">+ ${stBibleFilter || '인물'} 카드</button>`;
  $('#stMdImp').onclick = stImportMd;
  $$('#stBibleChips [data-k]').forEach(b => b.onclick = () => { stBibleFilter = b.dataset.k; stRenderBible(); });
  $('#stBibleNew').onclick = () => { const l = stBible(); const kind = stBibleFilter || '인물'; l.unshift({id: uid(), kind, title: '', body: BIBLE_HINT[kind], img: '', t: Date.now()}); stSetBible(l); stRenderBible(); $('#stBible input')?.focus(); };
  const box = $('#stBible'); box.innerHTML = '';
  for (const b of all.filter(x => !stBibleFilter || x.kind === stBibleFilter)){
    const d = document.createElement('div'); d.className = 'st-bc';
    d.innerHTML = `<div class="top">${b.kind === '인물' ? `<div class="ph${b.img ? ' has' : ''}" title="그림 넣기">${b.img ? '' : '사진<br>넣기'}</div>` : ''}<div class="meta"><input type="text" placeholder="${b.kind === '인물' ? '이름' : '제목'}"><div class="row"><select>${kinds.map(k => `<option${k === b.kind ? ' selected' : ''}>${k}</option>`).join('')}</select><button class="del">지우기</button></div></div></div><textarea></textarea>`;
    const ph = d.querySelector('.ph'); if (ph && b.img) ph.style.backgroundImage = `url("${b.img}")`;
    const [inp, sel, del, ta] = [d.querySelector('input'), d.querySelector('select'), d.querySelector('.del'), d.querySelector('textarea')];
    inp.value = b.title || ''; ta.value = b.body || '';
    const save = patch => { const l = stBible(); const x = l.find(y => y.id === b.id); if (!x) return; Object.assign(x, patch, {t: Date.now()}); stSetBible(l); };
    let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { save({title: inp.value}); stRenderCast(); }, 400); };
    ta.oninput = () => { clearTimeout(t); t = setTimeout(() => save({body: ta.value}), 400); };
    sel.onchange = () => { save({kind: sel.value}); stRenderBible(); stRenderCast(); };
    del.onclick = () => { if ((b.title || '').trim() && !confirm(`'${b.title}' 카드를 지울까요?`)) return; tomb('bible', b.id); stSetBible(stBible().filter(y => y.id !== b.id)); stRenderBible(); stRenderCast(); };
    if (ph) ph.onclick = () => pickSmallImage(240, url => { save({img: url}); stRenderBible(); stRenderCast(); });
    box.append(d);
  }
  if (!box.children.length) box.innerHTML = '<div class="hint">아직 카드가 없어요. 오른쪽 위 단추로 만들어 보세요.</div>';
}
function pickSmallImage(max, cb){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try{ const im = await loadImgEl(f); const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.82)); }catch{ toast('그림을 읽지 못했어요'); } };
  inp.click();
}

/* ---------- 통계 ---------- */
function stRenderStatsView(){
  const p = stProj(); const eps = stEps(); const dl = store.get('st.daily', {});
  const total = eps.reduce((s, e) => s + (e.chars || 0), 0);
  const wk = (() => { let s = 0; const d = new Date(); for (let k = 0; k < 7; k++){ s += dl[dkey(d)] || 0; d.setDate(d.getDate() - 1); } return s; })();
  const written = eps.filter(e => e.chars > 0); const avg = written.length ? Math.round(written.reduce((s, e) => s + e.chars, 0) / written.length) : 0;
  const reserve = eps.filter(e => e.status === 'done').length;
  // 12주 잔디
  const cells = []; const d = new Date(); d.setDate(d.getDate() - 83 - d.getDay());
  for (let k = 0; k < 84 + new Date().getDay() + 1; k++){ const n = dl[dkey(d)] || 0; const g = p.daily || 3000; const lv = !n ? '' : n >= g ? 'l4' : n >= g * 0.66 ? 'l3' : n >= g * 0.33 ? 'l2' : 'l1'; cells.push(`<i class="${lv}" title="${dkey(d)} · ${n.toLocaleString()}자"></i>`); d.setDate(d.getDate() + 1); }
  const max = Math.max(p.max || 0, ...eps.map(e => e.chars || 0), 1);
  const bars = eps.map((e, i) => `<i class="${e.chars > p.max ? 'over' : e.chars < p.min ? 'short' : ''}" style="height:${Math.max(2, e.chars / max * 100)}%" title="${i+1}. ${esc(e.title)} · ${(e.chars||0).toLocaleString()}자" data-id="${e.id}"></i>`).join('');
  $('#stStatsView').innerHTML = `<h2>${esc(p.name)} 통계</h2><p class="sub">${esc(p.genre || '')}</p>
    <div class="st-kpi">
      <div><small>작품 전체</small><b>${total.toLocaleString()}</b><small>자 · 원고지 약 ${Math.round(total * 1.25 / 200).toLocaleString()}매</small></div>
      <div><small>회차</small><b>${eps.length}</b><small>화 · 평균 ${avg.toLocaleString()}자</small></div>
      <div><small>비축분</small><b style="${reserve ? '' : 'color:var(--warn)'}">${reserve}</b><small>화 · 다음 연재 ${nextPostDay(p.days) || '—'}</small></div>
      <div><small>이번 주</small><b>${wk.toLocaleString()}</b><small>자 · 오늘 ${(dl[today()] || 0).toLocaleString()}자</small></div>
      <div><small>연속 달성</small><b>${stStreak(dl, p.daily || 1)}</b><small>일 (하루 ${(p.daily||0).toLocaleString()}자)</small></div>
    </div>
    <div class="st-sec"><h3>최근 12주 (하루 목표 기준 색)</h3><div class="st-heat">${cells.join('')}</div></div>
    <div class="st-sec"><h3>회차별 분량 (초록 띠 = 목표 ${p.min.toLocaleString()}~${p.max.toLocaleString()}자, 누르면 그 회차로)</h3><div class="st-bars" id="stBars"><div class="band" style="bottom:${p.min / max * 100}%;height:${(p.max - p.min) / max * 100}%"></div>${bars}</div></div>`;
  $$('#stBars i').forEach(b => b.onclick = () => { stOpenEp(b.dataset.id); stSetView('write'); });
  stStatsExtra();
}

/* ---------- 작품 정보 ---------- */
function stRenderInfo(){
  const p = stProj(); if (!p) return;
  $('#stPName').value = p.name; $('#stPGenre').value = p.genre || ''; $('#stPLog').value = p.log || ''; $('#stPSyn').value = p.syn || '';
  $('#stPMin').value = p.min; $('#stPMax').value = p.max; $('#stPDaily').value = p.daily;
  $('#stPRating').value = p.rating || '15'; $('#stPStyle').value = p.style || 'commercial';
  $('#stPDays').innerHTML = DAYS.map((d, i) => `<label><input type="checkbox" value="${i}"${(p.days || []).includes(i) ? ' checked' : ''}>${d}</label>`).join('');
  $('#stStartHere').checked = store.get('set.stStart', false);
  stRenderRefSel();
}
function stInfoFormSave(){
  const p = stProj(); if (!p) return;
  Object.assign(p, {name: $('#stPName').value.trim() || '이름 없는 작품', genre: $('#stPGenre').value.trim(), log: $('#stPLog').value.trim(), syn: $('#stPSyn').value,
    min: +$('#stPMin').value || 0, max: +$('#stPMax').value || 0, daily: +$('#stPDaily').value || 0, days: $$('#stPDays input:checked').map(x => +x.value), rating: $('#stPRating').value, style: $('#stPStyle').value});
  stSaveProj(p); stRenderProjHead(); stRenderStats(); stMeter();
}
for (const id of ['stPName','stPGenre','stPLog','stPSyn','stPMin','stPMax','stPDaily','stPRating','stPStyle']) $('#'+id).addEventListener('change', stInfoFormSave);
$('#stPDays').addEventListener('change', stInfoFormSave);
$('#stStartHere').onchange = () => store.set('set.stStart', $('#stStartHere').checked);
$('#stPCover').onclick = () => pickSmallImage(360, url => { const p = stProj(); p.cover = url; stSaveProj(p); stRenderProjHead(); });
$('#stPCoverDel').onclick = () => { const p = stProj(); p.cover = ''; stSaveProj(p); stRenderProjHead(); };
$('#stCover').onclick = () => stSetView('info');
$('#stProjInfo').onclick = () => stSetView('info');
$('#stProj').onchange = () => { stFlush(); stSnap(false); ST.pid = $('#stProj').value; ST.eid = stEps().at(-1)?.id || null; store.set('st.cur', {pid: ST.pid, eid: ST.eid}); stRenderSide(); stRenderEditor(); stSetView(ST.view); };
$('#stProjNew').onclick = () => { const n = prompt('새 작품 이름', ''); if (n === null) return; stFlush(); stNewProject(n.trim() || '새 작품'); stRenderSide(); stRenderEditor(); stSetView('info'); };
$('#stProjDel').onclick = () => {
  const p = stProj(); if (!p) return;
  if (prompt(`'${p.name}'과 모든 회차·설정집을 지워요. 지우려면 작품 이름을 그대로 입력해 주세요.`) !== p.name) return;
  for (const e of stEps()){ txtDel(p.id, e.id); }
  store.set('st.eps.' + p.id, null); store.set('st.bible.' + p.id, null); store.set('st.projects', stProjects().filter(x => x.id !== p.id)); tomb('projects', p.id);
  if (!stProjects().length) stNewProject('첫 작품'); else { ST.pid = stProjects()[0].id; ST.eid = stEps().at(-1)?.id || null; }
  stRenderSide(); stRenderEditor(); stSetView('write'); toast('지웠어요');
};
$('#stExpAll').onclick = () => { stFlush(); const p = stProj(); download(`${safeName(p.name)}_전체.txt`, stEps().map(e => `${e.title}\n\n${stEpText(e.id).trim()}`).join('\n\n\n'), 'text/plain'); };
$('#stExpBackup').onclick = () => { stFlush(); const p = stProj(); download(`${safeName(p.name)}_백업.json`, JSON.stringify({kind: 'novel-viewer-project', project: p, eps: stEps().map(e => ({...e, text: stEpText(e.id)})), bible: stBible()}, null, 1), 'application/json'); };
$('#stImpBackup').onclick = () => $('#stImpBackupFile').click();
$('#stImpBackupFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try{
    const d = JSON.parse(await f.text()); if (d.kind !== 'novel-viewer-project') throw 0;
    stFlush(); const p = {...d.project, id: uid(), name: d.project.name + (stProjects().some(x => x.name === d.project.name) ? ' (불러옴)' : '')};
    stSaveProj(p); ST.pid = p.id;
    stSetEps(d.eps.map(({text, ...x}) => { txtSet(p.id, x.id, text || ''); return x; }), p.id); store.set('st.bible.' + p.id, d.bible || []);
    ST.eid = stEps().at(-1)?.id || null; stRenderSide(); stRenderEditor(); stSetView('write'); toast('작품을 불러왔어요');
  }catch{ toast('작품 백업 파일이 아니에요'); }
};

/* ---------- 판 기록 ---------- */
async function stGetSnaps(key){ try{ return (await idb.tx('readonly', s => s.get(key), 'snaps'))?.list || []; }catch{ return []; } }
async function stSnap(manual, eid = ST.eid){
  if (!ST.pid || !eid) return;
  const key = `${ST.pid}/${eid}`; const text = stEpText(eid); ST.snapT = Date.now();
  const list = await stGetSnaps(key);
  if (!text.trim() || list[0]?.text === text){ if (manual) toast('바뀐 게 없어서 이전 판 그대로예요'); return; }
  list.unshift({t: Date.now(), text, n: stCount(text), manual: !!manual});
  try{ await idb.tx('readwrite', s => s.put({id: key, list: list.slice(0, 20)}), 'snaps'); }catch{ return; }
  if (manual) toast('지금 판을 저장했어요');
  if (eid === ST.eid) stRenderSnaps();
}
async function stRenderSnaps(){
  const box = $('#stSnaps'); if (!ST.eid){ box.innerHTML = ''; return; }
  const list = await stGetSnaps(`${ST.pid}/${ST.eid}`);
  box.innerHTML = list.length ? '' : '<div class="hint" style="padding:6px 2px">아직 없어요</div>';
  list.forEach(s => {
    const d = document.createElement('div'); d.className = 'it';
    d.innerHTML = `<span>${new Date(s.t).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit'})} · ${s.n.toLocaleString()}자${s.manual ? ' · 직접' : ''}</span><button data-a="cmp">비교</button><button>되돌리기</button>`;
    d.querySelector('[data-a=cmp]').onclick = () => stShowDiff(s);
    d.querySelector('button:last-child').onclick = async () => { if (!confirm('이 판으로 되돌릴까요? 지금 글은 판 기록에 먼저 남겨 둘게요.')) return; await stSnap(false); taReplace(0, $('#stText').value.length, s.text); stSaveText(); stMeter(); toast('되돌렸어요'); };
    box.append(d);
  });
}
$('#stSnapNow').onclick = () => { stFlush(); stSnap(true); };
$('#stOtherShow').onclick = async () => { const v = txtOther(ST.pid, ST.eid); if (!v) return; await stSnap(false); taReplace(0, $('#stText').value.length, v); stSaveText(); txtSet(ST.pid, ST.eid, null, {other: ''}); $('#stOtherBox').hidden = true; stMeter(); toast('다른 기기 판으로 바꿨어요. 이전 글은 판 기록에 있어요'); };
$('#stOtherDrop').onclick = () => { txtSet(ST.pid, ST.eid, null, {other: ''}); $('#stOtherBox').hidden = true; };

/* ---------- 막대·단축키 ---------- */
$$('.st-rail [data-view]').forEach(b => b.onclick = () => stSetView(b.dataset.view));
$('#stToLib').onclick = () => stClose();
$('#stToSet').onclick = () => { stClose(); openTool('set'); };
const stToggleSide = () => { const s = $('#studio'); if (isMobile()){ s.classList.toggle('mside'); s.classList.remove('minsp'); } else { s.classList.toggle('noside'); store.set('set.stNoSide', s.classList.contains('noside')); } };
const stToggleInsp = () => { const s = $('#studio'); if (isMobile()){ s.classList.toggle('minsp'); s.classList.remove('mside'); } else { s.classList.toggle('noinsp'); store.set('set.stNoInsp', s.classList.contains('noinsp')); } };
$('#stSideTg').onclick = stToggleSide; $('#stSideTg2').onclick = stToggleSide;
$('#stInspTg').onclick = stToggleInsp; $('#stInspTg2').onclick = stToggleInsp;
$$('[data-stclose]').forEach(b => b.onclick = () => $('#studio').classList.remove(b.dataset.stclose === 'side' ? 'mside' : 'minsp'));
function stInspTab(t){ $$('[data-itab]').forEach(x => x.classList.toggle('on', x.dataset.itab === t)); $$('[data-ipane]').forEach(p => p.hidden = p.dataset.ipane !== t); if (t === 'snap') stRenderSnaps(); }
$$('[data-itab]').forEach(b => b.onclick = () => stInspTab(b.dataset.itab));
$('#stFocus').onclick = () => { const s = $('#studio'); const on = !s.classList.contains('focus'); s.classList.toggle('focus', on); s.classList.toggle('noside', on || store.get('set.stNoSide', false)); s.classList.toggle('noinsp', on || store.get('set.stNoInsp', false)); $('#stFocus').classList.toggle('on', on); $('#stText').focus(); };
$('#stEpNew').onclick = () => { stFlush(); stAddEp(); stRenderStats(); stSetView('write'); $('#stTitle').select(); };
$('#stImport').onclick = () => $('#stImportFile').click();
$('#stImportFile').onchange = async e => {
  const fs = [...e.target.files].sort((a, b) => natural(a.name, b.name)); e.target.value = ''; if (!fs.length) return;
  stFlush(); let last = null; const list = stEps(); const part = stEp()?.part || '';
  for (const f of fs){ const t = await decodeText(f); const ep = {id: uid(), title: f.name.replace(/\.txt$/i, ''), status: 'draft', chars: stCount(t), syn: '', note: '', part, cast: [], t: Date.now()}; list.push(ep); txtSet(ST.pid, ep.id, t); last = ep.id; }
  stSetEps(list); stOpenEp(last); stRenderStats(); stSetView('write'); toast(`${fs.length}개를 회차로 가져왔어요`);
};
document.addEventListener('keydown', e => {
  if ($('#studio').hidden) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 's' || e.key === 'S')){ e.preventDefault(); stFlush(); stSnap(true); }
  else if (mod && e.key === '.'){ e.preventDefault(); $('#stFocus').click(); }
  else if (mod && (e.key === 'f' || e.key === 'F' || e.key === 'h' || e.key === 'H')){ e.preventDefault(); stFindOpen(); if (e.key.toLowerCase() === 'h') $('#stRepQ').focus(); }
  else if (e.altKey && e.key >= '1' && e.key <= '5'){ e.preventDefault(); stSetView(['write','board','outline','bible','stats'][+e.key - 1]); }
  else if (mod && e.key === 'Enter' && e.target === $('#stText')){ e.preventDefault(); $('#stEpNew').click(); }
  else if (e.key === 'Escape' && $('#studio').classList.contains('focus')) $('#stFocus').click();
  if (!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) e.stopPropagation();
}, true);
addEventListener('beforeunload', () => { stFlush(); txtFlushNow(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden'){ stFlush(); txtFlushNow(); } });
addEventListener('resize', () => { if (!$('#studio').hidden) stApplyLayout(); });

/* ---------- 내보내기 ---------- */
$('#stCopyEp').onclick = () => { stFlush(); copy($('#stText').value.trim()); };
$('#stExpEp').onclick = () => { stFlush(); download(`${safeName(stProj()?.name || '작품')}_${safeName($('#stTitle').value || '회차')}.txt`, $('#stText').value, 'text/plain'); };
$('#stFmt').onclick = async () => {
  const t = $('#stText').value; const out = t.split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.trim()).join('\n\n');
  if (out === t.trim()) return toast('이미 맞춰져 있어요');
  await stSnap(false); taReplace(0, t.length, out); stSaveText(); stMeter(); toast('문단 사이를 빈 줄 하나로 맞췄어요 (이전 판은 판 기록에)');
};

/* ---------- AI 도우미 ---------- */
function stBibleText(){
  const e = stEp(); const cast = e?.cast || [];
  const b = stBible().filter(x => (x.title || x.body || '').trim()).filter(x => x.kind !== '작법').filter(x => x.kind !== '인물' || !cast.length || cast.includes(x.id));
  if (!b.length) return '';
  return '<story_bible>\n' + b.map(x => `[${x.kind}] ${x.title}\n${x.body}`).join('\n\n').slice(0, 9000) + '\n</story_bible>';
}
function stPrevTail(){
  const list = stEps(); const i = list.findIndex(e => e.id === ST.eid); if (i <= 0) return '';
  const prev = list.slice(Math.max(0, i - 5), i).filter(e => e.syn).map(e => `- ${e.title}: ${e.syn}`).join('\n');
  const t = stEpText(list[i - 1].id).trim();
  return (prev ? `<recent_episode_synopses>\n${prev}\n</recent_episode_synopses>\n` : '') + (t ? `<previous_episode title="${esc(list[i-1].title)}">\n${t.slice(-1500)}\n</previous_episode>` : '');
}
function stSystem(){
  const p = stProj() || {}; const e = stEp();
  return SYSTEM_WRITER() + '\n\n' + [RATING_TEXT[p.rating || '15'], STYLE_TEXT[p.style || 'commercial'], p.style === 'mine' ? '사용자 문체의 결: ' + $('#voice').value : '',
    `작품: ${p.name || ''}${p.genre ? ' · ' + p.genre : ''}${p.log ? `\n로그라인: ${p.log}` : ''}${p.syn ? `\n큰 줄거리: ${p.syn.slice(0, 1500)}` : ''}`,
    `한 화 목표 분량: 공백 제외 ${p.min}~${p.max}자.`, e?.syn ? `이번 화 줄거리(작가 메모): ${e.syn}` : '', e?.note ? `작가 메모: ${e.note.slice(0, 800)}` : '',
    e?.comments?.length ? '작가가 원고 문장에 단 메모:\n' + e.comments.slice(0, 20).map(c => `- 「${c.q.slice(0, 60)}」: ${c.n}`).join('\n') : '',
    '원고의 기존 문체·시점·시제·인물 말투를 그대로 따른다.'].filter(Boolean).join('\n');
}
function stSelText(){ const t = $('#stText'); return t.selectionEnd > t.selectionStart ? t.value.slice(t.selectionStart, t.selectionEnd) : ''; }
const ST_TASK = {
  continue: () => { const t = $('#stText'); const before = t.value.slice(0, t.selectionStart); const after = t.value.slice(t.selectionEnd); return {need: before.trim() || stEp()?.syn ? '' : '이어 쓸 원고나 줄거리가 없어요. 먼저 몇 줄 쓰거나 회차 정보에 줄거리를 적어 주세요', insert: 'cursor', text: `<manuscript_before_cursor>\n${before.slice(-7000)}\n</manuscript_before_cursor>${after.trim() ? `\n<manuscript_after_cursor>\n${after.slice(0, 1500)}\n</manuscript_after_cursor>` : ''}\n\n커서 자리부터 이어질 본문만 공백 제외 약 ${$('#stLen').value}자 써 줘. 앞 내용을 되풀이하지 말고, 뒤 내용이 있으면 자연스럽게 이어지게.`}; },
  polish: () => { const s = stSelText(); return {need: s ? '' : '다듬을 부분을 원고에서 먼저 골라 주세요', insert: 'replace', text: `<selected>\n${s}\n</selected>\n\n위 부분을 내용과 사건은 그대로 두고 문장·호흡만 다듬어 줘. 고친 본문만 출력해.`}; },
  dialog: () => { const s = stSelText() || $('#stText').value; return {need: s.trim() ? '' : '원고가 비어 있어요', insert: stSelText() ? 'replace' : 'none', text: `<text>\n${s.slice(0, 9000)}\n</text>\n\n대사를 인물마다 목소리가 구분되게 살려 줘(설정집의 말투를 따른다). 지문은 최소한만 고치고, 고친 본문만 출력해.`}; },
  cut: () => { const t = $('#stText').value.trim(); return {need: t ? '' : '원고가 비어 있어요', insert: 'none', text: `<episode_end>\n${t.slice(-2500)}\n</episode_end>\n\n이 화의 마지막 장면을 다음 화 결제를 누르게 만드는 절단으로 바꾼 대안 3개를 써 줘. 각각 [유형] 한 줄 + 바꿔 쓸 마지막 3~6문단. 유형은 서로 다르게(새 인물 등장/위기 직전/주인공 선언/반전 정보/주변 반응 등).`}; },
  hook: () => { const t = $('#stText').value.trim(); return {need: t ? '' : '원고가 비어 있어요', insert: 'none', text: `<episode_start>\n${t.slice(0, 2500)}\n</episode_start>\n\n이 화의 첫 세 문단이 독자를 붙잡는지 한 줄로 판정하고, 더 세게 고친 첫 장면(5~8문단)을 써 줘.`}; },
  feedback: () => { const t = $('#stText').value; const a = analyze(t || ' '); const p = stProj(); return {need: t.trim() ? '' : '원고가 비어 있어요', insert: 'none', text: `내가 쓴 한 화다. 수치: 분량 ${a.chars}자(목표 ${p.min}~${p.max}), 문단 중앙값 ${a.median}자, 대사 ${a.dlg}%.\n<manuscript>\n${t.slice(0, 16000)}\n</manuscript>\n\n냉정하게 피드백해 줘: 1) 첫 세 문단 2) 이 화의 보상(사이다·설렘·반전) 3) 대사와 인물 목소리 4) 설정집·앞 화와 어긋나는 곳 5) 절단 6) 모바일 호흡. 각 항목마다 고칠 문장 예시를 하나씩.`}; },
  title: () => { const t = $('#stText').value.trim(); return {need: t ? '' : '원고가 비어 있어요', insert: 'none', text: `<manuscript>\n${t.slice(0, 12000)}\n</manuscript>\n\n이 화의 제목 후보 6개를 줘. 3개는 주인공·인물의 짧고 센 대사형, 3개는 상황형. 목록만.`}; },
  summary: () => { const t = $('#stText').value.trim(); return {need: t ? '' : '원고가 비어 있어요', insert: 'none', syn: true, text: `<manuscript>\n${t.slice(0, 16000)}\n</manuscript>\n\n이 화의 줄거리를 카드에 적을 수 있게 두세 문장으로 요약해 줘. 마지막 문장은 다음 화로 넘긴 떡밥. 요약만 출력해.`}; },
};
async function stRun(kind, custom){
  if (ST.abort) return toast('AI가 쓰는 중이에요');
  stFlush();
  const task = custom ? {need: '', insert: 'cursor', text: `<manuscript>\n${$('#stText').value.slice(-9000)}\n</manuscript>${stSelText() ? `\n<selected>\n${stSelText()}\n</selected>` : ''}\n\n${custom}`} : ST_TASK[kind]();
  if (task.need) return toast(task.need);
  // 배우면서 쓰기: 왜 이렇게 썼는지, 다음에 기억할 것
  if ($('#stWhy').checked && WHY_KINDS.includes(kind)) task.text += WHY_TAIL; else if (kind === 'feedback') task.text += MEMO_TAIL;
  ST.outBody = null; $('#stLearn').innerHTML = ''; ST.orig = (kind === 'polish' || (kind === 'custom' && stSelText())) ? stSelText() : kind === 'dialog' ? stSelText() : '';
  const p = stProj(); if (p?.rating === 'adult' && !adultGuard(task.text + stBibleText(), 'adult')) return;
  const c = await client('#stProv'); if (!c) return;
  const t = $('#stText'); ST.sel = {s: t.selectionStart, e: t.selectionEnd}; ST.outKind = task.insert;
  $('#stToSyn').hidden = !task.syn;
  const ctx = [stBibleText(), $('#stUseCraft')?.checked ? stCraftText() : '', stPrevTail()].filter(Boolean).join('\n\n');
  const content = []; if (ctx) content.push({type:'text', text: ctx, cache_control: {type:'ephemeral'}});
  content.push({type:'text', text: task.text});
  stInspTab('ai'); if (isMobile()) $('#studio').classList.add('minsp');
  const out = $('#stOut'); out.textContent = '';
  ST.abort = new AbortController(); $('.st-ai').classList.add('busy');
  const res = await stream(c, {system: stSystem(), messages: [{role:'user', content}], signal: ST.abort.signal, onText: x => { out.textContent += x; out.scrollTop = out.scrollHeight; }});
  ST.abort = null; $('.st-ai').classList.remove('busy');
  if (res.note) out.textContent += res.note;
  if (out.textContent) stSplitOut();
}
$$('[data-st]').forEach(b => b.onclick = () => stRun(b.dataset.st));
$('#stAskGo').onclick = () => { const q = $('#stAsk').value.trim(); if (!q) return; stRun('custom', q); };
$('#stAsk').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#stAskGo').click(); });
$('#stStop').onclick = () => ST.abort?.abort();
function stOutText(){ return ST.outBody ?? $('#stOut').textContent.replace(/\n\n\[[^\]]*\]$/, '').trim(); }
$('#stCopyOut').onclick = () => copy(stOutText());
$('#stInsert').onclick = async () => {
  const v = stOutText(); if (!v) return; const t = $('#stText'); await stSnap(false);
  const pos = ST.outKind === 'cursor' && ST.sel ? Math.min(ST.sel.e, t.value.length) : t.selectionEnd;
  const pre = t.value.slice(0, pos), post = t.value.slice(pos);
  const sep = pre && !/\n\s*$/.test(pre) ? '\n\n' : '';
  taReplace(pos, pos, sep + v + (post && !/^\s*\n/.test(post) ? '\n\n' : ''));
  t.selectionStart = t.selectionEnd = (pre + sep + v).length; stSaveText(); stMeter(); stSetView('write'); t.focus(); $('#studio').classList.remove('minsp'); toast('원고에 넣었어요 (이전 판은 판 기록에)');
};
$('#stReplace').onclick = async () => {
  const v = stOutText(); if (!v) return; const t = $('#stText');
  const s = ST.outKind === 'replace' && ST.sel && ST.sel.e > ST.sel.s ? ST.sel : {s: t.selectionStart, e: t.selectionEnd};
  if (s.e <= s.s) return toast('바꿀 부분을 원고에서 먼저 골라 주세요');
  await stSnap(false); taReplace(s.s, s.e, v); t.selectionStart = s.s; t.selectionEnd = s.s + v.length;
  stSaveText(); stMeter(); t.focus(); $('#studio').classList.remove('minsp'); toast('바꿨어요 (이전 판은 판 기록에)');
};
$('#stToSyn').onclick = () => { const v = stOutText(); if (!v) return; stPatchEp({syn: v}); $('#stSyn').value = v; $('#stToSyn').hidden = true; stInspTab('info'); toast('줄거리 칸에 넣었어요. 카드보드에도 보여요'); };

/* ---------- 들어가는 곳 ---------- */
$('#btnStudio').onclick = () => stOpen();
$('#wStudio') && ($('#wStudio').onclick = () => stOpen());
window.stRefresh = () => { if ($('#studio').hidden) return; if (document.activeElement !== $('#stText') && !ST.saveT){ const v = txtGet(ST.pid, ST.eid); if (v !== $('#stText').value){ $('#stText').value = v; ST.lastText = v; stMeter(); } } stRenderSide(); stRenderEditorInfo(); $('#stOtherBox').hidden = !txtOther(ST.pid, ST.eid); if (ST.view !== 'write') stSetView(ST.view); };
if (location.hash === '#studio' || (store.get('set.stStart', false) && stProjects().some(p => stEps(p.id).some(e => e.chars > 0)))) stOpen();


