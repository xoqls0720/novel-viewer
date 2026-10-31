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
// 다운로더: OneDrive/문서/다운로더 (토끼 설정 saveDir = 문서/novel). 갤러리는 아직 없다
const dl = path.join(one, '문서', '다운로더'); fs.mkdirSync(path.join(dl, 'tokiDownloader', 'app'), {recursive: true}); fs.mkdirSync(path.join(dl, 'moaDownloader'), {recursive: true});
fs.writeFileSync(path.join(dl, 'tokiDownloader', 'app', 'server.cjs'), ''); fs.writeFileSync(path.join(dl, 'moaDownloader', 'server.cjs'), '');
fs.writeFileSync(path.join(dl, 'tokiDownloader', 'settings.json'), JSON.stringify({saveDir: path.join(one, '문서', 'novel')}));
fs.mkdirSync(path.join(one, '문서', 'novel', '성인', '만화'), {recursive: true});
// 가짜 터널 프로그램: 주소만 찍고 기다린다 (진짜 터널은 열지 않는다)
const fakeCf = path.join(tmp, 'fakecf.js'); fs.writeFileSync(fakeCf, "process.stderr.write('INF |  https://abc-def-ghi.trycloudflare.com  |\\n'); setInterval(() => {}, 1000);");
process.env.NOVELIST_CF_BIN = process.execPath; process.env.NOVELIST_CF_PRE = fakeCf; process.env.NOVELIST_LAN_PORT = '0';
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
  const dlf = await H['lib-dl-folders']();
  console.log('dl folders:', dlf.dirs.map(d => path.basename(d)).sort().join(','));
  const linked = await H['lib-dl-link'](null, path.join(one, '문서', 'novel', '성인'));
  console.log('dl link:', !!linked, '| outside refused:', await H['lib-dl-link'](null, tmp));
  // PC로 맞추기 칸: 쓰고 읽고 목록에 나오고 지워진다. 경로를 벗어나는 이름은 막는다
  await H['pcsync-put'](null, 'state.json', new TextEncoder().encode('{"ok":1}'));
  await H['pcsync-put'](null, 'txt-작품_1화?.txt', new TextEncoder().encode('원고'));
  const pl = (await H['pcsync-list']()).map(f => f.name).sort().join(',');
  const pg = Buffer.from(await H['pcsync-get'](null, 'txt-작품_1화?.txt')).toString();
  let escBlocked = false; try{ await H['pcsync-put'](null, '../evil', new Uint8Array(1)); }catch{ escBlocked = true; }
  await H['pcsync-del'](null, 'state.json');
  console.log('pcsync:', pl, '|', pg, '| escape blocked', escBlocked, '| after del', (await H['pcsync-list']()).length);
  // 구글 보안 비밀번호: 이 PC에만 저장되고, 값은 화면으로 돌려주지 않는다. 없으면 로그인 창을 열기 전에 'nosecret'
  let ns = ''; try{ await H['gd-login'](null, 'cid', '', 'scope'); }catch(e){ ns = e.message; }
  const had = await H['gd-secret'](null); await H['gd-secret'](null, 'GOCSPX-test');
  console.log('gd secret: nosecret', ns === 'nosecret', '| before', had, '| after', await H['gd-secret'](null), '| file', fs.existsSync(path.join(userData, 'gd-secret.bin')), '| token without login', await H['gd-token'](null, 'cid', ''));
  // 어디서나 열기: 켜면 가짜 터널의 주소를 읽고, 끄면 닫는다
  let st = await H['lan-remote-set'](null, true);
  for (let i = 0; i < 40 && !(await H['lan-remote-info']()).url; i++) await new Promise(r => setTimeout(r, 100));
  st = await H['lan-remote-info']();
  console.log('remote err:', st.err); console.log('remote on:', st.state, /^https:\/\/abc-def-ghi\.trycloudflare\.com\/t\/[0-9a-f]{32}\/$/.test(st.url));
  st = await H['lan-remote-set'](null, false);
  console.log('remote off:', st.state, st.url === '');
  await new Promise(r => setTimeout(r, 300));
  fs.rmSync(tmp, {recursive: true, force: true});
  process.exit(0);
})();
