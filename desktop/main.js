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
    title: '노벨 뷰어', icon: path.join(APP_DIR, 'icon-512.png'), backgroundColor: '#f7f5f0', autoHideMenuBar: true, show: false,
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
    let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || !p) p = '/index.html';
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
ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));
ipcMain.handle('gd-logout', () => { try{ fs.unlinkSync(TOK()); }catch{} return true; });
ipcMain.handle('gd-token', async (_e, id, secret) => {
  const rt = loadRefresh(); if (!rt) return null;
  try{ const j = await tokenRequest({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: 'refresh_token' }); return { token: j.access_token, expires: j.expires_in }; }
  catch(e){ if (/invalid_grant/.test(e.message)){ try{ fs.unlinkSync(TOK()); }catch{} } throw e; }
});
ipcMain.handle('gd-login', (_e, id, secret) => new Promise((resolve, reject) => {
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
      resolve({ token: j.access_token, expires: j.expires_in });
    }catch(e){ done(false, e.message); reject(e); }
  });
  server.on('error', reject);
  server.listen(PORT, '127.0.0.1', () => {
    const q = new URLSearchParams({ client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.appdata', access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state });
    shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q);
  });
  setTimeout(() => { server.close(); reject(new Error('timeout')); }, 5 * 60000);
}));
