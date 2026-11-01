/* ================= 독서 기록 · 사전 찾기 ================= */
// 독서 기록(리디·KOReader 의 독서 통계처럼): 읽는 화면이 보이고 최근 2분 안에 넘기거나 누른 동안만 시간을 센다.
// 기기마다 따로 적고(rstat.<기기>) 홈에서 모두 더해 보여 준다 — 두 기기가 같은 날 읽어도 서로 덮어쓰지 않는다(기기끼리 맞춰진다).
const RS_DEV = (() => { try{ let d = localStorage.getItem('nv.devTag'); if (!d){ d = Math.random().toString(36).slice(2, 8); localStorage.setItem('nv.devTag', d); } return d; }catch{ return 'x'; } })();
const RS = {last: 0, add: 0, work: {}};
const rsDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
for (const ev of ['pointerdown', 'wheel', 'keydown', 'scroll', 'touchmove']) addEventListener(ev, e => { if (e.target?.closest?.('#reader') || ev === 'keydown' || ev === 'wheel') RS.last = Date.now(); }, {capture: true, passive: true});
const rsReading = () => !!cur && document.visibilityState === 'visible' && !atHome() && !atLib() && $('#studio').hidden && $('#wt').hidden && $('#dlPage').hidden && Date.now() - RS.last < 120e3;
setInterval(() => { if (rsReading()){ RS.add += 15; RS.work[cur.key] = (RS.work[cur.key] || 0) + 15; } }, 15e3);
function rsFlush(){
  if (!RS.add) return;
  const k = 'rstat.' + RS_DEV, s = store.get(k, {days: {}, works: {}});
  const day = rsDay(); s.days[day] = (s.days[day] || 0) + RS.add;
  for (const [w, sec] of Object.entries(RS.work)) s.works[w] = (s.works[w] || 0) + sec;
  // 오래된 날은 1년치만, 작품은 많이 읽은 300개만 남긴다
  const keep = rsDay(Date.now() - 366 * 864e5); for (const d of Object.keys(s.days)) if (d < keep) delete s.days[d];
  const ws = Object.entries(s.works); if (ws.length > 300) s.works = Object.fromEntries(ws.sort((a, b) => b[1] - a[1]).slice(0, 300));
  RS.add = 0; RS.work = {}; store.set(k, s);
}
setInterval(rsFlush, 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rsFlush(); });
function rsAll(){
  const days = {}, wks = {};
  for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (!k.startsWith('nv.rstat.')) continue;
    const s = store.get(k.slice(3), null); if (!s) continue;
    for (const [d, v] of Object.entries(s.days || {})) days[d] = (days[d] || 0) + v;
    for (const [w, v] of Object.entries(s.works || {})) wks[w] = (wks[w] || 0) + v; }
  const today = rsDay(); days[today] = (days[today] || 0) + RS.add;   // 아직 적지 않은 것도
  return {days, wks};
}
const rsMin = s => s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round(s % 3600 / 60)}분` : `${Math.round(s / 60)}분`;
function renderReadStats(){
  const box = $('#hStats'); if (!box) return;
  const {days, wks} = rsAll(); const now = Date.now();
  const sum = n => Array.from({length: n}, (_, i) => days[rsDay(now - i * 864e5)] || 0).reduce((a, b) => a + b, 0);
  let streak = 0; for (let i = days[rsDay()] ? 0 : 1; days[rsDay(now - i * 864e5)] >= 60; i++) streak++;   // 하루 1분 넘게 읽은 날이 이어진 수
  if (!Object.keys(days).length || !sum(365)){ box.hidden = true; return; }
  box.hidden = false;
  // 4주 달력(오늘이 맨 오른쪽 아래)
  const cells = Array.from({length: 28}, (_, i) => { const t = now - (27 - i) * 864e5, v = days[rsDay(t)] || 0; const lv = !v ? 0 : v < 600 ? 1 : v < 1800 ? 2 : v < 3600 ? 3 : 4; return `<i class="l${lv}" title="${new Date(t).toLocaleDateString('ko-KR', {month: 'numeric', day: 'numeric'})} · ${rsMin(v)}"></i>`; }).join('');
  const top = Object.entries(wks).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => { const w = works.find(x => x.key === k); return w && !isAdult(w) ? `<li><span></span><em>${rsMin(v)}</em></li>` : ''; }).filter(Boolean);
  box.innerHTML = `<div class="h-k">독서 기록</div>
    <div class="rs-row"><div><b>${rsMin(days[rsDay()] || 0)}</b><span>오늘</span></div><div><b>${rsMin(sum(7))}</b><span>이번 주(7일)</span></div><div><b>${streak}일</b><span>연속</span></div></div>
    <div class="rs-cal">${cells}</div>${top.length ? `<ol class="rs-top">${top.join('')}</ol>` : ''}`;
  const names = Object.entries(wks).sort((a, b) => b[1] - a[1]).map(([k]) => works.find(x => x.key === k)).filter(w => w && !isAdult(w)).slice(0, 3);
  box.querySelectorAll('.rs-top span').forEach((s, i) => s.textContent = names[i]?.name || '');
}
window.nvReadStats = {all: rsAll, flush: rsFlush, render: renderReadStats, tick: s => { RS.add += s; if (cur) RS.work[cur.key] = (RS.work[cur.key] || 0) + s; }};   // 시험용

// 사전 찾기: 고른 낱말을 네이버 사전(한국어·영어·일본어·한자 모두)에서
if ($('#selbar') && !$('#selDict')){
  const b = document.createElement('button'); b.id = 'selDict'; b.textContent = '사전'; b.title = '고른 낱말을 사전에서 찾기';
  $('#selCopy').before(b);
  b.onclick = () => { const t = (selInfo?.text || getSelection().toString()).trim().slice(0, 60); if (!t) return; $('#selbar').style.display = 'none'; window.open('https://dict.naver.com/search.dict?dicQuery=' + encodeURIComponent(t), '_blank', 'noopener'); };
}
