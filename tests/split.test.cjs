const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1440,height:900}, acceptDownloads:true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  p.on('dialog', d => d.accept('새 작품'));
  await p.goto(APP); await p.waitForTimeout(800);
  await p.evaluate(() => localStorage.setItem('nv.set.stStart','false')); await p.reload(); await p.waitForTimeout(800);
  await p.setInputFiles('#pickFolder', path.join(DATA,'vt2')); await p.waitForTimeout(900);
  await p.click('.grid .card:has-text("hwasan")'); await p.waitForTimeout(900); await p.click('#coachOk').catch(()=>{});
  // 떠오른 문장 태그
  await p.click('#tgTool').catch(()=>{}); await p.click('.tabs button[data-tab=notes]');
  await p.fill('#ideaIn', '너는 왜 웃어'); await p.click('#ideaQuick [data-t=대사]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await p.fill('#ideaIn', '비 오는 객잔 #장면'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await p.fill('#ideaIn', '태그 없는 생각'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  console.log('filter chips:', await p.$$eval('#ideaFilter button', e => e.map(x => x.textContent)));
  await p.click('#ideaFilter [data-f=대사]'); await p.waitForTimeout(200);
  console.log('filtered:', await p.$$eval('#ideaList .item .q', e => e.map(x => x.textContent)));
  await p.click('#toolClose').catch(()=>{});
  // 집필실 + 자료 나란히
  await p.evaluate(() => document.querySelector('#btnStudio').click()); await p.waitForTimeout(600);
  await p.click('#stText'); await p.keyboard.type('첫 줄이다.\n\n둘째 줄이다.'); await p.waitForTimeout(900);
  await p.click('#stSplitBtn'); await p.waitForTimeout(900);
  const box = await p.$eval('#stRefPane', el => { const r = el.getBoundingClientRect(); return {w: Math.round(r.width), vis: !el.hidden}; });
  const ta = await p.$eval('#stText', el => Math.round(el.getBoundingClientRect().width));
  console.log('split:', box.vis, '| pane w>250:', box.w > 250, '| text w>300:', ta > 300);
  console.log('rp work:', await p.$eval('#rpWork', s => s.selectedOptions[0]?.textContent), '| paras:', (await p.$$('#rpBody p')).length > 0);
  const before = await p.$eval('#rpEp', s => s.value); await p.click('#rpNext'); await p.waitForTimeout(400);
  console.log('rp next:', before, '→', await p.$eval('#rpEp', s => s.value));
  await p.evaluate(() => { const el = document.querySelector('#rpBody p'); const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); });
  const sel = await p.evaluate(() => getSelection().toString().trim());
  await p.click('#rpIdea'); await p.waitForTimeout(200);
  console.log('rp idea saved:', await p.evaluate(s => JSON.parse(localStorage.getItem('nv.ideas'))[0].text === s.slice(0, 600), sel), '| from:', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.ideas'))[0].from));
  await p.screenshot({path: path.join(__dirname, 'out', 'split.png')});
  await p.click('#rpClose'); await p.waitForTimeout(200); console.log('closed:', await p.$eval('#stRefPane', el => el.hidden));
  // 한글(hwpx)
  if (!await p.isVisible('#stExpHwpx')){ if (!await p.isVisible('[data-itab=info]')) await p.click('#stInspTg'); await p.waitForTimeout(200); await p.click('[data-itab=info]'); await p.waitForTimeout(200); }
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#stExpHwpx')]);
  const out = path.join(__dirname, 'out', 'test.hwpx'); await dl.saveAs(out); const buf = fs.readFileSync(out);
  console.log('hwpx zip:', buf.slice(0,2).toString() === 'PK', '| mimetype first:', buf.slice(30, 38).toString() === 'mimetype');
  const zip = await p.evaluate(async b64 => { const z = await JSZip.loadAsync(b64, {base64: true}); const s = await z.file('Contents/section0.xml').async('string'); return s.includes('첫 줄이다.') && s.includes('둘째 줄이다.'); }, buf.toString('base64'));
  console.log('hwpx text:', zip);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
