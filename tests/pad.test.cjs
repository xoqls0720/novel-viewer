// 필기 칸 도구: 지우개 크기 따로, 획 지우개·부분 지우개, 되돌리기, 올가미로 옮기기, 멈추면 곧은 선, 옆에 두기, 새 쪽
const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1366, height: 1024}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.lib.skDock', 'false'); }); await p.reload(); await p.waitForTimeout(700);
  await p.click('#tgTool').catch(() => {}); await p.click('.tabs button[data-tab=notes]'); await p.waitForTimeout(200);
  await p.selectOption('#ideaPaper', 'plain'); await p.selectOption('#ideaSize', 'tall'); await p.click('#ideaDraw'); await p.waitForTimeout(400);
  const box = await p.$eval('#skCanvas', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const X = x => box.x + x, Y = y => box.y + y;
  const ink = async (x, y) => (await p.evaluate(([x, y]) => { const c = document.querySelector('#skCanvas'); const r = c.getBoundingClientRect(); const d = c.getContext('2d').getImageData(Math.round(x * c.width / r.width), Math.round(y * c.height / r.height), 1, 1).data; return d[0] + d[1] + d[2] < 600; }, [x, y]));
  const line = async pts => { await p.mouse.move(X(pts[0][0]), Y(pts[0][1])); await p.mouse.down(); for (const [x, y] of pts.slice(1)) await p.mouse.move(X(x), Y(y), {steps: 6}); await p.mouse.up(); await p.waitForTimeout(120); };
  const setRange = v => p.$eval('#skSize', (r, v) => { r.value = v; r.dispatchEvent(new Event('input')); }, v);
  // 도구를 바꿔도 그림판이 움직이지 않는다
  const top0 = box.y; const tops = []; for (const t of ['erase', 'lasso', 'hl', 'pen']){ await p.click(`#skTools [data-tool=${t}]`); tops.push(await p.$eval('#skCanvas', c => Math.round(c.getBoundingClientRect().top))); }
  console.log('stable canvas:', tops.every(t => Math.abs(t - top0) < 1), tops.join(','));
  // 지우개 크기는 펜과 따로 기억
  await p.click('#skTools [data-tool=erase]'); await setRange(60);
  await p.click('#skTools [data-tool=pen]'); const penSize = await p.inputValue('#skSize'); const penLab = await p.textContent('#skSizeLab');
  await p.click('#skTools [data-tool=erase]'); console.log('sizes: pen', penSize, penLab, '| eraser', await p.inputValue('#skSize'), await p.textContent('#skSizeLab'), '| eraser max', await p.$eval('#skSize', r => r.max), '| erase opts:', await p.isVisible('#skEraseOpts'));
  await setRange(12);
  // 획 두 개
  await p.click('#skTools [data-tool=ball]'); await setRange(6);
  await line([[50, 100], [150, 100], [250, 100]]); await line([[50, 200], [150, 200], [250, 200]]);
  console.log('drawn:', await ink(60, 100), await ink(60, 200));
  // 획 지우개: 가운데만 스쳐도 획 전체가 사라진다
  await p.click('#skTools [data-tool=erase]'); await p.click('#skEraseOpts [data-em=stroke]');
  await line([[150, 85], [150, 115]]);
  console.log('stroke eraser: A gone', !(await ink(60, 100)), '| B kept', await ink(60, 200));
  await p.click('#skUndo'); await p.waitForTimeout(100); console.log('undo erase: A back', await ink(60, 100));
  await p.click('#skRedo'); await p.waitForTimeout(100); console.log('redo erase: A gone', !(await ink(60, 100)));
  await p.click('#skUndo'); await p.waitForTimeout(100);
  // 부분 지우개: 닿은 곳만
  await p.click('#skEraseOpts [data-em=part]'); await line([[150, 185], [150, 215]]);
  console.log('part eraser: hole', !(await ink(150, 200)), '| rest kept', await ink(60, 200));
  // 올가미로 A를 골라 아래로 옮기기
  await p.click('#skTools [data-tool=lasso]');
  await line([[30, 70], [270, 70], [270, 130], [30, 130], [30, 72]]);
  console.log('lasso:', await p.isVisible('#skSelBar'), await p.textContent('#skSelN'));
  await line([[150, 100], [150, 200], [150, 300]]);
  console.log('moved: new', await ink(60, 300), '| old empty', !(await ink(60, 100)));
  await p.click('#skUndo'); await p.waitForTimeout(100); console.log('undo move:', await ink(60, 100), !(await ink(60, 300)));
  // 멈추면 곧은 선
  await p.click('#skTools [data-tool=pen]');
  await p.mouse.move(X(50), Y(420)); await p.mouse.down();
  for (const [x, y] of [[80, 390], [110, 450], [140, 390], [170, 450], [200, 390], [230, 450], [250, 420]]) await p.mouse.move(X(x), Y(y), {steps: 4});
  await p.waitForTimeout(800); await p.mouse.up(); await p.waitForTimeout(150);
  console.log('hold → straight line:', await ink(150, 420), '| wave gone', !(await ink(110, 445)));
  // 옆에 두기
  await p.click('#skDock'); await p.waitForTimeout(200);
  const dock = await p.$eval('#sketch', s => ({dock: s.classList.contains('dock'), w: Math.round(s.getBoundingClientRect().width)}));
  console.log('dock:', dock.dock, '| narrower than screen:', dock.w < 900, '| remembered:', await p.evaluate(() => localStorage.getItem('nv.lib.skDock')));
  // 새 쪽: 앞 쪽은 저장, 새 종이
  const n0 = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').count(); g.onsuccess = () => res(g.result); }; }));
  await p.click('#skNewPage'); await p.waitForTimeout(700);
  const n1 = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').count(); g.onsuccess = () => res(g.result); }; }));
  console.log('new page: saved', n1 - n0, '| blank', !(await ink(60, 100)) && !(await ink(60, 200)), '| still open', await p.isVisible('#skCanvas'));
  await p.screenshot({path: path.join(__dirname, 'out', 'pad_dock.png')});
  await p.click('#skDock'); await p.click('#skX'); await p.waitForTimeout(200);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
