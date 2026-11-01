// 드라이브 영상을 보다가 구글 토큰이 끝나면: 서비스 워커가 화면에 알리고, 화면을 한 번 누르면 새 토큰으로 그 자리부터 이어서 본다
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const CLIP = fs.readFileSync(path.join(__dirname, 'drv-clip.webm'));
const FOLDER = 'application/vnd.google-apps.folder';
const D = {root: [{id: 'H', name: '노벨리스트', mimeType: FOLDER}], H: [{id: 'K2', name: '영상', mimeType: FOLDER}],
  K2: [{id: 'W2', name: '긴영상', mimeType: FOLDER}], W2: [{id: 'V1', name: 'clip.webm', mimeType: 'video/webm', size: String(CLIP.length), modifiedTime: '2026-10-01T00:00:00Z'}]};
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const html = fs.readFileSync(path.join(ROOT, 'index.html')), sw = fs.readFileSync(path.join(ROOT, 'sw.js'));
  await ctx.route('https://nv.test/**', r => { const u = new URL(r.request().url());
    if (u.pathname.endsWith('/sw.js')) return r.fulfill({status: 200, contentType: 'text/javascript', body: sw});
    if (u.pathname.endsWith('/index.html') || u.pathname === '/') return r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html});
    return r.fulfill({status: 200, contentType: 'application/octet-stream', body: ''}); });
  // 구글 로그인 흉내: 받을 때마다 새 토큰(tok1, tok2 …)
  let issued = 0;
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({status: 200, contentType: 'text/javascript', body: 'window.__n=0;window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>{window.__n++;setTimeout(()=>o.callback({access_token:"tok"+(window.__n+1),expires_in:3600}),10)}})}}};'}));
  let good = 'tok1', denied = 0, served = {};
  await ctx.route('https://www.googleapis.com/**', async r => {
    const rq = r.request(); const u = new URL(rq.url()); const H = {'access-control-allow-origin': '*'}; const J = o => r.fulfill({status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(o)});
    if (rq.method() === 'OPTIONS') return r.fulfill({status: 204, headers: {...H, 'access-control-allow-headers': 'authorization,range'}});
    const auth = (rq.headers()['authorization'] || '').replace('Bearer ', '');
    const m = u.pathname.match(/files\/(\w+)$/);
    if (m){ if (auth !== good){ denied++; return r.fulfill({status: 401, headers: H, body: '{}'}); }
      served[auth] = (served[auth] || 0) + 1; const rg = /bytes=(\d+)-(\d+)/.exec(rq.headers()['range'] || '');
      if (rg){ const a = +rg[1], e = Math.min(CLIP.length - 1, +rg[2]); return r.fulfill({status: 206, headers: {...H, 'content-type': 'application/octet-stream'}, body: CLIP.subarray(a, e + 1)}); }
      return r.fulfill({status: 200, headers: H, body: CLIP}); }
    if (auth !== good) return r.fulfill({status: 401, headers: H, body: '{}'});
    if (u.pathname.endsWith('/changes/startPageToken')) return J({startPageToken: '1'});
    if (u.pathname.endsWith('/changes')) return J({changes: [], newStartPageToken: '1'});
    if (u.searchParams.get('spaces') === 'appDataFolder') return J({files: []});
    const q = u.searchParams.get('q') || '';
    if (q.includes("'root' in parents")) return J({files: D.root.map(f => ({...f, parents: ['root']}))});
    return J({files: [...q.matchAll(/'(\w+)' in parents/g)].flatMap(x => (D[x[1]] || []).map(f => ({...f, parents: [x[1]]})))});
  });
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(300);
  await p.evaluate(() => { const S = (k, v) => localStorage.setItem('nv.' + k, JSON.stringify(v)); S('set.stStart', false); S('gd.linked', true); S('coachDone', true); S('gd.auto', false);
    S('gd.tok', {t: 'tok1', exp: Date.now() + 3600e3, s: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly'}); });
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload();
  await p.waitForFunction(() => window.nvMedia && nvMedia.works().some(w => w.name === '긴영상'), null, {timeout: 30000});
  await p.evaluate(async () => { await nvMedia.openWork(nvMedia.works().find(w => w.name === '긴영상')); });
  await p.waitForFunction(() => document.querySelector('#reader video')?.readyState >= 1, null, {timeout: 15000});
  console.log('first token served:', !!served.tok1);
  // 토큰이 끝났다: 드라이브는 이제 tok2 만 받는다. 앞부분을 다시 읽게 해 거절을 맞는다
  good = 'tok2';
  const toastSeen = p.waitForFunction(() => /한 번 누르면/.test(document.querySelector('#toast')?.textContent || ''), null, {timeout: 15000}).then(() => true, () => false);
  await p.evaluate(() => { const v = document.querySelector('#reader video'); v.src = v.src.replace(/&t=[^&]*/, '&t=tok1') + '&x=1'; v.load(); });
  console.log('denied old token:', await toastSeen && denied > 0, '| asked to tap:', await toastSeen);
  // 화면을 한 번 누른다 → 새 토큰(tok2) → 서비스 워커가 새 토큰으로, 화면은 그 자리부터 다시
  await p.mouse.click(200, 200); await p.waitForTimeout(400);
  await p.waitForFunction(() => document.querySelector('#reader video')?.readyState >= 1, null, {timeout: 15000}).catch(() => {});
  await p.waitForTimeout(6000);
  console.log('new token served:', !!served.tok2, '| video ok:', await p.evaluate(() => { const v = document.querySelector('#reader video'); return v.readyState >= 1 && !v.error; }));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
