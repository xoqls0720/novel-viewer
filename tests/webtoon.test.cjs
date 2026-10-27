// 웹툰 만들기: 새 프로젝트 → 쪽 틀 → 그림 넣기 → 말풍선·효과음·스티커 → 내보내기
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1500, height: 940}, acceptDownloads: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'false')); await p.reload(); await p.waitForTimeout(700);
  await p.click('#gnav [data-g=toon]'); await p.waitForTimeout(300);
  console.log('home shown:', await p.isVisible('#wtHome'), '| new btn:', await p.isVisible('#wtNew'));
  await p.click('#wtNew'); await p.waitForTimeout(500);
  console.log('editor:', await p.isVisible('#wtCv'), '| pages:', (await p.$$('#wtPages .pg')).length, '| layouts:', (await p.$$('#wtLayouts button')).length);
  // 쪽 크기: 캔버스는 쪽 비율
  const ratio = await p.$eval('#wtCv', c => +(c.height / c.width).toFixed(3)); console.log('page ratio:', ratio);
  // 틀 바꾸기: 사선 가로
  await p.click('#wtLayouts [data-l="2d"]'); await p.waitForTimeout(200);
  console.log('layout 2d on:', await p.$eval('#wtLayouts [data-l="2d"]', b => b.classList.contains('on')));
  // 컷 고르고 그림 넣기(파일)
  const box = await p.$eval('#wtCv', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  await p.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.2); await p.waitForTimeout(200);
  console.log('panel selected:', await p.isVisible('#wtPanelSec'));
  await p.setInputFiles('#wtImgInput', path.join(DATA, 'vt2', 'webtoon', 'misaeng', '0001 ep', '001.png')); await p.waitForTimeout(500);
  await p.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.85); await p.waitForTimeout(150);
  await p.setInputFiles('#wtImgInput', path.join(DATA, 'vt2', 'webtoon', 'misaeng', '0002 ep', '002.png')); await p.waitForTimeout(500);
  const imgs = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('wt').objectStore('wt').getAll(); g.onsuccess = () => res(g.result.filter(x => x.t === 'img').length); }; }));
  console.log('images stored:', imgs);
  // 글·효과: 말풍선, 속마음, 설명 상자, 효과음, 땀방울, 별
  await p.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.2);
  for (const k of ['speech', 'thought', 'narr', 'sfx', 'sweat', 'burst', 'heart', 'text', 'shout']){ await p.click(`#wtAdd [data-add=${k}]`); await p.waitForTimeout(80); }
  console.log('items:', await p.evaluate(() => document.querySelector('#wtItemSec') && !document.querySelector('#wtItemSec').hidden));
  // 마지막 말풍선 글 고치기
  await p.mouse.click(box.x + box.w * 0.5, box.y + box.h * 0.2); await p.click('#wtAdd [data-add=speech]'); await p.fill('#wtText', '자, 잠깐만…\n왜 이렇게 붙는 건데'); await p.waitForTimeout(150);
  await p.screenshot({path: path.join(__dirname, 'out', 'wt_editor.png')});
  // 내보내기: 이 쪽 PNG
  const [dl] = await Promise.all([p.waitForEvent('download'), p.selectOption('#wtExport', 'this')]);
  const f = path.join(__dirname, 'out', 'wt_page.png'); await dl.saveAs(f); const buf = fs.readFileSync(f);
  console.log('export png:', buf.slice(1, 4).toString(), '| size', buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));
  // 저장·되돌리기
  await p.waitForTimeout(1000); console.log('saved status:', await p.textContent('#wtSaved'));
  const n0 = await p.evaluate(() => 0); await p.click('#wtUndo'); await p.waitForTimeout(200); await p.click('#wtRedo');
  // 다시 열기
  await p.click('#wtClose'); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(700); await p.click('#gnav [data-g=toon]'); await p.waitForTimeout(400);
  console.log('listed after reload:', await p.$$eval('#wtList .it b', e => e.map(x => x.textContent)));
  await p.click('#wtList .it'); await p.waitForTimeout(600);
  console.log('reopened items kept:', await p.evaluate(() => document.querySelectorAll('#wtPages .pg').length), '| img panels:', await p.evaluate(async () => { const r = indexedDB.open('nv'); return await new Promise(res => { r.onsuccess = () => { const g = r.result.transaction('wt').objectStore('wt').getAll(); g.onsuccess = () => { const pr = g.result.find(x => x.t === 'proj'); res(JSON.parse(pr.data).pages[0].panels.filter(q => q.img).length + ' / items ' + JSON.parse(pr.data).pages[0].items.length); }; }; }); }));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
