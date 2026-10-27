const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data'); const OUT = path.join(__dirname, 'out');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1440,height:900}, acceptDownloads:true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  const reqs = [];
  await p.route('https://generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); reqs.push(body);
    let t = '이어진 문장이다.';
    if (body.systemInstruction.parts[0].text.includes('교정자')) t = JSON.stringify({items:[{wrong:'않되', right:'안 돼', why:'맞춤법'},{wrong:'없는말', right:'없는 말', why:'띄어쓰기'}]});
    r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body: `data: ${JSON.stringify({candidates:[{content:{parts:[{text:t}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:5}})}\n\n`});
  });
  let dialogs = []; p.on('dialog', d => { dialogs.push(d.message().slice(0,40)); d.type() === 'prompt' ? d.accept(p._promptAns || '메모') : d.accept(); });
  // 1) 예전 판(localStorage) 원고 옮기기
  await p.goto(APP); await p.waitForTimeout(500);
  await p.evaluate(() => {
    localStorage.setItem('nv.st.projects', JSON.stringify([{id:'p1', name:'옛 작품', min:5000, max:6000, daily:3000, days:[1], rating:'15', style:'commercial'}]));
    localStorage.setItem('nv.st.eps.p1', JSON.stringify([{id:'e1', title:'1화', status:'draft', chars:10, t:1}]));
    localStorage.setItem('nv.st.txt.p1.e1', JSON.stringify('예전에 쓴 원고다. 않되 없는말.'));
    localStorage.setItem('nv.st.cur', JSON.stringify({pid:'p1', eid:'e1'}));
    localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x'));
    localStorage.setItem('nv.notes.소설/hwasan', JSON.stringify([{id:'n1', ep:0, epName:'1화', parts:[], text:'그 순간, 문이 열렸다.', color:'g', note:'새 인물로 끊기', t:5}]));
  });
  await p.reload(); await p.waitForTimeout(1200);
  await p.click('#hWrite'); await p.waitForTimeout(800);   // 이제는 홈의 '이어 쓰기'로 들어간다
  console.log('auto studio:', await p.isVisible('#studio'), '| migrated text:', await p.inputValue('#stText'), '| ls removed:', await p.evaluate(() => localStorage.getItem('nv.st.txt.p1.e1') === null));
  // 2) 큰 원고 (2MB) 저장 → 새로 고침 뒤 유지
  await p.evaluate(() => { const ta = document.querySelector('#stText'); ta.value = ta.value + '\n' + '가'.repeat(2_000_000); ta.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(3500); await p.reload(); await p.waitForTimeout(2000); await p.click('#hWrite'); await p.waitForTimeout(800);   // 홈에서 이어 쓰기
  console.log('2MB persisted:', (await p.inputValue('#stText')).length > 2_000_000);
  await p.evaluate(() => { const ta = document.querySelector('#stText'); ta.value = '예전에 쓴 원고다. 않되 없는말.\n\n두 번째 문단.'; ta.dispatchEvent(new Event('input')); }); await p.waitForTimeout(900);
  // 3) AI 넣기 후 Ctrl+Z
  await p.click('[data-itab=ai]'); await p.selectOption('#stProv', 'gemini');
  await p.click('#stText'); await p.keyboard.press('Control+End');
  await p.click('[data-st=continue]'); await p.waitForTimeout(900); await p.click('#stInsert'); await p.waitForTimeout(300);
  const afterIns = await p.inputValue('#stText');
  await p.click('#stText'); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  console.log('insert:', afterIns.includes('이어진 문장이다'), '| undo:', !(await p.inputValue('#stText')).includes('이어진 문장이다'));
  // 4) 맞춤법
  await p.click('#stSpellBtn'); await p.waitForTimeout(1200);
  console.log('spell items:', await p.$$eval('.st-sp', e => e.length)); await p.click('#stSpellAll'); await p.waitForTimeout(300);
  console.log('spell fixed:', await p.inputValue('#stText'));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200); console.log('spell undo one:', (await p.inputValue('#stText')).slice(0, 40));
  // 5) 원고 메모
  await p.evaluate(() => { const ta = document.querySelector('#stText'); ta.focus(); ta.setSelectionRange(0, 6); });
  p._promptAns = '여기 더 세게'; await p.click('#stCmtBtn'); await p.waitForTimeout(400);
  await p.click('[data-itab=info]');
  console.log('comment marks:', await p.$$eval('#stHl mark', e => e.map(x => x.textContent)), '| list:', await p.$$eval('#stCmts .st-cmt', e => e.length));
  // 6) 판 비교
  await p.keyboard.press('Control+s'); await p.waitForTimeout(300);
  await p.click('#stText'); await p.keyboard.press('Control+End'); await p.keyboard.type('\n\n새로 쓴 문단.'); await p.waitForTimeout(800);
  await p.click('[data-itab=snap]'); await p.waitForTimeout(300); await p.click('#stSnaps .it >> nth=0 >> text=비교'); await p.waitForTimeout(300);
  console.log('diff view:', await p.isVisible('#stDiffBody'), (await p.textContent('#stDiffHead')).replace(/\s+/g,' '), await p.$$eval('#stDiffBody .a, #stDiffBody ins', e => e.length));
  await p.screenshot({path: path.join(OUT, 'v8_diff.png')});
  await p.click('#stDiffBack');
  // 7) 내보내기
  await p.click('[data-itab=info]'); await p.selectOption('#stExpFmt', 'book'); await p.waitForTimeout(100); console.log('export count:', await p.textContent('#stExpCount'));
  // 8) 참고 탭
  await p.click('[data-itab=ref]'); await p.waitForTimeout(200); console.log('ref items:', await p.$$eval('.st-ref', e => e.length));
  await p.click('.st-ref [data-a=ai]'); console.log('ask filled:', (await p.inputValue('#stAsk')).slice(0, 30));
  // 9) 분석 보고서 가져오기 → 작법 카드 → AI에 같이 감
  await p.click('.st-rail [data-view=bible]'); await p.waitForTimeout(200);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#stMdImp')]); await fc.setFiles(path.join(DATA, 'imp', 'report.md')); await p.waitForTimeout(500);
  console.log('craft cards:', await p.$$eval('.st-bc', e => e.length));
  await p.click('.st-rail [data-view=write]'); await p.click('[data-itab=ai]'); await p.click('[data-st=cut]'); await p.waitForTimeout(900);
  console.log('craft sent:', reqs.at(-1).contents[0].parts[0].text.includes('<craft_notes>'), '| not in bible:', !reqs.at(-1).contents[0].parts[0].text.includes('[작법]'));
  // 10) 합본 가져오기
  const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('#stImport')]); await fc2.setFiles(path.join(DATA, 'imp', 'combined.txt')); await p.waitForTimeout(800);
  console.log('import split eps:', await p.$$eval('#stEpList .st-it', e => e.length), '| dialog:', dialogs.at(-1));
  // 11) 자료실 합본 나누기
  await p.click('#gnav [data-g=lib]'); await p.waitForTimeout(300);
  await p.setInputFiles('#pickFolder', path.join(DATA, 'vt3a')); await p.waitForTimeout(800);
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("hapbon")'); await p.waitForTimeout(1200);
  await p.click('#epBtn'); await p.waitForTimeout(300); console.log('reader split eps:', await p.$$eval('#epList .it', e => e.length), '| btn:', await p.textContent('#epSplit'));
  await p.click('#epSplit'); await p.waitForTimeout(1000); await p.click('#epBtn'); await p.waitForTimeout(300); console.log('after off:', await p.$$eval('#epList .it', e => e.length));
  await p.keyboard.press('Escape');
  // 12) 휴대폰
  await p.click('#gnav [data-g=write]').catch(()=>{}); await p.waitForTimeout(400);
  await p.setViewportSize({width:390, height:844}); await p.waitForTimeout(300); await p.screenshot({path: path.join(OUT, 'v8_phone.png')});
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
