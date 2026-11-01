// 성인 웹툰 줄거리: 톤(치정·뽕빨) · AI 티 지우기 지침 · 내 서재 문체 참고(대사 많은 대목) · 맛깔나게 다시 쓰기 · 성인만·실존 인물 금지
const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const APP = 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1500, height: 940}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('dialog', d => d.accept());
  const syn = {title: '옆집 사람', logline: '벽이 얇은 원룸', synopsis: '벽 너머로 소리가 샌다.', beats: [{t: '1장', c: '택배를 잘못 받는다'}], cast: []};
  const spiced = {title: '옆집 사람', logline: '벽이 얇다, 너무.', synopsis: '"택배 왔어요." 문이 열리자마자 꼬인다.', beats: [{t: '1장', c: '택배 핑계로 문턱을 넘는다'}], cast: []};
  let turn = 0, sent = [];
  await ctx.route('https://generativelanguage.googleapis.com/**', r => { sent.push(r.request().postData()); const body = [syn, spiced][Math.min(turn++, 1)]; r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(body)}]}, finishReason: 'STOP'}]})}\n\n`}); });
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); localStorage.setItem('nv.set.provider', '"gemini"'); });
  await p.reload(); await p.waitForTimeout(800);
  // 문체 참고로 쓸 성인 소설 하나(대사·소리가 많은 화와 서술만 있는 화)
  await p.evaluate(async () => {
    const mk = (n, t) => { const f = new File([t], n, {type: 'text/plain'}); f._rel = '성인/노벨/참고소설/' + n; return f; };
    await nvMedia.addFiles([mk('0001 1화.txt', '비가 왔다.\n\n거리는 조용했다.\n\n그는 걸었다.\n\n오래 걸었다.'), mk('0002 2화.txt', '"잠깐, 거기…!"\n\n"하앗… 읏, 안 돼…"\n\n"쉿. 옆집에 다 들려."\n\n"그, 그러니까 천천히…♡"')]);
  });
  await p.click('#gnav [data-g=toon]'); await p.click('#wtNew'); await p.waitForTimeout(400); await p.click('#wtAuto'); await p.waitForTimeout(200);
  await p.selectOption('#wtRating', 'nsfw'); await p.selectOption('#wtHeat', 'hard');
  console.log('tone row shown:', !(await p.isHidden('#wtToneRow')));
  await p.selectOption('#wtAdultTone', 'pong');
  await p.focus('#wtRef'); await p.waitForTimeout(200);
  const opts = await p.$$eval('#wtRef option', o => o.map(x => x.textContent));
  console.log('ref options:', opts.includes('[성인] 참고소설'));
  await p.selectOption('#wtRef', {label: '[성인] 참고소설'});
  await p.fill('#wtStory', '옆집 사람과 택배 때문에 엮임');
  await p.click('#wtSynGo');
  for (let i = 0; i < 30; i++){ if (/줄거리를 썼어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  const s0 = sent[0] || '';
  console.log('pong tone sent:', /뽕빨물/.test(s0), '| natural rules:', /AI 가 쓴 티가 나는 말/.test(s0), '| adult line:', /20세 이상 성인/.test(s0) && /실존 인물/.test(s0));
  console.log('ref sent:', /문체 참고/.test(s0) && /하앗/.test(s0) && /베끼지 않는다/.test(s0), '| dull chapter skipped:', !/오래 걸었다/.test(s0));
  // 맛깔나게 다시 쓰기
  await p.click('#wtSynSpice');
  for (let i = 0; i < 30; i++){ if (sent.length > 1 && /줄거리를 썼어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  await p.waitForTimeout(300);
  console.log('spice prompt:', /처음부터 다시 쓴다/.test(sent[1] || '') && /더 노골적으로/.test(sent[1] || ''), '| replaced:', (await p.inputValue('#wtSyn')).includes('문턱을 넘는다') && !(await p.inputValue('#wtSyn')).includes('잘못 받는다'));
  // 일반 등급이면 톤 줄이 숨는다
  await p.selectOption('#wtRating', 'safe');
  console.log('tone hidden on safe:', await p.isHidden('#wtToneRow'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
