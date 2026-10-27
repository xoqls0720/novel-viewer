// 웹툰 자동 만들기: 줄거리 → 대본(AI) → 쪽·컷·말풍선 → 컷 그림(노벨AI) 일괄 생성
const { chromium } = require('playwright');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1500, height: 940}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  p.on('dialog', d => d.accept());
  const script = {title: '눈 내리는 성문', synopsis: '눈이 내리는 밤, 카엘은 북쪽 성문 앞에서 돌아온 신부를 기다린다. 말은 없지만 장갑을 벗고 손을 내민다. 이든이 멀리서 그 모습을 본다.', cast: [{name: '이든', tags: '1boy, adult, short brown hair, green eyes, grey coat'}, {name: '카엘', tags: '덮어쓰기 안 됨'}], pages: [
    {layout: '2d', panels: [
      {scene: '카엘이 성문 앞에서 돌아본다', tags: 'upper body, from side, snow, castle gate, night', pose: 'looking back over shoulder, parted lips', fx: false, chars: ['카엘'], bubbles: [{type: 'narr', text: '그날 밤, 북쪽 성문', who: ''}, {type: 'speech', text: '…왔군.', who: '카엘'}], sfx: [{text: '두근', vert: true}], stickers: ['sweat']},
      {scene: '장갑을 벗고 손을 내민다', tags: 'close-up, hand, glove removed', pose: 'hand reaching out', fx: false, chars: ['카엘'], bubbles: [{type: 'text', text: '추웠을 텐데', who: ''}], sfx: [], stickers: ['heart']}]},
    {layout: '3b', panels: [
      {scene: '눈 덮인 성 전경', tags: 'wide shot, snow, castle', pose: '', fx: false, chars: [], bubbles: [], sfx: [], stickers: []},
      {scene: '이든이 지켜본다', tags: 'upper body, looking away', pose: 'arms folded', fx: false, chars: ['이든'], bubbles: [{type: 'thought', text: '또 저 표정이군', who: '이든'}], sfx: [], stickers: []},
      {scene: '두 사람', tags: 'two shot', pose: 'sword raised', fx: true, chars: ['카엘', '이든'], bubbles: [{type: 'shout', text: '멈춰!', who: '카엘'}], sfx: [{text: '쿵', vert: false}], stickers: ['burst', 'speed']}]},
  ]};
  await ctx.route('https://generativelanguage.googleapis.com/**', r => (globalThis.__gem = r.request().postData()) && r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(script)}]}, finishReason: 'STOP'}]})}\n\n`}));
  await ctx.addInitScript(({png}) => {
    window.__nai = [];
    window.nvDesktop = { version: async () => '9.9.9', libPick: async () => null, libScan: async () => [], gdToken: async () => null, gdLogin: async () => null, gdLogout: async () => true, openFolder: async () => {}, naiCapture: async () => ({ok: false}),
      naiGen: async (token, body) => { window.__nai.push(body); return {ok: true, images: [png]}; } };
  }, {png: PNG.toString('base64')});
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); localStorage.setItem('nv.provider', '"gemini"'); localStorage.setItem('nv.set.provider', '"gemini"'); localStorage.setItem('nv.naiKey', JSON.stringify('nai-token-x'));
    localStorage.setItem('nv.set.naiChars', JSON.stringify('카엘: 1boy, adult, black hair, golden eyes, black coat\n레비안: 1boy, adult, short silver hair, grey eyes, black armor')); localStorage.setItem('nv.set.naiStyle', JSON.stringify('masterpiece, korean webtoon style')); localStorage.setItem('nv.set.wtVoice', JSON.stringify('카엘: 낮은 반말, 짧고 명령적')); });
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#btnWebtoon'); await p.click('#wtNew'); await p.waitForTimeout(400);
  await p.click('#wtAuto'); await p.fill('#wtStory', '카엘이 눈 내리는 성문 앞에서 돌아온 신부를 맞이한다.'); await p.fill('#wtPagesN', '2'); await p.fill('#wtCast', '카엘, 이든'); await p.selectOption('#wtAI', 'gemini');
  await p.click('#wtAutoGo'); for (let i = 0; i < 30; i++){ if (/만들었어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  console.log('auto stat:', await p.textContent('#wtAutoStat'));
  console.log('synopsis shown:', !(await p.isHidden('#wtSynBox')), '|', (await p.inputValue('#wtSyn')).slice(0, 18));
  console.log('pages made:', (await p.$$('#wtPages .pg')).length, '| name:', await p.inputValue('#wtName'));
  const proj = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('wt').objectStore('wt').getAll(); g.onsuccess = () => res(JSON.parse(g.result.find(x => x.t === 'proj').data)); }; }));
  await p.waitForTimeout(1200); let d = await proj();
  console.log('layouts:', d.pages.map(x => x.layout).join(','), '| panels:', d.pages.map(x => x.panels.length).join(','));
  const kinds = d.pages.map(pg => pg.items.map(i => i.k === 'bubble' ? i.shape : i.k === 'stk' ? i.kind : i.k).sort().join('+')); console.log('items p1:', kinds[0]); console.log('items p2:', kinds[1]);
  console.log('panel meta:', d.pages[0].panels[0].chars, '|', d.pages[0].panels[0].tags.slice(0, 24), '| stack order speed first:', d.pages[1].items[0].kind === 'speed');
  // 컷 그림 일괄
  console.log('gen btn:', await p.textContent('#wtGenAll'));
  await p.click('#wtGenAll'); for (let i = 0; i < 60; i++){ if (/끝났어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(400); }
  console.log('gen stat:', await p.textContent('#wtAutoStat'));
  const reqs = await p.evaluate(() => window.__nai); console.log('requests:', reqs.length);
  const r0 = reqs[0].parameters, r4 = reqs[4].parameters;
  const b0 = r0.v4_prompt.caption.base_caption;
  console.log('p1c1 chars:', r0.characterPrompts.map(c => c.prompt.slice(0, 22)).join('|'), '| style neon:', b0.startsWith('0.4::artist:ask_(askzy) ::, 0.75::artist:mika_pikazo ::') && b0.endsWith('no text') && r0.negative_prompt.includes('hand on face'), '| neg bubble:', r0.negative_prompt.includes('speech bubble'));
  console.log('A order:', ['torn paper border', '1.8::his handsome face', '1boy', 'castle gate', '1.45::looking back over shoulder'].every((t, i, a) => b0.indexOf(t) > (i ? b0.indexOf(a[i - 1]) : -1)), '| pose weighted:', b0.includes('1.45::looking back over shoulder, parted lips ::'));
  console.log('fx only on battle:', !b0.includes('paint splatter'), reqs[4].parameters.v4_prompt.caption.base_caption.includes('1.2::paint splatter'));
  console.log('new cast saved:', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.set.naiChars')).split('\n').map(l => l.split(':')[0]).join(',')));
  console.log('cast kept old tags:', await p.evaluate(() => /카엘: 1boy, adult, black hair/.test(JSON.parse(localStorage.getItem('nv.set.naiChars')))));
  console.log('two chars centers:', r4.characterPrompts.map(c => c.center.x).join(','), '| sizes:', reqs.map(r => r.parameters.width + 'x' + r.parameters.height).join(' '));
  console.log('no-char panel:', reqs[2].parameters.characterPrompts.length, reqs[2].parameters.v4_prompt.caption.base_caption.includes('no humans'));
  await p.waitForTimeout(800); d = await proj(); console.log('images assigned:', d.pages.flatMap(x => x.panels).filter(q => q.img).length, '/', d.pages.flatMap(x => x.panels).length);
  console.log('gen btn after:', await p.textContent('#wtGenAll'));
  // 그림체: 내 노벨AI 그림체로 바꾸면 하우스 스타일을 쓴다
  // 그림체 B(암실 룩): 단색 지정, film grain 은 네거티브에서 빠진다
  await p.evaluate(() => { window.__nai = []; const st = document.querySelector('#wtStyle'); st.value = 'dark'; st.dispatchEvent(new Event('change')); const m = document.querySelector('#wtMono'); m.value = 'red'; m.dispatchEvent(new Event('change')); document.querySelector('#wtAutoX').click(); });
  await p.evaluate(() => { const c = document.querySelector('#wtCv'); const r = c.getBoundingClientRect(); window.__box = {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const bx = await p.evaluate(() => window.__box);
  await p.mouse.click(bx.x + bx.w * 0.5, bx.y + bx.h * 0.25); await p.waitForTimeout(200);
  await p.click('#wtImgGen'); await p.waitForTimeout(1800);
  const nreq = await p.evaluate(() => window.__nai);
  const nb = nreq[0].parameters;
  console.log('dark style:', nb.v4_prompt.caption.base_caption.includes('1.2::red monochrome ::') && nb.v4_prompt.caption.base_caption.includes('1.15::seen through a mirror ::'), '| film grain kept:', /film grain/.test(nb.v4_prompt.caption.base_caption) && !/film grain/.test(nb.negative_prompt), '| neg bishounen:', nb.negative_prompt.includes('bishounen'));
  console.log('fixed gen:', nreq[0].model, nb.width + 'x' + nb.height, nb.steps, nb.scale, nb.sampler, nb.noise_schedule, nb.cfg_rescale, nb.ucPreset, nb.prefer_brownian);
  // 성인 등급: 입 다물기·웃음 금지가 풀리고 검열 방지와 수위 태그가 들어간다
  await p.evaluate(() => { window.__nai = []; document.querySelector('#wtAuto').click(); });
  await p.waitForTimeout(200);
  await p.selectOption('#wtRating', 'nsfw'); await p.selectOption('#wtHeat', 'hard'); await p.waitForTimeout(150);
  console.log('model hint nsfw:', (await p.textContent('#wtModelHint')).slice(0, 10), '| model:', await p.$eval('#wtModel', e => e.value), '| shared:', await p.$eval('#ngModel', e => e.value));
  await p.selectOption('#wtModel', 'nai-diffusion-5-curated'); await p.waitForTimeout(150);
  console.log('curated warn:', (await p.textContent('#wtModelHint')).startsWith('⚠'));
  await p.selectOption('#wtModel', 'nai-diffusion-5-full'); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('#wtAutoX').click());
  await p.mouse.click(bx.x + bx.w * 0.5, bx.y + bx.h * 0.25); await p.waitForTimeout(200);
  await p.click('#wtImgGen'); await p.waitForTimeout(1800);
  const ad = (await p.evaluate(() => window.__nai))[0].parameters;
  const ab = ad.v4_prompt.caption.base_caption, an = ad.negative_prompt;
  console.log('adult pos:', /\bnsfw\b/.test(ab) && /uncensored/.test(ab) && /open mouth/.test(ab) && !/closed mouth/.test(ab));
  console.log('adult neg:', !/(^|,\s)(smile|teeth|open mouth)(,|$)/.test(an) && /mosaic censoring/.test(an) && !/\bnsfw\b/.test(an));
  console.log('adult char tag:', ad.characterPrompts.every(c => /\badult\b/.test(c.prompt)), '| model:', (await p.evaluate(() => window.__nai))[0].model);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
