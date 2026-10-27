const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data'); const OUT = path.join(__dirname, 'out');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:900}, acceptDownloads:true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  const bodies = []; let mode = 'ok';
  await p.route('https://api.anthropic.com/**', async r => {
    const body = JSON.parse(r.request().postData()); bodies.push(body);
    const ev = (t,d)=>`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`; const n = bodies.length;
    let text = mode === 'refuse' ? '' : '답 '+n;
    if (body.output_config?.format) text = JSON.stringify({base_prompt:'2boys, ruined cathedral', characters:[{name:'라파엘', prompt:'1boy, silver hair', negative:'', position:'C3'}], negative:'', size:'832x1216', notes:''});
    r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body:
      ev('message_start',{type:'message_start',message:{id:'m'+n,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,usage:{input_tokens:50,output_tokens:0}}})
      + (text ? ev('content_block_start',{type:'content_block_start',index:0,content_block:{type:'text',text:''}}) + ev('content_block_delta',{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}) + ev('content_block_stop',{type:'content_block_stop',index:0}) : '')
      + ev('message_delta',{type:'message_delta',delta:{stop_reason: mode==='refuse'?'refusal':'end_turn'},usage:{output_tokens:3}}) + ev('message_stop',{type:'message_stop'})});
  });
  const quick = async (fn) => { await p.click('#btnQuick'); await p.waitForTimeout(150); await fn(); await p.keyboard.press('Escape'); await p.waitForTimeout(150); };
  await p.goto(APP); await p.waitForTimeout(1500);
  await p.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await p.waitForTimeout(800);
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("hwasan")'); await p.waitForTimeout(800);
  console.log('epTitle:', await p.textContent('#epTitle'), '| pageInd:', await p.textContent('#pageInd'));
  // 회차 목록
  await p.click('#epBtn'); await p.waitForTimeout(200); console.log('eplist:', await p.$$eval('#epList .it', e=>e.length)); await p.click('#epList .it >> nth=2'); await p.waitForTimeout(600); console.log('after pick:', await p.textContent('#epTitle'));
  // 스크럽
  await p.$eval('#scrub', el => { el.value = 500; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }); await p.waitForTimeout(300); console.log('scrub 50% ->', await p.textContent('#pageInd'));
  // 테마·글자
  await quick(async () => { await p.click('#themeSw [data-theme=black]'); await p.click('#fsUp'); await p.click('#fsUp'); });
  console.log('theme:', await p.$eval('html', h=>h.dataset.theme), 'fs:', await p.$eval('html', h=>getComputedStyle(h).getPropertyValue('--fs')));
  await quick(async () => { await p.click('#themeSw [data-theme=light]'); });
  // Claude 대화 (실패 후 이어가기)
  await p.click('#tgTool'); await p.click('.tabs button[data-tab=set]'); await p.evaluate(() => document.querySelectorAll('details.prov').forEach(d => d.open = true)); await p.fill('#apiKey','sk-ant-test'); await p.click('#keySave');
  await p.click('.tabs button[data-tab=ai]'); mode = 'refuse'; await p.click('button[data-ai=cut]'); await p.waitForTimeout(5000);
  mode = 'ok'; await p.fill('#aiQ','다시'); await p.click('#aiAsk'); await p.waitForTimeout(1200); await p.fill('#aiQ','이어서'); await p.click('#aiAsk'); await p.waitForTimeout(1200);
  const last = bodies[bodies.length-1];
  console.log('chat:', bodies.length, 'reqs; last msgs:', last.messages.map(m=>m.role+':'+(typeof m.content==='string'?'str':m.content.map(c=>c.type+(c.cache_control?'*':'')).join('+'))).join(' | '));
  // 형광펜
  await p.click('#toolClose').catch(()=>{}); await p.click('#tgTool');
  await p.evaluate(() => { const a = document.querySelector('.novel p[data-i="3"]').firstChild; const r = document.createRange(); r.setStart(a,0); r.setEnd(a,5); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await p.mouse.up(); await p.waitForTimeout(400); await p.click('#selbar [data-hl="g"]'); await p.waitForTimeout(200);
  console.log('mark:', await p.$$eval('.novel mark', e=>e.map(m=>m.className+':'+m.textContent)));
  // 장면 담기(소설) → 필기 → 저장
  await p.click('#btnScrap'); await p.waitForTimeout(800); console.log('sketch open:', await p.isVisible('#sketch'));
  const box = await p.$eval('#skCanvas', c => { const b = c.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; });
  await p.mouse.move(box[0]+40, box[1]+40); await p.mouse.down(); await p.mouse.move(box[0]+200, box[1]+120, {steps:8}); await p.mouse.up();
  await p.fill('#skNote', '대사 없이 행동으로 감정 전환'); await p.click('#skSave'); await p.waitForTimeout(800);
  await p.click('#tgTool'); await p.click('.tabs button[data-tab=notes]'); await p.waitForTimeout(800);
  console.log('scraps:', await p.$$eval('#scrapList .card', e=>e.length), '| notes:', await p.$$eval('#noteList .item', e=>e.length));
  // 굿노트 PDF 다운로드
  const [dl] = await Promise.all([p.waitForEvent('download', {timeout: 30000}), p.selectOption('#noteExport','gn')]); console.log('pdf:', dl.suggestedFilename());
  const [dl2] = await Promise.all([p.waitForEvent('download', {timeout: 30000}), p.selectOption('#noteExport','mood')]); console.log('mood:', dl2.suggestedFilename());
  const [dl3] = await Promise.all([p.waitForEvent('download', {timeout: 30000}), p.click('#scrapList [data-a=pc]')]); console.log('procreate:', dl3.suggestedFilename());
  // 만화 장면 담기
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("deathnote")'); await p.waitForTimeout(3000);
  for (let k=0;k<2;k++){ await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500); }
  console.log('manga pageInd:', await p.textContent('#pageInd'));
  await p.click('#btnScrap'); await p.waitForTimeout(800); console.log('manga sketch size:', await p.$eval('#skCanvas', c=>c.width+'x'+c.height)); await p.click('#skCancel');
  // 웹툰
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("misaeng")'); await p.waitForTimeout(1500);
  await p.$eval('#reader', r => r.scrollTop = 3000); await p.waitForTimeout(800);
  await p.click('#btnScrap').catch(e=>console.log('scrap btn hidden?')); await p.waitForTimeout(800); console.log('webtoon sketch:', await p.isVisible('#sketch'), await p.$eval('#skCanvas', c=>c.width+'x'+c.height)); await p.click('#skCancel').catch(()=>{});
  console.log('immersive after scroll:', await p.$eval('#app', a=>a.classList.contains('immersive')));
  // 동기화 UI (file://)
  console.log('gd status:', await p.textContent('#gdStatus'));
  console.log('ERRORS:', errs);
  await b.close();
})();
