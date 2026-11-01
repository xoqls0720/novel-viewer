/* ================= 받기: 모아받기·토끼 다운로더를 Novelist 안에서 ================= */
// 다운로더(따로 켜던 .bat)는 Novelist 가 켜고 이 칸 안에 띄운다. pawchive 받기는 두 다운로더 안에 들어 있다.
// PC 프로그램: 이 PC 의 127.0.0.1 주소로. 폰·아이패드(PC 주소로 연 경우): PC 를 거쳐(/t/<열쇠>/moa/) — 받기는 늘 PC 가 하고, 받은 작품은 서재에 저절로 들어온다.
const DL = {apps: [], cur: '', urls: {}};
const DL_NAME = {moa: ['모아받기', '사이트에서 골라 받기 · pawchive'], toki: ['토끼 다운로더', '제목·주소로 받기 · 새 회차']};
async function dlInit(){
  if (DESKTOP && window.nvDesktop.dlApps) DL.apps = await window.nvDesktop.dlApps().catch(() => []);
  else if (pcBase()) DL.apps = (await fetch(pcBase() + '/lan/info').then(r => r.json()).catch(() => null))?.apps || [];
  // 창 프로그램 다운로더(Kemono·Pawchive·HakuNeko·HaruNeko·히토미): PC 프로그램에서만 켤 수 있다
  DL.ext = DESKTOP && window.nvDesktop.dlExt ? await window.nvDesktop.dlExt().catch(() => null) : null;
  const tabs = [...DL.apps, ...(DL.ext?.list?.length ? ['ext'] : [])];
  $('#gnav [data-g=dl]').hidden = !tabs.length;
  $('#dlTabs').innerHTML = tabs.map(k => k === 'ext' ? `<button data-k="ext" title="Kemono · Pawchive · HakuNeko · HaruNeko · 히토미">다른 프로그램</button>` : `<button data-k="${k}" title="${DL_NAME[k]?.[1] || ''}">${DL_NAME[k]?.[0] || k}</button>`).join('');
  $$('#dlTabs [data-k]').forEach(b => b.onclick = () => dlShow(b.dataset.k));
}
async function dlUrl(k){
  if (DL.urls[k]) return DL.urls[k];
  if (!DESKTOP) return DL.urls[k] = pcBase() + '/' + k + '/';
  $('#dlStat').textContent = `${DL_NAME[k]?.[0] || k} 켜는 중…`;
  const u = await window.nvDesktop.dlOpen(k).catch(() => null);
  if (u) DL.urls[k] = u; return u;
}
async function dlShow(k){
  DL.cur = k = k || DL.cur || DL.apps[0] || (DL.ext ? 'ext' : ''); if (!k) return;
  $$('#dlTabs [data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  $('#dlFrame').hidden = k === 'ext'; $('#dlExt').hidden = k !== 'ext'; $('#dlOut').hidden = k === 'ext';
  if (k === 'ext') return dlExtShow();
  const u = await dlUrl(k); if (DL.cur !== k) return;
  if (!u){ $('#dlStat').textContent = `${DL_NAME[k]?.[0] || k}를 켜지 못했어요 (Node.js 가 설치돼 있는지 확인해 주세요)`; return; }
  $('#dlStat').textContent = '받은 작품은 서재에 저절로 들어와요';
  const f = $('#dlFrame'); if (f.dataset.k !== k){ f.dataset.k = k; f.src = u; }
}
// 창 프로그램: 켜는 단추 + 받는 폴더(서재 폴더로 두면 서재·폰에 저절로 들어온다)
function dlExtShow(){
  const root = DL.ext?.save || '', sep = root.includes('\\') ? '\\' : '/';
  const dirs = root ? [['만화·웹툰 (HakuNeko·HaruNeko)', root + sep + '만화'], ['성인 (Kemono·Pawchive·히토미)', root + sep + '성인' + sep + '만화']] : [];
  $('#dlStat').textContent = '창으로 따로 열려요. 받은 작품은 서재에 저절로 들어와요';
  $('#dlExt').innerHTML = `<div class="dl-apps">${(DL.ext?.list || []).map(x => `<button class="dl-app" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><span>열기</span></button>`).join('')}</div>`
    + (dirs.length ? `<div class="hint dl-dirs-h">각 프로그램 설정의 <b>저장 폴더</b>를 아래로 정해 두면, 받은 작품이 서재와 폰에 저절로 들어와요.</div>` + dirs.map(([t, p]) => `<div class="lan-addr"><span class="hint">${t}</span><code>${esc(p)}</code><button data-cp="${esc(p)}">복사</button></div>`).join('') : '');
  $$('#dlExt [data-id]').forEach(b => b.onclick = async () => { const ok = await window.nvDesktop.dlExtRun(b.dataset.id).catch(() => false); toast(ok ? `${b.querySelector('b').textContent} 를 여는 중이에요` : '열지 못했어요'); });
  $$('#dlExt [data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp));
}
function dlOpen(){ closeOverlays(); closeSheets(); $('#dlPage').hidden = false; dlShow(); }
function dlClose(){ $('#dlPage').hidden = true; }
$('#dlOut').onclick = () => { const u = DL.urls[DL.cur]; if (u) window.open(u, '_blank', 'noopener'); };
setTimeout(dlInit, 1500);
