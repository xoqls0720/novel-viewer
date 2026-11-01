// 작가 모음: 작가 묶음(성인 폴더, '[작가] 제목' 회차 폴더)은 따로 모이고, 누르면 미리보기에서 작품을 골라 연다. '메스가키'·'말포이'는 성인으로
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 390, height: 844}}); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '..', 'index.html'))}));
  await p.goto('https://nv.test/index.html'); await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.coachDone', 'true'); }); await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(async png => {
    const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0)); const list = [];
    const put = rel => { const f = new File([bytes], rel.split('/').pop(), {type: 'image/png'}); f._rel = rel; list.push(f); };
    put('성인/만화/작가A/0001 [작가A] 첫 작품/001.png'); put('성인/만화/작가A/0001 [작가A] 첫 작품/002.png'); put('성인/만화/작가A/0002 [작가A] 둘째 작품/001.png');
    put('만화/luxsumildo/0001 [LUXsumildo] 메스가키 말포이 (Harry Potter)/001.png');
    put('만화/메스가키 말포이/0001 메스가키 말포이/001.png');
    put('만화/평범한 만화/0001 1화/001.png'); put('만화/평범한 만화/0002 2화/001.png');
    await nvMedia.addFiles(list);
  }, PNG.toString('base64'));
  const works = await p.evaluate(() => nvMedia.works().map(w => `${w.name}:${w.author ? 'author' : 'work'}:${w.adult ? 'adult' : '-'}`).sort().join(' | '));
  console.log('works:', works);
  await p.evaluate(() => { nvGo('lib'); nvMedia.setKind('manga'); }); await p.waitForTimeout(300);
  console.log('manga tab:', await p.$$eval('#lib :is(.grid,.shelf) .card .t', e => e.map(x => x.textContent).join(',')));
  await p.click('#libKinds .kind-tab.adult'); await p.waitForTimeout(300);
  console.log('adult headings:', await p.$$eval('#lib h4 span', e => e.map(x => x.textContent).join(',')), '| author label:', await p.$eval('#lib .card.author .m', e => e.textContent).catch(() => 'none'));
  await p.click('#lib .card:has-text("작가A")'); await p.waitForTimeout(600);
  console.log('picker:', await p.$$eval('.apick .ap-it .t', e => e.map(x => x.textContent).join(',')), '| thumbs:', await p.$$eval('.apick .ap-it img', e => e.filter(i => i.complete && i.naturalWidth > 0).length), '| reader untouched:', await p.evaluate(() => !document.querySelector('#reader img')));
  await p.click('.apick .ap-it:has-text("둘째 작품")'); await p.waitForTimeout(800);
  console.log('opened:', await p.textContent('#epTitle'), '| picker closed:', !(await p.$('.apick')));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
