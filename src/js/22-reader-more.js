/* ================= 읽기 편의 더하기: 자동 스크롤·폰 화면 보기·내 글꼴·방향키 ================= */
const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
const overlayOpen = () => !$('#studio').hidden || !$('#wt').hidden || $('#sketch').classList.contains('open');

/* ---------- 자동 스크롤 ----------
   소설 스크롤·웹툰은 매 화면마다 조금씩 내리고, 쪽 넘김·만화는 몇 초마다 한 쪽씩 넘긴다.
   화면을 누르거나 휠을 굴리면 멈춘다. 회차 끝에 닿으면 다음 화로 이어 간다. */
const AS = {on: false, raf: 0, last: 0, pos: 0, acc: 0, endT: 0};
const asSpeed = () => +$('#asSpeed').value || 4;
const asPx = () => 4 * Math.pow(1.35, asSpeed()) * ($('#reader .webtoon') ? 3 : 1);   // 1단계 약 5px/초 ~ 10단계 약 80px/초
const asSec = () => 40 / Math.pow(1.25, asSpeed());                                   // 쪽 넘김 간격: 1단계 32초 ~ 10단계 4초
const asStepMode = () => !!($('#reader.paged') || $('#reader .manga'));
function asLabel(){ $('#asTxt').textContent = `자동 스크롤 · 속도 ${asSpeed()}` + (asStepMode() ? ` (${Math.round(asSec())}초마다)` : ''); $('#asSpeedOut').textContent = asSpeed(); }
function asStart(){
  if (!cur) return toast('작품을 먼저 열어 주세요');
  if (AS.on) return;
  if ($('#btnTTS').classList.contains('on')) stopTTS();
  AS.on = true; AS.last = 0; AS.acc = 0; AS.endT = 0; AS.pos = $('#reader').scrollTop;
  $('#asChip').hidden = false; $('#asGo').textContent = '자동 스크롤 멈추기 (Space)'; asLabel();
  closeSheets(); $('#app').classList.add('immersive');
  AS.raf = requestAnimationFrame(asTick);
}
function asStop(msg){
  if (!AS.on) return;
  AS.on = false; cancelAnimationFrame(AS.raf);
  $('#asChip').hidden = true; $('#asGo').textContent = '자동 스크롤 시작 (Space)';
  quiet(); $('#app').classList.remove('immersive');   // 멈추면 막대를 다시 보여 준다
  if (msg) toast(msg);
}
function asTick(t){
  if (!AS.on) return;
  if (!cur) return asStop();
  const dt = AS.last ? Math.min(0.1, (t - AS.last) / 1000) : 0; AS.last = t;
  const r = $('#reader');
  if (asStepMode()){
    AS.acc += dt;
    if (AS.acc >= asSec()){ AS.acc = 0; if ($('#reader .manga')) mangaStep(1); else pageTurn(1); }
  } else if (r.scrollHeight > r.clientHeight){
    if (Math.abs(r.scrollTop - AS.pos) > 3) AS.pos = r.scrollTop;   // 회차가 바뀌거나 프로그램이 옮긴 자리를 따라간다
    const atEnd = r.scrollTop + r.clientHeight >= r.scrollHeight - 2;
    if (!atEnd){ AS.endT = 0; AS.pos += asPx() * dt; quiet(200); r.scrollTop = AS.pos; }
    else if (curEp >= cur.eps.length - 1) return asStop('마지막 화 끝까지 읽었어요');
    else if ($('#autoNext').value !== 'auto'){   // '자동으로 넘김'이면 원래 장치가 넘긴다
      AS.endT += dt; if (AS.endT > 1.6){ AS.endT = 0; openEp(curEp + 1); }
    }
  }
  AS.raf = requestAnimationFrame(asTick);
}
function asNudge(d){ const el = $('#asSpeed'); el.value = Math.min(10, Math.max(1, asSpeed() + d)); el.dispatchEvent(new Event('change')); rangeFill(el); asLabel(); }
{ const v = store.get('set.asSpeed', null); if (v !== null) $('#asSpeed').value = v; }
$('#asSpeed').addEventListener('change', () => { store.set('set.asSpeed', $('#asSpeed').value); asLabel(); });
$('#asSpeed').addEventListener('input', asLabel);
$('#asGo').onclick = () => AS.on ? asStop() : asStart();
$('#asStop').onclick = () => asStop();
$('#asSlow').onclick = () => asNudge(-1);
$('#asFast').onclick = () => asNudge(1);
// 사람이 직접 움직이면 멈춘다 (막대·칩을 누르는 건 빼고)
$('#reader').addEventListener('wheel', () => asStop(), {passive: true});
$('#reader').addEventListener('pointerdown', () => asStop(), true);
document.addEventListener('visibilitychange', () => { if (document.hidden) asStop(); });
asLabel(); rangeFill($('#asSpeed'));

/* ---------- 폰 화면으로 보기 (작가용) ----------
   독자 대부분이 폰으로 읽으니, 375px 폭에서 어떻게 끊기는지와 한 화가 폰 화면 몇 장인지 본다. */
// 폭은 아이폰 기본 375px, 높이는 위아래 막대를 뺀 글 자리 620px. (시작할 때 앞 파일에서 불릴 수 있어 const 대신 함수로 둔다)
function PHONE_W(){ return 375; } function PHONE_H(){ return 620; }
function phoneSync(){
  const on = $('#phoneView').checked;
  $('#reader').classList.toggle('phone', on);
  document.documentElement.style.setProperty('--ph', PHONE_H() + 'px');
  if ($('#reader .novel')) requestAnimationFrame(() => { writerMarks(); updateProgress(); });
}
// 지금 글자 설정으로 375px 폭에 깔면 폰 화면 몇 장인지 (보이지 않는 곳에서 재어 본다)
function phoneScreens(paras){
  if (!paras?.length) return 0;
  const box = document.createElement('div'); box.className = 'novel';
  box.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;max-width:none;width:${PHONE_W()}px;padding:28px 20px 24px;margin:0`;
  const frag = document.createDocumentFragment(); const head = $('#reader .novel .chead'); if (head) frag.append(head.cloneNode(true));   // 폰 화면 보기 틀과 같은 조건으로 잰다
  for (const t of paras){ const p = document.createElement('p'); p.textContent = t; frag.append(p); }
  box.append(frag); document.body.append(box);
  const h = box.scrollHeight; box.remove();
  return Math.max(1, Math.ceil(h / PHONE_H()));
}
function phoneWhere(){
  const nv = $('#reader.phone:not(.paged) .novel'); if (!nv) return '';
  const r = $('#reader'); const n = Math.max(1, Math.ceil(nv.offsetHeight / PHONE_H()));
  const k = Math.min(n, Math.max(1, Math.floor((r.scrollTop + r.clientHeight / 2 - nv.offsetTop) / PHONE_H()) + 1));
  return `폰 ${k} / ${n}장`;
}
{ const v = store.get('set.phoneView', null); if (v !== null) $('#phoneView').checked = v; }
$('#phoneView').addEventListener('change', () => { store.set('set.phoneView', $('#phoneView').checked); phoneSync(); });
// 소설을 새로 그릴 때마다 폰 보기 표시를 다시 붙인다 (쪽 표시는 updateProgress 가 phoneWhere 로 바꾼다)
new MutationObserver(() => { $('#reader').classList.toggle('phone', $('#phoneView').checked); }).observe($('#reader'), {childList: true});
phoneSync();

/* ---------- 내 글꼴 파일 ----------
   글꼴은 커서 localStorage 대신 따로 작은 IndexedDB 에 둔다. */
const fontDb = () => new Promise((res, rej) => { const r = indexedDB.open('nv-font', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function fontIO(mode, fn){ const db = await fontDb(); return await new Promise((res, rej) => { const t = db.transaction('f', mode); const q = fn(t.objectStore('f')); t.oncomplete = () => { db.close(); res(q?.result); }; t.onerror = () => rej(t.error); }); }
async function fontApply(rec){
  const opt = $('#rfontMine');
  if (!rec){ opt.hidden = true; $('#fontDel').hidden = true; return false; }
  try{
    const face = new FontFace('NvMine', await rec.blob.arrayBuffer()); await face.load();
    [...document.fonts].filter(f => f.family === 'NvMine').forEach(f => document.fonts.delete(f)); document.fonts.add(face);
  }catch{ toast('글꼴 파일을 읽지 못했어요 (TTF·OTF·WOFF만 돼요)'); return false; }
  opt.hidden = false; opt.textContent = '내 글꼴 · ' + rec.name.replace(/\.(ttf|otf|woff2?)$/i, ''); $('#fontDel').hidden = false;
  return true;
}
$('#fontAdd').onclick = () => $('#fontFile').click();
$('#fontFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 40 * 1048576) return toast('글꼴 파일이 너무 커요 (40MB까지)');
  const rec = {name: f.name, blob: f};
  if (!await fontApply(rec)) return;
  try{ await fontIO('readwrite', s => s.put(rec, 'mine')); }catch{}
  $('#rfont').value = $('#rfontMine').value; $('#rfont').dispatchEvent(new Event('change'));
  toast('내 글꼴로 바꿨어요');
};
$('#fontDel').onclick = async () => {
  try{ await fontIO('readwrite', s => s.delete('mine')); }catch{}
  [...document.fonts].filter(f => f.family === 'NvMine').forEach(f => document.fonts.delete(f));
  if ($('#rfont').value === $('#rfontMine').value){ $('#rfont').selectedIndex = 0; $('#rfont').dispatchEvent(new Event('change')); }
  fontApply(null); toast('내 글꼴을 뺐어요');
};
fontIO('readonly', s => s.get('mine')).then(rec => fontApply(rec || null)).catch(() => {});

/* ---------- 키보드 ----------
   Space 자동 스크롤, ↑↓ 속도(자동 스크롤 중) · 스크롤 보기에서 ←→·PageUp/Down 한 화면, Home/End, +/− 글자 크기, P 폰 화면 */
document.addEventListener('keydown', e => {
  if (typing(e) || overlayOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === ' ' && cur){ e.preventDefault(); if (e.target.tagName === 'BUTTON') e.target.blur(); AS.on ? asStop() : asStart(); return; }
  if (AS.on && (k === 'ArrowUp' || k === 'ArrowDown')){ e.preventDefault(); asNudge(k === 'ArrowUp' ? 1 : -1); return; }
  if (AS.on && k === 'Escape') asStop();
  if (k === '+' || k === '='){ $('#fsUp').click(); toast(`글자 크기 ${$('#fs').value}`); return; }
  if (k === '-' || k === '_'){ $('#fsDown').click(); toast(`글자 크기 ${$('#fs').value}`); return; }
  if ((k === 'p' || k === 'P') && cur){ const c = $('#phoneView'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); toast(c.checked ? '폰 화면으로 보기를 켰어요' : '폰 화면으로 보기를 껐어요'); return; }
  // 스크롤 보기(소설·웹툰)에서 한 화면씩
  if (!cur || $('#reader.paged') || $('#reader .manga')) return;
  const r = $('#reader'); const page = r.clientHeight - 110;   // 위아래 막대만큼 겹쳐 둔다
  const go = y => { asStop(); r.scrollTo({top: y, behavior: 'smooth'}); };
  if (k === 'ArrowRight' || k === 'PageDown'){ e.preventDefault(); if (r.scrollTop + r.clientHeight >= r.scrollHeight - 2) $('#next').click(); else go(r.scrollTop + page); }
  else if (k === 'ArrowLeft' || k === 'PageUp'){ e.preventDefault(); go(r.scrollTop - page); }
  else if (k === 'ArrowDown'){ e.preventDefault(); go(r.scrollTop + 80); }
  else if (k === 'ArrowUp'){ e.preventDefault(); go(r.scrollTop - 80); }
  else if (k === 'Home'){ e.preventDefault(); go(0); }
  else if (k === 'End'){ e.preventDefault(); go(r.scrollHeight); }
});

/* ---------- 아이패드 가로: 서재와 도구가 함께 열려 글이 좁아지지 않게 ----------
   터치 기기에서 작품을 열거나 도구 창을 열면 서재를 접는다 (☰ 로 다시 연다). */
document.addEventListener('click', e => {
  if (!isTouch() || isMobile()) return;
  const a = $('#app');
  if (e.target.closest('#lib .card')) a.classList.add('hide-side');
  else if (e.target.closest('#tgTool') && !a.classList.contains('hide-tool') && innerWidth < 1500) a.classList.add('hide-side');
});

/* ---------- 첫 화면 '이어 읽기' 카드 ----------
   서재가 다시 그려질 때마다(작품을 불러오면) 가장 최근에 읽은 작품을 첫 화면 가운데에 보여 준다. */
function renderResume(){
  const box = $('#wResume'); if (!box) return;
  let best = null, bt = 0;
  for (const w of works){ const p = store.get('pos.' + w.key, null); if (p && (p.t || 0) > bt){ bt = p.t; best = {w, p}; } }
  if (!best){ box.hidden = true; return; }
  const {w, p} = best; const total = p.n || w.eps.length; const ep = w.eps[Math.min(p.ep, w.eps.length - 1)];
  const pct = Math.min(100, Math.round(((p.ep + (p.f || 0)) / total) * 100)); const cu = coverUrl(w);
  box.innerHTML = `<div class="cv">${cu ? `<img alt="" src="${cu}">` : '<div class="ph"></div>'}</div><div class="tx"><div class="k">이어 읽기</div><div class="n"></div><div class="e"></div><div class="bar2"><i style="width:${pct}%"></i></div></div><svg class="i"><use href="#i-right"/></svg>`;
  box.querySelector('.n').textContent = w.name;
  box.querySelector('.e').textContent = `${ep?.label || ep?.name || (p.ep + 1) + '화'} · ${Math.round((p.f || 0) * 100)}% · ${new Date(p.t).toLocaleDateString('ko-KR', {month: 'long', day: 'numeric'})}`;
  box.querySelector('.ph')?.style.setProperty('--h', hueOf(w.name));
  box.onclick = () => openWork(w);
  box.hidden = false;
}
new MutationObserver(renderResume).observe($('#lib'), {childList: true});
