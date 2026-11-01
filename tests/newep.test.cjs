// 새 회차 표시(+N화·NEW): 작품을 열면 지워지고, 화가 늘면 다시 보인다. 정렬: 최근 추가순·새 회차
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1300, height: 900}}); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '..', 'index.html'))}));
  await p.goto('https://nv.test/index.html'); await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'false')); await p.reload(); await p.waitForTimeout(800);
  // 이름 · 화 수 · 며칠 전 파일
  const add = (name, from, to, daysAgo) => p.evaluate(async ([name, from, to, daysAgo]) => {
    const list = []; for (let i = from; i <= to; i++){ const f = new File(['본문 ' + i], String(i).padStart(4, '0') + ' ' + i + '화.txt', {type: 'text/plain', lastModified: Date.now() - daysAgo * 864e5}); f._rel = '노벨/' + name + '/' + f.name; list.push(f); }
    await nvMedia.addFiles(list); nvMedia.setKind('novel'); }, [name, from, to, daysAgo]);
  const badges = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#lib .grid .card')].map(c => [c.querySelector('.t').textContent, c.querySelector('.new')?.textContent || '-'])));
  await add('오래된작품', 1, 3, 30); await add('새작품', 1, 2, 0);
  console.log('first:', JSON.stringify(await badges()));
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.name === '오래된작품'))); await p.waitForTimeout(500); await p.evaluate(() => nvGo('lib'));
  await add('오래된작품', 1, 5, 0);
  console.log('after 2 new eps:', JSON.stringify(await badges()));
  await p.selectOption('#libSort', 'new'); await p.waitForTimeout(200);
  console.log('new sort:', await p.$$eval('#lib .grid .card .t', e => e.map(x => x.textContent).join(',')));
  await p.selectOption('#libSort', 'added'); await p.waitForTimeout(200);
  console.log('added sort first:', await p.$eval('#lib .grid .card .t', e => e.textContent));
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.name === '오래된작품'))); await p.waitForTimeout(500); await p.evaluate(() => nvGo('lib'));
  await p.selectOption('#libSort', 'name'); await p.waitForTimeout(200);
  console.log('after reopen:', JSON.stringify(await badges()));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
