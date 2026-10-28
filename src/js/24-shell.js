/* ================= 전역 메뉴 · 홈 · 서재 판 ================= */
// 길은 하나: 왼쪽(폰은 아래) 메뉴 다섯 칸 — 홈 · 읽기 · 쓰기 · 웹툰 · 설정.
// 홈과 서재는 읽는 화면 위에 덮는 판이라, 읽던 자리는 그대로 남는다. 책을 열면 판이 걷히고 글만 남는다.
const atHome = () => $('#app').classList.contains('at-home');
const atLib = () => $('#app').classList.contains('at-lib');
function closeOverlays(){ if (!$('#studio').hidden) stClose(); if (!$('#wt').hidden) wtClose(); }
function showPage(k){
  closeOverlays(); closeSheets(); fsCloseNow?.();
  const a = $('#app'); a.classList.toggle('at-home', k === 'home'); a.classList.toggle('at-lib', k === 'lib'); a.classList.remove('show-side', 'show-tool', 'immersive');
  if (k === 'home') renderHome();
  (k === 'home' ? $('#home') : $('#libPage')).scrollTop = 0;
  gnavSync();
}
function leavePages(){ if (!atHome() && !atLib()) return; $('#app').classList.remove('at-home', 'at-lib'); gnavSync(); }
// 작품·회차를 열면(읽는 화면이 바뀌면) 판을 걷는다
new MutationObserver(() => { if (cur) leavePages(); }).observe($('#reader'), {childList: true});

function gnavSync(){
  const k = !$('#studio').hidden ? 'write' : !$('#wt').hidden ? 'toon' : atHome() ? 'home' : 'lib';
  $$('#gnav [data-g]').forEach(b => b.classList.toggle('on', b.dataset.g === k));
  const on = SYNC_OD() ? odLinked() : (gdReady() && !!store.get('gd.last', 0));
  $('#gnav .g-sync').classList.toggle('ok', !!on);
  $('#gnav .g-sync').title = on ? `설정 · ${SYNC_OD() ? 'OneDrive' : '구글 드라이브'}로 맞추는 중` : '설정 · 기기끼리 맞추기는 아직 연결 전';
}
for (const el of ['#studio', '#wt']) new MutationObserver(gnavSync).observe($(el), {attributes: true, attributeFilter: ['hidden']});

const GO = {
  home: () => showPage('home'),
  lib: () => showPage('lib'),
  write(){ if (!$('#wt').hidden) wtClose(); if ($('#studio').hidden) stOpen(); },
  toon(){ if (!$('#studio').hidden) stClose(); if ($('#wt').hidden) $('#btnWebtoon').click(); },
  set(){ closeOverlays(); openTool('set'); },
};
window.nvGo = k => GO[k]();   // 시험·단축용
$$('#gnav [data-g]').forEach(b => b.onclick = () => GO[b.dataset.g]());
$('#gnav .g-brand').onclick = GO.home;
$('#tgSide').onclick = GO.lib;   // 읽는 화면 왼쪽 위 ← 는 서재로
$('#stToLib').onclick = () => { stClose(); if (!cur) GO.lib(); };

// 서재(머리 단추·작품 목록)는 서재 판에 늘 놓는다. 옆 칸은 쓰지 않는다.
$('#lpBody').append($('.side-head'), $('#lib'));
$('#lpActs').append($('#btnFolder'), $('#btnFiles'), $('#btnLink'));
$('#btnFolder').innerHTML = '<svg class="i"><use href="#i-folder"/></svg>폴더 열기'; $('#btnFiles').innerHTML = '<svg class="i"><use href="#i-file"/></svg>파일';
$('#btnLink').innerHTML = '<svg class="i"><use href="#i-cloud"/></svg>폴더 연결 · OneDrive';
$('#btnLink').className = '';

/* ---------- 홈 ---------- */
function hHello(t, goal){
  const h = new Date().getHours();
  if (goal && t >= goal) return '오늘 목표를 채웠어요.';
  if (h < 5) return '고요한 새벽, 한 줄만 더.';
  if (h < 11) return '오늘의 첫 문장부터.';
  if (h < 17) return '오후의 원고, 이어 가 볼까요.';
  if (h < 21) return '오늘 쓴 만큼이 쌓여요.';
  return '하루의 끝에 한 장면.';
}
function hRing(pct){
  const r = 26, c = 2 * Math.PI * r, v = Math.min(1, pct / 100);
  return `<svg class="h-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="bg"/><circle cx="32" cy="32" r="${r}" class="fg" stroke-dasharray="${(c * v).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>`;
}
function hProjCover(p){ return `<div class="h-pcv" style="--h:${hueOfName(p.name)};${p.cover ? `background-image:url('${p.cover}')` : ''}">${p.cover ? '' : esc(p.name.slice(0, 6))}</div>`; }
function renderDesk(){
  const box = $('#hDesk'); const ps = [...stProjects()].sort((a, b) => (b.t || 0) - (a.t || 0));
  const dl = store.get('st.daily', {}); const t = dl[today()] || 0;
  if (!ps.length){
    box.innerHTML = `<div class="h-k">이어 쓰기</div><h2 class="h-empty-t">아직 쓰고 있는 작품이 없어요</h2><p class="h-empty-p">작품을 만들면 오늘 쓴 글자와 다음 연재일이 여기 모여요.</p><button class="primary h-go" id="hStart">첫 작품 시작하기</button>`;
    $('#hStart').onclick = () => stOpen('write'); $('#hHello').textContent = hHello(0, 0); return;
  }
  const last = store.get('st.cur', null); const p = ps.find(x => x.id === last?.pid) || ps[0];
  const eps = stEps(p.id); const goal = p.daily || 3000; const pct = Math.round(t / goal * 100);
  const reserve = eps.filter(e => e.status === 'done').length; const nd = nextPostDay(p.days);
  const ep = eps.find(e => e.id === last?.eid) || eps.at(-1);
  const facts = [`연속 ${stStreak(dl, goal)}일`, `비축 ${reserve}화`, nd ? `다음 연재 ${nd}` : ''].filter(Boolean).join(' · ');
  box.innerHTML = `
    <div class="h-k">이어 쓰기</div>
    <div class="h-pt">${hProjCover(p)}<div class="h-ptx"><h2></h2><div class="h-sub"></div></div></div>
    <div class="h-today">${hRing(pct)}<div><b>${t.toLocaleString()}</b><span> / ${goal.toLocaleString()}자 오늘</span><small>${facts}</small></div></div>
    <button class="primary h-go" id="hWrite"><span></span><svg class="i"><use href="#i-right"/></svg></button>`;
  box.querySelector('h2').textContent = p.name;
  box.querySelector('.h-sub').textContent = ep ? `${ep.title || '제목 없는 회차'} · ${(ep.chars || 0).toLocaleString()}자` : '첫 회차를 시작해 보세요';
  box.querySelector('#hWrite span').textContent = ep ? `${ep.title || '이 회차'} 이어 쓰기` : '첫 회차 쓰기';
  $('#hWrite').onclick = () => { store.set('st.cur', {pid: p.id, eid: ep?.id || null}); stOpen('write'); };
  $('#hHello').textContent = hHello(t, goal);
}
function renderProjs(){
  const box = $('#hProjs'); const ps = [...stProjects()].sort((a, b) => (b.t || 0) - (a.t || 0));
  $('.h-projs-wrap').hidden = ps.length < 2;   // 작품이 하나뿐이면 위 카드로 충분하다
  box.innerHTML = '';
  for (const p of ps){
    const eps = stEps(p.id); const total = eps.reduce((s, e) => s + (e.chars || 0), 0);
    const d = document.createElement('button'); d.className = 'h-pj';
    d.innerHTML = `${hProjCover(p)}<div class="tx"><b></b><span>${eps.length}화 · ${total.toLocaleString()}자</span></div>`;
    d.querySelector('b').textContent = p.name;
    d.onclick = () => { store.set('st.cur', {pid: p.id, eid: eps.at(-1)?.id || null}); stOpen('write'); };
    box.append(d);
  }
}
function renderHomeIdeas(){
  const box = $('#hIdeas'); const all = store.get('ideas', []).slice(0, 3);
  box.innerHTML = '';
  for (const it of all){ const d = document.createElement('div'); d.className = 'h-it'; d.innerHTML = `<p></p><span>${new Date(it.t).toLocaleDateString('ko-KR', {month: 'numeric', day: 'numeric'})}</span>`; d.querySelector('p').innerHTML = esc(it.text).replace(/#([^\s#]{1,12})/g, '<em>#$1</em>'); box.append(d); }
}
function renderHome(){
  if (!$('#home')) return;
  $('#hDate').textContent = new Date().toLocaleDateString('ko-KR', {month: 'long', day: 'numeric', weekday: 'long'});
  try{ renderDesk(); renderProjs(); }catch(e){ console.warn(e); }
  renderHomeIdeas(); renderResume(); $('#hReadNone').hidden = !$('#wResume').hidden;
  gnavSync();
}
const hIdea = () => { const v = $('#hIdeaIn').value.trim(); if (!v) return; addIdea(v, cur ? cur.name : '홈'); $('#hIdeaIn').value = ''; renderHomeIdeas(); };
$('#hIdeaAdd').onclick = hIdea;
$('#hIdeaIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); hIdea(); } });
$('#hLibAll').onclick = GO.lib;
// 작품을 불러오면 '이어 읽기'도, 집필실을 닫으면 책상도 새로
new MutationObserver(() => { if (atHome()){ renderResume(); $('#hReadNone').hidden = !$('#wResume').hidden; } }).observe($('#lib'), {childList: true});
new MutationObserver(() => { if ($('#studio').hidden && atHome()) renderHome(); }).observe($('#studio'), {attributes: true, attributeFilter: ['hidden']});
// 처음엔: 쓰거나 읽던 게 있으면 홈, 없으면 책을 들이는 서재부터
renderLib();   // 첫 실행에도 서재 빈 안내가 보이게
{ const used = stProjects().some(p => stEps(p.id).length) || Object.keys(localStorage).some(k => k.startsWith('nv.pos.')); showPage(used ? 'home' : 'lib'); }
