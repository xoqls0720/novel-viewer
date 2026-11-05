// 다른 앱에 있던 것들: CBZ · 여기까지 읽음 · 안 읽은 화만 · 설정 유지 · 회차 복제 · 집필 타이머 · 연재용 조각 · 세로 미리 보기 · 폰 웹툰 배치
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1300, height: 900}, acceptDownloads: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); let answer = '1'; p.on('dialog', d => d.accept(answer));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.coach', 'true'); }); await p.reload(); await p.waitForTimeout(800);
  // CBZ: 파일 하나가 한 화
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await p.evaluate(async png => {
    const raw = Uint8Array.from(atob(png), c => c.charCodeAt(0)); const mk = async n => { const z = new JSZip(); z.file('001.png', raw); z.file('002.png', raw); const f = new File([await z.generateAsync({type: 'blob'})], n, {type: 'application/zip'}); f._rel = '만화/시험만화/' + n; return f; };
    await nvMedia.addFiles([await mk('Vol 1 시작.cbz'), await mk('Vol 2 끝.cbz')]);
  }, png).catch(async e => { console.log('no global JSZip:', e.message); });
  console.log('cbz:', await p.evaluate(() => { const w = nvMedia.works().find(x => x.name === '시험만화'); return w ? w.eps.map(e => e.name + ':' + e.files.length).join(',') : 'none'; }));
  // 회차 목록
  await p.evaluate(async () => { const l = []; for (let i = 1; i <= 6; i++){ const f = new File(['본문 '.repeat(50) + i], String(i).padStart(4, '0') + ' ' + i + '화.txt'); f._rel = '노벨/시험소설/' + f.name; l.push(f); } await nvMedia.addFiles(l); await nvMedia.openWork(nvMedia.works().find(w => w.name === '시험소설')); });
  await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('.coach button')?.click());
  await p.evaluate(() => { const s = document.querySelector('#epSel'); s.value = 2; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(500);
  await p.click('#epBtn'); await p.click('#epReadTo'); await p.waitForTimeout(200);
  console.log('read marks:', await p.$$eval('#epList .it.read', e => e.length));
  await p.click('#epUnread'); await p.waitForTimeout(200);
  console.log('unread only:', await p.$$eval('#epList .it .nm', e => e.map(x => x.textContent).join(',')));
  await p.click('#epUnread'); await p.keyboard.press('Escape');
  // 설정이 새로 고침 뒤에도 남는다
  await p.evaluate(() => { for (const [id, v] of [['stLen', '3000'], ['wtPagesN', '7'], ['wtTone', null], ['aiN', '9'], ['ngEach', '3']]){ const el = document.getElementById(id); if (v === null) el.selectedIndex = 2; else el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); } });
  await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(900);
  console.log('kept settings:', await p.evaluate(() => [document.getElementById('wtPagesN').value, document.getElementById('wtTone').selectedIndex, document.getElementById('aiN').value, document.getElementById('ngEach').value].join(',')));
  // 집필실
  await p.click('#gnav [data-g=write]'); await p.waitForTimeout(600);
  
  await p.waitForTimeout(400); await p.fill('#stTitle', '1화 시작'); await p.click('#stText'); await p.keyboard.type('처음 쓴 글이다.', {delay: 1}); await p.waitForTimeout(1100);
  answer = '1'; await p.click('#stSprint'); await p.waitForTimeout(300);
  console.log('sprint on:', await p.isVisible('#stSprintBar'), '| time:', /^(0|1):\d\d$/.test(await p.textContent('#stSprintT')));
  await p.click('#stText'); await p.keyboard.press('End'); await p.keyboard.type(' 더 썼다 정말로', {delay: 1}); await p.waitForTimeout(1600);
  console.log('sprint count:', /^\+[1-9]/.test(await p.textContent('#stSprintN')));
  await p.click('#stSprintX'); await p.waitForTimeout(150); console.log('sprint stop:', await p.isHidden('#stSprintBar'));
  await p.evaluate(() => { document.querySelector('#stEpDup').click(); }); await p.waitForTimeout(500);
  console.log('ep dup:', await p.inputValue('#stTitle'), '| text:', (await p.inputValue('#stText')).includes('처음 쓴 글'));
  await p.evaluate(() => nvGo('home'));
  // 웹툰
  await p.click('#gnav [data-g=toon]'); await p.waitForTimeout(400); await p.click('#wtNew'); await p.waitForTimeout(500);
  await p.evaluate(() => { const s = document.querySelector('#wtSize'); s.value = '3000'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300);
  await p.evaluate(() => [...document.querySelectorAll('.pgbtns button')].find(x => x.textContent === '+ 쪽').click()); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => { const s = document.querySelector('#wtExport'); s.value = 'cut800'; s.dispatchEvent(new Event('change')); })]);
  const zipPath = path.join(__dirname, 'out', 'more2-cut.zip'); await dl.saveAs(zipPath); console.log('cut name:', dl.suggestedFilename());
  const cuts = await p.evaluate(async b64 => { const z = await JSZip.loadAsync(b64, {base64: true}); const out = []; for (const n of Object.keys(z.files).sort()){ const bm = await createImageBitmap(await z.file(n).async('blob')); out.push(`${bm.width}x${bm.height}`); } return out.join(','); }, fs.readFileSync(zipPath).toString('base64'));
  console.log('cut sizes:', cuts);
  await p.evaluate(() => { const s = document.querySelector('#wtExport'); s.value = 'view'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(600);
  console.log('preview pages:', await p.$$eval('.wt-prev canvas', e => e.length)); await p.keyboard.press('Escape'); await p.waitForTimeout(150); console.log('preview closed:', !(await p.$('.wt-prev')));
  console.log('back btn:', await p.$eval('#wtBack', e => e.textContent));
  // 폰: 그림 칸이 화면에서 가장 크다
  await p.setViewportSize({width: 375, height: 812}); await p.waitForTimeout(500);
  console.log('phone stage:', await p.evaluate(() => { const st = document.querySelector('#wtScroll').getBoundingClientRect().height, tp = document.querySelector('.wt-top').getBoundingClientRect().height, pg = document.querySelector('#wtPages').getBoundingClientRect().height; return `${st > 300} ${tp < 70} ${pg < 90}`; }));
  console.log('page btn tall:', await p.$eval('.pgbtns button', e => e.getBoundingClientRect().height >= 34));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
