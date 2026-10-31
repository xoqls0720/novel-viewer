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
      get: async () => { const r = await fetch(LAN_BASE + '/lan/file?p=' + encodeURIComponent(f.rel)); if (!r.ok) throw new Error('읽지 못했어요'); return r.blob(); }}),
      // 영상·큰 EPUB 은 통째로 받지 않고 필요한 구간만 (Range)
      {remote: true, lanRel: f.rel, streamUrl: LAN_BASE + '/lan/file?p=' + encodeURIComponent(f.rel)}));
    await addFiles(files, {persist: false, quiet: true});
    toast(`노트북 서재에서 작품 ${works.length}개를 불러왔어요`);
    renderHome();
  }catch{ toast('노트북 서재를 불러오지 못했어요. 노트북의 Novelist가 켜져 있는지 봐 주세요'); }
}
// 폰·아이패드: PC 의 Novelist 가 새 버전으로 바뀌었으면, 앱으로 돌아올 때 저절로 새로 불러온다(읽던 자리는 저장돼 있다)
let lanVer = null;
async function lanCheckVer(){
  const v = await fetch(LAN_BASE + '/lan/info', {cache: 'no-store'}).then(r => r.json()).then(j => j.ver).catch(() => null);
  if (v == null) return;
  if (lanVer == null){ lanVer = v; return; }
  if (v !== lanVer){ await window.nvPcSync?.().catch(() => {}); location.reload(); }
}
if (LAN_BASE){
  document.documentElement.classList.add('lan-guest');
  lanCheckVer();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lanCheckVer(); });
  setTimeout(lanLoad, 400);
  setTimeout(lanGuestApps, 600);
}
// 폰에서 다운로더 열기: 누르면 PC 가 받는다 (받은 작품은 PC 폴더에 쌓이고, 여기서 새로 고침하면 보인다)
async function lanGuestApps(){
  const info = await fetch(LAN_BASE + '/lan/info').then(r => r.json()).catch(() => null);
  const box = $('#lanGuestApps'); if (!box || !info) return;
  const names = {moa: ['모아받기', '사이트에서 골라 받기'], toki: ['토끼 다운로더', '제목·주소로 받기·업데이트']};
  box.innerHTML = (info.apps || []).map(k => `<a class="lan-app" href="${LAN_BASE}/${k}/" target="_blank" rel="noopener"><b>${names[k][0]}</b><span>${names[k][1]}</span></a>`).join('')
    + `<button class="lan-app" id="lanReload"><b>새로 받은 작품 보기</b><span>PC 서재를 다시 불러와요</span></button>`;
  box.hidden = false;
  $('#lanReload').onclick = () => location.reload();
}

// ---------- 노트북 쪽: 설정에서 켜고, 주소를 보여 준다 ----------
async function lanUI(){
  if (!DESKTOP || !window.nvDesktop.lanInfo) return;
  const info = await window.nvDesktop.lanInfo();
  $('#lanOn').checked = !!info.on;
  const box = $('#lanAddrs'); box.innerHTML = '';
  // 어디서나, 고정 주소 (Tailscale Funnel): 폰에는 아무것도 설치하지 않는다. 홈 화면에 한 번 추가하면 계속
  if (info.on && info.funnel && info.qrFunnel){
    const f = document.createElement('div'); f.className = 'lan-out lan-funnel';
    f.innerHTML = '<b>어디서나 열기 · 고정 주소 (추천)</b><div class="lan-qr">' + info.qrFunnel + '<div class="hint">폰 카메라로 찍어 열고 <b>홈 화면에 추가</b>하세요. 와이파이·데이터 어디서나, 폰에 VPN 없이 열려요. 주소가 바뀌지 않아서 한 번만 추가하면 돼요. 주소에 열쇠가 들어 있으니 남에게 보내지 마세요.</div></div>';
    const d = document.createElement('div'); d.className = 'lan-addr'; d.innerHTML = '<code></code><button data-cp>복사</button>';
    d.querySelector('code').textContent = info.funnel; d.querySelector('[data-cp]').onclick = () => copy(info.funnel); f.append(d);
    box.append(f);
  } else if (info.on && info.tsInstalled){
    const f = document.createElement('div'); f.className = 'lan-out';
    f.innerHTML = `<b>어디서나 열기 · 고정 주소</b><div class="hint">PC 에서 PowerShell 을 열고 아래 한 줄을 한 번 실행하면, 폰에 VPN 없이 어디서나 열리는 고정 주소 QR 이 여기에 생겨요(처음이면 허락 링크가 나와요).</div><div class="lan-addr"><code>tailscale funnel --bg ${info.lanPort || 8787}</code><button data-cp>복사</button></div>`;
    f.querySelector('[data-cp]').onclick = () => copy(`tailscale funnel --bg ${info.lanPort || 8787}`);
    box.append(f);
  }
  if (info.on && info.qr){
    const q = document.createElement('div'); q.className = 'lan-qr';
    q.innerHTML = '<b class="lan-qt">집 와이파이</b>' + info.qr + '<div class="hint">폰·아이패드 카메라로 찍으면 바로 열려요 (같은 와이파이). 홈 화면에 추가해 두면 앱처럼 써요.'
      + (info.publicIp ? ' 이 컴퓨터는 인터넷 주소를 바로 써서(공유기 없이 연결) 폰 와이파이에서도 이 주소로 닿아요. 주소 속 긴 열쇠가 남이 여는 것을 막아요. 주소는 남에게 보내지 마세요.' : '')
      + (info.apps?.length ? ` 폰에서도 ${info.apps.map(a => ({moa: '모아받기', toki: '토끼 다운로더'})[a]).join('·')} 를 열 수 있고, 받기는 이 PC 가 해요.` : '') + '</div>';
    box.append(q);
  }
  // 밖에서(데이터·다른 와이파이): Tailscale 이 있으면 그 주소 QR, 없으면 설치 안내
  if (info.on){
    const o = document.createElement('div'); o.className = 'lan-out';
    if (info.qrOut){
      o.innerHTML = '<b>밖에서 볼 때 (Tailscale)</b><div class="lan-qr">' + info.qrOut + '<div class="hint">데이터로나 다른 와이파이에서도 열려요. 폰에도 Tailscale 을 켜고 같은 계정으로 로그인해 두세요. 이 QR 도 홈 화면에 따로 추가해 두면 돼요. 안 열리면 윈도우 방화벽에서 Novelist 를 "공용 네트워크"에도 허용해 주세요.</div></div>';
    } else {
      o.innerHTML = '<b>밖에서 볼 때 (Tailscale)</b><div class="hint">와이파이 없이 데이터로 보려면 PC 와 폰에 <a href="https://tailscale.com/download" target="_blank" rel="noopener">Tailscale</a>(무료)을 설치하고 같은 계정으로 로그인하세요. '
        + (info.tsInstalled ? 'PC 에 설치는 돼 있어요. Tailscale 에 로그인해 연결하면 여기에 QR 이 생겨요.' : '설치하고 로그인하면 여기에 밖에서 볼 QR 이 생겨요.') + '</div>';
    }
    box.append(o);
  }
  if (info.on && info.urls.length){
    for (const u of [...info.urls, ...(info.outside || [])]){
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

// ---------- 어디서나 열기 (Cloudflare 터널): 노트북 쪽 ----------
// 켜고 끄는 것은 사용자만 (설정의 체크). 지금 주소는 동기화 설정 pcRemote 에 적어 폰의 웹 버전이 찾게 한다.
const REMOTE_STATE = {off: '', download: '처음 한 번 터널 프로그램(cloudflared)을 받는 중…', starting: '여는 중…', on: '열려 있어요', retry: '끊겨서 다시 여는 중…', error: '열지 못했어요'};
async function lanRemoteUI(info){
  if (!DESKTOP || !window.nvDesktop.lanRemoteInfo) return;
  const all = await window.nvDesktop.lanInfo().catch(() => null); const r = info || all?.remote; if (!r) return;
  $('#lanRemoteOn').checked = !!r.on;
  $('#lanRemoteState').textContent = (REMOTE_STATE[r.state] || '') + (r.state === 'error' && r.err ? ' ' + r.err : '');
  const box = $('#lanRemoteAddr'); box.innerHTML = '';
  if (r.url && all?.qrRemote){
    const q = document.createElement('div'); q.className = 'lan-qr';
    q.innerHTML = all.qrRemote + '<div class="hint">어디서나 이 QR 로 열려요. PC 를 다시 켜면 주소가 바뀌니, 홈 화면에는 웹 버전 Novelist 를 두고 거기의 <b>PC 서재 열기</b>를 쓰세요.</div>';
    box.append(q);
    const d = document.createElement('div'); d.className = 'lan-addr'; d.innerHTML = '<code></code><button data-cp>복사</button>';
    d.querySelector('code').textContent = r.url; d.querySelector('[data-cp]').onclick = () => copy(r.url); box.append(d);
  }
  const prev = store.get('pcRemote', null);
  if (r.url && prev?.url !== r.url) store.set('pcRemote', {url: r.url, at: Date.now()});
  else if (!r.on && prev?.url) store.set('pcRemote', {url: '', at: Date.now()});
}
$('#lanRemoteOn')?.addEventListener('change', async e => {
  if (e.target.checked && !confirm('서재와 다운로더를 인터넷 어디서나 열 수 있게 해요. 주소(긴 열쇠 포함)를 아는 사람만 열 수 있어요. 켤까요?')){ e.target.checked = false; return; }
  const r = await window.nvDesktop.lanRemoteSet(e.target.checked).catch(() => null); lanRemoteUI(r || undefined);
});
if (DESKTOP && window.nvDesktop?.onLanRemote){ window.nvDesktop.onLanRemote(r => lanRemoteUI(r)); lanRemoteUI(); }
if (!DESKTOP) $('#lanRemoteBox')?.remove();

// ---------- 폰·아이패드의 웹 버전: PC 서재 열기 ----------
// 구글 드라이브 맞추기로 받은 pcRemote 주소가 있으면 서재 위에 단추를 둔다 (PC 가 켜져 있고 어디서나 열기를 켠 동안)
function pcRemoteButton(){
  if (DESKTOP || LAN_BASE) return;
  const r = store.get('pcRemote', null); const box = $('#lanGuestApps'); if (!box) return;
  if (!r?.url){ box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = `<a class="lan-app" href="${esc(r.url)}"><b>PC 서재 열기</b><span>PC 의 작품·다운로더를 어디서나</span></a>`;
  box.hidden = false;
}
if (!DESKTOP && !LAN_BASE){ setTimeout(pcRemoteButton, 800); setInterval(pcRemoteButton, 15000); }
