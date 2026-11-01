// 독서 기록(홈 카드) · 사전 찾기(고른 낱말) · 작품 전체 EPUB 내보내기(만든 EPUB 을 이 뷰어로 다시 열어 본다)
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1300, height: 900}, acceptDownloads: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '..', 'index.html'))}));
  await ctx.route('https://dict.naver.com/**', r => r.fulfill({status: 200, contentType: 'text/html', body: 'dict'}));
  await p.goto('https://nv.test/index.html'); await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.coachDone', 'true'); }); await p.reload(); await p.waitForTimeout(800);
  // 독서 기록: 30분 읽은 셈 치고 홈을 연다
  console.log('stats hidden before:', await p.evaluate(() => { nvGo('home'); return document.querySelector('#hStats').hidden; }));
  await p.evaluate(() => { nvReadStats.tick(1800); nvReadStats.flush(); nvGo('lib'); nvGo('home'); });
  console.log('stats:', await p.$$eval('#hStats .rs-row b', e => e.map(x => x.textContent).join(' | ')), '| cal cells:', await p.$$eval('#hStats .rs-cal i', e => e.length), '| today lit:', await p.$eval('#hStats .rs-cal i:last-child', e => e.className));
  console.log('stats key per device:', await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('nv.rstat.')).length));
  // 사전: 소설을 열고 낱말을 골라 '사전'
  await p.evaluate(async () => { const f = new File(['청명은 검을 뽑았다.\n\n매화가 흩날렸다.'], '0001 1화.txt', {type: 'text/plain'}); f._rel = '노벨/사전시험/0001 1화.txt'; await nvMedia.addFiles([f]); await nvMedia.openWork(nvMedia.works().find(w => w.name === '사전시험')); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { const t = [...document.querySelectorAll('#reader .novel p')].find(x => x.textContent.includes('매화')).firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 2); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await p.waitForTimeout(700);
  const popup = ctx.waitForEvent('page', {timeout: 5000}).catch(() => null);
  await p.click('#selDict'); const pg = await popup;
  console.log('dict opened:', pg ? decodeURIComponent(pg.url()) : 'none');
  // EPUB 내보내기 → 그 파일을 서재에 넣어 열기
  const dl = p.waitForEvent('download');
  await p.evaluate(() => nvSaveEpub('시험작.epub', '시험작', '나', [{title: '1화 시작', text: '첫 문장이다.\n\n둘째 문단.'}, {title: '2화 끝', text: '마지막 문장이다. 매화 향기가 산문 너머까지 번졌다.'}]));
  const d = await dl; const file = path.join(__dirname, 'out', 'export-test.epub'); await d.saveAs(file);
  const buf = fs.readFileSync(file); console.log('epub saved:', d.suggestedFilename(), '| mimetype first:', buf.slice(30, 58).toString() === 'mimetypeapplication/epub+zip');
  await p.evaluate(async b64 => { const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const f = new File([bytes], '시험작.epub', {type: 'application/epub+zip'}); f._rel = '노벨/시험작/시험작.epub'; await nvMedia.addFiles([f]); await nvMedia.openWork(nvMedia.works().find(w => w.name === '시험작')); }, buf.toString('base64'));
  await p.waitForTimeout(1500);
  console.log('epub reopened:', await p.evaluate(() => ({eps: nvMedia.works().find(w => w.name === '시험작').eps.map(e => e.name).join(','), text: document.querySelector('#reader').textContent.includes('첫 문장이다')})));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
