/* ================= 다른 앱에는 있는데 없던 것들 =================
   회차 목록: 여기까지 읽음·안 읽은 화만 / 집필실: 회차 복제·집필 타이머 / 웹툰: 연재용 조각·세로 미리 보기·맨 뒤로 */

/* ---------- 회차 목록 ---------- */
$('#epReadTo').onclick = () => {
  if (!cur || curEp < 0) return;
  const k = 'read.' + cur.key, r = new Set(store.get(k, []));
  for (let i = 0; i <= curEp; i++) r.add(i);
  store.set(k, [...r]); renderEpList(); toast(`${curEp + 1}화까지 읽음으로 표시했어요`);
};
$('#epUnread').onclick = () => { epUnreadOnly = !epUnreadOnly; $('#epUnread').classList.toggle('on', epUnreadOnly); renderEpList(); };

/* ---------- 집필실: 회차 복제 ---------- */
$('#stEpDup').onclick = () => {
  stFlush(); const e = stEps().find(x => x.id === ST.eid); if (!e) return;
  const text = txtGet(ST.pid, ST.eid);
  const n = stAddEp(e.title + ' 사본');
  stPatchEp({syn: e.syn || '', note: e.note || '', part: e.part || '', cast: [...(e.cast || [])], chars: e.chars || 0});
  txtSet(ST.pid, n.id, text); stOpenEp(n.id); stRenderStats(); toast('회차를 복제했어요. 바로 뒤에 넣었어요');
};

/* ---------- 집필실: 집필 타이머 (정한 시간 동안 몇 자 썼는지) ---------- */
const SPR = {end: 0, min: 0, base: 0, t: 0};
const sprToday = () => store.get('st.daily', {})[today()] || 0;
function sprTick(){
  if (!SPR.end) return;
  stFlush();
  const left = Math.max(0, SPR.end - Date.now()), wrote = Math.max(0, sprToday() - SPR.base);
  if (!left) return sprStop(true);
  const s = Math.ceil(left / 1000);
  $('#stSprintT').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('#stSprintN').textContent = `+${wrote.toLocaleString()}자`;
}
function sprStop(finished){
  clearInterval(SPR.t); const wrote = Math.max(0, sprToday() - SPR.base), min = SPR.min;
  SPR.end = 0; $('#stSprintBar').hidden = true; $('#stSprint').classList.remove('on');
  if (!finished) return;
  const log = store.get('st.sprints', []); log.push({t: Date.now(), min, chars: wrote}); store.set('st.sprints', log.slice(-100));
  const best = Math.max(...log.map(x => x.min ? x.chars / x.min : 0));
  toast(`${min}분 동안 ${wrote.toLocaleString()}자 썼어요${wrote && wrote / min >= best ? ' · 최고 기록이에요' : ''}`);
}
function sprStart(min){
  stFlush(); Object.assign(SPR, {end: Date.now() + min * 60000, min, base: sprToday()});
  store.set('st.sprintMin', min); $('#stSprintBar').hidden = false; $('#stSprint').classList.add('on');
  clearInterval(SPR.t); SPR.t = setInterval(sprTick, 1000); sprTick(); $('#stText').focus();
}
$('#stSprint').onclick = () => {
  if (SPR.end) return;
  const v = prompt('몇 분 동안 쓸까요?', String(store.get('st.sprintMin', 25))); if (v === null) return;
  const min = Math.round(+v); if (!(min >= 1 && min <= 240)) return toast('1분에서 240분 사이로 적어 주세요');
  sprStart(min);
};
$('#stSprintX').onclick = () => sprStop(false);

/* ---------- 웹툰: 맨 뒤로 ---------- */
$('#wtBack').onclick = () => { const s = WT.sel, pg = wtPage(); if (s?.t !== 'item') return; const [it] = pg.items.splice(s.i, 1); pg.items.unshift(it); WT.sel = {t: 'item', i: 0}; wtCommit(); wtRender(); };

/* ---------- 웹툰: 연재용 조각 ---------- */
// 쪽 경계는 그대로 두고, 긴 쪽만 고르게 나눈다 (말풍선 한가운데가 잘리는 일을 줄인다)
async function wtPieces(W, maxH){
  const out = [];
  for (const pg of WT.proj.pages){
    const c = await wtPageCanvas(pg, W), n = Math.ceil(c.height / maxH), h = Math.ceil(c.height / n);
    for (let i = 0; i < n; i++){
      const y = i * h, hh = Math.min(h, c.height - y);
      const p = document.createElement('canvas'); p.width = W; p.height = hh;
      const g = p.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, hh); g.drawImage(c, 0, y, W, hh, 0, 0, W, hh);
      out.push(p);
    }
  }
  return out;
}
async function wtExportPieces(W, maxH){
  const z = new JSZip(), name = safeName(WT.proj.name || '웹툰'), ps = await wtPieces(W, maxH);
  for (let i = 0; i < ps.length; i++) z.file(`${name}_${String(i + 1).padStart(3, '0')}.jpg`, await wtBlob(ps[i], 'image/jpeg'));
  wtDownload(await z.generateAsync({type: 'blob', compression: 'STORE'}), `${name}_연재용_${W}.zip`);
  return ps.length;
}

/* ---------- 웹툰: 세로 미리 보기 (독자가 폰으로 내려 보는 모습) ---------- */
async function wtPreview(){
  document.querySelector('.wt-prev')?.remove();
  const box = document.createElement('div'); box.className = 'wt-prev'; box.setAttribute('role', 'dialog');
  box.innerHTML = `<div class="wt-prev-top"><b>독자 화면 미리 보기</b><button class="icon" title="닫기"><svg class="i"><use href="#i-x"/></svg></button></div><div class="wt-prev-body"></div>`;
  const body = box.querySelector('.wt-prev-body');
  for (const pg of WT.proj.pages) body.append(await wtPageCanvas(pg, 800));
  const close = () => { box.remove(); removeEventListener('keydown', esc, true); };
  const esc = e => { if (e.key === 'Escape'){ e.stopPropagation(); close(); } };
  box.querySelector('button').onclick = close; addEventListener('keydown', esc, true);
  $('#wt').append(box);
}
