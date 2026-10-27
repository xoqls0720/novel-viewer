// 줄거리 길게 쓰기: 분량 고르기 → 늘리기 → 이어서 더 쓰기 → 그 줄거리로 대본
const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1500, height: 940}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  p.on('dialog', d => d.accept());
  const syn = {title: '눈 내리는 성문', logline: '버려진 신부가 돌아온 밤', synopsis: '눈이 멈추지 않는다. 카엘은 북쪽 성문 앞에 선다. 말은 하지 않는다.', beats: [{t: '1장', c: '성문 앞, 카엘이 기다린다'}, {t: '2장', c: '신부가 걸어온다'}], cast: [{name: '이든', tags: '1boy, adult, brown hair', voice: '빠른 반말'}]};
  const more = {title: '눈 내리는 성문', logline: '', synopsis: '장갑을 벗은 손이 식어 간다.', beats: [{t: '3장', c: '이든이 멀리서 본다'}], cast: []};
  const script = {title: '눈 내리는 성문', synopsis: 'x', cast: [], pages: [{layout: '1', panels: [{scene: 'a', tags: 'wide shot', pose: '', fx: false, chars: [], bubbles: [], sfx: [], stickers: []}]}]};
  let turn = 0, sent = [];
  await ctx.route('https://generativelanguage.googleapis.com/**', r => { sent.push(r.request().postData()); const body = [syn, more, script][Math.min(turn++, 2)]; r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(body)}]}, finishReason: 'STOP'}]})}\n\n`}); });
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); localStorage.setItem('nv.provider', '"gemini"'); localStorage.setItem('nv.set.provider', '"gemini"'); localStorage.setItem('nv.set.naiChars', JSON.stringify('카엘: 1boy, adult, black hair')); });
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#btnWebtoon'); await p.click('#wtNew'); await p.waitForTimeout(400); await p.click('#wtAuto'); await p.waitForTimeout(200);
  await p.fill('#wtStory', '카엘이 눈 오는 날 신부를 맞이함');
  // 기본은 일반 등급: 성인 지침이 가지 않는다
  await p.click('#wtSynGo'); for (let i = 0; i < 20; i++){ if (sent.length) break; await p.waitForTimeout(200); }
  await p.waitForTimeout(600);
  console.log('safe sys:', /등급은 일반\(safe\)/.test(sent[0]) && !/19금/.test(sent[0]));
  sent = []; turn = 0;
  // 성인으로 바꾸면 창에서 바로 바뀌고, 노벨AI 탭 값도 함께 바뀐다
  await p.selectOption('#wtRating', 'nsfw'); await p.selectOption('#wtHeat', 'hard'); await p.waitForTimeout(200);
  console.log('rating shared:', await p.$eval('#naiRating', e => e.value), '| heat enabled:', await p.$eval('#wtHeat', e => !e.disabled));
  await p.selectOption('#wtSynLen', 'long'); await p.click('#wtSynGo');
  for (let i = 0; i < 30; i++){ if (/줄거리를 썼어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  console.log('stat1:', await p.textContent('#wtAutoStat'));
  const v1 = await p.inputValue('#wtSyn');
  console.log('syn built:', v1.includes('버려진 신부가 돌아온 밤') && v1.includes('[1장] 성문 앞') && v1.includes('[2장]'), '| box:', !(await p.isHidden('#wtSynBox')), '| len shown:', await p.textContent('#wtSynLenOut'));
  console.log('adult sys:', /등급은 성인\(19금\)/.test(sent[0]), '| heat sent:', /노골적으로 쓴다/.test(sent[0]), '| minor guard:', /미성년/.test(sent[0]), '| adult craft:', /누가 먼저 선을 넘는지/.test(sent[0]));
  console.log('asked长:', /분량: 18~25문장/.test(sent[0]) && /차례 개수: 10/.test(sent[0]), '| cast saved:', await p.evaluate(() => /이든/.test(JSON.parse(localStorage.getItem('nv.set.naiChars')))), '| title:', await p.inputValue('#wtName'));
  // 이어서 더 쓰기
  await p.click('#wtSynMore');
  for (let i = 0; i < 30; i++){ if (/이어서 썼어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  const v2 = await p.inputValue('#wtSyn');
  console.log('appended:', v2.startsWith(v1) && v2.includes('장갑을 벗은 손') && v2.includes('[3장]'), '| prompt says continue:', /이어서 더 쓴다/.test(sent[1]));
  // 그 줄거리로 대본
  await p.click('#wtSynUse');
  for (let i = 0; i < 30; i++){ if (/만들었어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  console.log('script used long syn:', sent[2].includes('장갑을 벗은 손'), '| pages:', (await p.$$('#wtPages .pg')).length);
  console.log('script adult too:', /등급은 성인\(19금\)/.test(sent[2]) && /노골적으로 쓴다/.test(sent[2]));
  // 다시 열어도 줄거리가 남아 있다
  await p.click('#wtAutoX'); await p.waitForTimeout(1200); await p.click('#wtClose'); await p.waitForTimeout(300);
  await p.reload(); await p.waitForTimeout(700); await p.click('#btnWebtoon'); await p.waitForTimeout(300); await p.click('#wtList .it'); await p.waitForTimeout(600); await p.click('#wtAuto'); await p.waitForTimeout(200);
  console.log('kept after reload:', (await p.inputValue('#wtSyn')).includes('[3장]'));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
