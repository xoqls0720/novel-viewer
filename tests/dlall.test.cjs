// 작품 통째로 받기: 가짜 드라이브 작품을 '전체 받기'로 받아 두면 인터넷 없이 모든 화가 열린다
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1300,height:900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({status: 200, contentType: 'text/javascript', body: `window.google = {accounts: {oauth2: {initTokenClient: o => ({requestAccessToken: () => setTimeout(() => o.callback({access_token: 'tok', expires_in: 3600}), 10)})}}};`}));
  // 가짜 드라이브: 노벨 / 화산귀환 / 0001.txt, 0002.txt, 0003.txt, 삽화.png
  const D = {root: [{id: 'F1', name: '노벨', mimeType: 'application/vnd.google-apps.folder'}],
    F1: [{id: 'F2', name: '화산귀환', mimeType: 'application/vnd.google-apps.folder'}],
    F2: [{id: 'T1', name: '0001 ep.txt', mimeType: 'text/plain', size: '40', modifiedTime: '2026-10-01T00:00:00Z'},
         {id: 'T2', name: '0002 ep.txt', mimeType: 'text/plain', size: '40', modifiedTime: '2026-10-01T00:00:00Z'},
         {id: 'T3', name: '0003 ep.txt', mimeType: 'text/plain', size: '40', modifiedTime: '2026-10-01T00:00:00Z'},
         {id: 'I1', name: '삽화.png', mimeType: 'image/png', size: '10', modifiedTime: '2026-10-01T00:00:00Z'}]};
  const MEDIA = {T1: '드라이브에서 온 1화.', T2: '드라이브에서 온 2화.', T3: '드라이브에서 온 3화.', I1: 'PNG'};
  let mediaHits = 0, online = true, deny = 0, flaky = 0;
  await ctx.route('https://www.googleapis.com/drive/v3/files**', r => {
    if (!online) return r.abort();
    const u = new URL(r.request().url());
    const m = u.pathname.match(/files\/(\w+)$/);
    if (m && u.searchParams.get('alt') === 'media'){
      if (deny > 0){ deny--; return r.fulfill({status: 401, body: '{}'}); }   // 구글 토큰이 끝났다
      if (flaky > 0){ flaky--; return r.fulfill({status: 500, body: '{}'}); }   // 잠깐 끊겼다
      mediaHits++; return r.fulfill({status: 200, contentType: 'text/plain', body: MEDIA[m[1]]}); }
    const q = u.searchParams.get('q') || ''; if (!q.includes(' in parents')) return r.fulfill({status: 200, contentType: 'application/json', body: '{"files":[]}'});
    const ids = [...q.matchAll(/'(\w+)' in parents/g)].map(m => m[1]);
    let files = ids.flatMap(id => (D[id] || []).map(f => ({...f, parents: [id]}))); if (q.includes("mimeType='application/vnd.google-apps.folder'")) files = files.filter(f => f.mimeType.endsWith('folder'));
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({files})});
  });
  await ctx.route('https://www.googleapis.com/drive/v3/changes**', r => {
    if (!online) return r.abort();
    const u = new URL(r.request().url()); if (u.pathname.endsWith('/startPageToken')) return r.fulfill({status: 200, contentType: 'application/json', body: '{"startPageToken":"c1"}'});
    r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({changes: [], newStartPageToken: u.searchParams.get('pageToken')})});
  });
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(600);
  await p.evaluate(() => { localStorage.setItem('nv.gd.client', JSON.stringify('x.apps.googleusercontent.com')); localStorage.setItem('nv.set.stStart', 'false'); });
  await p.reload(); await p.waitForTimeout(600);
  await p.click('#btnLink'); await p.click('#srcDrive'); await p.waitForTimeout(600);
  await p.click('#drvList .it:has-text("노벨")'); await p.waitForTimeout(400);
  await p.click('#drvPick'); await p.waitForTimeout(1500);
  await p.keyboard.press('Escape');
  await p.evaluate(() => nvGo('lib')); await p.click(':is(.grid,.shelf) .card:has-text("화산귀환")'); await p.waitForTimeout(1200);
  console.log('ep1 text:', (await p.textContent('#reader .novel')).includes('드라이브에서 온 1화'), '| hits:', mediaHits);
  // 회차 목록의 '마저 받기' (1화는 이미 봐서 받아져 있다) → 전체 받기
  await p.click('#epBtn'); await p.waitForSelector('#epDl:not([hidden])', {timeout: 5000}); await p.waitForTimeout(300);
  console.log('btn before:', await p.textContent('#epDl'));
  await p.click('#epDl');
  await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('받아 둠'), null, {timeout: 20000});
  console.log('asked:', /화를 이 기기에 받아 둘까요/.test(dialogs[0]), '| downloaded: ' + await p.textContent('#epDl'), '| hits:', mediaHits);
  // 인터넷 없이 다시 켜도 모든 화가 열린다 (받기 전엔 본 화만 열렸다)
  online = false; await p.reload(); await p.waitForTimeout(1800);
  await p.evaluate(() => nvGo('lib')); await p.click(':is(.grid,.shelf) .card:has-text("화산귀환")'); await p.waitForTimeout(1000);
  await p.click('#epBtn'); await p.click('#epList .it:has-text("3화")'); await p.waitForTimeout(600);
  console.log('offline ep3 text:', (await p.textContent('#reader .novel')).includes('드라이브에서 온 3화'));
  // '받아 둠 ✓' 을 누르면 이 작품 것만 지운다
  online = true;
  await p.click('#epBtn'); await p.waitForSelector('#epDl:not([hidden])'); await p.waitForTimeout(300);
  await p.click('#epDl');
  await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('전체 받기'), null, {timeout: 8000});
  console.log('after delete:', await p.textContent('#epDl'), '| asked del:', /받아 둔 파일을 기기에서 지울까요/.test(dialogs.at(-1)));
  // 받는 중에 구글 토큰이 끝나면 기다렸다가, 화면을 한 번 누르면 빠짐없이 이어 받는다
  deny = 2; mediaHits = 0; await p.click('#epDl');
  await p.waitForFunction(() => document.querySelector('#epDlRow span')?.textContent.includes('화면을 한 번 누르면'), null, {timeout: 8000});
  console.log('waits for tap: true');
  await p.mouse.click(650, 300);
  await p.waitForFunction(() => { if (document.querySelector('#epDrawer.open')) return document.querySelector('#epDl')?.textContent.includes('받아 둠'); return !nvDl.DLA.on; }, null, {timeout: 20000});
  await p.waitForTimeout(300); if (!(await p.$('#epDrawer.open'))) await p.click('#epBtn'); await p.waitForTimeout(500);
  console.log('after token:', await p.textContent('#epDl'), '| files:', mediaHits);
  // 잠깐 끊긴 것은 다시 해 본다
  await p.click('#epDl'); await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('전체 받기'), null, {timeout: 8000});
  flaky = 1; await p.click('#epDl'); await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('받아 둠'), null, {timeout: 20000});
  console.log('retried: ' + await p.textContent('#epDl'));
  // 저장 공간이 차면 다 받았다고 하지 않고 멈춘다
  await p.click('#epDl'); await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('전체 받기'), null, {timeout: 8000});
  await p.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(v, ...a){ if (v?.blob || v?.__nvab) throw new DOMException('full', 'QuotaExceededError'); return put.call(this, v, ...a); }; });
  await p.click('#epDl'); await p.waitForFunction(() => !nvDl.DLA.on && nvDl.DLA.full, null, {timeout: 15000}); await p.waitForTimeout(300);
  console.log('full stops:', await p.textContent('#toast'), '| btn:', await p.textContent('#epDl'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
