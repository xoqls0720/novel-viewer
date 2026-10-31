/* ================= 열기 ================= */
async function openWork(w){
  stopTTS();
  cur = w; chats.ai.reset(); $('#mode').value = store.get('set.mode.' + w.kind, 'auto'); $('#app').classList.remove('nowork'); $('#app').classList.add('opening');
  if (!w._expanded && w.kind !== 'manga' && w.eps.some(e => e.type === 'epub')){
    toast('epub 여는 중…');
    const out = []; let comic = 0;
    for (const ep of w.eps){
      if (ep.type !== 'epub'){ out.push(ep); continue; }
      try{
        const e = await readEpub(ep.file);
        // 웹툰 EPUB(작품 통째): 목차대로 화별로 나눈다. 만화는 권 그대로 둔다
        if (e.isComic && e.parts.length > 1 && (w.kind === 'webtoon' || /웹툰/.test(w.top))){ e.parts.forEach((p, i) => { const name = p.title || `${i + 1}화`; if (!out.some(o => o.type === 'epubpart' && o.name === name)) out.push({name, type: 'epubpart', file: ep.file, idx: i}); }); comic++; continue; }   // 같은 작품 EPUB 이 둘(사본)이어도 같은 화는 한 번만
        if (e.isComic){ out.push(ep); comic++; continue; }
        const many = w.eps.length > 1;
        const n0 = out.length;
        e.chapters.forEach((c,i) => { if (c.text.length > 20) out.push({name: (many ? ep.name + ' · ' : '') + (c.title || `${i+1}장`), type:'epubch', file:ep.file, idx:i}); });
        if (out.length === n0) out.push(ep);   // 글 장이 하나도 없으면(그림 몇 장뿐인 EPUB) 통째로 남긴다 — 사라지지 않게
      }catch{ out.push(ep); }
    }
    w.eps = out; if (comic && comic === out.length && w.kind !== 'webtoon') w.kind = 'manga';
    w._expanded = true;
  }
  try{ await splitWorkTxt(w); }catch(e){ $('#app').classList.remove('opening'); throw e; }
  if (cur !== w) return $('#app').classList.remove('opening');
  $('#title').textContent = w.name; closeSheets();
  const sel = $('#epSel'); sel.innerHTML = '';
  w.eps.forEach((e,i)=>{ e.label = prettyEp(e.name); const o=document.createElement('option'); o.value=i; o.textContent=e.label; sel.append(o); });
  const pos = store.get('pos.'+w.key, {ep:0});
  try{ await openEp(Math.min(pos.ep || 0, w.eps.length-1), pos); }finally{ $('#app').classList.remove('opening'); }
  renderLib(); renderWorkStats(); renderNotes();
  if (isMobile()) $('#app').classList.remove('show-side');
}

function freeUrls(){ objectUrls.forEach(u=>URL.revokeObjectURL(u)); objectUrls = []; }
const url = blob => { const u = URL.createObjectURL(blob); objectUrls.push(u); return u; };
const isText = ep => ep.type === 'txt' || ep.type === 'epubch' || ep.type === 'txtpart';
async function epText(ep){
  if (ep.type === 'txt') return await decodeText(ep.file);
  if (ep.type === 'epubch') return (await readEpub(ep.file)).chapters[ep.idx]?.text || '';
  if (ep.type === 'txtpart') return (await txtParts(ep.file))?.[ep.idx]?.text || '';
  return '';
}
// 윈도우에서 만든 txt(EUC-KR·CP949)도 읽는다
async function decodeText(f){ const buf = await f.arrayBuffer(); try{ return new TextDecoder('utf-8', {fatal:true}).decode(buf).replace(/^\uFEFF/, ''); }catch{ try{ return new TextDecoder('euc-kr').decode(buf); }catch{ return new TextDecoder().decode(buf); } } }
const splitParas = t => t.split(/\n\s*\n|\n/).map(s=>s.trim()).filter(Boolean);
function viewMode(){
  const m = $('#mode').value;
  if (m !== 'auto') return m;
  return cur.kind === 'novel' ? (store.get('set.pagedDefault', false) ? 'paged' : 'novel') : cur.kind;
}

async function openEp(i, pos = {}, jump = null){
  if (!cur) return;
  const tok = ++openToken; const w = cur;
  stopTTS(); clearTimeout(anTimer);
  const ep = w.eps[i]; if (!ep) return;
  let mode = viewMode();
  let text = '', imgs = [];
  if (isText(ep)) text = await epText(ep);
  else if (ep.type === 'video'){ /* 영상은 아래에서 플레이어로 */ }
  else {
    if (ep.type === 'imgs') imgs = ep.files.map(f => f.isLazy ? {lazy: () => f.blob(), name: f.name} : {blob: f, name: f.name});
    else if (ep.type === 'epubpart'){
      const e = await readEpub(ep.file);
      for (const p of e.parts[ep.idx]?.imgs || []) imgs.push({lazy: () => e.zip.file(p).async('blob'), name: p});
    }
    else if (ep.type === 'epub'){
      const e = await readEpub(ep.file);
      for (const c of e.chapters) for (const p of c.imgs) imgs.push({lazy: () => e.zip.file(p).async('blob'), name:p});
    }
    if (mode === 'novel' || mode === 'paged') mode = w.kind === 'novel' ? 'webtoon' : w.kind;
    if (mode === 'manga') imgs = await prepareImgs(imgs, tok);
  }
  if (tok !== openToken || cur !== w) return;
  if (i === curEp + 1) markRead(curEp);   // 다음 화로 넘어가면 앞 화는 읽음
  freeUrls();
  curEp = i; $('#epSel').value = i; $('#epTitle').textContent = ep.label || ep.name; $('#epTitle').title = ep.name; curText = text; curParas = text ? splitParas(text) : []; curImgs = imgs; mangaPos = 0;
  const r = $('#reader'); r.classList.remove('paged'); r.classList.toggle('vid', ep.type === 'video');
  if (ep.type === 'video'){
    await renderVideo(ep, pos);
  } else if (text){
    renderNovel(mode === 'paged'); renderEpStats();
  } else {
    if (mode === 'manga'){
      if (pos.end) mangaPos = await lastSpreadStart();
      else if (pos.page !== undefined) mangaPos = Math.min(Math.max(0, curImgs.length-1), pos.page);
      else mangaPos = await snapSpread(Math.min(Math.max(0, curImgs.length-1), Math.round((pos.f || 0) * curImgs.length)));
      await renderManga();
    } else renderWebtoon();
    $('#pane-stat').innerHTML = `<h3>${esc(ep.name)}</h3><div class="hint">이미지 ${curImgs.length}장. 그림 연출은 Claude 탭의 <b>이 쪽 연출 분석</b>으로 볼 수 있어요.</div>`;
  }
  await new Promise(requestAnimationFrame);
  if (tok !== openToken) return;
  if (jump) gotoRange(jump);
  else if (ep.type === 'video'){ /* 영상은 renderVideo 가 이어 보기 자리를 맞춘다 */ }
  else if ($('#reader .webtoon')) await restoreWebtoon(pos);
  else if (!$('#reader .manga')) setFrac(pos.end ? 1 : (pos.f || 0));
  updateProgress(); savePos(); wakeSync(); coach();
  updateFlowBtn(); trMaybe();
}

/* ---------- 소설 ---------- */
function renderNovel(paged){
  const r = $('#reader');
  const div = document.createElement('div'); div.className = 'novel';
  const head = document.createElement('div'); head.className = 'chead';
  head.innerHTML = '<div class="cw"></div><h2></h2><div class="orn">· · ·</div>';
  head.querySelector('.cw').textContent = cur.name; head.querySelector('h2').textContent = cur.eps[curEp].label || cur.eps[curEp].name; div.append(head);
  curParas.forEach((p, idx) => { const el = document.createElement('p'); el.dataset.i = idx; el.textContent = p; div.append(el); });
  r.innerHTML = ''; r.append(div);
  if (paged){
    r.classList.add('paged');
    r.insertAdjacentHTML('beforeend', '<div class="tapzone l" data-d="-1"></div><div class="tapzone r" data-d="1"></div>');
    r.querySelectorAll('.tapzone').forEach(z => z.onclick = () => pageTurn(+z.dataset.d));
  } else appendEpEnd(r);
  applyHighlights();
  requestAnimationFrame(writerMarks);
}
function appendEpEnd(r){
  const has = curEp < cur.eps.length-1;
  r.insertAdjacentHTML('beforeend', `<div class="epend"><div class="orn">· · ·</div>${has ? `<button class="nextcard" id="endNext"><div><div class="k">다음 화</div><div class="n">${esc(cur.eps[curEp+1].label || cur.eps[curEp+1].name)}</div></div><svg class="i" style="margin-left:auto"><use href="#i-right"/></svg></button>` : '<div class="hint">마지막 화까지 읽었어요</div>'}</div>`);
  $('#endNext') && ($('#endNext').onclick = () => openEp(curEp+1));
}
function pageTurn(d){
  const nv = $('#reader.paged .novel'); if (!nv) return;
  if ($('#tapMode').value === 'next' && d < 0 && pageTurn._tap) d = 1;   // 한 손 모드: 양쪽 다 다음 쪽
  pageTurn._tap = false;
  const step = nv.clientWidth;
  const max = nv.scrollWidth - step;
  if (d > 0 && nv.scrollLeft >= max - 4){ if (curEp < cur.eps.length-1) openEp(curEp+1); else toast('마지막 쪽이에요'); return; }
  if (d < 0 && nv.scrollLeft <= 4){ if (curEp > 0) openEp(curEp-1, {end:true}); return; }
  nv.style.scrollBehavior = 'smooth'; setTimeout(() => nv.style.scrollBehavior = '', 450);
  nv.scrollLeft = Math.round((nv.scrollLeft + d*step) / step) * step;
  setTimeout(() => { if ($('#reader.paged')){ updateProgress(); savePos(); } }, 480);
}
function getFrac(){
  const r = $('#reader'); const nv = $('#reader.paged .novel');
  if (nv) return nv.scrollWidth > nv.clientWidth ? nv.scrollLeft / (nv.scrollWidth - nv.clientWidth) : 0;
  if ($('#reader .manga')) return curImgs.length ? mangaPos / curImgs.length : 0;
  return r.scrollHeight > r.clientHeight ? r.scrollTop / (r.scrollHeight - r.clientHeight) : 0;
}
let hideBlock = 0;
const quiet = (ms = 900) => { hideBlock = Date.now() + ms; };   // 프로그램이 움직인 스크롤에는 막대를 숨기지 않는다
function setFrac(f){
  quiet();
  const r = $('#reader'); const nv = $('#reader.paged .novel');
  if (nv){ const step = nv.clientWidth; nv.scrollLeft = Math.round(f * (nv.scrollWidth - step) / step) * step; return; }
  r.scrollTop = f * (r.scrollHeight - r.clientHeight);
}
function updateProgress(){
  if (!cur) return;
  const f = getFrac(), pi = pagedInfo(); if (!scrubbing) $('#scrub').value = Math.round(f * 1000);
  const where = $('#reader .manga') ? `${mangaPos + mangaShown} / ${curImgs.length}` : pi ? `${pi.k} / ${pi.n}쪽` : phoneWhere() || `${Math.round(f*100)}%`;
  $('#pageInd').textContent = where;
  if (f > 0.9) markRead(curEp);
  // 몰입 화면 아래 한 줄: 회차 · 위치 · 남은 시간 · 시각
  const now = new Date().toLocaleTimeString('ko-KR', {hour:'numeric', minute:'2-digit'});
  $('#mini').textContent = [cur.eps[curEp]?.label || cur.eps[curEp]?.name, where, minutesLeft(f), now].filter(Boolean).join('  ·  ');
  modeClass(); bmMark();
}
let scrubbing = false;
function markRead(i){ if (!cur) return; const k = 'read.'+cur.key; const r = store.get(k, []); if (!r.includes(i)){ r.push(i); store.set(k, r); } }
function webtoonAnchor(){
  const r = $('#reader'); const top = r.getBoundingClientRect().top;
  const imgs = $$('#reader .webtoon img');
  for (let i=0; i<imgs.length; i++){ const b = imgs[i].getBoundingClientRect(); if (b.bottom > top + 1) return {img:i, off: b.height ? (top - b.top) / b.height : 0}; }
  return {img: Math.max(0, imgs.length-1), off: 1};
}
async function restoreWebtoon(pos){
  const imgs = $$('#reader .webtoon img');
  let target = pos.img ?? (pos.end ? imgs.length-1 : null);
  if (target === null){ if (pos.f) target = Math.floor(pos.f * imgs.length); else return; }
  target = Math.min(Math.max(0, target), imgs.length-1);
  const tok = openToken;
  await Promise.all(imgs.slice(0, target+1).map(im => loadImg(im)));
  if (tok !== openToken) return;
  const im = imgs[target]; if (!im) return;
  quiet(); $('#reader').scrollTop = im.offsetTop + (pos.end ? im.offsetHeight : (pos.off || 0) * im.offsetHeight);
}
let posT;
function savePos(){
  if (!cur) return;
  const w = cur, ep = curEp, tok = openToken;
  const p = {ep, f:getFrac(), t:Date.now(), n:w.eps.length};
  const v = $('#reader video'); if (v) p.vt = Math.floor(v.currentTime || 0);
  if ($('#reader .manga')) p.page = mangaPos;
  if ($('#reader .webtoon')) Object.assign(p, webtoonAnchor());
  clearTimeout(posT);
  posT = setTimeout(() => { if (tok === openToken && w === cur) store.set('pos.'+w.key, p); }, 300);
}

/* ---------- 형광펜·메모 ---------- */
const getNotes = (key) => (store.get('notes.' + (key || cur.key), [])).map(n => n.parts ? n : {...n, parts: [{para: n.para, text: n.text}]});
const setNotes = (notes) => store.set('notes.' + cur.key, notes);
function wrapRange(p, start, end, cls, id){
  const marks = []; let pos = 0;
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); const nodes = [];
  let n; while ((n = walker.nextNode())) nodes.push(n);
  for (let node of nodes){
    const len = node.data.length, a = pos, b = pos + len; pos = b;
    if (b <= start || a >= end) continue;
    const s = Math.max(start, a) - a, e = Math.min(end, b) - a;
    if (e < len) node.splitText(e);
    if (s > 0) node = node.splitText(s);
    const m = document.createElement('mark'); m.className = cls; if (id) m.dataset.id = id;
    node.parentNode.insertBefore(m, node); m.append(node); marks.push(m);
  }
  return marks;
}
function partRange(p, part){
  if (part.start !== undefined) return [part.start, part.end];
  const k = p.textContent.indexOf(part.text);
  return k < 0 ? null : [k, k + part.text.length];
}
function bindMark(m, n){ m.title = n.note || ''; m.onclick = e => { if (getSelection().isCollapsed){ e.stopPropagation(); editNote(n.id); } }; }
function applyHighlights(){
  if (!cur) return;
  for (const n of getNotes()){
    if (n.ep !== curEp) continue;
    for (const part of n.parts){
      const p = $(`#reader .novel p[data-i="${part.para}"]`); if (!p) continue;
      const rg = partRange(p, part); if (!rg) continue;
      for (const m of wrapRange(p, rg[0], rg[1], n.color, n.id)) bindMark(m, n);
    }
  }
}
function offsetIn(p, node, off){ const r = document.createRange(); r.setStart(p, 0); r.setEnd(node, off); return r.toString().length; }
function selectionInfo(){
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const el = n => (n.nodeType === 1 ? n : n.parentElement);
  const p1 = el(range.startContainer)?.closest('.novel p'), p2 = el(range.endContainer)?.closest('.novel p');
  if (!p1 || !p2) return null;
  const i1 = +p1.dataset.i, i2 = +p2.dataset.i;
  const parts = [];
  for (let i = i1; i <= i2; i++){
    const p = $(`#reader .novel p[data-i="${i}"]`); if (!p) continue;
    const s = i === i1 ? offsetIn(p, range.startContainer, range.startOffset) : 0;
    const e = i === i2 ? offsetIn(p, range.endContainer, range.endOffset) : p.textContent.length;
    if (e > s) parts.push({para:i, start:s, end:e, text: p.textContent.slice(s, e)});
  }
  if (!parts.length) return null;
  const text = parts.map(x=>x.text).join('\n');
  if (!text.trim() || text.length > 4000) return null;
  return {parts, text, rect: range.getBoundingClientRect()};
}
let selInfo = null;
function showSelbar(){
  selInfo = selectionInfo(); const bar = $('#selbar');
  if (!selInfo){ bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const below = isTouch();   // 아이폰은 선택 위에 기본 메뉴가 떠서 아래에 둔다
  bar.style.left = Math.max(8, Math.min(innerWidth - bar.offsetWidth - 8, selInfo.rect.left)) + 'px';
  bar.style.top = (below ? Math.min(innerHeight - bar.offsetHeight - 8, selInfo.rect.bottom + 12) : Math.max(8, selInfo.rect.top - bar.offsetHeight - 8)) + 'px';
}
document.addEventListener('mouseup', e => { if (!e.target.closest('#selbar')) setTimeout(showSelbar, 10); });
document.addEventListener('selectionchange', () => { clearTimeout(showSelbar._t); showSelbar._t = setTimeout(() => { if (!getSelection().isCollapsed || $('#selbar').style.display === 'flex') showSelbar(); }, 350); });
function addNote(color, note=''){
  if (!selInfo || !cur) return;
  const notes = getNotes();
  const n = {id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), ep: curEp, epName: cur.eps[curEp].name, parts: selInfo.parts.map(({para,start,end})=>({para,start,end})), text: selInfo.text, color, note, t: Date.now()};
  notes.push(n); setNotes(notes);
  getSelection().removeAllRanges(); $('#selbar').style.display = 'none';
  for (const part of n.parts){   // 다시 그리지 않고 그 자리에 칠한다(쪽 위치 유지)
    const p = $(`#reader .novel p[data-i="${part.para}"]`); if (!p) continue;
    for (const m of wrapRange(p, part.start, part.end, color, n.id)) bindMark(m, n);
  }
  renderNotes();
}
function rerenderKeepPos(){ const f = getFrac(); renderNovel(!!$('#reader.paged')); setFrac(f); }
function editNote(id){
  const notes = getNotes(); const n = notes.find(x=>x.id===id); if (!n) return;
  const v = prompt('메모를 고치세요. "삭제"라고 쓰면 형광펜을 지워요.', n.note || '');
  if (v === null) return;
  if (v.trim() === '삭제'){ notes.splice(notes.indexOf(n), 1); tomb('notes', n.id); } else { n.note = v; n.t = Date.now(); }
  setNotes(notes); rerenderKeepPos(); renderNotes();
}
$$('#selbar [data-hl]').forEach(b => b.onclick = () => { addNote(b.dataset.hl); toast('형광펜을 칠했어요'); });
$('#selNote').onclick = () => { const keep = selInfo; const v = prompt('메모'); selInfo = keep; if (v !== null) { addNote('y', v); toast('메모를 남겼어요'); } };
$('#selCopy').onclick = () => { copy(selInfo?.text || ''); $('#selbar').style.display='none'; };
$('#selAsk').onclick = () => {
  if (!selInfo) return; const t = selInfo.text; $('#selbar').style.display='none'; getSelection().removeAllRanges();
  openTool('ai'); $('#aiQ').value = `「${t}」\n\n이 부분이 이 화에서 하는 역할과, 비슷하게 쓰려면 어떻게 하면 되는지 알려 줘.`; $('#aiQ').focus();
};

function allNotes(scope = $('#noteScope').value){
  if (scope === 'work' && cur) return [{w:cur, notes:getNotes()}];
  return works.map(w => ({w, notes: getNotes(w.key)})).filter(x => x.notes.length);
}
const noteSort = (a,b) => a.ep-b.ep || a.parts[0].para-b.parts[0].para || (a.parts[0].start||0)-(b.parts[0].start||0);
function renderNotes(){
  const list = $('#noteList'); list.innerHTML = '';
  let count = 0;
  for (const {w, notes} of allNotes()){
    for (const n of [...notes].sort(noteSort)){
      count++;
      const d = document.createElement('div'); d.className = 'item';
      d.innerHTML = `<div class="e"><span class="chip" style="background:var(--hl-${n.color})"></span>${esc(w.name)} · ${esc(n.epName||'')}</div><div class="q">${esc(n.text)}</div>${n.note?`<div class="n">${esc(n.note)}</div>`:''}`;
      d.onclick = async () => { if (cur !== w) await openWork(w); const p0 = n.parts[0]; openEp(n.ep, {}, {para:p0.para, keep:true}); if (isMobile()) $('#app').classList.remove('show-tool'); };
      list.append(d);
    }
  }
  if (!count) list.innerHTML = '<div class="hint" style="padding:8px">아직 메모가 없어요. 소설에서 문장을 골라 보세요.</div>';
}
function gotoRange(j){
  const p = $(`#reader .novel p[data-i="${j.para}"]`); if (!p) return; quiet();
  const nv = $('#reader.paged .novel');
  if (nv){ const step = nv.clientWidth; nv.scrollLeft = Math.floor((p.offsetLeft - nv.offsetLeft) / step) * step; }
  else p.scrollIntoView({block:'center'});
  if (!j.keep && j.start !== undefined){
    const ms = wrapRange(p, j.start, j.end, 'find');
    setTimeout(() => { for (const m of ms) if (m.isConnected) m.replaceWith(...m.childNodes); p.normalize(); }, 2500);
  } else if (!j.quiet){ p.style.transition='background .6s'; p.style.background='color-mix(in srgb, var(--accent) 18%, transparent)'; setTimeout(()=>p.style.background='', 1500); }
  updateProgress(); savePos();
}
function notesMarkdown(scope){
  let md = '';
  for (const {w, notes} of allNotes(scope)){
    md += `# ${w.name}\n\n`;
    let last = null;
    for (const n of [...notes].sort(noteSort)){
      if (n.epName !== last){ md += `## ${n.epName}\n\n`; last = n.epName; }
      md += `- [${({y:'좋은 문장',g:'구조·기술',p:'대사'})[n.color]}] ${n.text.replace(/\n/g,' / ')}${n.note ? `\n  - 메모: ${n.note}` : ''}\n`;
    }
    md += '\n';
  }
  return md;
}
function download(name, text, type='text/markdown'){
  const u = URL.createObjectURL(new Blob([text], {type})); const a = document.createElement('a'); a.href = u; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
$('#noteScope').onchange = () => { renderNotes(); renderScraps(); };
$('#noteMd').onclick = () => download(($('#noteScope').value==='work' && cur ? cur.name : '모든작품') + '_메모.md', notesMarkdown());
$('#noteAI').onclick = () => {
  const md = notesMarkdown(); if (md.trim().length < 20) return toast('정리할 메모가 없어요');
  openTool('ai'); chats.ai.reset();
  chats.ai.ask({question:`아래는 내가 작품을 읽으며 형광펜(노랑=좋은 문장, 초록=구조·기술, 분홍=대사)과 메모를 남긴 목록이야.
1) 내가 반복해서 끌리는 문장·기술의 공통점
2) 내 메모에서 보이는 관심사와 빠진 관점
3) 이걸 내 글쓰기에 옮길 연습 과제 5개 (각각 300자 안팎으로 바로 써 볼 수 있게)
로 정리해 줘.

${md}`, display:'[메모 정리]'});
};

/* ---------- 검색 ---------- */
let findToken = 0;
async function runFind(){
  const q = $('#findQ').value.trim(); if (!q || !cur) return;
  let re; try{ re = new RegExp(q, 'g'); }catch{ re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g'); }
  const tok = ++findToken; const w = cur; const list = $('#findList'); list.innerHTML = ''; let hits = 0, epHits = 0;
  $('#findInfo').textContent = '찾는 중…';
  for (let i=0; i<w.eps.length; i++){
    if (tok !== findToken) return;
    if (!isText(w.eps[i])) continue;
    const paras = splitParas(await epText(w.eps[i])); let inEp = 0;
    paras.forEach((p, idx) => {
      re.lastIndex = 0; const m = re.exec(p); if (!m || !m[0]) return;
      hits++; inEp++; if (hits > 500) return;
      const s = Math.max(0, m.index - 30), e = Math.min(p.length, m.index + m[0].length + 40);
      const d = document.createElement('div'); d.className = 'item';
      d.innerHTML = `<div class="e">${esc(w.eps[i].name)}</div><div class="q">${esc(p.slice(s, m.index))}<b>${esc(m[0])}</b>${esc(p.slice(m.index+m[0].length, e))}</div>`;
      d.onclick = () => { openEp(i, {}, {para: idx, start: m.index, end: m.index + m[0].length}); if (isMobile()) $('#app').classList.remove('show-tool'); };
      list.append(d);
    });
    if (inEp) epHits++;
  }
  $('#findInfo').textContent = hits ? `${epHits}개 화에서 ${hits}번 나와요${hits>500?' (500개까지만 표시)':''}` : '찾지 못했어요';
}
$('#findGo').onclick = runFind;
$('#findQ').addEventListener('keydown', e => e.key === 'Enter' && runFind());

/* ---------- 웹툰·만화 ---------- */
async function blobOf(it){ if (!it.blob) it.blob = await it.lazy(); return it.blob; }
async function imgSrc(it){ if (!it) return ''; if (it.src) return it.src; it.src = url(await blobOf(it)); return it.src; }
function makeCanvas(w, h){ if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const canvasBlob = c => c.convertToBlob ? c.convertToBlob({type:'image/jpeg', quality:0.92}) : new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
// 붙은 두 쪽 나누기: 크기만 먼저 재고, 실제 자르기·여백 자르기는 그 쪽을 볼 때 한다
async function prepareImgs(imgs, tok){
  const split = $('#splitWide').checked, crop = $('#crop').checked, rtl = $('#rtl').value === '1';
  if (!split && !crop) return imgs;
  if (split && imgs.length > 20) toast('쪽 크기를 재는 중…');
  const out = [];
  for (const it of imgs){
    if (tok !== openToken) return imgs;
    let parts = ['A'];
    if (split){ const bmp = await createImageBitmap(await blobOf(it)); const wide = bmp.width > bmp.height * 1.15; bmp.close?.(); if (wide) parts = rtl ? ['R','L'] : ['L','R']; }
    for (const part of parts){
      out.push({name: it.name + part, wide: parts.length > 1 ? false : undefined, lazy: async () => {
        const bmp = await createImageBitmap(await blobOf(it));
        let sx = 0, sw = bmp.width, sy = 0, sh = bmp.height;
        if (part === 'L') sw = bmp.width/2; if (part === 'R'){ sx = bmp.width/2; sw = bmp.width/2; }
        if (crop){ const b = trimBox(bmp, sx, sy, sw, sh); sx = b.x; sy = b.y; sw = b.w; sh = b.h; }
        const cv = makeCanvas(Math.round(sw), Math.round(sh)); cv.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        bmp.close?.();
        return await canvasBlob(cv);
      }});
    }
  }
  return out;
}
function trimBox(bmp, sx, sy, sw, sh){
  const s = Math.min(1, 300 / Math.max(sw, sh)); const W = Math.max(1, Math.round(sw*s)), H = Math.max(1, Math.round(sh*s));
  const cv = makeCanvas(W, H); const g = cv.getContext('2d', {willReadFrequently:true}); g.drawImage(bmp, sx, sy, sw, sh, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const bg = [d[0], d[1], d[2]];
  const ink = (x,y) => { const k = (y*W+x)*4; return Math.abs(d[k]-bg[0]) + Math.abs(d[k+1]-bg[1]) + Math.abs(d[k+2]-bg[2]) > 60; };
  let t=0,b=H-1,l=0,r=W-1;
  const rowInk = y => { let c=0; for(let x=0;x<W;x++) if(ink(x,y)) c++; return c > W*0.01; };
  const colInk = x => { let c=0; for(let y=0;y<H;y++) if(ink(x,y)) c++; return c > H*0.01; };
  while (t<b && !rowInk(t)) t++; while (b>t && !rowInk(b)) b--; while (l<r && !colInk(l)) l++; while (r>l && !colInk(r)) r--;
  const pad = 4;
  t=Math.max(0,t-pad); l=Math.max(0,l-pad); b=Math.min(H-1,b+pad); r=Math.min(W-1,r+pad);
  if ((r-l) < W*0.5 || (b-t) < H*0.5) return {x:sx, y:sy, w:sw, h:sh};
  return {x: sx + l/s, y: sy + t/s, w: (r-l+1)/s, h: (b-t+1)/s};
}
// 그림은 앞(위)에서부터 네 장씩: 한꺼번에 수십 장을 부르면 지금 볼 첫 장이 늦게 뜬다(멀리 있는 드라이브·PC 서재에서)
const IMGQ = {wait: [], run: 0};
function loadImg(im){ return new Promise(done => { IMGQ.wait.push({im, done}); imgPump(); }); }
function imgPump(){
  while (IMGQ.run < 4 && IMGQ.wait.length){
    IMGQ.wait.sort((a, b) => (+a.im.dataset.i || 0) - (+b.im.dataset.i || 0));
    const {im, done} = IMGQ.wait.shift(); if (!im.isConnected){ done(); continue; }   // 다른 화로 넘어갔으면 건너뛴다
    IMGQ.run++; loadImg0(im).catch(() => {}).finally(() => { IMGQ.run--; done(); imgPump(); });
  }
}
async function loadImg0(im){
  if (!im.getAttribute('src') && im.dataset.i){ const it = curImgs[+im.dataset.i]; if (it) im.src = await imgSrc(it); }
  if (im.getAttribute('src') && !im.complete) await new Promise(res => { im.addEventListener('load', res, {once:true}); im.addEventListener('error', res, {once:true}); });
  im.style.minHeight = '';
}
function renderWebtoon(){
  const r = $('#reader'); r.innerHTML = '';
  const box = document.createElement('div'); box.className = 'webtoon'; r.append(box);
  const io = new IntersectionObserver(ents => { for (const en of ents) if (en.isIntersecting){ io.unobserve(en.target); loadImg(en.target); } }, {root:r, rootMargin:'2500px'});
  curImgs.forEach((it,i)=>{ const im = document.createElement('img'); im.dataset.i = i; im.alt=''; im.style.minHeight='600px'; im.decoding='async'; box.append(im); io.observe(im); });
  appendEpEnd(r);
}
async function imgWide(i){
  const it = curImgs[i]; if (!it) return false; if (it.wide !== undefined) return it.wide;
  const bmp = await createImageBitmap(await blobOf(it)); it.wide = bmp.width > bmp.height; bmp.close?.(); return it.wide;
}
let mangaShown = 1, mangaToken = 0, mangaBusy = false;
async function pairAt(pos){
  if (spreadN() !== 2 || pos < 0 || pos+1 >= curImgs.length) return false;
  if ($('#coverSingle').checked && pos === 0) return false;
  return !(await imgWide(pos)) && !(await imgWide(pos+1));
}
// 두 쪽 보기에서 n이 짝의 오른쪽(뒤) 쪽이면 앞 쪽으로 맞춘다(표지 한 쪽이면 1·3·5…가 짝의 시작)
async function snapSpread(n){
  if (spreadN() !== 2 || n <= 0 || await imgWide(n)) return n;
  const start = $('#coverSingle').checked ? 1 : 0;
  return ((n - start) % 2 === 1 && !(await imgWide(n-1))) ? n - 1 : n;
}
async function lastSpreadStart(){ const last = curImgs.length - 1; if (last <= 0) return 0; return (await pairAt(last-1)) ? last-1 : last; }
async function renderManga(){
  const tok = ++mangaToken; const r = $('#reader'); const rtl = $('#rtl').value === '1';
  mangaPos = Math.min(Math.max(0, mangaPos), Math.max(0, curImgs.length-1));
  if (!curImgs.length){ r.innerHTML = '<div class="empty">이미지가 없어요</div>'; return; }
  const shown = [mangaPos]; if (await pairAt(mangaPos)) shown.push(mangaPos+1);
  const srcs = []; for (const i of shown) srcs.push(await imgSrc(curImgs[i]));
  if (tok !== mangaToken) return;
  mangaShown = shown.length;
  r.innerHTML = ''; const box = document.createElement('div');
  box.className = 'manga' + (shown.length===1?' single':'') + ($('#fit').value==='w'?' fitw':''); r.append(box);
  if (rtl) srcs.reverse();
  for (const s of srcs){ const im = document.createElement('img'); im.src = s; im.alt = ''; box.append(im); }
  for (let k = mangaPos + mangaShown; k < Math.min(curImgs.length, mangaPos + mangaShown + 3); k++) imgSrc(curImgs[k]);
  r.scrollTop = 0; updateProgress(); savePos(); trMaybe();
}
async function mangaStep(d){
  if (mangaBusy || !cur) return; mangaBusy = true;
  try {
    let n;
    if (d > 0) n = mangaPos + mangaShown;
    else { n = mangaPos - 1; if (n > 0 && await pairAt(n-1)) n -= 1; }
    if (n < 0){ if (curEp > 0) await openEp(curEp-1, {end:true}); else toast('첫 쪽이에요'); return; }
    if (n >= curImgs.length){ if (curEp < cur.eps.length-1) await openEp(curEp+1); else toast('마지막 쪽이에요'); return; }
    mangaPos = n; await renderManga();
  } finally { mangaBusy = false; }
}

/* ---------- 누르기·밀기 (휴대폰) ---------- */
const reader = $('#reader');
let touch0 = null;
reader.addEventListener('touchstart', e => { if (e.touches.length === 1) touch0 = {x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now()}; }, {passive:true});
reader.addEventListener('touchend', e => {
  if (!touch0) return; const t = e.changedTouches[0]; const dx = t.clientX - touch0.x, dy = t.clientY - touch0.y; const dt = Date.now() - touch0.t; touch0 = null;
  if (dt > 600 || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (!getSelection().isCollapsed) return;
  const rtl = $('#rtl').value === '1';
  if ($('#reader .manga')) mangaStep((dx > 0) === rtl ? 1 : -1);
  else if ($('#reader.paged')) pageTurn(dx < 0 ? 1 : -1);
}, {passive:true});
reader.addEventListener('click', e => {
  if (e.target.closest('button, mark, .tapzone, a') || !getSelection().isCollapsed) return;
  const b = reader.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width;
  if ($('#reader .manga') && (x < 0.3 || x > 0.7)){ const rtl = $('#rtl').value === '1'; mangaStep((x < 0.3) === rtl ? 1 : -1); return; }
  if (closeSheets()) return;
  if (x > 0.3 && x < 0.7) $('#app').classList.toggle('immersive');
});

/* ---------- 읽어 주기 ---------- */
let ttsSession = 0;
function stopTTS(){ ttsSession++; tts?.cancel(); $('#btnTTS').classList.remove('on'); $$('.novel p.speaking').forEach(p=>p.classList.remove('speaking')); }
function speakFrom(i, session){
  if (session !== ttsSession) return;
  $$('.novel p.speaking').forEach(p=>p.classList.remove('speaking'));
  if (i >= curParas.length){
    $('#btnTTS').classList.remove('on');
    if ($('#autoNext').value === 'auto' && curEp < cur.eps.length-1) openEp(curEp+1).then(() => { const s = ++ttsSession; $('#btnTTS').classList.add('on'); speakFrom(0, s); });
    return;
  }
  const p = $(`#reader .novel p[data-i="${i}"]`);
  if (p){ p.classList.add('speaking'); if (!$('#reader.paged')) p.scrollIntoView({block:'center', behavior:'smooth'}); else gotoRange({para:i, quiet:true}); }
  const u = new SpeechSynthesisUtterance(curParas[i]); u.lang = 'ko-KR'; u.rate = +$('#ttsRate').value;
  const ko = tts.getVoices().find(v => v.lang.startsWith('ko')); if (ko) u.voice = ko;
  u.onend = () => speakFrom(i+1, session);
  tts.speak(u);
}
$('#btnTTS').onclick = () => {
  if (!tts) return toast('이 브라우저는 읽어 주기를 지원하지 않아요');
  if ($('#btnTTS').classList.contains('on')) return stopTTS();
  if (!curParas.length) return toast('소설 회차에서만 돼요');
  const r = $('#reader').getBoundingClientRect();
  const first = $$('#reader .novel p').find(p => { const b = p.getBoundingClientRect(); return b.bottom > r.top + 20 && b.left >= r.left - 2 && b.right <= r.right + 2; });
  stopTTS(); const s = ttsSession; $('#btnTTS').classList.add('on'); speakFrom(first ? +first.dataset.i : 0, s);
};

