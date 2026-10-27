const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data'); const OUT = path.join(__dirname, 'out');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1440,height:900}, acceptDownloads:true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror '+e.message)); p.on('console', m => m.type()==='error' && !/ERR_|net::/.test(m.text()) && errs.push('console '+m.text()));
  const reqs = [];
  await p.route('https://generativelanguage.googleapis.com/**', async r => {
    const body = JSON.parse(r.request().postData()); reqs.push(body);
    const t = body.contents[0].parts.at(-1).text.includes('요약') ? '청명이 거지에게 맞는다. 떡밥: 매화검.' : '이어진 문장이다.\n\n“좋아.”';
    r.fulfill({status:200, headers:{'content-type':'text/event-stream','access-control-allow-origin':'*'}, body: `data: ${JSON.stringify({candidates:[{content:{parts:[{text:t}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:5}})}\n\n`});
  });
  await p.goto(APP); await p.waitForTimeout(1000);
  await p.evaluate(() => localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')));
  await p.click('#gnav [data-g=write]'); await p.waitForTimeout(500);
  await p.fill('#stTitle', '1화 검을 뽑다');
  await p.click('#stText'); await p.keyboard.type('“거기 서라.”\n\n청명이 돌아섰다. 바람이 불었다. 청명은 웃었다.\n\n', {delay:1});
  await p.waitForTimeout(900);
  console.log('meter:', (await p.textContent('#stMeter')).replace(/\s+/g,' ').trim(), '| pagehead:', await p.textContent('.st-pagehead'));
  await p.screenshot({path: path.join(OUT, 'v7_write.png')});
  // 찾기·바꾸기
  await p.keyboard.press('Control+f'); await p.fill('#stFindQ', '청명'); await p.waitForTimeout(100); console.log('find count:', await p.textContent('#stFindN'));
  await p.fill('#stRepQ', '청운'); await p.click('#stRepAll'); await p.waitForTimeout(400); console.log('replaced:', (await p.inputValue('#stText')).match(/청운/g)?.length);
  await p.click('#stFindX');
  // 회차 정보
  await p.fill('#stSyn', '청명이 깨어난다'); await p.fill('#stPart', '1부 깨어남'); await p.waitForTimeout(600);
  console.log('binder part:', await p.$$eval('.st-part', e => e.map(x => x.textContent)));
  // 설정집
  await p.click('.st-rail [data-view=bible]'); await p.waitForTimeout(200); await p.click('#stBibleNew'); await p.fill('#stBible .st-bc input', '청운'); await p.waitForTimeout(600);
  await p.screenshot({path: path.join(OUT, 'v7_bible.png')});
  // 회차 정보 인물 선택
  await p.click('.st-rail [data-view=write]'); await p.waitForTimeout(200); await p.click('#stCast label'); await p.waitForTimeout(100);
  // AI 이어 쓰기 → 넣기
  await p.click('[data-itab=ai]'); await p.selectOption('#stProv', 'gemini'); await p.click('#stText'); await p.keyboard.press('Control+End');
  await p.click('[data-st=continue]'); await p.waitForTimeout(1000);
  const sys = reqs[0].systemInstruction.parts[0].text; const u = reqs[0].contents[0].parts[0].text;
  console.log('sys has syn:', sys.includes('청명이 깨어난다'), '| bible sent:', u.includes('[인물] 청운'));
  await p.click('#stInsert'); await p.waitForTimeout(300); console.log('inserted:', (await p.inputValue('#stText')).includes('이어진 문장이다'));
  await p.click('[data-st=summary]'); await p.waitForTimeout(900); console.log('toSyn visible:', await p.isVisible('#stToSyn')); await p.click('#stToSyn'); console.log('syn:', await p.inputValue('#stSyn'));
  // 새 회차들
  for (let i=0;i<3;i++){ await p.click('#stEpNew'); await p.waitForTimeout(150); await p.click('#stText'); await p.keyboard.type('본문 '.repeat(50*(i+1))); await p.waitForTimeout(800); }
  // 카드보드
  await p.click('.st-rail [data-view=board]'); await p.waitForTimeout(300); console.log('cards:', await p.$$eval('.st-ic:not(.add)', e => e.length));
  await p.screenshot({path: path.join(OUT, 'v7_board.png')});
  await p.dragAndDrop('.st-ic >> nth=3', '.st-ic >> nth=0'); await p.waitForTimeout(300);
  console.log('after drag order:', await p.$$eval('.st-ic:not(.add) b', e => e.map(x => x.textContent)));
  // 개요·통계
  await p.click('.st-rail [data-view=outline]'); await p.waitForTimeout(200); console.log('outline rows:', await p.$$eval('#stOutline tr', e => e.length));
  await p.click('.st-rail [data-view=stats]'); await p.waitForTimeout(200); console.log('kpi:', (await p.textContent('.st-kpi')).replace(/\s+/g,' ').slice(0,90));
  await p.screenshot({path: path.join(OUT, 'v7_stats.png')});
  // 작품 정보
  await p.click('#stProjInfo'); await p.fill('#stPLog', '천하제일검이 막내로 깨어난다'); await p.press('#stPLog', 'Tab'); await p.waitForTimeout(100); console.log('meta:', await p.textContent('#stProjMeta'));
  // 판 기록
  await p.click('.st-rail [data-view=write]'); await p.keyboard.press('Control+s'); await p.waitForTimeout(400); await p.click('[data-itab=snap]'); console.log('snaps:', await p.$$eval('#stSnaps .it', e => e.length));
  // 다시 열면 홈(오늘의 책상)부터, '집필실부터' 를 켜 두면 집필실부터
  await p.reload(); await p.waitForTimeout(1200); console.log('home first:', await p.isVisible('#home'), !(await p.isVisible('#studio')), '| desk:', await p.textContent('#hDesk h2'));
  await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'true'));
  await p.reload(); await p.waitForTimeout(1200); console.log('auto studio:', await p.isVisible('#studio'));
  await p.click('#gnav [data-g=lib]'); console.log('to library:', !(await p.isVisible('#studio')));
  await p.click('#gnav [data-g=write]'); await p.waitForTimeout(300);
  await p.setViewportSize({width:390, height:844}); await p.waitForTimeout(400); await p.screenshot({path: path.join(OUT, 'v7_phone.png')});
  await p.click('#stSideTg'); await p.waitForTimeout(200); await p.screenshot({path: path.join(OUT, 'v7_phone_side.png')});
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
