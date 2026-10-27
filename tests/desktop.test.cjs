// 윈도우 프로그램(main.js)의 작품 폴더 처리: 옮겨진 폴더 찾기, 하위 종류 폴더 허용 — electron 을 가짜로 바꿔 끼워 시험한다
const Module = require('module'); const path = require('path'); const fs = require('fs'); const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nvdesk-')); const userData = path.join(tmp, 'userData'); fs.mkdirSync(userData);
const H = {};
const fake = { app: { requestSingleInstanceLock: () => true, quit(){}, on(){}, whenReady: () => new Promise(() => {}), getPath: () => userData, getVersion: () => '0' },
  BrowserWindow: function(){}, protocol: { registerSchemesAsPrivileged(){}, handle(){} }, net: {}, shell: {}, ipcMain: { handle: (k, f) => { H[k] = f; } },
  Menu: { setApplicationMenu(){}, buildFromTemplate: () => ({}) }, safeStorage: { isEncryptionAvailable: () => false }, dialog: {} };
const load = Module._load; Module._load = function(req, ...a){ return req === 'electron' ? fake : load.call(this, req, ...a); };
// 예전 자리: 바탕 화면\노벨 (지금은 없음) → 새 자리: OneDrive\문서\novel\노벨
const one = path.join(tmp, 'OneDrive'); const newNovel = path.join(one, '문서', 'novel', '노벨'); fs.mkdirSync(path.join(newNovel, '화산'), {recursive: true});
fs.writeFileSync(path.join(newNovel, '화산', '0001 1화.txt'), '청명');
fs.mkdirSync(path.join(one, '문서', 'novel', '만화'), {recursive: true});
const oldNovel = path.join(tmp, 'Desktop', '노벨');
fs.writeFileSync(path.join(userData, 'library-roots.json'), JSON.stringify([oldNovel, path.join(one, '문서', 'novel')]));
process.env.OneDrive = one; process.env.OneDriveConsumer = '';
require(path.resolve(__dirname, '..', 'desktop', 'main.js'));
(async () => {
  console.log('handlers:', ['lib-info', 'lib-find', 'lib-repick', 'od-login', 'od-token', 'od-logout'].every(k => H[k]));
  console.log('old exists:', (await H['lib-info'](null, oldNovel)).exists);
  const found = await H['lib-find'](null, oldNovel);
  console.log('found:', found === newNovel, '| roots:', JSON.parse(fs.readFileSync(path.join(userData, 'library-roots.json'), 'utf8')).map(r => path.relative(tmp, r)).join(' , '));
  const info = await H['lib-info'](null, path.join(one, '문서', 'novel'));
  console.log('kind dirs:', info.dirs.sort().join(','));
  const scan = await H['lib-scan'](null, path.join(one, '문서', 'novel', '만화'));
  console.log('sub-folder scan allowed:', Array.isArray(scan));
  let blocked = false; try{ await H['lib-scan'](null, tmp); }catch{ blocked = true; }
  console.log('outside blocked:', blocked);
  console.log('missing not found:', await H['lib-find'](null, path.join(tmp, 'Desktop', '없는폴더')));
  fs.rmSync(tmp, {recursive: true, force: true});
})();
