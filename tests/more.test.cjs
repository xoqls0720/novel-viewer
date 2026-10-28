// 읽기 편의 더하기: 서재·도구를 숨긴 배치, 자동 스크롤, 방향키, 글자 크기 키, 폰 화면 보기, 내 글꼴
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  await p.goto(APP); await p.waitForTimeout(1200);
  await p.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await p.waitForTimeout(800);
  await p.evaluate(() => nvGo('lib')); await p.click('.grid .card:has-text("hwasan")'); await p.waitForTimeout(800);
  if (await p.isVisible('#coachOk')) await p.click('#coachOk');
  const mainW = () => p.$eval('main', m => Math.round(m.getBoundingClientRect().width));
  // 옆 서재 칸은 없다: 읽기 화면은 메뉴 옆 전체, 도구를 열면 그만큼만 줄고, 닫으면 돌아온다
  const w1 = await mainW();
  await p.click('#tgTool'); await p.waitForTimeout(200); const w2 = await mainW();
  await p.click('#tgTool'); await p.waitForTimeout(200); const w3 = await mainW();
  console.log(`layout widths: ${w1} ${w2} ${w3}`);
  // 자동 스크롤
  // Space = 한 화면 내리기 (자동 스크롤은 뺐다)
  await p.click('main .novel p >> nth=5', {force: true}); await p.keyboard.press('Escape');
  await p.$eval('#reader', r => r.scrollTop = 0); await p.waitForTimeout(200);
  await p.keyboard.press('Space'); await p.waitForTimeout(700);
  console.log('space page:', (await p.$eval('#reader', r => r.scrollTop)) > 100, '| no autoscroll ui:', await p.$('#asChip') === null && await p.$('#asGo') === null);
  // 읽기 과녁: 정하면 위 막대에 뜨고, 작품마다 기억된다 (스크롤로 숨은 막대를 먼저 되살린다)
  await p.$eval('#reader', r => r.scrollTop = 0); await p.keyboard.press('Escape'); await p.waitForTimeout(350);
  await p.click('#btnQuick'); await p.waitForTimeout(250);
  await p.selectOption('#readFocus', '대사'); await p.waitForTimeout(150); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('focus chip:', await p.textContent('#focusChip'), '| shown:', await p.isVisible('#focusChip'));
  // 필사: 따라 쓰고, 저장되고, 원문과 비교가 뜬다
  await p.click('#btnQuick'); await p.waitForTimeout(250); await p.click('#fsOpen'); await p.waitForTimeout(400);
  await p.fill('#fsText', '청명은 고개를 들었다. 내가 새로 쓴 줄.'); await p.waitForTimeout(1300);
  console.log('fs stat:', /원문 [\d,]+자 · 내 필사 [\d,]+자/.test(await p.textContent('#fsStat')));
  await p.click('#fsDiff'); await p.waitForTimeout(200);
  console.log('fs diff:', await p.$$eval('#fsCmp ins, #fsCmp del, #fsCmp .a, #fsCmp .d', e => e.length > 0));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('#btnQuick'); await p.waitForTimeout(250); await p.click('#fsOpen'); await p.waitForTimeout(400);
  console.log('fs kept:', (await p.inputValue('#fsText')).includes('내가 새로 쓴 줄'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // 방향키로 한 화면씩
  await p.$eval('#reader', r => r.scrollTop = 0); await p.waitForTimeout(200);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
  const after = await p.$eval('#reader', r => r.scrollTop), page = await p.$eval('#reader', r => r.clientHeight - 110);
  console.log('arrow page:', Math.abs(after - page) < 5);
  // 글자 크기 키
  const fs0 = +(await p.inputValue('#fs')); await p.keyboard.press('='); await p.keyboard.press('='); await p.keyboard.press('-');
  console.log('font keys:', +(await p.inputValue('#fs')) - fs0);
  // 폰 화면 보기
  await p.keyboard.press('p'); await p.waitForTimeout(300);
  const ph = await p.$eval('#reader .novel', n => Math.round(n.getBoundingClientRect().width));
  console.log(`phone: on ${await p.$eval('#reader', r => r.classList.contains('phone'))} | width ${ph} | ind ${await p.textContent('#pageInd')}`);
  await p.keyboard.press('Escape'); await p.click('#tgTool'); await p.waitForTimeout(200);
  console.log('stat phone row:', (await p.$eval('#pane-stat .kv', k => k.textContent)).match(/폰 화면약 \d+장/)?.[0], '| frame:', (await p.textContent('#pageInd')).match(/\/ (\d+)장/)?.[1]);
  await p.keyboard.press('Escape'); await p.click('#next'); await p.waitForTimeout(600);
  console.log('phone kept after ep change:', await p.$eval('#reader', r => r.classList.contains('phone')));
  await p.reload(); await p.waitForTimeout(1200);
  console.log('phone remembered:', await p.isChecked('#phoneView'));
  await p.keyboard.press('p');
  // 내 글꼴: 시스템에 있는 TTF 하나로 시험한다
  const cand = ['C:/Windows/Fonts/malgun.ttf', 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find(f => fs.existsSync(f));
  if (cand){
    await p.setInputFiles('#fontFile', cand); await p.waitForTimeout(1500);
    console.log('font:', await p.inputValue('#rfont'), '| loaded', await p.evaluate(() => [...document.fonts].some(f => f.family === 'NvMine' && f.status === 'loaded')));
    await p.reload(); await p.waitForTimeout(1500);
    console.log('font after reload:', await p.evaluate(() => [...document.fonts].some(f => f.family === 'NvMine' && f.status === 'loaded')), !(await p.$eval('#rfontMine', o => o.hidden)));
    await p.evaluate(() => document.querySelector('#fontDel').click()); await p.waitForTimeout(300);   // 다시 열면 홈부터라 보기 설정 단추 대신 바로 누른다
    console.log('font removed:', await p.$eval('#rfontMine', o => o.hidden), await p.inputValue('#rfont'));
  } else console.log('font: skipped (no ttf)');
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
