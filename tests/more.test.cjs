// 읽기 편의 더하기: 서재·도구를 숨긴 배치, 자동 스크롤, 방향키, 글자 크기 키, 폰 화면 보기, 내 글꼴
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
const APP = process.env.APP || 'file://' + ROOT + '/index.html'; const DATA = path.join(__dirname, 'data');

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1400,height:900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  await p.goto(APP); await p.waitForTimeout(1200);
  await p.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await p.waitForTimeout(800);
  await p.click('.grid .card:has-text("hwasan")'); await p.waitForTimeout(800);
  if (await p.isVisible('#coachOk')) await p.click('#coachOk');
  const mainW = () => p.$eval('main', m => Math.round(m.getBoundingClientRect().width));
  // 서재·도구를 숨겨도 읽기 화면이 남는다
  await p.click('#tgSide'); await p.waitForTimeout(200); const w1 = await mainW();
  await p.click('#tgTool'); await p.waitForTimeout(200); const w2 = await mainW();
  await p.click('#tgSide'); await p.waitForTimeout(200); const w3 = await mainW();
  await p.click('#tgTool'); await p.click('#tgSide'); await p.waitForTimeout(200); const w4 = await mainW();
  console.log(`layout widths: ${w1} ${w2} ${w3} ${w4}`);
  // 자동 스크롤
  await p.click('main .novel p >> nth=5', {force: true}); await p.keyboard.press('Escape');
  const top0 = await p.$eval('#reader', r => r.scrollTop);
  await p.keyboard.press('Space'); await p.waitForTimeout(150);
  const chip = await p.isVisible('#asChip');
  for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(1500);
  const top1 = await p.$eval('#reader', r => r.scrollTop);
  console.log(`autoscroll: chip ${chip} | speed ${await p.inputValue('#asSpeed')} | moved ${top1 > top0 + 20}`);
  await p.mouse.wheel(0, 10); await p.waitForTimeout(150);
  const top2 = await p.$eval('#reader', r => r.scrollTop); await p.waitForTimeout(600);
  console.log(`wheel stops: ${!(await p.isVisible('#asChip'))} ${Math.abs((await p.$eval('#reader', r => r.scrollTop)) - top2) < 3}`);
  // 끝까지 가면 다음 화로 이어 간다
  await p.$eval('#reader', r => r.scrollTop = r.scrollHeight - r.clientHeight - 30);
  await p.keyboard.press('Space'); await p.waitForTimeout(3500);
  console.log('autoscroll next ep:', await p.textContent('#epTitle'), '| still on:', await p.isVisible('#asChip'));
  await p.click('#asStop'); await p.waitForTimeout(100);
  console.log('stop btn:', !(await p.isVisible('#asChip')));
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
    await p.click('#btnQuick'); await p.click('#fontDel'); await p.waitForTimeout(300);
    console.log('font removed:', await p.$eval('#rfontMine', o => o.hidden), await p.inputValue('#rfont'));
  } else console.log('font: skipped (no ttf)');
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
