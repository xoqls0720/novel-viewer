// 같은 와이파이로 보여 주기: 진짜 서버를 켜고, 아이패드처럼 주소만 열어 서재가 보이는지 본다
const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data');
const { createLanServer } = require(path.join(ROOT, 'desktop', 'lan-server.js'));

(async () => {
  const fs = require('fs'), http = require('http');
  // '성인' 아래 폴더(이름이 같아도 섞이지 않게 '성인/만화'), 영상 파일
  const ADULT = path.join(__dirname, 'out', 'lan-data', '성인', '만화'); fs.mkdirSync(path.join(ADULT, 'artistZ'), {recursive: true});
  fs.writeFileSync(path.join(ADULT, 'artistZ', 'clip.mp4'), Buffer.alloc(5000, 7));
  // 가짜 번역 엔진·가짜 모아받기 (처음엔 꺼져 있다가 start() 로 켜진다)
  const listen = (handler) => new Promise(ok => { const sv = http.createServer(handler); sv.listen(0, '127.0.0.1', () => ok(sv)); });
  let trBody = null, trStarted = 0, moaSeen = null, moaStarted = 0;
  const trPort = await listen(() => {}).then(sv => { const pt = sv.address().port; sv.close(); return pt; });
  const moaPort = await listen(() => {}).then(sv => { const pt = sv.address().port; sv.close(); return pt; });
  const servers = [];
  const tr = {port: trPort, start: async () => { trStarted++; servers.push(await new Promise(ok => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { if (q.url.startsWith('/video')) trBody = JSON.parse(b); r.writeHead(200, {'content-type': 'application/json'}); r.end(JSON.stringify(q.url.startsWith('/health') ? {ok: true, ollama: true} : {id: 'v9'})); }); }); sv.listen(trPort, '127.0.0.1', () => ok(sv)); })); }};
  const moa = {port: moaPort, start: async () => { moaStarted++; servers.push(await new Promise(ok => { const sv = http.createServer((q, r) => { moaSeen = {url: q.url, origin: q.headers.origin || '', host: q.headers.host}; if (q.url === '/'){ r.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); return r.end(`<link rel="icon" href="/icon.ico"><script>fetch('/api/state'); new EventSource("/api/events")</script>`); } if (q.url === '/api/events'){ r.writeHead(200, {'content-type': 'text/event-stream'}); r.write('event: state\ndata: {"jobs":2}\n\n'); setTimeout(() => r.write('event: job\ndata: {"id":7}\n\n'), 300); return; } r.writeHead(200, {'content-type': 'application/json'}); r.end('{"ok":true}'); }); sv.listen(moaPort, '127.0.0.1', () => ok(sv)); })); }};
  // PC로 맞추기 칸 (시험: 메모리)
  const mem = new Map(); let syncNotes = 0;
  const memStore = {list: () => [...mem].map(([name, v]) => ({name, mtime: v.t})), get: n => mem.get(n)?.b || null, put: (n, b) => mem.set(n, {b, t: Date.now()}), del: n => mem.delete(n)};
  const lan = createLanServer({appDir: ROOT, roots: [path.join(DATA, 'vt2', 'novel'), path.join(DATA, 'vt2', 'webtoon'), ADULT], token: 'tok123', port: 0, tr, apps: () => ({moa}), sync: memStore, onSync: () => syncNotes++, trPages: {get: k => k === '만화/a|1화|001.jpg' ? JSON.stringify({image: 'AAA', blocks: []}) : null, has: ks => ks.map(k => k === '만화/a|1화|001.jpg')}});
  const port = await lan.start();
  const base = `http://127.0.0.1:${port}/t/tok123/`;
  console.log('urls have token:', lan.urls().every(u => u.includes('/t/tok123/')));

  // 열쇠가 틀리면 403, 폴더 밖은 404
  const code = async u => (await fetch(u).catch(() => ({status: 0}))).status;
  const tok = `http://127.0.0.1:${port}/t/tok123/`;
  const scanned = await (await fetch(tok + 'lan/scan')).json();
  console.log('adult rel:', scanned.filter(f => f.rel.startsWith('성인/')).map(f => f.rel).join(','));
  const vr = await fetch(tok + 'lan/file?p=' + encodeURIComponent('성인/만화/artistZ/clip.mp4'), {headers: {Range: 'bytes=100-199'}});
  console.log('range:', vr.status, vr.headers.get('content-range'), (await vr.arrayBuffer()).byteLength, vr.headers.get('content-type'));
  const tj = await (await fetch(tok + 'tr/video', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: 'lan:성인/만화/artistZ/clip.mp4'})})).json();
  console.log('tr proxy: started', trStarted, '| id', tj.id, '| abs path', trBody && trBody.path === path.join(ADULT, 'artistZ', 'clip.mp4'));
  const page = await (await fetch(tok + 'moa/')).text();
  console.log('moa proxy: started', moaStarted, '| rewritten', page.includes("fetch('api/state')") && page.includes('EventSource("api/events")') && page.includes('href="icon.ico"'));
  await fetch(tok + 'moa/api/download', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'http://192.168.0.9:8787'}, body: '{}'});
  console.log('moa api:', moaSeen.url, '| origin stripped', moaSeen.origin === '', '| host', moaSeen.host === `127.0.0.1:${moaPort}`);
  console.log('info:', JSON.stringify(await (await fetch(tok + 'lan/info')).json()));
  // 터널로 온 손님(cloudflared 가 붙이는 머리말): 다운로더 화면에 묻기 방식이 끼워지고, 이벤트가 묻는 대로 온다
  const viaCf = {'cf-connecting-ip': '203.0.113.9', 'cf-ray': 'x'};
  const tunnelPage = await (await fetch(tok + 'moa/', {headers: viaCf})).text();
  const p1 = await (await fetch(tok + 'moa/api/events?__poll=1&cid=c1&since=0', {headers: viaCf})).json();
  const p2 = await (await fetch(tok + 'moa/api/events?__poll=1&cid=c1&since=' + p1.events.at(-1).id, {headers: viaCf})).json();
  console.log('tunnel shim:', tunnelPage.includes('window.EventSource=P'), '| lan page plain:', !page.includes('window.EventSource=P'), '| poll:', [...p1.events, ...p2.events].map(e => e.event).join(','));
  { const L2 = createLanServer({appDir: ROOT, roots: [], token: 'k', port: 0}); const p2 = await L2.start(); let last = 0; for (let i = 0; i < 21; i++) last = (await fetch(`http://127.0.0.1:${p2}/t/nope/`)).status; const ok = (await fetch(`http://127.0.0.1:${p2}/t/k/lan/info`)).status; console.log('lockout:', last, ok);
    // Funnel·터널로 들어온 손님은 X-Forwarded-For 로 구분: 남이 막혀도 내 폰은 열린다
    let fl = 0; for (let i = 0; i < 21; i++) fl = (await fetch(`http://127.0.0.1:${p2}/t/nope/`, {headers: {'X-Forwarded-For': '198.51.100.7'}})).status;
    const mine = (await fetch(`http://127.0.0.1:${p2}/t/k/lan/info`, {headers: {'X-Forwarded-For': '203.0.113.20'}})).status;
    const bad = (await fetch(`http://127.0.0.1:${p2}/t/k/lan/info`, {headers: {'X-Forwarded-For': '198.51.100.7'}})).status;
    console.log('funnel lockout:', fl, mine, bad); await L2.stop(); }
  console.log('wrong token:', await code(`http://127.0.0.1:${port}/t/nope/`), '| escape blocked:', await code(base + 'lan/file?p=' + encodeURIComponent('novel/../../sw.js')));

  // 아이패드(사파리 흉내): 주소만 열면 서재가 보이고, 회차도 읽힌다
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 820, height: 1180}, hasTouch: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base); await p.waitForTimeout(2500);
  console.log('guest works:', (await p.$$eval('#lib .grid .card .t', e => e.map(x => x.textContent))).sort().join(','));
  console.log('guest hides add buttons:', await p.$eval('#lpActs', el => getComputedStyle(el).display) === 'none');
  await p.tap('.grid .card:has-text("hwasan")'); await p.waitForTimeout(1500);
  console.log('guest novel text:', /청명|거기 서라/.test(await p.textContent('#reader')));
  await p.evaluate(() => nvGo('lib')); await p.tap('.grid .card:has-text("misaeng")'); await p.waitForTimeout(2000);
  console.log('guest webtoon imgs:', await p.$$eval('#reader .webtoon img', e => e.length));
  // 다시 열어도(새로 고침) 저절로 다시 불러온다
  await p.reload(); await p.waitForTimeout(2500);
  console.log('guest reload works:', (await p.$$eval('#lib .grid .card', e => e.length)) >= 3);
  const tc1 = await fetch(tok + 'lan/trcache?k=' + encodeURIComponent('만화/a|1화|001.jpg')).then(r => r.json());
  const tc2 = await fetch(tok + 'lan/trcache', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({keys: ['만화/a|1화|001.jpg', 'x']})}).then(r => r.json());
  console.log('trcache:', tc1.image, JSON.stringify(tc2), (await fetch(tok + 'lan/trcache?k=none')).status);
  // PC로 맞추기: 폰 A 가 쓴 메모·번역 AI 키·형광펜이 PC 를 거쳐 폰 B 에 온다
  const ctxA = await b.newContext(), ctxB = await b.newContext();
  const pa = await ctxA.newPage(), pb = await ctxB.newPage(); pa.on('pageerror', e => errs.push('A ' + e.message)); pb.on('pageerror', e => errs.push('B ' + e.message));
  await pa.goto(base); await pb.goto(base); await pa.waitForTimeout(2500); await pb.waitForTimeout(500);
  await pa.evaluate(async () => { const store = window.nvStore; store.set('wIn', '폰에서 쓴 메모'); store.set('tr.key.deepl', 'dk-test-1'); store.set('notes.test', [{id: 'n1', t: Date.now(), text: '형광펜'}]); await window.nvPcSync(); });
  await pb.evaluate(async () => { await window.nvPcSync(); });
  console.log('pc sync:', await pb.evaluate(() => { const store = window.nvStore; return [store.get('wIn', ''), store.get('tr.key.deepl', ''), (store.get('notes.test', []) || []).map(x => x.text).join(',')].join(' | '); }), '| files', mem.has('state.json') && mem.has('keys.json'), '| notified', syncNotes > 0);
  console.log('pc sync box:', await pb.evaluate(() => !document.querySelector('#pcSyncBox').hidden && /PC와 맞춤/.test(document.querySelector('#pcSyncStat').textContent)));
  await ctxA.close(); await ctxB.close();
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close(); await lan.stop(); servers.forEach(sv => sv.close());
})();
