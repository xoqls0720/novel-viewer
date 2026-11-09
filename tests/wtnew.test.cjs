// 웹툰 만들기 개선: 새 말풍선(떨림·전화·검은 독백·이어 말하기), 빈 자리 자동 배치, 글꼴, 웹툰식 틀·여백·테두리, 빈 말풍선은 내보낼 때 빠짐, 이야기 틀
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1500, height: 940}, acceptDownloads: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '..') + '/index.html'); await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'false')); await p.reload(); await p.waitForTimeout(700);
  await p.click('#gnav [data-g=toon]'); await p.waitForTimeout(300); await p.click('#wtNew'); await p.waitForTimeout(500);
  await p.click('#wtLayouts [data-l="w3"]'); await p.selectOption('#wtGutter', 'bleed'); await p.waitForTimeout(150);
  const box = await p.$eval('#wtCv', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  await p.mouse.click(box.x + box.w * 0.4, box.y + box.h * 0.15); await p.waitForTimeout(150);
  for (const k of ['speech', 'wave', 'electric', 'mono']){ await p.click(`#wtAdd [data-add=${k}]`); await p.waitForTimeout(60); await p.keyboard.type({speech: '야, 찐따.', wave: '저, 저는 그냥…', electric: '[문자] 옥상으로 와', mono: '왜 하필 나야'}[k]); await p.waitForTimeout(60); }
  const focused = await p.evaluate(() => document.activeElement?.id);
  // 이어 말하기
  await p.click('#wtLink'); await p.keyboard.type('지금 당장.'); await p.waitForTimeout(80);
  const st = await p.evaluate(() => { const WT = nvWT.WT; const pg = WT.proj.pages[WT.pi]; const it = pg.items; const ov = []; for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++){ const a = it[i], c = it[j]; if (Math.abs(a.x - c.x) < (a._hw + c._hw) * 0.7 && Math.abs(a.y - c.y) < (a._hh + c._hh) * 0.7) ov.push([i, j]); } return {n: it.length, shapes: it.map(x => x.shape + (x.fill === '#1c1c1e' ? '·dark' : '') + (x.link ? '·link' : '')).join(','), overlap: ov.length}; });
  // 글꼴·굵게
  await p.selectOption('#wtBubFont', 'hand'); await p.check('#wtBold'); const bf = await p.evaluate(() => { const WT = nvWT.WT; const pg = WT.proj.pages[WT.pi]; const it = pg.items.at(-1); return it.bf + '/' + it.bold; });
  // 빈 말풍선 하나 → 내보낼 때 빠지는지(그리기 호출 수로 확인)
  await p.click('#wtAdd [data-add=speech]'); await p.waitForTimeout(60);
  const emptySkip = await p.evaluate(() => { const WT = nvWT.WT; const pg = WT.proj.pages[WT.pi]; const last = pg.items.at(-1); const c = document.createElement('canvas'); c.width = 1500; c.height = 4500; const g = c.getContext('2d'); WT.exporting = true; try{ nvWT.drawItem(g, last); } finally { WT.exporting = false; } const d = g.getImageData(0, 0, 1500, 4500).data; let any = false; for (let i = 3; i < d.length; i += 4) if (d[i]){ any = true; break; } return !String(last.text).trim() && !any; });
  await p.click('#wtDel');
  await p.selectOption('#wtBorder', '8'); await p.selectOption('#wtSize', '4500'); await p.waitForTimeout(200);
  // 이야기 틀
  await p.click('#wtAuto'); await p.evaluate(() => document.querySelectorAll('#wtAutoBox details').forEach(d => d.open = true)); await p.waitForTimeout(200); await p.selectOption('#wtStoryFrame', 'pair'); const fl = await p.evaluate(() => window.nvWtFrameLine());
  await p.click('#wtAutoX').catch(() => {});
  await p.keyboard.press('Escape').catch(() => {}); await p.mouse.click(5, 5).catch(() => {}); await p.waitForTimeout(300);
  await p.screenshot({path: path.join(__dirname, 'out', 'wt_new.png')});
  const [dl] = await Promise.all([p.waitForEvent('download'), p.selectOption('#wtExport', 'this')]); const f = path.join(__dirname, 'out', 'wt_new_page.png'); await dl.saveAs(f);
  console.log('focus after add:', focused);
  console.log('items:', st.n, '| shapes:', st.shapes, '| overlap:', st.overlap);
  console.log('font:', bf, '| empty bubble skipped on export:', emptySkip);
  console.log('frame line:', /2인 관계극/.test(fl));
  console.log('layouts:', await p.$$eval('#wtLayouts button', x => x.length), '| border:', await p.evaluate(() => nvWT.WT.proj.border), '| scroll page h:', await p.evaluate(() => nvWT.WT.proj.pages[nvWT.WT.pi].h));
  console.log('ERRORS:', errs.length ? errs.join(' / ') : 'none');
  await b.close();
})();
