// OneDrive: 가짜 마이크로소프트 로그인·가짜 OneDrive 로 두 기기(A=컴퓨터 브라우저, B=아이패드)를 맞추고, OneDrive 작품 폴더를 연결한다
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const http = require('http');
const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data');

// 앱은 localhost 로 띄운다(마이크로소프트 로그인은 https 나 localhost 에서만 돌아온다)
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'}); fs.createReadStream(f).pipe(res);
});

// 가짜 OneDrive
const APPROOT = new Map();   // 이름 → {id, body(Buffer)}
let nid = 1; const newId = () => 'I' + (nid++);
const TREE = {id: 'root', name: 'root', kids: []};
const mkdir = (parent, name) => { const d = {id: newId(), name, kids: [], parent}; parent.kids.push(d); return d; };
const mkfile = (parent, name, body) => { const f = {id: newId(), name, body, parent, file: true}; parent.kids.push(f); return f; };
const BYID = new Map();
function buildTree(){
  const docs = mkdir(TREE, '문서'); const novel = mkdir(docs, 'novel');
  const nv = mkdir(novel, '노벨'); const hw = mkdir(nv, '화산');
  for (let i = 1; i <= 3; i++) mkfile(hw, `${String(i).padStart(4, '0')} ${i}화.txt`, Buffer.from(`청명이 돌아왔다 ${i}.\n\n“거기 서라.”\n\n바람이 불었다.`));
  const wt = mkdir(novel, '웹툰'); const ms = mkdir(wt, '미생'); const ep = mkdir(ms, '0001 1화');
  const png = fs.readFileSync(path.join(DATA, 'vt2', 'webtoon', 'misaeng', '0001 ep', '001.png'));
  for (let k = 1; k <= 25; k++) mkfile(ep, `${String(k).padStart(3, '0')}.png`, png);
  mkdir(novel, '메모');
  const walk = n => { BYID.set(n.id, n); (n.kids || []).forEach(walk); }; walk(TREE);
}
buildTree();
const item = n => ({id: n.id, name: n.name, size: n.body?.length || 0, lastModifiedDateTime: '2026-10-01T00:00:00Z', parentReference: n.parent ? {id: n.parent.id} : undefined, ...(n.file ? {file: {}} : {folder: {childCount: n.kids.length}})});
const stats = {token: 0, refresh: 0, puts: 0, batch: 0, batchItems: 0, downloads: 0, delta: 0, auth: []};

async function mockRoutes(ctx){
  await ctx.route('https://login.microsoftonline.com/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/authorize')){
      stats.auth.push(u.searchParams.get('prompt') || 'login');
      const back = new URL(u.searchParams.get('redirect_uri')); back.searchParams.set('code', 'CODE-' + Date.now()); back.searchParams.set('state', u.searchParams.get('state'));
      if (!u.searchParams.get('code_challenge')) return r.fulfill({status: 400, body: 'no pkce'});
      return r.fulfill({status: 302, headers: {location: back.toString()}});
    }
    if (u.pathname.endsWith('/token')){
      const body = new URLSearchParams(r.request().postData());
      if (body.get('grant_type') === 'refresh_token') stats.refresh++; else stats.token++;
      const ok = body.get('client_id') === 'test-client' && (body.get('grant_type') === 'refresh_token' || body.get('code_verifier'));
      return r.fulfill({status: ok ? 200 : 400, headers: {'access-control-allow-origin': '*', 'content-type': 'application/json'}, body: JSON.stringify(ok ? {access_token: 'AT', refresh_token: 'RT' + Date.now(), expires_in: 3600} : {error: 'invalid_request'})});
    }
    r.fulfill({status: 404});
  });
  await ctx.route('https://dl.example/**', async r => { stats.downloads++; const id = new URL(r.request().url()).pathname.slice(1); const n = BYID.get(id) || [...APPROOT.values()].find(v => v.id === id); r.fulfill({status: n ? 200 : 404, headers: {'access-control-allow-origin': '*'}, body: n?.body || ''}); });
  await ctx.route('https://graph.microsoft.com/**', async r => {
    const req = r.request(); const u = new URL(req.url()); const p = decodeURIComponent(u.pathname.replace('/v1.0', '')); const m = req.method();
    const J = (o, s = 200) => r.fulfill({status: s, headers: {'access-control-allow-origin': '*', 'content-type': 'application/json'}, body: JSON.stringify(o)});
    if (req.headers()['authorization'] !== 'Bearer AT') return J({error: 'auth'}, 401);
    if (p === '/me/drive/special/approot/children') return J({value: [...APPROOT].map(([name, v]) => ({id: v.id, name, size: v.body.length, file: {}}))});
    let mm = p.match(/^\/me\/drive\/special\/approot:\/(.+):\/content$/);
    if (mm && m === 'PUT'){ stats.puts++; const name = mm[1]; const v = APPROOT.get(name) || {id: newId()}; v.body = req.postDataBuffer() || Buffer.alloc(0); APPROOT.set(name, v); return J({id: v.id, name}); }
    if (p === '/$batch'){ const b = JSON.parse(req.postData()); stats.batch++; stats.batchItems += b.requests.length; return J({responses: b.requests.map(q => ({id: q.id, status: 200, body: {id: q.url.split('/')[4].split('?')[0], '@microsoft.graph.downloadUrl': 'https://dl.example/' + q.url.split('/')[4].split('?')[0]}}))}); }
    mm = p.match(/^\/me\/drive\/items\/([^/]+)$/);
    if (mm && m === 'GET') return J({id: mm[1], '@microsoft.graph.downloadUrl': 'https://dl.example/' + mm[1]});
    if (mm && m === 'DELETE'){ for (const [k, v] of APPROOT) if (v.id === mm[1]) APPROOT.delete(k); return r.fulfill({status: 204, headers: {'access-control-allow-origin': '*'}}); }
    if (p === '/me/drive/root/children') return J({value: TREE.kids.map(item)});
    mm = p.match(/^\/me\/drive\/items\/([^/]+)\/children$/); if (mm) return J({value: (BYID.get(mm[1])?.kids || []).map(item)});
    mm = p.match(/^\/me\/drive\/items\/([^/]+)\/delta$/);
    if (mm){ stats.delta++; const all = []; const walk = n => { all.push(item(n)); (n.kids || []).forEach(walk); }; walk(BYID.get(mm[1]));
      const pg = +(u.searchParams.get('pg') || 0); const part = all.slice(pg * 20, pg * 20 + 20);
      return J({value: part, ...(pg * 20 + 20 < all.length ? {'@odata.nextLink': `https://graph.microsoft.com/v1.0/me/drive/items/${mm[1]}/delta?pg=${pg + 1}`} : {'@odata.deltaLink': 'x'})}); }
    J({error: 'unknown ' + p}, 404);
  });
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const APP = `http://localhost:${server.address().port}/`;
  const b = await chromium.launch(); const errs = [];
  const device = async (name, vp) => {
    const ctx = await b.newContext({viewport: vp}); await mockRoutes(ctx); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(name + ' ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::|404/.test(m.text()) && errs.push(name + ' console ' + m.text()));
    p.on('dialog', d => d.accept());
    await p.addInitScript(() => { if (!localStorage.getItem('nv.od.client')) localStorage.setItem('nv.od.client', JSON.stringify('test-client')); localStorage.setItem('nv.set.coach', 'true'); });
    await p.goto(APP); await p.waitForTimeout(800); return p;
  };
  // ---- A: 컴퓨터 브라우저 ----
  const A = await device('A', {width: 1400, height: 900});
  await A.click('#tgTool'); await A.click('.tabs [data-tab=set]'); await A.waitForTimeout(200);
  console.log('A before:', await A.textContent('#odStatus'), '| connect shown:', await A.isVisible('#odConnect'));
  await Promise.all([A.waitForURL(u => !/code=/.test(u.toString()) && /localhost/.test(u.toString()), {timeout: 15000}).catch(() => {}), A.click('#odConnect')]);
  await A.waitForTimeout(2500);
  console.log('A linked:', await A.evaluate(() => !!localStorage.getItem('nvod.rt')), '| url clean:', !/code=/.test(A.url()), '| backend:', await A.evaluate(() => localStorage.getItem('nv.sync.backend')), '| token reqs:', stats.token);
  console.log('A state uploaded:', APPROOT.has('state.json'));
  // A 에서 작품을 읽고, 떠오른 문장 하나 남기고 맞춘다
  await A.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await A.waitForTimeout(800);
  await A.evaluate(() => nvGo('lib')); await A.click('.grid .card:has-text("hwasan")'); await A.waitForTimeout(600);
  await A.click('#epBtn'); await A.click('#epList .it >> nth=2'); await A.waitForTimeout(500);
  await A.click('#tgTool').catch(() => {}); await A.evaluate(() => { document.querySelector('.tabs [data-tab=notes]').click(); });
  await A.fill('#ideaIn', '검은 눈이 내리는 성문 #장면'); await A.click('#ideaAdd'); await A.waitForTimeout(300);
  // 필사도 함께 맞춰지는지: 한 줄 쓰고 동기화
  await A.keyboard.press('Escape'); await A.click('#btnQuick'); await A.waitForTimeout(250); await A.click('#fsOpen'); await A.waitForTimeout(400);
  await A.fill('#fsText', '청명은 고개를 들었다.'); await A.waitForTimeout(1300); await A.keyboard.press('Escape'); await A.waitForTimeout(200);
  await A.click('#tgTool').catch(() => {});
  await A.evaluate(() => { document.querySelector('.tabs [data-tab=set]').click(); }); await A.click('#odNow'); await A.waitForTimeout(2500);
  const st = JSON.parse(APPROOT.get('state.json').body.toString());
  console.log('A synced idea:', /검은 눈/.test(st.ls.ideas || ''), '| pos in state:', !!st.ls['pos.소설/hwasan'], '| no token in state:', !JSON.stringify(st).includes('RT'), '| device-only kept out:', !('od.client' in st.ls) && !('sync.backend' in st.ls));
  const odNames = [...APPROOT.keys()];
  console.log('fisa synced:', odNames.some(n => /^txt-fs_/.test(n)), '| no bad chars:', odNames.every(n => !/[:\\/]/.test(n)));
  console.log('A status:', await A.textContent('#odStatus'));
  // ---- B: 아이패드 (같은 계정) ----
  const B = await device('B', {width: 820, height: 1180});
  await B.click('#tgTool'); await B.click('.tabs [data-tab=set]'); await B.waitForTimeout(200);
  await B.click('#odConnect'); await B.waitForTimeout(3000);
  console.log('B got fisa:', await B.evaluate(() => nvTxtGet('fs:소설/hwasan:2')));
  console.log('B got idea:', await B.evaluate(() => (JSON.parse(localStorage.getItem('nv.ideas') || '[]')[0] || {}).text), '| B pos:', await B.evaluate(() => JSON.parse(localStorage.getItem('nv.pos.소설/hwasan') || 'null')?.ep));
  // B: OneDrive 작품 폴더 연결 — '문서/novel' 을 고르면 노벨·웹툰이 따로 연결된다(메모 폴더는 빠진다)
  await B.click('#toolClose').catch(() => {}); await B.click('#gnav [data-g=lib]'); await B.waitForTimeout(200); await B.click('#btnLink'); await B.waitForTimeout(200);
  await B.click('#srcOd'); await B.waitForTimeout(800);
  console.log('B browse root:', await B.$$eval('#drvList .it span', e => e.map(x => x.textContent)));
  await B.click('#drvList .it:has-text("문서")'); await B.waitForTimeout(400); await B.click('#drvList .it:has-text("novel")'); await B.waitForTimeout(400);
  console.log('B path:', await B.textContent('#drvPath'));
  await B.click('#drvPick'); await B.waitForTimeout(3000);
  const srcs = await B.evaluate(() => JSON.parse(localStorage.getItem('nv.lib.sources') || '[]').map(s => s.kind + ':' + s.name));
  console.log('B sources:', srcs, '| delta calls:', stats.delta);
  await B.click('#linkClose').catch(() => {}); await B.click('#tgSide').catch(() => {}); await B.waitForTimeout(300);
  const names = await B.$$eval('#lib .grid .card .t', e => e.map(x => x.textContent));
  console.log('B works:', names.sort());
  await B.evaluate(() => { const c = [...document.querySelectorAll('#lib .grid .card')].find(x => x.textContent.includes('화산')); c.click(); }); await B.waitForTimeout(1200);
  console.log('B novel text:', /청명이 돌아왔다/.test(await B.textContent('#reader')), '| ep:', await B.textContent('#epTitle'));
  stats.downloads = 0; stats.batch = 0; stats.batchItems = 0;
  await B.evaluate(() => { const c = [...document.querySelectorAll('#lib .grid .card')].find(x => x.textContent.includes('미생')); c.click(); }); await B.waitForTimeout(2500);
  console.log('B webtoon imgs:', await B.$$eval('#reader .webtoon img', e => e.length), '| batched:', stats.batch, 'batches for', stats.batchItems, 'urls | downloads:', stats.downloads);
  // B 를 다시 켜면(웹은 다시 쓰는 토큰으로) 로그인 창 없이 맞춘다
  const before = stats.auth.length; await B.reload(); await B.waitForTimeout(4500);
  console.log('B reload: refresh used', stats.refresh > 0, '| new login page:', stats.auth.length - before, '| works after reload:', (await B.$$eval('#lib .grid .card', e => e.length)) >= 2);
  // 연결 끊기
  await B.click('#tgTool').catch(() => {}); await B.evaluate(() => document.querySelector('.tabs [data-tab=set]').click()); await B.click('#odOut'); await B.waitForTimeout(300);
  console.log('B logout:', await B.evaluate(() => !localStorage.getItem('nvod.rt')), await B.isVisible('#odConnect'));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close(); server.close();
})();
