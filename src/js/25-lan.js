/* ================= 같은 와이파이로 보여 주기 =================
   노트북(윈도우 프로그램)이 작은 서버를 켜고, 아이패드·폰은 그 주소를 열면 폴더 연결 없이 서재가 보인다.
   읽기 전용: 진도·형광펜은 그 기기 안에만 남는다(기기끼리 맞추려면 OneDrive 를 쓴다). */

// ---------- 손님 쪽: /t/<열쇠>/ 주소로 열렸으면 노트북 서재를 불러온다 ----------
const LAN_BASE = (location.pathname.match(/^(\/t\/[^/]+)\//) || [])[1] || '';
async function lanLoad(){
  if (!LAN_BASE) return;
  try{
    const list = await (await fetch(LAN_BASE + '/lan/scan')).json();
    const files = list.map(f => Object.assign(new LazyFile({name: f.rel.split('/').pop(), size: f.size, mtime: f.mtime, rel: f.rel,
      get: async () => { const r = await fetch(LAN_BASE + '/lan/file?p=' + encodeURIComponent(f.rel)); if (!r.ok) throw new Error('읽지 못했어요'); return r.blob(); }}), {remote: true}));
    await addFiles(files, {persist: false, quiet: true});
    toast(`노트북 서재에서 작품 ${works.length}개를 불러왔어요`);
    renderHome();
  }catch{ toast('노트북 서재를 불러오지 못했어요. 노트북의 Novelist가 켜져 있는지 봐 주세요'); }
}
if (LAN_BASE){
  document.documentElement.classList.add('lan-guest');
  setTimeout(lanLoad, 400);
}

// ---------- 노트북 쪽: 설정에서 켜고, 주소를 보여 준다 ----------
async function lanUI(){
  if (!DESKTOP || !window.nvDesktop.lanInfo) return;
  const info = await window.nvDesktop.lanInfo();
  $('#lanOn').checked = !!info.on;
  const box = $('#lanAddrs'); box.innerHTML = '';
  if (info.on && info.urls.length){
    for (const u of info.urls){
      const d = document.createElement('div'); d.className = 'lan-addr';
      d.innerHTML = `<code></code><button data-cp>복사</button>`;
      d.querySelector('code').textContent = u;
      d.querySelector('[data-cp]').onclick = () => copy(u);
      box.append(d);
    }
  } else if (info.on) box.innerHTML = '<div class="hint">와이파이 주소를 찾지 못했어요. 와이파이에 연결돼 있는지 봐 주세요.</div>';
}
$('#lanOn')?.addEventListener('change', async () => {
  const r = await window.nvDesktop.lanSet($('#lanOn').checked).catch(() => null);
  if (!r?.ok && $('#lanOn').checked){ $('#lanOn').checked = false; toast('서버를 켜지 못했어요' + (r?.err ? ` (${r.err})` : '')); }
  else toast($('#lanOn').checked ? '켰어요. 아이패드 사파리에 아래 주소를 쳐 보세요' : '껐어요');
  lanUI();
});
if (DESKTOP) lanUI();
