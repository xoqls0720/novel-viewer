const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data'); const OUT = path.join(__dirname, 'out');

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:900}});
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  p.on('dialog', d => d.accept());
  await p.route('https://generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); const u = body.contents[0].parts.at(-1).text;
    let t = '다듬은 문장이다. 그는 웃었다.\n===이유===\n• [리듬] 같은 어미가 세 번 이어져서 하나를 짧게 끊었다\n• [중복] 가까이 반복된 \'갑자기\'를 뺐다';
    if (u.includes('냉정하게 피드백')) t = '1) 첫 세 문단: 약함\n===기억===\n절단은 소리나 목소리로 끊는다.';
    r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body: `data: ${JSON.stringify({candidates:[{content:{parts:[{text:t}]},finishReason:'STOP'}]})}\n\n`});
  });
  await p.goto(APP); await p.waitForTimeout(600);
  await p.evaluate(() => localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')));
  await p.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await p.waitForTimeout(800);
  await p.click('#btnStudio'); await p.waitForTimeout(500);
  const draft = '그는 갑자기 일어섰다. 그는 갑자기 걸었다. 그는 문을 열었다. 그녀는 정말 너무 놀랐다.\n\n그리고 그는 웃었다. 그것은 이상한 일이었던 것이다. 갑자기 바람이 불었다. 갑자기 비가 왔다.\n\n'.repeat(4);
  await p.evaluate(t => { const ta = document.querySelector('#stText'); ta.value = t; ta.dispatchEvent(new Event('input')); }, draft); await p.waitForTimeout(900);
  // 1) 문장 다듬기 + 이유
  await p.evaluate(() => { const ta = document.querySelector('#stText'); ta.focus(); ta.setSelectionRange(0, 30); });
  await p.click('[data-itab=ai]'); await p.selectOption('#stProv', 'gemini'); await p.click('[data-st=polish]'); await p.waitForTimeout(1000);
  console.log('out body:', JSON.stringify(await p.textContent('#stOut')), '| reasons:', await p.$$eval('.st-why', e => e.map(x => x.querySelector('.tag')?.textContent)), '| diff:', await p.isVisible('#stLearn .st-diff'));
  await p.click('.st-why button >> nth=0');
  await p.click('#stReplace'); await p.waitForTimeout(300); console.log('replaced start:', (await p.inputValue('#stText')).slice(0, 18));
  // 4) 피드백 → 기억할 것
  await p.click('[data-st=feedback]'); await p.waitForTimeout(1000);
  console.log('memo:', await p.textContent('.st-memo .tx')); await p.click('.st-memo button');
  await p.click('.st-rail [data-view=bible]'); await p.waitForTimeout(200);
  console.log('craft note card:', await p.$$eval('.st-bc', e => e.map(x => x.querySelector('input').value + ' :: ' + x.querySelector('textarea').value.split('\n').length + '줄')));
  await p.click('.st-rail [data-view=write]');
  // 2) 거울
  await p.click('[data-itab=mirror]'); await p.waitForTimeout(400);
  console.log('mirror:', await p.$$eval('.st-hb', e => e.map(x => x.querySelector('b').textContent + '=' + x.querySelector('.v').textContent + (x.classList.contains('warn') ? '!' : ''))).then(a => a.join(' ')));
  await p.click('.st-hb >> nth=2 >> button'); await p.waitForTimeout(300); console.log('marks hb:', await p.$$eval('#stHl mark.hb', e => e.length));
  await p.screenshot({path: path.join(OUT, 'v10_mirror.png')});
  // 3) 퇴고 패턴: 판 남기고 고치기 여러 번
  for (let i = 0; i < 3; i++){
    await p.keyboard.press('Control+s'); await p.waitForTimeout(250);
    await p.evaluate(() => { const ta = document.querySelector('#stText'); ta.value = ta.value.replace('갑자기 ', '').replace('정말 ', ''); ta.dispatchEvent(new Event('input')); }); await p.waitForTimeout(800);
  }
  await p.keyboard.press('Control+s'); await p.waitForTimeout(300);
  // 5) 참고 작품
  await p.click('#stProjInfo'); await p.waitForTimeout(200); console.log('ref options:', await p.$$eval('#stRefWork option', e => e.map(x => x.textContent)));
  await p.selectOption('#stRefWork', {label: 'hwasan'}); await p.waitForTimeout(2500);
  await p.click('.st-rail [data-view=stats]'); await p.waitForTimeout(1500);
  console.log('compare rows:', await p.$$eval('#stStatsView .st-tbl tr', e => e.length), '| revision:', (await p.textContent('#stRevBox')).replace(/\s+/g, ' ').slice(0, 160));
  await p.screenshot({path: path.join(OUT, 'v10_stats.png'), fullPage: false});
  await p.click('.st-rail [data-view=write]'); await p.waitForTimeout(300);
  console.log('meter ref:', (await p.textContent('#stMeter')).includes('참고'));
  // 6) 용어 설명
  await p.hover('#stMeter .term >> nth=0'); await p.waitForTimeout(200); console.log('term pop:', await p.isVisible('#termPop'), (await p.textContent('#termPop')).slice(0, 30));
  await p.screenshot({path: path.join(OUT, 'v10_write.png')});
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
