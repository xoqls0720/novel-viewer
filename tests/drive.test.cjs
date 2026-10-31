// 구글 드라이브 작품 폴더 연결: https 가짜 주소로 앱을 띄우고, 구글 로그인·드라이브 API를 흉내 낸다
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1300,height:900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
  let scopes = '';
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({status: 200, contentType: 'text/javascript', body: `window.google = {accounts: {oauth2: {initTokenClient: o => ({requestAccessToken: () => { window.__scope = o.scope; setTimeout(() => o.callback({access_token: 'tok', expires_in: 3600}), 10); }})}}};`}));
  // 가짜 드라이브: 내 드라이브 / 노벨 / 화산귀환 / 0001.txt, 0002.txt  ·  웹툰 / 미생 / 0001 / 01.png
  const D = {root: [{id: 'F1', name: '노벨', mimeType: 'application/vnd.google-apps.folder'}, {id: 'F9', name: '웹툰', mimeType: 'application/vnd.google-apps.folder'}],
    F1: [{id: 'F2', name: '화산귀환', mimeType: 'application/vnd.google-apps.folder'}, {id: 'D1', name: '메모', mimeType: 'application/vnd.google-apps.document'}],
    F2: [{id: 'T1', name: '0001 ep.txt', mimeType: 'text/plain', size: '40', modifiedTime: '2026-10-01T00:00:00Z'}, {id: 'T2', name: '0002 ep.txt', mimeType: 'text/plain', size: '40', modifiedTime: '2026-10-01T00:00:00Z'}]};
  const MEDIA = {T1: '“거기 서라.”\n\n드라이브에서 온 1화.', T2: '드라이브에서 온 2화.'}; let mediaHits = 0, online = true, folderQs = 0;
  await ctx.route('https://www.googleapis.com/drive/v3/files**', r => {
    if (!online) return r.abort();
    const u = new URL(r.request().url()); const auth = r.request().headers()['authorization'];
    if (auth !== 'Bearer tok') return r.fulfill({status: 401, body: '{}'});
    const m = u.pathname.match(/files\/(\w+)$/);
    if (m && u.searchParams.get('alt') === 'media'){ mediaHits++; return r.fulfill({status: 200, contentType: 'text/plain', body: MEDIA[m[1]]}); }
    const q = u.searchParams.get('q') || ''; if (!q.includes(' in parents') && !q.includes('sharedWithMe')) return r.fulfill({status: 200, contentType: 'application/json', body: '{"files":[]}'});
    // 폴더 여러 개를 한 번에 물어도 (parents 로 어느 폴더 것인지 알려 준다)
    const ids = [...q.matchAll(/'(\w+)' in parents/g)].map(m => m[1]); folderQs++;
    let files = ids.flatMap(id => (D[id] || []).map(f => ({...f, parents: [id]}))); if (q.includes("mimeType='application/vnd.google-apps.folder'")) files = files.filter(f => f.mimeType.endsWith('folder'));
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({files})});
  });
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem('nv.gd.client', JSON.stringify('x.apps.googleusercontent.com')); localStorage.setItem('nv.set.stStart', 'false'); });
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#btnLink'); await p.click('#srcDrive'); await p.waitForTimeout(600);
  console.log('scope asked:', await p.evaluate(() => window.__scope));
  console.log('root folders:', await p.$$eval('#drvList .it', e => e.map(x => x.textContent)));
  await p.click('#drvList .it:has-text("노벨")'); await p.waitForTimeout(400); console.log('path:', await p.textContent('#drvPath'));
  await p.click('#drvPick'); await p.waitForTimeout(1500);
  console.log('sources:', await p.$$eval('#srcList .src b', e => e.map(x => x.textContent)), '| status:', await p.textContent('#srcList .st'));
  await p.keyboard.press('Escape');
  console.log('works:', await p.$$eval('.grid .card .t', e => e.map(x => x.textContent)));
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("화산귀환")'); await p.waitForTimeout(1200);
  console.log('ep text:', (await p.textContent('#reader .novel')).includes('드라이브에서 온 1화'), '| media hits:', mediaHits);
  // 다시 켜면(인터넷 없이) 목록·받은 화가 그대로
  online = false; await p.reload(); await p.waitForTimeout(1800);
  console.log('offline works:', await p.$$eval('.grid .card .t', e => e.map(x => x.textContent)));
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("화산귀환")'); await p.waitForTimeout(1200);
  console.log('offline ep text:', (await p.textContent('#reader .novel')).includes('드라이브에서 온 1화'));
  console.log('sync keeps lib out:', await p.evaluate(() => !/^(apiKey|gemKey|grKey|olOk|__ts|theme|spent|st\.bk\.|lib\.)/.test('lib.sources') ? 'no' : 'yes'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
