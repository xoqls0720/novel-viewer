// 노벨 뷰어 윈도우 프로그램: 웹 앱을 app:// 주소로 띄우고, 구글 로그인·자동 업데이트를 맡는다
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu, safeStorage, dialog } = require('electron');
const path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();

const APP_DIR = path.join(__dirname, 'app');
const STATE = () => path.join(app.getPath('userData'), 'window.json');
let win;

function createWindow(){
  let st = {}; try{ st = JSON.parse(fs.readFileSync(STATE(), 'utf8')); }catch{}
  win = new BrowserWindow({
    width: st.width || 1400, height: st.height || 900, x: st.x, y: st.y, minWidth: 360, minHeight: 480,
    title: 'Novelist', icon: path.join(APP_DIR, 'icon-512.png'), backgroundColor: '#f7f5f0', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, spellcheck: false },
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://novel/index.html');
  // 바깥 주소(노벨AI·구글 AI 스튜디오·맞춤법 검사기 등)는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('app://')) return { action: 'allow' }; shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')){ e.preventDefault(); shell.openExternal(url); } });
  const save = () => { if (!win || win.isDestroyed()) return; const b = win.getNormalBounds(); fs.writeFileSync(STATE(), JSON.stringify({ ...b, max: win.isMaximized() })); };
  win.on('close', save);
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: '파일', submenu: [{ label: '데이터 폴더 열기', click: () => shell.openPath(app.getPath('userData')) }, { type: 'separator' }, { role: 'quit', label: '끝내기' }] },
  { label: '편집', submenu: [{ role: 'undo', label: '되돌리기' }, { role: 'redo', label: '다시 하기' }, { type: 'separator' }, { role: 'cut', label: '잘라내기' }, { role: 'copy', label: '복사' }, { role: 'paste', label: '붙여넣기' }, { role: 'selectAll', label: '모두 선택' }] },
  { label: '보기', submenu: [{ role: 'reload', label: '새로 고침' }, { role: 'togglefullscreen', label: '전체 화면' }, { type: 'separator' }, { role: 'resetZoom', label: '원래 크기' }, { role: 'zoomIn', label: '크게' }, { role: 'zoomOut', label: '작게' }, { type: 'separator' }, { role: 'toggleDevTools', label: '개발자 도구' }] },
  { label: '도움말', submenu: [{ label: '업데이트 확인', click: () => checkUpdate(true) }, { label: '웹 버전 열기', click: () => shell.openExternal('https://xoqls0720.github.io/novel-viewer/') }, { label: `버전 ${app.getVersion()}`, enabled: false }] },
]));

app.on('second-instance', () => { if (win){ if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  protocol.handle('app', req => {
    const u = new URL(req.url);
    // 연결한 작품 폴더의 파일: app://novel/__disk/?p=<절대 경로> (연결한 폴더 안만 허용)
    if (u.pathname === '/__disk/'){
      const abs = path.normalize(u.searchParams.get('p') || '');
      if (!libRoots().some(r => abs.startsWith(r + path.sep))) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(abs).toString());
    }
    let p = decodeURIComponent(u.pathname); if (p === '/' || !p) p = '/index.html';
    const file = path.normalize(path.join(APP_DIR, p));
    if (!file.startsWith(APP_DIR)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  setTimeout(() => checkUpdate(false), 5000);
});
app.on('window-all-closed', () => app.quit());

/* ---------- 자동 업데이트(GitHub 릴리스) ---------- */
async function checkUpdate(manual){
  try{
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.once('update-downloaded', async info => {
      const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['지금 다시 시작', '나중에'], title: '업데이트', message: `새 판 ${info.version}을 받았어요. 다시 시작하면 바뀌어요.` });
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
    if (manual) autoUpdater.once('update-not-available', () => dialog.showMessageBox(win, { message: `지금이 최신 판이에요 (${app.getVersion()}).` }));
    await autoUpdater.checkForUpdates();
  }catch(e){ if (manual) dialog.showMessageBox(win, { type: 'warning', message: '업데이트를 확인하지 못했어요.', detail: String(e.message || e) }); }
}

/* ---------- 구글 드라이브 로그인(기본 브라우저 + 이 컴퓨터로 돌아오기) ---------- */
// 데스크톱 앱 안에서는 구글이 로그인 창을 막기 때문에, 기본 브라우저로 로그인하고
// http://127.0.0.1:53682 로 돌아온 코드를 받아 토큰으로 바꾼다. 다시 쓸 수 있는 토큰은 윈도우 암호화로 저장한다.
const PORT = 53682, REDIRECT = `http://127.0.0.1:${PORT}/`;
const TOK = () => path.join(app.getPath('userData'), 'gd.bin');
const saveRefresh = t => fs.writeFileSync(TOK(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t));
const loadRefresh = () => { try{ const b = fs.readFileSync(TOK()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString(); }catch{ return null; } };
async function tokenRequest(params){
  const r = await net.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || ('token ' + r.status)); return j;
}
ipcMain.handle('version', () => app.getVersion());

/* ---------- 작품 폴더 연결 ---------- */
const ROOTS = () => path.join(app.getPath('userData'), 'library-roots.json');
const libRoots = () => { try{ return JSON.parse(fs.readFileSync(ROOTS(), 'utf8')); }catch{ return []; } };
ipcMain.handle('lib-pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: '작품 폴더 고르기', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = path.normalize(r.filePaths[0]); const roots = libRoots(); if (!roots.includes(p)){ roots.push(p); fs.writeFileSync(ROOTS(), JSON.stringify(roots)); }
  return p;
});
// 폴더 아래 파일을 모두 훑는다(숨김 파일은 뺀다). rel 은 '폴더이름/하위/파일'
ipcMain.handle('lib-scan', async (_e, root) => {
  root = path.normalize(root); if (!libRoots().includes(root)) throw new Error('연결하지 않은 폴더예요');
  const base = path.basename(root), out = [];
  async function walk(dir, rel){
    let ents = []; try{ ents = await fs.promises.readdir(dir, { withFileTypes: true }); }catch{ return; }
    for (const d of ents){
      if (d.name.startsWith('.') || d.name === 'desktop.ini' || d.name === 'Thumbs.db') continue;
      const abs = path.join(dir, d.name), r = rel + '/' + d.name;
      if (d.isDirectory()) await walk(abs, r);
      else if (d.isFile()){ try{ const st = await fs.promises.stat(abs); out.push({ abs, rel: r, size: st.size, mtime: st.mtimeMs }); }catch{} }
    }
  }
  await walk(root, base); return out;
});
/* ---------- 노벨AI 그림 만들기 ----------
   브라우저에서는 막혀 있어서(CORS) 프로그램이 대신 보낸다.
   V4 이상 모델은 .../generate-image-stream 으로 보내고, 답이 '길이(4바이트) + msgpack' 덩어리로 줄줄이 온다.
   그중 다 그린 것(final)만 골라 PNG 로 돌려준다. */
function msgpackFinals(buf){
  const out = []; let at = 0;
  const dec = new TextDecoder();
  function read(b, p){   // [값, 다음 위치]
    const t = b[p];
    if (t < 0x80) return [t, p + 1];                                  // 작은 양수
    if (t >= 0xe0) return [t - 256, p + 1];                           // 작은 음수
    if (t >= 0x80 && t <= 0x8f) return map(b, p + 1, t - 0x80);
    if (t >= 0x90 && t <= 0x9f) return arr(b, p + 1, t - 0x90);
    if (t >= 0xa0 && t <= 0xbf) return str(b, p + 1, t - 0xa0);
    switch (t){
      case 0xc0: return [null, p + 1];
      case 0xc2: return [false, p + 1];
      case 0xc3: return [true, p + 1];
      case 0xc4: return bin(b, p + 2, b[p + 1]);
      case 0xc5: return bin(b, p + 3, b.readUInt16BE(p + 1));
      case 0xc6: return bin(b, p + 5, b.readUInt32BE(p + 1));
      case 0xca: return [b.readFloatBE(p + 1), p + 5];
      case 0xcb: return [b.readDoubleBE(p + 1), p + 9];
      case 0xcc: return [b[p + 1], p + 2];
      case 0xcd: return [b.readUInt16BE(p + 1), p + 3];
      case 0xce: return [b.readUInt32BE(p + 1), p + 5];
      case 0xcf: return [Number(b.readBigUInt64BE(p + 1)), p + 9];
      case 0xd0: return [b.readInt8(p + 1), p + 2];
      case 0xd1: return [b.readInt16BE(p + 1), p + 3];
      case 0xd2: return [b.readInt32BE(p + 1), p + 5];
      case 0xd3: return [Number(b.readBigInt64BE(p + 1)), p + 9];
      case 0xd9: return str(b, p + 2, b[p + 1]);
      case 0xda: return str(b, p + 3, b.readUInt16BE(p + 1));
      case 0xdb: return str(b, p + 5, b.readUInt32BE(p + 1));
      case 0xdc: return arr(b, p + 3, b.readUInt16BE(p + 1));
      case 0xdd: return arr(b, p + 5, b.readUInt32BE(p + 1));
      case 0xde: return map(b, p + 3, b.readUInt16BE(p + 1));
      case 0xdf: return map(b, p + 5, b.readUInt32BE(p + 1));
    }
    throw new Error('msgpack 0x' + t.toString(16));
  }
  function str(b, p, n){ return [dec.decode(b.subarray(p, p + n)), p + n]; }
  function bin(b, p, n){ return [b.subarray(p, p + n), p + n]; }
  function arr(b, p, n){ const o = []; for (let i = 0; i < n; i++){ const [v, q] = read(b, p); o.push(v); p = q; } return [o, p]; }
  function map(b, p, n){ const o = {}; for (let i = 0; i < n; i++){ const [k, q] = read(b, p); const [v, r] = read(b, q); o[k] = v; p = r; } return [o, p]; }
  while (at + 4 <= buf.length){
    const len = buf.readUInt32BE(at); at += 4;
    if (!len || at + len > buf.length) break;
    try{ const [obj] = read(buf.subarray(at, at + len), 0); if (obj && obj.event_type === 'final' && obj.image) out.push(Buffer.from(obj.image).toString('base64')); }catch{}
    at += len;
  }
  return out;
}
/* 노벨AI 설정 가져오기: 노벨AI 창을 띄우고, 거기서 그림을 한 장 만들면
   그때 나간 요청을 받아 토큰·모델·설정을 그대로 가져온다. 비밀번호는 보지 않는다. */
ipcMain.handle('nai-capture', () => new Promise(resolve => {
  let w;
  try{ w = new BrowserWindow({ width: 1200, height: 880, title: '노벨AI 설정 가져오기 — 여기서 그림을 한 장 만들어 주세요', autoHideMenuBar: true, webPreferences: { partition: 'persist:novelai' } }); }
  catch(e){ return resolve({ ok: false, text: e.message }); }
  let body = null, done = false;
  const ses = w.webContents.session;
  const filter = { urls: ['https://image.novelai.net/ai/generate-image*', 'https://api.novelai.net/ai/generate-image*'] };
  const finish = (token) => {
    if (done || !body) return; done = true;
    resolve({ ok: true, token: token || '', body });
    setTimeout(() => { try{ w.close(); }catch{} }, 1200);
  };
  ses.webRequest.onBeforeRequest(filter, (d, cb) => {
    try{
      const raw = d.uploadData && d.uploadData[0] && d.uploadData[0].bytes;
      if (raw && !done){ const j = JSON.parse(Buffer.from(raw).toString('utf8')); if (j && j.parameters) body = j; }
    }catch{}
    cb({});
  });
  ses.webRequest.onBeforeSendHeaders(filter, (d, cb) => {
    const h = d.requestHeaders || {};
    const a = h.Authorization || h.authorization || '';
    if (body) finish(String(a).replace(/^Bearer\s+/i, ''));
    cb({ requestHeaders: h });
  });
  w.on('closed', () => { if (!done){ done = true; resolve(body ? { ok: true, token: '', body } : { ok: false, text: '그림을 만들지 않고 창을 닫았어요' }); } });
  w.loadURL('https://novelai.net/image');
}));
ipcMain.handle('nai-gen', async (_e, token, body) => {
  const stream = /nai-diffusion-(?:[4-9]|\d\d)/.test(String(body?.model || ''));
  const url = 'https://image.novelai.net/ai/generate-image' + (stream ? '-stream' : '');
  if (stream) body.parameters = { ...body.parameters, stream: 'msgpack' };
  let r;
  try{
    r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: stream ? 'application/x-msgpack' : 'application/zip' }, body: JSON.stringify(body) });
  }catch(err){ return { ok: false, status: 0, text: err.message }; }
  const raw = Buffer.from(await r.arrayBuffer());
  if (!r.ok) return { ok: false, status: r.status, text: raw.toString('utf8').slice(0, 400) };
  if (stream){
    const imgs = msgpackFinals(raw);
    return imgs.length ? { ok: true, images: imgs } : { ok: false, status: r.status, text: '그림을 받지 못했어요 (' + raw.length + '바이트)' };
  }
  return { ok: true, zip: raw.toString('base64') };   // 옛 모델(V3)은 zip 으로 온다
});
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('gd-logout', () => { try{ fs.unlinkSync(TOK()); }catch{} return true; });
ipcMain.handle('gd-token', async (_e, id, secret) => {
  const rt = loadRefresh(); if (!rt) return null;
  try{ const j = await tokenRequest({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: 'refresh_token' }); return { token: j.access_token, expires: j.expires_in, scope: j.scope }; }
  catch(e){ if (/invalid_grant/.test(e.message)){ try{ fs.unlinkSync(TOK()); }catch{} } throw e; }
});
ipcMain.handle('gd-login', (_e, id, secret, scope) => new Promise((resolve, reject) => {
  const verifier = crypto.randomBytes(32).toString('base64url'); const challenge = crypto.createHash('sha256').update(verifier).digest('base64url'); const state = crypto.randomBytes(12).toString('hex');
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, REDIRECT); if (u.pathname !== '/'){ res.writeHead(404); res.end(); return; }
    const done = (ok, msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<meta charset="utf-8"><body style="font:16px sans-serif;padding:40px">${ok ? '✓ 노벨 뷰어에 연결했어요. 이 창은 닫아도 돼요.' : '연결하지 못했어요: ' + msg}</body>`); server.close(); };
    if (u.searchParams.get('state') !== state){ done(false, 'state'); return reject(new Error('state')); }
    if (u.searchParams.get('error')){ done(false, u.searchParams.get('error')); return reject(new Error(u.searchParams.get('error'))); }
    try{
      const j = await tokenRequest({ code: u.searchParams.get('code'), client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code', code_verifier: verifier });
      if (j.refresh_token) saveRefresh(j.refresh_token);
      done(true); if (win){ if (win.isMinimized()) win.restore(); win.focus(); }
      resolve({ token: j.access_token, expires: j.expires_in, scope: j.scope });
    }catch(e){ done(false, e.message); reject(e); }
  });
  server.on('error', reject);
  server.listen(PORT, '127.0.0.1', () => {
    const q = new URLSearchParams({ client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: scope || 'https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state });
    shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q);
  });
  setTimeout(() => { server.close(); reject(new Error('timeout')); }, 5 * 60000);
}));
