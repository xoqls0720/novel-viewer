// 폰의 'PC 서재 열기': 저장된 PC 주소가 안 닿으면(PC 를 다시 켜 주소가 바뀜) 구글로 맞춰 새 주소를 받아 열고, 그래도 안 되면 알려 준다
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://xoqls0720.github.io/**', r => r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '..', 'index.html'))}));
  await ctx.route('https://pc-old.test/**', r => r.abort());   // 예전 주소: PC 를 다시 켜서 없어졌다
  await ctx.route('https://pc-new.test/**', r => r.fulfill({status: 200, headers: {'access-control-allow-origin': 'https://xoqls0720.github.io', 'content-type': r.request().url().includes('lan/info') ? 'application/json' : 'text/html'}, body: r.request().url().includes('lan/info') ? '{"apps":[]}' : '<title>PC 서재</title>'}));
  // 구글 맞추기 흉내: 앱 칸의 pcRemote 가 새 주소
  let syncs = 0;
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({status: 200, contentType: 'text/javascript', body: 'window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:"tok",expires_in:3600}),10)})}}};'}));
  await ctx.route('https://www.googleapis.com/**', r => { const u = r.request().url(); const H = {'access-control-allow-origin': '*', 'content-type': 'application/json'};
    if (/spaces=appDataFolder/.test(u)){ syncs++; return r.fulfill({status: 200, headers: H, body: JSON.stringify({files: [{id: 'S1', name: 'state.json', modifiedTime: new Date().toISOString()}]})}); }
    if (/files\/S1\?alt=media/.test(u)) return r.fulfill({status: 200, headers: H, body: JSON.stringify({v: 1, ls: {pcRemote: JSON.stringify({url: 'https://pc-new.test/t/k/', at: Date.now()})}, ts: {pcRemote: Date.now()}, scraps: []})});
    return r.fulfill({status: 200, headers: H, body: '{"files":[]}'}); });
  await p.goto('https://xoqls0720.github.io/novel-viewer/index.html');
  await p.evaluate(() => { const S = (k, v) => localStorage.setItem('nv.' + k, JSON.stringify(v)); S('set.stStart', false); S('coachDone', true); S('gd.linked', true); S('gd.auto', false);
    S('gd.tok', {t: 'tok', exp: Date.now() + 3600e3, s: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly'}); S('pcRemote', {url: 'https://pc-old.test/t/k/', at: 1}); });
  await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => nvGo('lib')); await p.waitForTimeout(300);
  console.log('button shown:', await p.isVisible('#pcRemoteGo'));
  const nav = p.waitForURL(/pc-new\.test/, {timeout: 20000}).then(() => true, () => false);
  await p.click('#pcRemoteGo');
  console.log('opened new address:', await nav, '| synced:', syncs > 0);
  // 새 주소도 안 닿으면 알려 준다
  await p.goto('https://xoqls0720.github.io/novel-viewer/index.html'); await p.evaluate(() => localStorage.setItem('nv.pcRemote', JSON.stringify({url: 'https://pc-old.test/t/k/', at: Date.now() + 1e9})));
  await ctx.unroute('https://www.googleapis.com/**'); await ctx.route('https://www.googleapis.com/**', r => r.fulfill({status: 200, headers: {'access-control-allow-origin': '*', 'content-type': 'application/json'}, body: '{"files":[]}'}));
  await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => nvGo('lib')); await p.waitForTimeout(300);
  await p.click('#pcRemoteGo'); await p.waitForFunction(() => /PC 에 닿지 않아요/.test(document.querySelector('#toast')?.textContent || ''), null, {timeout: 25000}).catch(() => {});
  console.log('told unreachable:', /PC 에 닿지 않아요/.test(await p.textContent('#toast')), '| still here:', p.url().includes('xoqls0720'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
