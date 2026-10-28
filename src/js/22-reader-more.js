/* ================= 작가의 뷰어: 폰 화면 보기·내 글꼴·방향키·읽기 과녁·필사 ================= */
const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
const overlayOpen = () => !$('#studio').hidden || !$('#wt').hidden || $('#sketch').classList.contains('open');

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
   스크롤 보기에서 Space·←→·PageUp/Down 한 화면, Home/End, +/− 글자 크기, P 폰 화면 */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#fsPane').hidden && !overlayOpen()){ fsCloseNow(); $('#fsText').blur(); return; }   // 필사 중에도 Esc 로 닫힌다
  if (typing(e) || overlayOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === '+' || k === '='){ $('#fsUp').click(); toast(`글자 크기 ${$('#fs').value}`); return; }
  if (k === '-' || k === '_'){ $('#fsDown').click(); toast(`글자 크기 ${$('#fs').value}`); return; }
  if ((k === 'p' || k === 'P') && cur){ const c = $('#phoneView'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); toast(c.checked ? '폰 화면으로 보기를 켰어요' : '폰 화면으로 보기를 껐어요'); return; }
  // 스크롤 보기(소설·웹툰)에서 한 화면씩
  if (!cur || $('#reader.paged') || $('#reader .manga')) return;
  const r = $('#reader'); const page = r.clientHeight - 110;   // 위아래 막대만큼 겹쳐 둔다
  const go = y => r.scrollTo({top: y, behavior: 'smooth'});
  if (k === ' ' || k === 'ArrowRight' || k === 'PageDown'){ e.preventDefault(); if (e.target.tagName === 'BUTTON') e.target.blur(); if (r.scrollTop + r.clientHeight >= r.scrollHeight - 2) $('#next').click(); else go(r.scrollTop + page); }
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

/* ---------- 짜임(글 밀도) 프리셋: 줄간격·문단 간격·자간·여백을 한 번에 ---------- */
const DENS = {airy: {lh: '2.15', pgap: '1.3', ls: '0', margin: '32'}, std: {lh: '1.9', pgap: '0.9', ls: '0', margin: '24'}, tight: {lh: '1.7', pgap: '0.55', ls: '-0.01', margin: '20'}};
function densSync(){
  const cur = Object.entries(DENS).find(([, v]) => Math.abs(+$('#lh').value - +v.lh) < 0.03 && Math.abs(+$('#pgap').value - +v.pgap) < 0.06);
  $$('#qDens [data-dens]').forEach(b => b.classList.toggle('on', b.dataset.dens === cur?.[0]));
}
$$('#qDens [data-dens]').forEach(b => b.onclick = () => {
  for (const [id, v] of Object.entries(DENS[b.dataset.dens])){ const el = $('#' + id); el.value = v; el.dispatchEvent(new Event('change')); rangeFill(el); }
  applyView(); densSync();
});
$('#quick').addEventListener('change', densSync); $('#quick').addEventListener('input', densSync);
densSync();

/* ---------- 읽기의 과녁 ----------
   "한 번 읽을 때 기법 하나만 본다" — 작품마다 과녁을 하나 정해 두면 위 막대에 떠 있고, 형광펜 메모와 함께 남는다. */
function focusKey(){ return cur ? 'focus.' + cur.key : ''; }
function focusSync(){
  const v = cur ? store.get(focusKey(), '') : '';
  if ($('#readFocus').value !== v) $('#readFocus').value = v;
  const chip = $('#focusChip'); chip.hidden = !v; if (v) chip.textContent = '과녁 · ' + v;
}
$('#readFocus').addEventListener('change', () => { if (!cur) return toast('작품을 먼저 열어 주세요'); store.set(focusKey(), $('#readFocus').value); focusSync(); });
$('#focusChip').onclick = () => { $('#btnQuick').click(); };
new MutationObserver(focusSync).observe($('#reader'), {childList: true});

/* ---------- 필사 모드 ----------
   원문을 왼쪽에 두고 따라 쓴다. 회차마다 따로 저장하고(기기 저장소 'texts', 열쇠 fs:작품:회차),
   집필실 원고와 같은 길로 기기끼리 맞춰진다. '원문과 비교'는 판 비교와 같은 diff 를 쓴다. */
const FS = {k: '', t: 0};
const fsK = () => cur ? `fs:${cur.key}:${curEp}` : '';
async function fsLoad(){
  const k = fsK(); FS.k = k; if (!k) return;
  let text = '';
  try{ await txtReady(); text = TXT.cache.get(k)?.text || ''; }catch{}
  $('#fsText').value = text; fsStat();
}
function fsStat(){
  const src = (curText || '').replace(/\s/g, '').length, mine = $('#fsText').value.replace(/\s/g, '').length;
  $('#fsStat').textContent = src ? `원문 ${src.toLocaleString()}자 · 내 필사 ${mine.toLocaleString()}자 (${Math.min(100, Math.round(mine / src * 100))}%)` : '';
}
function fsSave(){
  const k = FS.k; if (!k) return;
  const r = TXT.cache.get(k) || {k, text: '', t: 0, syncedT: 0};
  if (r.text === $('#fsText').value) return;
  r.text = $('#fsText').value; r.t = Date.now(); TXT.cache.set(k, r); TXT.dirty.add(k);
  clearTimeout(FS.t); FS.t = setTimeout(() => txtFlushNow().catch(() => {}), 900);
}
async function fsOpenNow(){
  if (!cur || !curText) return toast('소설 회차를 먼저 열어 주세요');
  closeSheets(); $('#app').classList.add('fs-on'); $('#fsPane').hidden = false; $('#fsCmp').hidden = true;
  await fsLoad(); $('#fsText').focus();
}
function fsCloseNow(){ if ($('#fsPane').hidden) return; fsSave(); $('#fsPane').hidden = true; $('#app').classList.remove('fs-on'); }
$('#fsOpen').onclick = fsOpenNow;
$('#fsClose').onclick = fsCloseNow;
$('#fsText').addEventListener('input', () => { fsStat(); fsSave(); });
$('#fsDiff').onclick = () => {
  const box = $('#fsCmp'); box.hidden = !box.hidden;
  if (!box.hidden){ box.innerHTML = diffHTML(curText || '', $('#fsText').value).html; $('#fsDiff').textContent = '비교 닫기'; }
  else $('#fsDiff').textContent = '원문과 비교';
};
$('#fsWipe').onclick = () => { if (!confirm('이 회차의 필사를 지울까요?')) return; $('#fsText').value = ''; fsStat(); fsSave(); };
$('#fsCopyIdea').onclick = () => {
  const t = $('#fsText'); const v = t.value.slice(t.selectionStart, t.selectionEnd).trim() || t.value.split('\n').filter(Boolean).at(-1)?.trim() || '';
  if (!v) return toast('보낼 문장을 골라 주세요');
  addIdea(v.slice(0, 300) + ' #필사', cur ? cur.name : '');
};
// 회차가 바뀌면 그 회차의 필사로 갈아 끼운다
new MutationObserver(() => { if (!$('#fsPane').hidden){ if (!cur || !curText) fsCloseNow(); else if (fsK() !== FS.k){ fsSave(); fsLoad(); $('#fsCmp').hidden = true; $('#fsDiff').textContent = '원문과 비교'; } } }).observe($('#reader'), {childList: true});
