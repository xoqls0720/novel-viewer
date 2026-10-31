// 노벨 뷰어 윈도우 프로그램: 웹 앱을 app:// 주소로 띄우고, 구글 로그인·자동 업데이트를 맡는다
const { app, BrowserWindow, protocol, net, shell, ipcMain, Menu, safeStorage, dialog, nativeImage } = require('electron');
const path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto'), os = require('os');
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
    title: 'Novelist', icon: path.join(APP_DIR, 'icon-512.png'), backgroundColor: '#f5f4f0', autoHideMenuBar: true, show: false,
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
      return diskResponse(abs, req.headers.get('range'));
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

// 연결한 폴더의 파일을 내려준다. 영상은 Range(구간) 요청을 받아 앞뒤로 넘기기가 된다.
const DISK_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime', '.vtt': 'text/vtt', '.srt': 'text/plain; charset=utf-8' };
function diskResponse(abs, range){
  let st; try{ st = fs.statSync(abs); }catch{ return new Response('not found', { status: 404 }); }
  const type = DISK_TYPES[path.extname(abs).toLowerCase()];
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m && (m[1] || m[2])){
    const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
    const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : Math.min(st.size - 1, start + 8 * 1024 * 1024 - 1);
    if (start >= st.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    const { Readable } = require('stream');
    return new Response(Readable.toWeb(fs.createReadStream(abs, { start, end })), { status: 206, headers: {
      'Content-Type': type || 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' } });
  }
  if (type && type.startsWith('video/')){
    const { Readable } = require('stream');
    return new Response(Readable.toWeb(fs.createReadStream(abs)), { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(st.size), 'Accept-Ranges': 'bytes' } });
  }
  return net.fetch(pathToFileURL(abs).toString());
}

/* ---------- 받은 작품 자동 반영: 연결한 폴더를 지켜보다 바뀌면 화면에 알린다 ---------- */
// 모아받기·토끼 다운로더가 새로 받으면 그 폴더만 다시 읽게 한다. 받는 중에는 자주 바뀌어서 몇 초 모았다가 알린다.
const watchers = new Map();
function watchRoots(){
  const roots = libRoots();
  for (const [r, w] of watchers) if (!roots.includes(r)){ try{ w.close(); }catch{} watchers.delete(r); }
  for (const r of roots){
    if (watchers.has(r) || !fs.existsSync(r)) continue;
    let t = null;
    try{
      const w = fs.watch(r, { recursive: true }, (_ev, file) => {
        if (file && /(^|[\\/])\.|\.part$|\.tmp$|desktop\.ini$/i.test(String(file))) return;   // 받는 중인 조각·숨김 파일은 빼고
        clearTimeout(t); t = setTimeout(() => { lan?.invalidate?.(); if (win && !win.isDestroyed()) win.webContents.send('lib-changed', r); }, 6000);
      });
      w.on('error', () => { watchers.delete(r); });
      watchers.set(r, w);
    }catch{}
  }
}
app.whenReady().then(() => { watchRoots(); setInterval(watchRoots, 60000); dlWatch(); });

/* ---------- 모아받기·토끼 다운로더가 받는 폴더를 모두 잇는다 ----------
   두 다운로더는 토끼 설정의 saveDir(기본 D:\novel) 아래 종류 폴더에 받는다. 있는 폴더는 모두 연결하고,
   처음 받는 종류(예: 갤러리)가 새로 생기면 바로 연결해 화면에 알린다. 받은 작품은 위 watchRoots 가 알린다. */
const DL_KINDS = ['만화', '웹툰', '노벨', '영상', '갤러리', '성인'];
function dlSaveRoot(){
  const d = dlDir(); if (!d) return '';
  try{ const s = JSON.parse(fs.readFileSync(path.join(d, 'tokiDownloader', 'settings.json'), 'utf8')); if (s.saveDir && fs.existsSync(s.saveDir)) return path.normalize(s.saveDir); }catch{}
  const def = path.dirname(d);   // 기본: 다운로더 폴더 옆 (D:\novel)
  return DL_KINDS.some(k => fs.existsSync(path.join(def, k))) ? def : '';
}
function dlFolders(){
  const root = dlSaveRoot(); if (!root) return {root: '', dirs: []};
  return {root, dirs: DL_KINDS.map(k => path.join(root, k)).filter(p => { try{ return fs.statSync(p).isDirectory(); }catch{ return false; } })};
}
ipcMain.handle('lib-dl-folders', () => dlFolders());
// 화면이 고른 다운로더 폴더를 연결 목록에 더한다 (그 저장 폴더의 종류 폴더만)
ipcMain.handle('lib-dl-link', (_e, p) => {
  p = path.normalize(p || ''); if (!dlFolders().dirs.includes(p)) return null;
  const roots = libRoots(); if (!roots.some(r => p === r || p.startsWith(r + path.sep))){ roots.push(p); fs.writeFileSync(ROOTS(), JSON.stringify(roots)); watchRoots(); }
  return p;
});
let dlWatcher = null;
function dlWatch(){
  const root = dlSaveRoot(); if (!root || dlWatcher) return;
  try{
    let t = null;
    dlWatcher = fs.watch(root, (_ev, name) => {
      if (!DL_KINDS.includes(String(name || ''))) return;
      clearTimeout(t); t = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('lib-dl-new'); }, 3000);
    });
    dlWatcher.on('error', () => { dlWatcher = null; });
  }catch{}
}
// 연결한 폴더 옆의 폴더(예: 성인 옆 '영상')를 한 번에 잇는다. 옆에 그 폴더가 있을 때만
ipcMain.handle('lib-sibling', async (_e, of, name) => {
  of = path.normalize(of || ''); const inRoot = x => libRoots().some(r => x === r || x.startsWith(r + path.sep));
  if (!inRoot(of) || !/^[^\\/:*?"<>|]+$/.test(name || '')) return null;
  const p = path.join(path.dirname(of), name);
  try{ if (!fs.statSync(p).isDirectory()) return null; }catch{ return null; }
  // 이미 연결한 폴더 안이면(예: 성인 아래 영상) 그대로, 아니면 새로 연결 목록에 더한다
  if (!inRoot(p)){ const roots = libRoots(); roots.push(p); fs.writeFileSync(ROOTS(), JSON.stringify(roots)); watchRoots(); }
  return p;
});
// 번역에 쓰는 Ollama(내 컴퓨터 AI)를 켠다. 이 프로그램 화면에서 부를 수 있게 OLLAMA_ORIGINS 를 넓혀 둔다.
ipcMain.handle('ollama-start', () => ollamaStart());
function ollamaStart(){
  const dir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama');
  const appExe = path.join(dir, 'ollama app.exe'), cli = path.join(dir, 'ollama.exe');
  const env = { ...process.env, OLLAMA_ORIGINS: '*' };
  const { spawn } = require('child_process');
  try{
    if (fs.existsSync(appExe)) spawn(appExe, [], { detached: true, stdio: 'ignore', env }).unref();
    else spawn(fs.existsSync(cli) ? cli : 'ollama', ['serve'], { detached: true, stdio: 'ignore', windowsHide: true, env }).unref();
    return true;
  }catch{ return false; }
}
const ollamaUp = () => new Promise(res => { const r = http.get('http://127.0.0.1:11434/api/version', { timeout: 1500 }, x => { x.resume(); res(true); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });

/* ---------- 번역 엔진 (translator/: 내 컴퓨터 GPU 로 만화·영상 번역, 무료) ---------- */
// 설치: 보통 파이썬으로 translator/install.py → %USERPROFILE%\NovelistTranslator\ (venv·모델. AppData 밖이라 어디서 켜도 같은 곳)
// 켜기: 그 venv 의 파이썬으로 server.py (127.0.0.1:8790). 화면은 이 주소로 바로 요청한다.
const TR_DIR = () => app.isPackaged ? path.join(process.resourcesPath, 'translator') : path.join(__dirname, '..', 'translator');
const TR_HOME = () => process.env.NOVELIST_TR_HOME || path.join(os.homedir(), 'NovelistTranslator');
const TR_PY = () => path.join(TR_HOME(), 'venv', 'Scripts', 'pythonw.exe');
let trProc = null, trInstall = null;
const trHealth = () => new Promise(res => { const r = http.get('http://127.0.0.1:8790/health', { timeout: 1500 }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => { try{ res(JSON.parse(d)); }catch{ res(null); } }); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });
ipcMain.handle('tr-status', async () => ({ installed: fs.existsSync(path.join(TR_HOME(), 'installed.json')), installing: !!trInstall, health: await trHealth() }));
ipcMain.handle('tr-install', async () => {
  if (trInstall) return { ok: true, already: true };
  const { spawn } = require('child_process');
  const py = process.platform === 'win32' ? 'python' : 'python3';
  return await new Promise(resolve => {
    try{
      trInstall = spawn(py, ['-u', path.join(TR_DIR(), 'install.py')], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
    }catch(e){ trInstall = null; return resolve({ ok: false, err: '파이썬을 찾지 못했어요. python.org 에서 파이썬 3.12 를 설치해 주세요.' }); }
    const send = line => { if (win && !win.isDestroyed()) win.webContents.send('tr-install-log', line); };
    let buf = '';
    const onData = d => { buf += d.toString('utf8'); const lines = buf.split(/\r?\n/); buf = lines.pop(); lines.forEach(l => l.trim() && send(l)); };
    trInstall.stdout.on('data', onData); trInstall.stderr.on('data', onData);
    trInstall.on('error', e => { trInstall = null; resolve({ ok: false, err: '파이썬을 찾지 못했어요. python.org 에서 파이썬 3.12 를 설치해 주세요.' }); });
    trInstall.on('close', code => { trInstall = null; send(code === 0 ? 'DONE' : `FAIL ${code}`); resolve({ ok: code === 0 }); });
  });
});
ipcMain.handle('tr-start', () => trStart());
async function trStart(){
  if (await trHealth()) return { ok: true };
  if (!fs.existsSync(TR_PY())) return { ok: false, err: 'not-installed' };
  const { spawn } = require('child_process');
  trProc = spawn(TR_PY(), [path.join(TR_DIR(), 'server.py')], { cwd: TR_DIR(), windowsHide: true, detached: false, stdio: ['ignore', fs.openSync(path.join(TR_HOME(), 'server.log'), 'a'), fs.openSync(path.join(TR_HOME(), 'server.log'), 'a')], env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } });
  trProc.on('close', () => { trProc = null; });
  for (let i = 0; i < 60; i++){ await new Promise(r => setTimeout(r, 500)); if (await trHealth()) return { ok: true }; }
  return { ok: false, err: '번역 엔진이 켜지지 않았어요 (' + path.join(TR_HOME(), 'server.log') + ' 를 확인)' };
}
app.on('before-quit', () => { try{ trProc?.kill(); }catch{} try{ trInstall?.kill(); }catch{} });

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
// 구글이 데스크톱 로그인에 요구하는 클라이언트 보안 비밀번호: 이 PC에만(윈도우 암호화) 둔다. 화면 저장소·동기화·백업에는 들어가지 않는다
const SECRET = () => path.join(app.getPath('userData'), 'gd-secret.bin');
const saveSecret = t => fs.writeFileSync(SECRET(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t));
const loadSecret = () => { try{ const b = fs.readFileSync(SECRET()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString(); }catch{ return ''; } };
// 화면이 넘긴 값(예전 판에서 옮기는 중) → 이 PC에 저장한 값. 둘 다 없으면 화면이 고급 칸을 열어 한 번만 받는다
const gdSecretFor = s => { s = String(s || '').trim(); if (s && s !== loadSecret()) saveSecret(s); const v = s || loadSecret(); if (!v) throw new Error('nosecret'); return v; };
async function tokenRequest(params){
  const r = await net.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || ('token ' + r.status)); return j;
}
ipcMain.handle('version', () => app.getVersion());

/* ---------- 같은 와이파이로 보여 주기 (desktop/lan-server.js) ---------- */
const {createLanServer, hasPublicIp} = require('./lan-server.js');
const LAN_CFG = () => path.join(app.getPath('userData'), 'lan.json');
// 처음부터 켜 둔다(폰·아이패드는 주소만 열면 된다). 설정에서 끌 수 있다.
const lanCfg = () => { try{ return {on: true, ...JSON.parse(fs.readFileSync(LAN_CFG(), 'utf8'))}; }catch{ return {on: true, token: ''}; } };
let lan = null;
const LAN_PORT = process.env.NOVELIST_LAN_PORT != null ? Number(process.env.NOVELIST_LAN_PORT) : 8787;   // 시험은 다른 번호로
// 모아받기·토끼 다운로더 폴더: 설정(lan.json 의 dlDir) → 작품 폴더 위쪽의 '다운로더' 폴더
function dlDir(){
  const cfg = lanCfg(); const ok = d => d && fs.existsSync(path.join(d, 'moaDownloader', 'server.cjs')) || d && fs.existsSync(path.join(d, 'tokiDownloader', 'app', 'server.cjs'));
  if (ok(cfg.dlDir)) return cfg.dlDir;
  for (const r of libRoots()){
    for (let d = path.dirname(r), i = 0; i < 4 && d !== path.dirname(d); d = path.dirname(d), i++){
      for (const name of ['다운로더', 'downloader', 'Downloader']) if (ok(path.join(d, name))) return path.join(d, name);
    }
  }
  return '';
}
function nodeRun(script, cwd){
  const { spawn } = require('child_process');
  spawn('node', [script, '--no-open'], { cwd, detached: true, stdio: 'ignore', windowsHide: true, shell: process.platform === 'win32' }).unref();
}
function lanApps(){
  const d = dlDir(); const apps = {};
  if (d && fs.existsSync(path.join(d, 'moaDownloader', 'server.cjs'))) apps.moa = {port: 47616, start: async () => nodeRun('server.cjs', path.join(d, 'moaDownloader'))};
  if (d && fs.existsSync(path.join(d, 'tokiDownloader', 'app', 'server.cjs'))) apps.toki = {port: 47615, start: async () => nodeRun(path.join('app', 'server.cjs'), path.join(d, 'tokiDownloader'))};
  return apps;
}
/* ---------- PC로 맞추기 ----------
   폰·아이패드가 이 PC 주소(와이파이·Tailscale·터널)로 연 Novelist 와 이 PC 의 Novelist 가
   메모·형광펜·진도·집필실 원고·장면 노트·설정·API 키를 맞추는 곳. 구글 드라이브·OneDrive 의 '앱 폴더'와 같은 파일 모양이다.
   파일은 userData/pcsync 에만 둔다(바깥으로 나가지 않는다). */
const PC_SYNC_DIR = () => path.join(app.getPath('userData'), 'pcsync');
const pcEnc = n => encodeURIComponent(n).replace(/\*/g, '%2A');
function pcFile(n){
  n = String(n || '');
  if (!n || n.length > 400 || /[\\/]/.test(n) || n.includes('..')) throw new Error('bad name');
  return path.join(PC_SYNC_DIR(), pcEnc(n));
}
const pcStore = {
  list(){ try{ return fs.readdirSync(PC_SYNC_DIR()).filter(f => !f.endsWith('.part')).map(f => ({name: decodeURIComponent(f), mtime: fs.statSync(path.join(PC_SYNC_DIR(), f)).mtimeMs})); }catch{ return []; } },
  get(n){ try{ return fs.readFileSync(pcFile(n)); }catch{ return null; } },
  put(n, buf){ const f = pcFile(n); fs.mkdirSync(PC_SYNC_DIR(), {recursive: true}); fs.writeFileSync(f + '.part', buf); fs.renameSync(f + '.part', f); },
  del(n){ try{ fs.rmSync(pcFile(n), {force: true}); }catch{} },
};
// 폰이 무언가 올리면 PC 화면이 곧바로 받아 가게 알린다
let pcSyncNoteT = null;
const pcSyncChanged = () => { clearTimeout(pcSyncNoteT); pcSyncNoteT = setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('pcsync-changed'); }, 1500); };
// 번역해 둔 쪽: 엔진이 TR_HOME/pages/<쪽 열쇠 sha1>.json 에 저장한다. 엔진을 켜지 않고 바로 읽는다(PC·폰 모두)
const trPages = {
  get(key){ try{ return fs.readFileSync(path.join(TR_HOME(), 'pages', crypto.createHash('sha1').update(String(key), 'utf8').digest('hex') + '.json'), 'utf8'); }catch{ return null; } },
  has(keys){ return (keys || []).slice(0, 2000).map(k => fs.existsSync(path.join(TR_HOME(), 'pages', crypto.createHash('sha1').update(String(k), 'utf8').digest('hex') + '.json'))); },
};
ipcMain.handle('tr-page-get', (_e, key) => trPages.get(key));
ipcMain.handle('tr-page-has', (_e, keys) => trPages.has(keys));
ipcMain.handle('pcsync-list', () => pcStore.list());
ipcMain.handle('pcsync-get', (_e, n) => pcStore.get(n));
ipcMain.handle('pcsync-put', (_e, n, data) => { pcStore.put(n, Buffer.from(data)); return true; });
ipcMain.handle('pcsync-del', (_e, n) => { pcStore.del(n); return true; });
async function lanStart(){
  if (lan) return true;
  const cfg = lanCfg();
  // 열쇠: 128비트. 예전 짧은 열쇠는 새로 만든다(이 컴퓨터가 인터넷 주소를 바로 쓰면 바깥에서도 닿는다)
  if (!cfg.token || cfg.token.length < 32){ cfg.token = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(LAN_CFG(), JSON.stringify(cfg)); }
  // 번역 엔진: 폰에서 처음 부르면 PC 가 엔진(과 Ollama)을 켠다
  const tr = fs.existsSync(path.join(TR_HOME(), 'installed.json')) ? {port: 8790, wait: 40000, start: async () => { if (!(await ollamaUp())) ollamaStart(); const r = await trStart(); if (!r.ok) throw new Error(r.err); }} : null;
  // 폰에 보낼 그림은 화면 폭에 맞춰 줄인다(jpg·png). 줄인 것은 userData/lan-img 에 남겨 다음엔 바로
  const resize = async (src, w) => { const im = Buffer.isBuffer(src) ? nativeImage.createFromBuffer(src) : nativeImage.createFromPath(src); if (im.isEmpty()) return null; const sz = im.getSize(); if (sz.width <= w) return null; return im.resize({width: w, quality: 'good'}).toJPEG(82); };
  lan = createLanServer({appDir: APP_DIR, roots: libRoots, token: cfg.token, port: LAN_PORT, apps: lanApps, tr, sync: pcStore, onSync: pcSyncChanged, trPages,
    cacheFile: path.join(app.getPath('userData'), 'lan-scan.json'), resize, thumbDir: path.join(app.getPath('userData'), 'lan-img')});
  try{ await lan.start(); return true; }catch(e){ lan = null; throw e; }
}
// Tailscale Funnel: 사용자가 'tailscale funnel --bg 8787' 을 켜 두었으면 그 고정 https 주소를 찾는다 (읽기만 한다)
function tsRun(args){
  const exe = path.join(process.env.ProgramFiles || 'C:/Program Files', 'Tailscale', 'tailscale.exe');
  if (!fs.existsSync(exe)) return Promise.resolve(null);
  return new Promise(res => require('child_process').execFile(exe, args, {windowsHide: true, timeout: 5000}, (err, out) => { if (err) return res(null); try{ res(JSON.parse(out)); }catch{ res(null); } }));
}
async function tsFunnelUrl(){
  const st = await tsRun(['status', '--json']); const dns = String(st?.Self?.DNSName || '').replace(/\.$/, ''); if (!dns) return '';
  const fs_ = await tsRun(['funnel', 'status', '--json']); if (!fs_) return '';
  const on = Object.entries(fs_.AllowFunnel || {}).some(([k, v]) => v && k.startsWith(dns));
  const to8787 = JSON.stringify(fs_.Web || {}).includes(':' + LAN_PORT);
  return on && to8787 ? `https://${dns}` : '';
}
ipcMain.handle('lan-info', async () => {
  const cfg = lanCfg(); const urls = lan ? lan.urls() : []; const outside = lan ? lan.outsideUrls() : [];
  const qrOf = async u => { try{ return u ? await require('qrcode').toString(u, {type: 'svg', margin: 1, errorCorrectionLevel: 'M'}) : ''; }catch{ return ''; } };
  const tsInstalled = fs.existsSync(path.join(process.env.ProgramFiles || 'C:/Program Files', 'Tailscale', 'tailscale.exe'));
  const fb = lan ? await tsFunnelUrl() : ''; const funnel = fb && cfg.token ? `${fb}/t/${cfg.token}/` : '';
  return {on: !!lan, urls, outside, token: cfg.token, apps: Object.keys(lanApps()), qr: await qrOf(urls[0]), qrOut: await qrOf(outside[0]), tsInstalled, publicIp: hasPublicIp(), remote: remoteInfo(), qrRemote: await qrOf(remoteInfo().url), funnel, qrFunnel: await qrOf(funnel), lanPort: LAN_PORT};
});
ipcMain.handle('lan-set', async (_e, on) => {
  try{
    if (on) await lanStart(); else if (lan){ await lan.stop(); lan = null; }
    const cfg = lanCfg(); cfg.on = !!on; fs.writeFileSync(LAN_CFG(), JSON.stringify(cfg));
    return {ok: true};
  }catch(e){ return {ok: false, err: String(e.message || e)}; }
});
app.whenReady().then(async () => { if (lanCfg().on){ await lanStart().catch(() => {}); if (lanCfg().remote) remoteStart(); } });

/* ---------- 어디서나 열기 (Cloudflare 빠른 터널, 사용자가 설정에서 켤 때만) ----------
   cloudflared 가 이 PC 에서 바깥으로 연결을 열어 https://….trycloudflare.com 주소를 받는다.
   와이파이·데이터·WARP 와 상관없이 폰이 닿는다. 주소는 PC 를 다시 켜면 바뀐다 → 화면이 동기화 설정(pcRemote)에 적는다. */
const remote = {proc: null, url: '', state: 'off', err: '', tries: 0, fails: 0, quitting: false, timer: null};
function remoteNotify(){ if (win && !win.isDestroyed()) win.webContents.send('lan-remote', remoteInfo()); }
function remoteInfo(){ const t = lanCfg().token; return {on: !!lanCfg().remote, state: remote.state, err: remote.err, url: remote.url && t ? `${remote.url}/t/${t}/` : ''}; }
async function cfBin(){
  if (process.env.NOVELIST_CF_BIN) return process.env.NOVELIST_CF_BIN;   // 시험용
  for (const p of [path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'cloudflared', 'cloudflared.exe'), path.join(process.env.ProgramFiles || 'C:/Program Files', 'cloudflared', 'cloudflared.exe')]) if (fs.existsSync(p)) return p;
  const own = path.join(app.getPath('userData'), 'bin', 'cloudflared.exe');
  if (fs.existsSync(own) && fs.statSync(own).size > 1e6) return own;
  // 처음 켤 때 한 번: Cloudflare 공식 GitHub 릴리스에서 받는다
  remote.state = 'download'; remoteNotify();
  fs.mkdirSync(path.dirname(own), {recursive: true});
  const r = await net.fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe');
  if (!r.ok) throw new Error('cloudflared 를 받지 못했어요 (' + r.status + ')');
  fs.writeFileSync(own + '.part', Buffer.from(await r.arrayBuffer())); fs.renameSync(own + '.part', own);
  return own;
}
async function remoteStart(){
  if (remote.proc || remote.quitting || !lanCfg().remote) return;
  if (!lan){ try{ await lanStart(); }catch(e){ remote.state = 'error'; remote.err = String(e.message || e); return remoteNotify(); } }
  let bin; try{ bin = await cfBin(); }catch(e){ remote.state = 'error'; remote.err = String(e.message || e); remoteNotify(); remote.timer = setTimeout(remoteStart, 5 * 60000); return; }
  const { spawn } = require('child_process');
  remote.state = 'starting'; remote.url = ''; remote.err = ''; remoteNotify();
  const pre = process.env.NOVELIST_CF_PRE ? [process.env.NOVELIST_CF_PRE] : [];   // 시험: node 가짜터널.js
  const p = spawn(bin, [...pre, 'tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${lan.server.address()?.port || LAN_PORT}`], {windowsHide: true});
  remote.proc = p;
  const onData = d => { const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && !remote.url){ remote.url = m[0]; remote.state = 'on'; remote.tries = 0; remote.fails = 0; remoteNotify(); } };
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('error', e => { remote.err = String(e.message || e); });
  p.on('close', () => {
    remote.proc = null; remote.url = '';
    if (remote.quitting || !lanCfg().remote){ remote.state = 'off'; return remoteNotify(); }
    remote.state = 'retry'; remoteNotify();
    remote.timer = setTimeout(remoteStart, Math.min(60000, 3000 * ++remote.tries));   // 끊기면 다시 (주소가 새로 바뀐다)
  });
}
function remoteStop(){ clearTimeout(remote.timer); try{ remote.proc?.kill(); }catch{} remote.proc = null; remote.url = ''; remote.state = 'off'; remoteNotify(); }
// 빠른 터널은 가끔 말없이 끊긴다: 5분마다 바깥 주소로 확인하고, 세 번 연속 안 되면 다시 연다
setInterval(async () => {
  if (!remote.url || !remote.proc) return;
  const ok = await net.fetch(`${remote.url}/t/${lanCfg().token}/lan/info`, {signal: AbortSignal.timeout(20000)}).then(r => r.ok).catch(() => false);
  remote.fails = ok ? 0 : remote.fails + 1;
  if (remote.fails >= 3){ remote.fails = 0; try{ remote.proc.kill(); }catch{} }
}, 5 * 60000).unref?.();
ipcMain.handle('lan-remote-info', () => remoteInfo());
ipcMain.handle('lan-remote-set', async (_e, on) => {
  const cfg = lanCfg(); cfg.remote = !!on; fs.writeFileSync(LAN_CFG(), JSON.stringify(cfg));
  if (on) remoteStart(); else remoteStop();
  return remoteInfo();
});
app.on('before-quit', () => { remote.quitting = true; clearTimeout(remote.timer); try{ remote.proc?.kill(); }catch{} });

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
  root = path.normalize(root); if (!libRoots().some(r => root === r || root.startsWith(r + path.sep))) throw new Error('연결하지 않은 폴더예요');   // 연결한 폴더 안의 '노벨'·'만화' 같은 하위 폴더도 된다
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
// 연결한 폴더가 있는지, 바로 아래 폴더 이름들 (종류 폴더를 나눠 연결할 때)
ipcMain.handle('lib-info', async (_e, root) => {
  root = path.normalize(root); if (!libRoots().some(r => root === r || root.startsWith(r + path.sep))) return {exists: false, dirs: []};
  try{ const ents = await fs.promises.readdir(root, { withFileTypes: true }); return {exists: true, dirs: ents.filter(d => d.isDirectory() && !d.name.startsWith('.')).map(d => d.name)}; }
  catch{ return {exists: false, dirs: []}; }
});
// 폴더가 옮겨졌으면(예: 바탕 화면 → OneDrive → D:) 같은 이름의 폴더를 찾아 새로 연결한다.
// OneDrive·문서·바탕 화면, 다른 드라이브(D: 등)의 맨 위, 구글 드라이브(G:\내 드라이브) 아래 네 단계까지만 본다.
ipcMain.handle('lib-find', async (_e, oldPath) => {
  const old = path.normalize(oldPath || ''); const name = path.basename(old); if (!name) return null;
  const home = os.homedir();
  const drives = process.platform === 'win32' ? 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => l + ':\\').filter(d => { try{ return fs.existsSync(d); }catch{ return false; } }) : [];
  const gdrive = drives.flatMap(d => ['내 드라이브', 'My Drive'].map(n => path.join(d, n))).filter(p => fs.existsSync(p));
  const bases = [...new Set([process.env.OneDrive, process.env.OneDriveConsumer, path.join(home, 'OneDrive'), path.join(home, 'Documents'), path.join(home, 'Desktop'), ...gdrive, ...drives].filter(Boolean).map(p => path.normalize(p)))];
  const skip = /^(\.|node_modules$|AppData$|\$)/;
  // 얕은 곳부터 넓게 본다(만화 회차 폴더 깊숙이 들어가지 않게). 폴더 3,000개까지만 연다.
  async function look(base){
    let level = [base], seen = 0;
    for (let depth = 0; depth <= 4 && level.length; depth++){
      const next = [];
      for (const dir of level){
        if (++seen > 3000) return null;
        let ents = []; try{ ents = await fs.promises.readdir(dir, { withFileTypes: true }); }catch{ continue; }
        const hit = ents.find(d => d.isDirectory() && d.name === name); if (hit) return path.join(dir, hit.name);
        for (const d of ents) if (d.isDirectory() && !skip.test(d.name)) next.push(path.join(dir, d.name));
      }
      level = next;
    }
    return null;
  }
  for (const b of bases){
    const found = await look(b);
    if (found && found !== old){ const roots = libRoots().filter(r => r !== old); if (!roots.includes(found)) roots.push(found); fs.writeFileSync(ROOTS(), JSON.stringify(roots)); return found; }
  }
  return null;
});
// 옮겨진 폴더를 사람이 직접 다시 고른다 (진도·메모는 폴더 이름으로 이어져서 그대로 남는다)
ipcMain.handle('lib-repick', async (_e, oldPath) => {
  const r = await dialog.showOpenDialog(win, { title: '옮긴 작품 폴더 다시 고르기', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = path.normalize(r.filePaths[0]); const roots = libRoots().filter(x => x !== path.normalize(oldPath || '')); if (!roots.includes(p)) roots.push(p); fs.writeFileSync(ROOTS(), JSON.stringify(roots));
  return p;
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
// 보안 비밀번호: 값을 주면 저장(빈 문자열이면 지움), 안 주면 저장돼 있는지만 알려 준다(값은 화면으로 돌려주지 않는다)
ipcMain.handle('gd-secret', (_e, s) => {
  if (typeof s !== 'string') return !!loadSecret();
  if (s.trim()) saveSecret(s.trim()); else { try{ fs.unlinkSync(SECRET()); }catch{} }
  return true;
});
ipcMain.handle('gd-token', async (_e, id, secret) => {
  const rt = loadRefresh(); if (!rt) return null;
  secret = gdSecretFor(secret);
  try{ const j = await tokenRequest({ client_id: id, client_secret: secret, refresh_token: rt, grant_type: 'refresh_token' }); return { token: j.access_token, expires: j.expires_in, scope: j.scope }; }
  catch(e){ if (/invalid_grant/.test(e.message)){ try{ fs.unlinkSync(TOK()); }catch{} } throw e; }
});
ipcMain.handle('gd-login', (_e, id, secret, scope) => new Promise((resolve, reject) => {
  try{ secret = gdSecretFor(secret); }catch(e){ return reject(e); }
  const verifier = crypto.randomBytes(32).toString('base64url'); const challenge = crypto.createHash('sha256').update(verifier).digest('base64url'); const state = crypto.randomBytes(12).toString('hex');
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, REDIRECT); if (u.pathname !== '/'){ res.writeHead(404); res.end(); return; }
    const done = (ok, msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<meta charset="utf-8"><body style="font:16px sans-serif;padding:40px">${ok ? '✓ Novelist에 구글 드라이브를 연결했어요. 이 창은 닫고 프로그램으로 돌아가세요. 이제 저절로 맞춰요.' : '연결하지 못했어요: ' + msg}</body>`); server.close(); };
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
    // prompt=consent: 다시 쓰는 토큰(refresh_token)을 꼭 받으려고. 계정 고르기·허용 한 번이면 끝난다
    const q = new URLSearchParams({ client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: scope || 'https://www.googleapis.com/auth/drive.appdata', include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state });
    shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q);
  });
  setTimeout(() => { server.close(); reject(new Error('timeout')); }, 5 * 60000);
}));

/* ---------- OneDrive 로그인(기본 브라우저 + http://localhost:53683) ----------
   마이크로소프트 앱 등록의 '모바일 및 데스크톱 애플리케이션'에 http://localhost 를 넣어 두면 된다. 비밀번호는 쓰지 않는다(PKCE). */
const OD_PORT = 53683, OD_REDIRECT = `http://localhost:${OD_PORT}/`, OD_AUTH = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const OD_TOK = () => path.join(app.getPath('userData'), 'od.bin');
const odSave = t => fs.writeFileSync(OD_TOK(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t));
const odLoad = () => { try{ const b = fs.readFileSync(OD_TOK()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString(); }catch{ return null; } };
async function odTokenRequest(params){
  const r = await net.fetch(OD_AUTH + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || ('token ' + r.status)); return j;
}
ipcMain.handle('od-logout', () => { try{ fs.unlinkSync(OD_TOK()); }catch{} return true; });
ipcMain.handle('od-token', async (_e, id, scope) => {
  const rt = odLoad(); if (!rt) return null;
  try{ const j = await odTokenRequest({ client_id: id, scope, refresh_token: rt, grant_type: 'refresh_token' }); if (j.refresh_token) odSave(j.refresh_token); return { token: j.access_token, expires: j.expires_in }; }
  catch(e){ if (/invalid_grant/.test(e.message)){ try{ fs.unlinkSync(OD_TOK()); }catch{} } return null; }
});
ipcMain.handle('od-login', (_e, id, scope) => new Promise((resolve, reject) => {
  const verifier = crypto.randomBytes(32).toString('base64url'); const challenge = crypto.createHash('sha256').update(verifier).digest('base64url'); const state = crypto.randomBytes(12).toString('hex');
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, OD_REDIRECT); if (u.pathname !== '/'){ res.writeHead(404); res.end(); return; }
    const done = (ok, msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<meta charset="utf-8"><body style="font:16px sans-serif;padding:40px">${ok ? '✓ Novelist에 OneDrive를 연결했어요. 이 창은 닫아도 돼요.' : '연결하지 못했어요: ' + msg}</body>`); server.close(); };
    if (u.searchParams.get('state') !== state){ done(false, 'state'); return reject(new Error('state')); }
    if (u.searchParams.get('error')){ done(false, u.searchParams.get('error_description') || u.searchParams.get('error')); return reject(new Error(u.searchParams.get('error'))); }
    try{
      const j = await odTokenRequest({ client_id: id, scope, code: u.searchParams.get('code'), redirect_uri: OD_REDIRECT, grant_type: 'authorization_code', code_verifier: verifier });
      if (j.refresh_token) odSave(j.refresh_token);
      done(true); if (win){ if (win.isMinimized()) win.restore(); win.focus(); }
      resolve({ token: j.access_token, expires: j.expires_in });
    }catch(e){ done(false, e.message); reject(e); }
  });
  server.on('error', reject);
  server.listen(OD_PORT, '127.0.0.1', () => {
    const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: OD_REDIRECT, scope, code_challenge: challenge, code_challenge_method: 'S256', state, response_mode: 'query' });
    shell.openExternal(OD_AUTH + '/authorize?' + q);
  });
  setTimeout(() => { server.close(); reject(new Error('timeout')); }, 5 * 60000);
}));
