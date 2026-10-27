const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1024,height:1366}, acceptDownloads:true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  p.on('dialog', d => d.accept('새 작품'));
  await p.route('https://generativelanguage.googleapis.com/**', r => r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body: `data: ${JSON.stringify({candidates:[{content:{parts:[{text:'절단 공식: 소리로 끊는다.'}]},finishReason:'STOP'}]})}\n\n`}));
  await p.goto(APP); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart','false'); localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); localStorage.setItem('nv.provider','"gemini"'); localStorage.setItem('nv.set.provider','"gemini"'); });
  await p.reload(); await p.waitForTimeout(800);
  console.log('title:', await p.title(), '| brand:', await p.textContent('.brand h1'));
  // 아이패드 세로(1024px): 서재·도구 덮개가 열리는지
  console.log('mobile css@1024:', await p.evaluate(() => matchMedia('(max-width:1100px)').matches));
  await p.click('#gnav [data-g=lib]'); await p.waitForTimeout(200); console.log('side open:', await p.isVisible('#libPage'));   // 서재는 이제 옆 칸이 아니라 한 판
  await p.setInputFiles('#pickFolder', path.join(DATA,'vt2')); await p.waitForTimeout(900);
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("hwasan")'); await p.waitForTimeout(900); await p.click('#coachOk').catch(()=>{});
  await p.click('#tgTool'); await p.waitForTimeout(300); console.log('tool open@1024:', await p.evaluate(() => getComputedStyle(document.querySelector('.tool')).display) !== 'none');
  await p.screenshot({path:'ux/ipad_tool.png'});
  // 떠오른 문장
  await p.click('.tabs button[data-tab=notes]'); await p.fill('#ideaIn', '검은 태양 아래에서만 피는 꽃'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('idea:', await p.$$eval('#ideaList .item .q', e => e.map(x => x.textContent)));
  // 자유 그림
  await p.click('#ideaDraw'); await p.waitForTimeout(400); console.log('free canvas:', await p.isVisible('#sketch'), await p.$eval('#skCanvas', c => c.width + 'x' + c.height)); await p.click('#skX');
  // AI 분석 → 작법 카드로 (집필실 작품이 없을 때 → 만들고 → 저장)
  await p.click('.tabs button[data-tab=ai]'); await p.selectOption('#aiProv','gemini'); await p.fill('#aiQ','절단 공식 뽑아 줘'); await p.click('#aiAsk'); await p.waitForTimeout(1000);
  await p.click('#aiCraft'); await p.waitForTimeout(300); console.log('no project toast ok');
  await p.click('#toolClose').catch(()=>{});
  await p.evaluate(() => document.querySelector('#btnStudio').click()); await p.waitForTimeout(600);   // 첫 작품 자동 생성
  await p.click('#gnav [data-g=lib]'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#app').classList.remove('show-side'));
  await p.click('#tgTool'); await p.click('.tabs button[data-tab=ai]'); await p.click('#aiCraft'); await p.waitForTimeout(300);
  console.log('craft saved:', await p.evaluate(() => { const ps = JSON.parse(localStorage.getItem('nv.st.projects')); const b = JSON.parse(localStorage.getItem('nv.st.bible.' + ps[0].id) || '[]'); return b.map(x => x.kind + ':' + x.title); }));
  // 집필실 참고 탭에 떠오른 문장 + 커서 자리에 넣기
  await p.click('#toolClose').catch(()=>{}); await p.evaluate(() => document.querySelector('#btnStudio').click()); await p.waitForTimeout(500);
  await p.click('#stText'); await p.keyboard.type('첫 줄.'); await p.waitForTimeout(900);
  await p.click('#stInspTg'); await p.waitForTimeout(200); await p.click('[data-itab=ref]'); await p.waitForTimeout(300);
  console.log('ref ideas:', await p.$$eval('#stRefList .st-ref .q', e => e.slice(0,2).map(x => x.textContent)));
  await p.click('#stRefList .st-ref [data-a=ins]'); await p.waitForTimeout(400);
  console.log('inserted:', (await p.inputValue('#stText')).includes('검은 태양'));
  // docx 내보내기
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#stInspTg').then(()=>p.click('[data-itab=info]')).then(()=>p.click('#stExpDocx'))]);
  await dl.saveAs(path.join(__dirname, 'out', 'test.docx'));
  const buf = require('fs').readFileSync(path.join(__dirname, 'out', 'test.docx')); console.log('docx zip:', buf.slice(0, 2).toString() === 'PK', '| has document:', buf.includes(Buffer.from('word/document.xml')));
  console.log('docx:', dl.suggestedFilename());
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
