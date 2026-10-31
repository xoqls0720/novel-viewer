// 구글로 시작하기: 새 브라우저에서 단추 한 번 → 맞추기. 다시 켜면 저절로, 토큰이 끝나면 다음 누름 때 조용히 다시 받는다
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1300, height: 900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const CID = (html.match(/const GD_CLIENT_ID = '([^']*)'/) || [])[1] || '';
  await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
  // 가짜 구글 로그인: 부를 때마다 새 토큰. 몇 번, 어떤 prompt 로, 누름 안에서 불렸는지 적어 둔다
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({status: 200, contentType: 'text/javascript', body: `window.__asks = []; window.google = {accounts: {oauth2: {initTokenClient: o => ({requestAccessToken: q => { window.__asks.push({prompt: q.prompt, id: o.client_id, act: !!navigator.userActivation?.isActive}); const n = window.__asks.length; setTimeout(() => o.callback({access_token: 'tok' + Date.now() + n, expires_in: 3600}), 10); }})}}};`}));
  // 가짜 앱 전용 드라이브 칸
  const DB = new Map(); let seq = 0, lists = 0; const dead = new Set();
  await ctx.route('https://www.googleapis.com/**', async r => {
    const rq = r.request(); const u = new URL(rq.url()); const m = u.pathname.match(/files\/(\w+)$/); const j = (o, s = 200) => r.fulfill({status: s, contentType: 'application/json', body: JSON.stringify(o)});
    const tok = (rq.headers()['authorization'] || '').replace('Bearer ', ''); if (!/^tok\d+$/.test(tok) || dead.has(tok)) return j({}, 401);
    if (rq.method() === 'GET' && !m){ lists++; return j({files: [...DB.values()].map(f => ({id: f.id, name: f.name, modifiedTime: f.mt}))}); }
    if (rq.method() === 'GET' && m){ const f = [...DB.values()].find(x => x.id === m[1]); return f ? r.fulfill({status: 200, body: f.body}) : j({}, 404); }
    if (rq.method() === 'POST'){
      const buf = rq.postDataBuffer(); const bd = '--' + rq.headers()['content-type'].match(/boundary=(.+)$/)[1]; const parts = []; let at = buf.indexOf(bd);
      while (at >= 0){ const nx = buf.indexOf(bd, at + bd.length); if (nx < 0) break; parts.push(buf.slice(at + bd.length + 2, nx - 2)); at = nx; }
      const body = x => x.slice(x.indexOf('\r\n\r\n') + 4); const meta = JSON.parse(body(parts[0]).toString()); const id = 'G' + (++seq);
      DB.set(id, {id, name: meta.name, body: body(parts[1]), mt: new Date().toISOString()}); return j({id, name: meta.name});
    }
    if (rq.method() === 'PATCH'){ const f = [...DB.values()].find(x => x.id === m[1]); f.body = rq.postDataBuffer(); f.mt = new Date().toISOString(); return j({id: f.id}); }
    if (rq.method() === 'DELETE') return r.fulfill({status: 204, body: ''});
    j({}, 404);
  });
  const asks = () => p.evaluate(() => window.__asks || []);
  const state = () => [...DB.values()].find(f => f.name === 'state.json')?.body.toString() || '';
  const until = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 250){ if (await f()) return true; await p.waitForTimeout(250); } return false; };
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(600);
  await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'false'));
  if (!CID) await p.evaluate(() => localStorage.setItem('nv.gd.client', JSON.stringify('x.apps.googleusercontent.com')));   // ID 를 아직 코드에 넣기 전
  await p.reload(); await p.waitForTimeout(3800);
  // 1) 처음: 서재 위 띠에 단추 하나. 누르기 전에는 로그인 창을 열지 않는다
  console.log('hello shown:', await p.isVisible('#libPage .gd-hello .gd-start'), '| settings btn:', await p.textContent('#gdConnect'), '| adv closed:', !(await p.$eval('#gdAdv', d => d.open)), '| secret field hidden:', await p.$eval('#gdSecret', e => !!e.closest('[hidden]')));
  console.log('no login before tap:', (await asks()).length === 0, '| no drive calls:', lists === 0);
  // 2) 구글로 시작하기 한 번 → 바로 맞춘다
  await p.click('#libPage .gd-hello .gd-start');
  await until(async () => state().length > 0);
  const a1 = await asks();
  console.log('started: asks', a1.length, '| prompt', JSON.stringify(a1[0]?.prompt), '| client id ok', a1[0]?.id === (CID || 'x.apps.googleusercontent.com'), '| state.json', state().length > 0);
  await until(async () => /마지막 동기화/.test(await p.textContent('#gdStatus')));
  console.log('after start: hello hidden', !(await p.isVisible('#libPage .gd-hello')), '| status', /마지막 동기화/.test(await p.textContent('#gdStatus')), '| connect hidden', await p.$eval('#gdConnect', e => e.hidden), '| linked', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.gd.linked'))));
  // 3) 다시 켜면 누르지 않아도(토큰이 살아 있으면) 저절로 맞춘다
  let l0 = lists; await p.reload(); await until(async () => lists > l0, 6000);
  console.log('reload auto sync:', lists > l0, '| no new login:', (await asks()).length === 0, '| hello hidden:', !(await p.isVisible('#libPage .gd-hello')));
  // 4) 바뀌면 저절로 올린다 (15초 조용하면)
  await p.evaluate(() => window.nvStore.set('ideas', [{id: 'i1', text: '저절로 올라가는 메모', t: Date.now()}]));
  await until(async () => state().includes('저절로 올라가는 메모'), 22000);
  console.log('change uploaded:', state().includes('저절로 올라가는 메모'));
  // 5) 토큰이 끝났으면: 켤 때는 기다렸다가, 화면을 한 번 누르면 조용히(prompt 없이) 다시 받고 이어서 맞춘다
  await p.evaluate(() => { const t = JSON.parse(localStorage.getItem('nv.gd.tok')); t.exp = Date.now() - 1000; localStorage.setItem('nv.gd.tok', JSON.stringify(t)); });
  dead.add(JSON.parse(await p.evaluate(() => localStorage.getItem('nv.gd.tok'))).t);
  await p.reload(); await p.waitForTimeout(3800);
  console.log('expired waits for tap:', (await asks()).length === 0, '| status:', await p.textContent('#gdStatus'));
  l0 = lists; await p.mouse.click(640, 30); await until(async () => lists > l0);
  const a2 = await asks();
  console.log('after tap: asks', a2.length, '| prompt', JSON.stringify(a2[0]?.prompt), '| in gesture', a2[0]?.act, '| synced', lists > l0);
  // 6) 연결 끊기 → 단추가 다시 보인다
  await p.evaluate(() => nvGo('set')); await p.click('#gdOut'); await p.waitForTimeout(300);
  console.log('logout: connect shown', !(await p.$eval('#gdConnect', e => e.hidden)), '| token gone', await p.evaluate(() => localStorage.getItem('nv.gd.tok') === null));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
