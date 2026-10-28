/* ================= 보기 편의 (책갈피·쪽 번호·화면 켜 두기·안내) ================= */
const VIEW_IDS = ['weight','ls','margin','warmLv','gap','tapMode','wake'];
for (const id of VIEW_IDS){
  const el = $('#'+id); const v = store.get('set.'+id, null);
  if (v !== null){ if (el.type === 'checkbox') el.checked = v; else el.value = v; }
  el.addEventListener('change', () => { store.set('set.'+id, el.type === 'checkbox' ? el.checked : el.value); applyView2(); if (id === 'wake') wakeSync(); if (['weight','ls','margin'].includes(id) && $('#reader.paged')) setFrac(getFrac()); });
}
for (const id of Object.keys(OUTS)) $('#'+id).addEventListener('input', () => { applyView(); applyView2(); if (['weight','ls','margin'].includes(id) && $('#reader.paged')) setFrac(getFrac()); });
const VIEW_DEFAULT = {dimLv:'0', warmLv:'0', fs:'18', weight:'400', ls:'0', lh:'1.9', pgap:'0.9', margin:'24', col:'620', rfont:'"RIDIBatang","Noto Serif KR",serif', align:'left', indent:'0', tapMode:'lr', wcol:'720', gap:'0', spread:'auto', rtl:'1', fit:'h', ttsRate:'1.1'};
$('#qReset').onclick = () => {
  for (const [id, v] of Object.entries(VIEW_DEFAULT)){ const el = $('#'+id); if (!el || el.value === v) continue; el.value = v; el.dispatchEvent(new Event('change')); }
  applyView(); toast('보기 설정을 기본값으로 되돌렸어요');
};
$('#qClose').onclick = closeSheets;

// 만화 펼침 '자동': 가로로 넓은 화면이면 두 쪽
function spreadN(){ const v = $('#spread').value; if (v === 'auto'){ const r = $('#reader').getBoundingClientRect(); return r.width > r.height && r.width >= 700 ? 2 : 1; } return +v || 1; }
let lastSpreadN = 0;
addEventListener('resize', () => { const n = spreadN(); if (lastSpreadN && n !== lastSpreadN && $('#reader .manga')) renderManga(); lastSpreadN = n; });

// 작품 종류에 맞는 설정만 보이기
function modeClass(){
  const a = $('#app'); const img = !!$('#reader .manga, #reader .webtoon');
  a.classList.toggle('imgmode', !!cur && img); a.classList.toggle('txtmode', !!cur && !img);
}

// 쪽 넘김: 쪽 번호와 남은 시간
function pagedInfo(){
  const nv = $('#reader.paged .novel'); if (!nv) return null;
  const n = Math.max(1, Math.round(nv.scrollWidth / nv.clientWidth)), k = Math.min(n, Math.round(nv.scrollLeft / nv.clientWidth) + 1);
  return {k, n};
}
function minutesLeft(f){ if (!curText) return ''; const chars = curText.replace(/\s/g,'').length * (1 - f); const m = Math.round(chars / 600); return m < 1 ? '곧 끝나요' : `이 화 ${m}분 남음`; }
$('#reader').addEventListener('scroll', () => { if (!$('#reader.paged')) updateProgress(); }, {passive:true});

// 쪽 넘김 효과와 한 손 모드
document.addEventListener('click', e => { if (e.target.closest('.tapzone')) pageTurn._tap = true; }, true);

// 책갈피
function bmKey(){ return cur ? 'bm.' + cur.key : ''; }
function bmHere(){
  const p = {ep: curEp, f: getFrac(), t: Date.now(), name: cur.eps[curEp].label || cur.eps[curEp].name};
  if ($('#reader .manga')) p.page = mangaPos;
  if ($('#reader .webtoon')) Object.assign(p, webtoonAnchor());
  const pi = pagedInfo(); p.at = $('#reader .manga') ? `${mangaPos+1}쪽` : pi ? `${pi.k}쪽` : `${Math.round(p.f*100)}%`;
  if (curText){ const vis = [...$$('#reader .novel p')].find(el => el.getBoundingClientRect().bottom > $('#reader').getBoundingClientRect().top + 60); if (vis) p.snip = vis.textContent.slice(0, 60); }
  return p;
}
function bmFind(list){ return list.findIndex(b => b.ep === curEp && Math.abs(b.f - getFrac()) < 0.03); }
function bmMark(){ if (!cur) return; $('#btnBm').classList.toggle('on', bmFind(store.get(bmKey(), [])) >= 0); }
function toggleBm(){
  if (!cur) return toast('작품을 먼저 열어 주세요');
  const list = store.get(bmKey(), []); const i = bmFind(list);
  if (i >= 0){ list.splice(i, 1); toast('책갈피를 뺐어요'); } else { list.unshift(bmHere()); toast('책갈피를 꽂았어요 · 메모 탭에서 볼 수 있어요'); }
  store.set(bmKey(), list.slice(0, 200)); bmMark(); renderBm();
}
function renderBm(){
  const box = $('#bmList'); if (!box) return; box.innerHTML = '';
  const keys = $('#noteScope')?.value === 'work' && cur ? [bmKey()] : Object.keys(localStorage).filter(k => k.startsWith('nv.bm.')).map(k => k.slice(3));
  let n = 0;
  for (const k of keys){
    const wk = k.slice(3); const w = works.find(v => v.key === wk);
    for (const b of store.get(k, [])){
      n++;
      const d = document.createElement('div'); d.className = 'item';
      d.innerHTML = `<div class="e"></div><div class="q"></div><div class="row tight" style="justify-content:flex-end;margin:4px 0 0"><button class="mini-btn" data-a="del">빼기</button></div>`;
      d.querySelector('.e').textContent = `${w ? w.name + ' · ' : ''}${b.name} · ${b.at}`;
      d.querySelector('.q').textContent = b.snip || new Date(b.t).toLocaleString('ko-KR');
      d.onclick = async e => {
        if (e.target.closest('[data-a=del]')){ e.stopPropagation(); store.set(k, store.get(k, []).filter(x => x.t !== b.t)); renderBm(); bmMark(); return; }
        if (!w) return toast('이 작품이 지금 서재에 없어요');
        if (cur !== w) await openWork(w);
        await openEp(b.ep, b.page !== undefined ? {page: b.page} : b);
        if (isMobile()) $('#app').classList.remove('show-tool');
      };
      box.append(d);
    }
  }
  if (!n) box.innerHTML = '<div class="hint">읽다가 위쪽 책갈피 단추(또는 B 키)를 누르면 여기에 모여요.</div>';
}
$('#btnBm').onclick = toggleBm;
document.addEventListener('keydown', e => { if ((e.key === 'b' || e.key === 'B') && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !$('#sketch').classList.contains('open') && !e.ctrlKey && !e.metaKey) toggleBm(); });
$('#noteScope')?.addEventListener('change', renderBm);

// 화면 켜 두기
let wakeLock = null;
async function wakeSync(){
  const want = $('#wake').checked && !!cur && document.visibilityState === 'visible';
  try{
    if (want && !wakeLock && navigator.wakeLock){ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!want && wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch{}
}
document.addEventListener('visibilitychange', wakeSync);

// 회차 목록 도구
$('#epCur').onclick = () => $('#epList .cur')?.scrollIntoView({block:'center'});
$('#epTop').onclick = () => { const l = $('#epList'); epRev ? l.lastElementChild?.scrollIntoView({block:'end'}) : (l.scrollTop = 0); };
$('#epSort').onclick = () => { epRev = !epRev; renderEpList(); };

// 다른 기기에서 쓴 글 불러오기
$('#wInOtherShow').onclick = () => { const v = store.get('wIn.other', ''); if (!v) return; if ($('#wIn').value.trim() && !confirm('지금 메모를 다른 기기 메모로 바꿀까요? (지금 메모는 클립보드에 복사해 둘게요)')) return; copy($('#wIn').value); $('#wIn').value = v; store.set('wIn', v); store.set('wIn.other', ''); $('#wInOther').hidden = true; };
$('#wInOther').hidden = !store.get('wIn.other', '');

// 메모 내보내기 하나로
$('#noteExport').onchange = e => { const v = e.target.value; e.target.value = ''; ({gn: () => $('#noteGN').click(), mood: () => $('#noteMood').click(), md: () => $('#noteMd').click(), claude: () => $('#noteClaude').click()})[v]?.(); };

// 장면 노트 머리 단추
$('#skX').onclick = () => skClose();
$('#skSave2').onclick = () => saveSketch();

// 노벨AI → 그림 → 다시 뷰어로
function naiPromptText(){ const p = naiState.last; return p ? [p.base, ...p.chars.map(c => c.prompt)].join(' | ') : ''; }
$('#naiOpen').onclick = async () => {
  const t = naiPromptText();
  if (t){ try{ await navigator.clipboard.writeText(t); toast('프롬프트를 복사했어요. 노벨AI 입력 칸에 붙여 넣어 주세요'); }catch{} }
  else toast('먼저 프롬프트를 만들면 복사해서 열어 드려요');
  window.open('https://novelai.net/image', '_blank', 'noopener');
};
$('#naiImport').onclick = () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return; const im = await loadImgEl(f);
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
    openSketch(c, {work: cur?.key || '', workName: cur?.name || '노벨AI', epName: '그림', where: {}}, ($('#naiIn').value.trim() + '\n\n' + naiPromptText()).trim().slice(0, 2000));
    toast('그림을 장면 노트로 열었어요. 저장하면 프로크리에이트로도 보낼 수 있어요');
  };
  inp.click();
};
$('#naiSketch').onclick = () => {
  const sz = (naiState.last?.size || '832x1216').match(/(\d+)\s*x\s*(\d+)/) || [0, 832, 1216];
  const c = document.createElement('canvas'); c.width = +sz[1]; c.height = +sz[2];
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#e4e1da'; g.lineWidth = 2; for (let i = 1; i < 5; i++){ g.beginPath(); g.moveTo(c.width*i/5, 0); g.lineTo(c.width*i/5, c.height); g.moveTo(0, c.height*i/5); g.lineTo(c.width, c.height*i/5); g.stroke(); }
  openSketch(c, {work: cur?.key || '', workName: cur?.name || '노벨AI', epName: '구도 스케치', where: {}}, $('#naiIn').value.trim().slice(0, 2000));
  toast('A1~E5 격자 위에 인물 자리를 그려 보세요. 저장한 뒤 프로크리에이트로 보낼 수 있어요');
};

// 처음 한 번만 보이는 안내
function coach(){
  if (store.get('set.coach', false) || !cur) return;
  const c = $('#coach');
  c.innerHTML = `<div><b>가운데</b>를 누르면 막대가 숨고, <b>양쪽</b>을 누르거나 밀면 넘어가요. 위쪽 <b>가</b> 단추에서 글자·테마를, <b>책갈피</b> 단추로 위치를, <b>장면</b> 단추로 그림 필기를 할 수 있어요.</div><div class="row"><button class="primary" id="coachOk">알겠어요</button></div>`;
  c.hidden = false; $('#coachOk').onclick = () => { c.hidden = true; store.set('set.coach', true); };
}

// 만화: 두 번 누르면 확대
$('#reader').addEventListener('dblclick', e => {
  const im = e.target.closest('#reader .manga img'); if (!im) return;
  const box = im.parentElement; const z = box.classList.toggle('zoom');
  box.style.transform = z ? 'scale(2)' : ''; box.style.transformOrigin = z ? `${e.offsetX / im.width * 100}% ${e.offsetY / im.height * 100}%` : '';
});

// 표지 없는 작품은 이름으로 색을 정한다
function hueOf(s){ let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }

applyView2();

/* ================= 작가 보기 (읽는 화면에 문단 글자 수·대사·갈고리·절단·눈금) ================= */
function writerMarks(){
  const r = $('#reader'); const on = $('#writerView').checked && !!$('#reader .novel');
  r.classList.toggle('writer', on);
  $('#app').classList.toggle('wmap-on', on && !$('#reader.paged'));
  if (!on) return;
  const ps = $$('#reader .novel p'); const s = spec(); const n = ps.length;
  const isDl = t => /^[“"‘'「『]/.test(t) || /^[^\s:：]{1,12}[:：]\s*["“]/.test(t);
  let acc = 0, nextK = 1000;
  ps.forEach((p, i) => {
    const t = p.textContent.trim(); const c = t.replace(/\s/g, '').length;
    p.dataset.n = c.toLocaleString();
    p.classList.toggle('long', c > Math.max(120, s.para * 2));
    p.classList.toggle('dl', isDl(t));
    p.classList.toggle('hook', i < 3); p.classList.toggle('hook0', i === 0);
    p.classList.toggle('cut', i >= n - 3); p.classList.toggle('cut0', i === n - 3 || (n < 3 && i === 0 && false));
    p.classList.remove('km'); delete p.dataset.k;
    if (acc >= nextK && i > 0){ p.classList.add('km'); p.dataset.k = `${(Math.floor(acc / 1000) * 1000).toLocaleString()}자`; while (nextK <= acc) nextK += 1000; }
    acc += c;
  });
  drawWmap();
}
function drawWmap(){
  if (!$('#app').classList.contains('wmap-on')) return;
  const box = $('#wmap'), cv = box.querySelector('canvas'); const ps = $$('#reader .novel p'); if (!ps.length) return;
  const H = box.clientHeight, W = box.clientWidth, dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const r = $('#reader'); const total = r.scrollHeight || 1; const top0 = $('#reader .novel').offsetTop;
  const css = getComputedStyle(document.documentElement);
  const cDl = css.getPropertyValue('--accent').trim() || '#2f3d6b', cNa = css.getPropertyValue('--line').trim() || '#ddd', cLong = css.getPropertyValue('--warn').trim() || '#b4471b';
  for (const p of ps){
    const y = (top0 + p.offsetTop) / total * H, h = Math.max(1, p.offsetHeight / total * H - 0.5);
    g.fillStyle = p.classList.contains('long') ? cLong : p.classList.contains('dl') ? cDl : cNa;
    g.globalAlpha = p.classList.contains('dl') ? 0.75 : 1; g.fillRect(0, y, W, h);
  }
  wmapView();
}
function wmapView(){
  if (!$('#app').classList.contains('wmap-on')) return;
  const r = $('#reader'), box = $('#wmap'), H = box.clientHeight, i = box.querySelector('i');
  i.style.top = (r.scrollTop / r.scrollHeight * H) + 'px'; i.style.height = Math.max(8, r.clientHeight / r.scrollHeight * H) + 'px';
}
$('#wmap').addEventListener('click', e => { const b = $('#wmap').getBoundingClientRect(); const r = $('#reader'); quiet(); r.scrollTop = (e.clientY - b.top) / b.height * r.scrollHeight - r.clientHeight / 2; });
$('#reader').addEventListener('scroll', wmapView, {passive:true});
addEventListener('resize', () => { clearTimeout(drawWmap._t); drawWmap._t = setTimeout(drawWmap, 200); });
{ const v = store.get('set.writerView', null); if (v !== null) $('#writerView').checked = v; }
$('#writerView').addEventListener('change', () => { store.set('set.writerView', $('#writerView').checked); writerMarks(); if ($('#reader.paged')) setFrac(getFrac()); });
document.addEventListener('keydown', e => { if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && $('#studio').hidden && !$('#sketch').classList.contains('open')){ $('#writerView').checked = !$('#writerView').checked; $('#writerView').dispatchEvent(new Event('change')); toast($('#writerView').checked ? '작가 보기를 켰어요' : '작가 보기를 껐어요'); } });


/* ---------- 떠오른 문장(빠른 메모)·태그·빈 캔버스 ---------- */
// 글 안의 #태그를 뽑는다(예: "#대사 너는 왜 웃어" → ['대사'])
const ideaTags = t => [...new Set((t.match(/#([^\s#]{1,12})/g) || []).map(x => x.slice(1)))];
let ideaTag = '';
function renderIdeas(){
  const box = $('#ideaList'); if (!box) return; const all = store.get('ideas', []);
  const tags = [...new Set(all.flatMap(i => ideaTags(i.text)))];
  if (ideaTag && !tags.includes(ideaTag)) ideaTag = '';
  $('#ideaFilter').innerHTML = tags.length ? `<button data-f="" class="${ideaTag ? '' : 'on'}">전체 ${all.length}</button>` + tags.map(t => `<button data-f="${esc(t)}" class="${t === ideaTag ? 'on' : ''}">#${esc(t)} ${all.filter(i => ideaTags(i.text).includes(t)).length}</button>`).join('') : '';
  $$('#ideaFilter [data-f]').forEach(b => b.onclick = () => { ideaTag = b.dataset.f; renderIdeas(); });
  const list = ideaTag ? all.filter(i => ideaTags(i.text).includes(ideaTag)) : all;
  box.innerHTML = list.length ? '' : '<div class="hint" style="padding:6px 2px">읽다가 떠오른 내 문장을 적어 두면 기기끼리 맞춰지고, 집필실 참고 탭에도 보여요. #대사 처럼 태그를 붙이면 모아 볼 수 있어요.</div>';
  for (const it of list){
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<div class="q"></div><div class="e">${new Date(it.t).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit'})}${it.from ? ' · ' + esc(it.from) : ''}</div><div class="row tight" style="justify-content:flex-end;margin:4px 0 0"><button data-a="cp">복사</button><button data-a="del">지우기</button></div>`;
    d.querySelector('.q').innerHTML = esc(it.text).replace(/#([^\s#]{1,12})/g, '<span class="tg">#$1</span>');
    d.querySelector('[data-a=cp]').onclick = () => copy(it.text.replace(/#[^\s#]{1,12}\s?/g, '').trim());
    d.querySelector('[data-a=del]').onclick = () => { tomb('ideas', it.id); store.set('ideas', store.get('ideas', []).filter(x => x.id !== it.id)); renderIdeas(); };
    box.append(d);
  }
}
function addIdea(text, from){
  const v = (text ?? $('#ideaIn').value).trim(); if (!v) return;
  const list = store.get('ideas', []); list.unshift({id: uid(), text: v, from: from ?? (cur ? cur.name : ''), t: Date.now()});
  store.set('ideas', list.slice(0, 1000)); if (text === undefined) $('#ideaIn').value = ''; renderIdeas(); toast('떠오른 문장으로 남겼어요');
}
$('#ideaAdd').onclick = () => addIdea();
$('#ideaIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); addIdea(); } });
$$('#ideaQuick [data-t]').forEach(b => b.onclick = () => { const el = $('#ideaIn'); const tag = '#' + b.dataset.t; if (!el.value.includes(tag)) el.value = (el.value.trim() + ' ' + tag).trim() + ' '; el.focus(); });
// 새 종이: 흰 종이·격자·줄 노트·점 노트, 세로·가로·정사각
const PAPER = {tall: [1240, 1754], wide: [1754, 1240], square: [1500, 1500]};
function paperCanvas(kind, size){
  const [w, h] = PAPER[size] || PAPER.tall; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d8dde6'; g.fillStyle = '#c4cad6'; g.lineWidth = 1.5; const st = 56;
  if (kind === 'grid'){ for (let x = st; x < w; x += st){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = st; y < h; y += st){ g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
  else if (kind === 'lined'){ for (let y = st * 1.5; y < h; y += st){ g.beginPath(); g.moveTo(60, y); g.lineTo(w - 60, y); g.stroke(); } }
  else if (kind === 'dots'){ for (let x = st; x < w; x += st) for (let y = st; y < h; y += st){ g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); } }
  return c;
}
$('#ideaPaper').value = store.get('lib.paper', 'plain'); $('#ideaSize').value = store.get('lib.paperSize', 'tall');
$('#ideaDraw').onclick = () => {
  store.set('lib.paper', $('#ideaPaper').value); store.set('lib.paperSize', $('#ideaSize').value);
  openSketch(paperCanvas($('#ideaPaper').value, $('#ideaSize').value), {work: cur?.key || '', workName: '자유 그림', epName: new Date().toLocaleDateString('ko-KR'), where: {}});
};
