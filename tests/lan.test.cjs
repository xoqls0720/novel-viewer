// 같은 와이파이로 보여 주기: 진짜 서버를 켜고, 아이패드처럼 주소만 열어 서재가 보이는지 본다
const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data');
const { createLanServer } = require(path.join(ROOT, 'desktop', 'lan-server.js'));

(async () => {
  const lan = createLanServer({appDir: ROOT, roots: [path.join(DATA, 'vt2', 'novel'), path.join(DATA, 'vt2', 'webtoon')], token: 'tok123', port: 0});
  const port = await lan.start();
  const base = `http://127.0.0.1:${port}/t/tok123/`;
  console.log('urls have token:', lan.urls().every(u => u.includes('/t/tok123/')));

  // 열쇠가 틀리면 403, 폴더 밖은 404
  const code = async u => (await fetch(u).catch(() => ({status: 0}))).status;
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
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close(); await lan.stop();
})();
