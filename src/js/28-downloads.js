/* ================= 받기: 모아받기·토끼 다운로더를 Novelist 안에서 ================= */
// 다운로더(따로 켜던 .bat)는 Novelist 가 켜고 이 칸 안에 띄운다. pawchive 받기는 두 다운로더 안에 들어 있다.
// 어디서 열든 받기는 다운로더가 있는 PC 가 하고, 받은 작품은 서재(구글 드라이브)에 저절로 들어온다.
//  · 그 PC 의 프로그램: 127.0.0.1 주소로
//  · PC 주소로 연 폰·아이패드: PC 를 거쳐(/t/<열쇠>/toki/)
//  · 깃허브 주소로 연 폰·아이패드·노트북: 구글로 맞춘 PC 바깥 주소(pcRemote, 터널)를 거쳐
const DL = {apps: [], cur: '', urls: {}, base: '', ext: null};
const DL_NAME = {moa: ['모아받기', '사이트에서 골라 받기 · pawchive'], toki: ['토끼 다운로더', '제목·주소로 받기 · 새 회차'], ext: ['주소로 받기', 'kemono · coomer · pawchive · 히토미 · mangadex 등 주소만 붙여 넣기']};
async function dlInit(){
  DL.base = ''; DL.apps = [];
  if (DESKTOP && window.nvDesktop.dlApps) DL.apps = await window.nvDesktop.dlApps().catch(() => []);
  if (!DL.apps.length && pcBase()){ DL.base = pcBase() + '/'; DL.apps = (await fetch(pcBase() + '/lan/info').then(r => r.json()).catch(() => null))?.apps || []; }
  // 이 기기에 다운로더가 없으면(폰·아이패드·다른 노트북) 구글로 맞춘 PC 바깥 주소로
  const remote = store.get('pcRemote', null)?.url || '';
  if (!DL.apps.length && remote && location.protocol !== 'app:'){
    DL.base = remote.endsWith('/') ? remote : remote + '/';
    DL.apps = (await fetch(DL.base + 'lan/info').then(r => r.json()).catch(() => null))?.apps || [];
  }
  // 창 프로그램 다운로더(Kemono·Pawchive·HakuNeko·HaruNeko·히토미): 이 PC 에서 창으로만 열린다
  DL.ext = DESKTOP && DL.apps.length && window.nvDesktop.dlExt ? await window.nvDesktop.dlExt().catch(() => null) : null;
  const tabs = [...DL.apps, ...(DL.apps.includes('toki') ? ['ext'] : [])];
  $('#gnav [data-g=dl]').hidden = !tabs.length;
  $('#dlTabs').innerHTML = tabs.map(k => `<button data-k="${k}" title="${DL_NAME[k]?.[1] || ''}">${DL_NAME[k]?.[0] || k}</button>`).join('');
  $$('#dlTabs [data-k]').forEach(b => b.onclick = () => dlShow(b.dataset.k));
}
async function dlUrl(k){
  if (DL.urls[k]) return DL.urls[k];
  if (DL.base) return DL.urls[k] = DL.base + k + '/';
  $('#dlStat').textContent = `${DL_NAME[k]?.[0] || k} 켜는 중…`;
  const u = await window.nvDesktop.dlOpen(k).catch(() => null);
  if (u) DL.urls[k] = u; return u;
}
async function dlShow(k){
  DL.cur = k = k || DL.cur || DL.apps[0]; if (!k) return;
  $$('#dlTabs [data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === k));
  $('#dlFrame').hidden = k === 'ext'; $('#dlExt').hidden = k !== 'ext'; $('#dlOut').hidden = k === 'ext';
  if (k === 'ext') return dlExtShow();
  const u = await dlUrl(k); if (DL.cur !== k) return;
  if (!u){ $('#dlStat').textContent = `${DL_NAME[k]?.[0] || k}를 켜지 못했어요 (Node.js 가 설치돼 있는지 확인해 주세요)`; return; }
  $('#dlStat').textContent = DL.base && !pcBase() ? 'PC 가 받아요 · 받은 작품은 서재에 저절로 들어와요' : '받은 작품은 서재에 저절로 들어와요';
  const f = $('#dlFrame'); if (f.dataset.k !== k){ f.dataset.k = k; f.src = u; }
}
// 주소로 받기: 붙여 넣은 주소를 토끼가 받는다(모르는 사이트는 gallery-dl·yt-dlp). 창 프로그램은 이 PC 에서만 단추로 연다
async function dlJob(body){
  if (!DL.base) return window.nvDesktop.dlJob(body);
  const r = await fetch(DL.base + 'toki/api/jobs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  return r.json().catch(() => ({error: 'PC 가 답하지 않아요 (' + r.status + ')'}));
}
function dlExtShow(){
  $('#dlStat').textContent = DL_NAME.ext[1];
  const root = DL.ext?.save || '', sep = root.includes('\\') ? '\\' : '/';
  const dirs = root ? [['만화·웹툰 (HakuNeko·HaruNeko)', root + sep + '만화'], ['성인 (Kemono·Pawchive·히토미)', root + sep + '성인' + sep + '만화']] : [];
  $('#dlExt').innerHTML = `<div class="dl-url">
      <textarea id="dlUrls" rows="3" placeholder="받을 주소를 붙여 넣으세요 (여러 개는 줄마다)&#10;예: https://kemono.cr/fanbox/user/… · https://hitomi.la/galleries/….html · https://mangadex.org/title/…"></textarea>
      <div class="row tight"><div class="seg" id="dlFmt"><button data-v="raw" class="on">원래대로(그림 폴더)</button><button data-v="epub">EPUB</button></div><span style="flex:1"></span><button class="primary" id="dlGo">받기</button></div>
      <div class="hint" id="dlMsg">${DL.base && !pcBase() ? 'PC 가 켜져 있으면 PC 가 받아 서재에 넣어요. 진행은 토끼 다운로더 칸에서 볼 수 있어요.' : '진행은 토끼 다운로더 칸에서 볼 수 있어요.'}</div>
    </div>`
    + (DL.ext?.list?.length ? `<div class="hint dl-dirs-h"><b>창으로 여는 프로그램</b> (이 PC 에서만) — 위 칸으로 안 되는 사이트를 받을 때</div><div class="dl-apps">${DL.ext.list.map(x => `<button class="dl-app" data-id="${esc(x.id)}"><b>${esc(x.name)}</b><span>열기</span></button>`).join('')}</div>` : '')
    + (dirs.length ? `<div class="hint dl-dirs-h">창 프로그램의 <b>저장 폴더</b>를 아래로 정해 두면 받은 작품이 서재와 폰에 저절로 들어와요.</div>` + dirs.map(([t, p]) => `<div class="lan-addr"><span class="hint">${t}</span><code>${esc(p)}</code><button data-cp="${esc(p)}">복사</button></div>`).join('') : '');
  $$('#dlFmt button').forEach(b => b.onclick = () => $$('#dlFmt button').forEach(x => x.classList.toggle('on', x === b)));
  $('#dlGo').onclick = async () => {
    const urls = $('#dlUrls').value.split(/[\s,]+/).filter(u => /^https?:\/\//i.test(u));
    if (!urls.length) return toast('http 로 시작하는 주소를 넣어 주세요');
    const format = $('#dlFmt .on')?.dataset.v || 'raw';
    $('#dlGo').disabled = true; $('#dlMsg').textContent = '토끼 다운로더에 맡기는 중…';
    const r = await dlJob({kind: 'title', titles: urls.join(', '), format}).catch(e => ({error: e.message}));
    $('#dlGo').disabled = false;
    if (r?.error){ $('#dlMsg').textContent = '맡기지 못했어요: ' + r.error; return; }
    $('#dlUrls').value = ''; $('#dlMsg').textContent = `${urls.length}개 주소를 받기 시작했어요. 다 받으면 서재에 저절로 들어와요.`;
    toast('받기를 시작했어요'); DL.urls.toki = ''; if ($('#dlFrame').dataset.k === 'toki') $('#dlFrame').dataset.k = '';
  };
  $$('#dlExt [data-id]').forEach(b => b.onclick = async () => { const ok = await window.nvDesktop.dlExtRun(b.dataset.id).catch(() => false); toast(ok ? `${b.querySelector('b').textContent} 를 여는 중이에요` : '열지 못했어요'); });
  $$('#dlExt [data-cp]').forEach(b => b.onclick = () => copy(b.dataset.cp));
}
function dlOpen(){ closeOverlays(); closeSheets(); $('#dlPage').hidden = false; dlShow(); }
function dlClose(){ $('#dlPage').hidden = true; }
$('#dlOut').onclick = () => { const u = DL.urls[DL.cur]; if (u) window.open(u, '_blank', 'noopener'); };
setTimeout(dlInit, 1500);
window.nvDl = {init: dlInit, state: () => DL};   // 시험용
