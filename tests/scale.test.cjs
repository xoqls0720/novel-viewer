const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data'); const OUT = path.join(__dirname, 'out');

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:900}});
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(APP); await p.waitForTimeout(500);
  await p.click('#gnav [data-g=write]'); await p.waitForTimeout(500);
  const t0 = Date.now();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#stImport')]); await fc.setFiles(path.join(DATA, 'imp', 'big300.txt')); await p.waitForTimeout(3000);
  console.log('import ms', Date.now() - t0, '| eps:', await p.$$eval('#stEpList .st-it', e => e.length));
  const ls = await p.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; });
  console.log('localStorage chars:', ls);
  await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'true'));   // 다시 열면 집필실부터(이제는 고르는 설정)
  await p.reload(); await p.waitForTimeout(2000);
  console.log('after reload eps:', await p.$$eval('#stEpList .st-it', e => e.length), '| cur text len:', (await p.inputValue('#stText')).length, '| tail:', (await p.inputValue('#stText')).slice(-6));
  await p.click('#stEpList .st-it >> nth=150'); await p.waitForTimeout(300); console.log('ep150 tail:', (await p.inputValue('#stText')).slice(-6));
  // 작품 전체 바꾸기 성능
  const t1 = Date.now(); await p.keyboard.press('Control+f'); await p.fill('#stFindQ', '청명이'); await p.fill('#stRepQ', '청운이'); await p.check('#stFindAll'); await p.click('#stRepAll'); await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('곳을 바꿨어요'), null, {timeout: 60000});
  console.log('replace all ms', Date.now() - t1, '| sample:', (await p.inputValue('#stText')).slice(0, 8));
  await p.click('.st-rail [data-view=stats]'); await p.waitForTimeout(300); console.log('stats total:', (await p.textContent('.st-kpi div')).replace(/\s+/g,' '));
  console.log('errs', errs); await b.close();
})();
