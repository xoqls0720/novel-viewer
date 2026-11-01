// 웹툰 만들기 고친 것: 장면 수만큼 쪽 늘리기 · '직접 쓰기' 그림체가 노벨AI 하우스 스타일을 쓰고 성인 태그도 붙기 · 말하는 사람 쪽 말풍선 · 집중선은 컷 안에서만 · 노벨AI 가 말풍선을 그리면 따로 얹지 않기
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
  await p.click('#gnav [data-g=toon]'); await p.click('#wtNew'); await p.waitForTimeout(400);
  await p.click('#wtAuto'); await p.fill('#wtStory', '카엘이 눈 내리는 성문 앞에서 돌아온 신부를 맞이한다.'); await p.fill('#wtPagesN', '2'); await p.fill('#wtCast', '카엘, 이든'); await p.selectOption('#wtAI', 'gemini');
  // 장면이 6개인 줄거리 + 쪽 수 2 → 6쪽으로 늘려서 묻는다
  await p.fill('#wtStory', '[1장] 성문\n[2장] 신부\n[3장] 장갑\n[4장] 이든\n[5장] 칼\n[6장] 새벽'); await p.fill('#wtPagesN', '2');
  await p.click('#wtAutoGo'); for (let i = 0; i < 30; i++){ if (/만들었어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  console.log('pages raised:', await p.inputValue('#wtPagesN'), '| asked:', /쪽 수: 6쪽/.test(globalThis.__gem || ''), '| keep all events rule:', /사건은 하나도 빼지 않는다/.test(globalThis.__gem || ''));
  const proj = () => p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('wt').objectStore('wt').getAll(); g.onsuccess = () => res(JSON.parse(g.result.find(x => x.t === 'proj').data)); }; }));
  await p.waitForTimeout(1200); let d = await proj();
  // 둘째 쪽 셋째 컷: chars [카엘, 이든] · '멈춰!' 는 카엘(왼쪽) → 말풍선이 왼쪽 반에, 집중선은 그 컷에 묶임
  const pg2 = d.pages[1]; const shout = pg2.items.find(i => i.k === 'bubble' && i.text === '멈춰!'); const speed = pg2.items.find(i => i.kind === 'speed');
  const L = await p.evaluate(pg => { const bb = (pts => [Math.min(...pts.map(q => q[0])), Math.min(...pts.map(q => q[1])), Math.max(...pts.map(q => q[0])), Math.max(...pts.map(q => q[1]))])(pg.panels[2].poly.map(([x, y]) => [x * 1500, y * pg.h])); return bb; }, pg2);
  console.log('speaker side:', shout && shout.x < (L[0] + L[2]) / 2, '| speed tied to panel:', speed?.pi === 2, '| bubble font:', shout?.size >= 40);
  // '직접 쓰기' + 성인: 웹툰 칸이 비면 노벨AI 하우스 스타일 칸(그림체 가져오기가 채우는 곳)을 쓰고 수위 태그를 붙인다
  await p.evaluate(() => { const st = document.querySelector('#wtStyle'); st.value = 'custom'; st.dispatchEvent(new Event('change')); document.querySelector('#wtStyleIn').value = ''; localStorage.setItem('nv.set.wtStyleIn', '""'); document.querySelector('#naiStyle').value = 'masterpiece, PICKEDSTYLE, thick lineart'; const r = document.querySelector('#wtRating'); r.value = 'nsfw'; r.dispatchEvent(new Event('change')); const h = document.querySelector('#wtHeat'); h.value = 'hard'; h.dispatchEvent(new Event('change')); window.__nai = []; });
  await p.click('#wtGenAll'); for (let i = 0; i < 60; i++){ if (/끝났어요|멈췄어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(400); }
  const reqs = await p.evaluate(() => window.__nai); const b0 = reqs[0]?.parameters?.v4_prompt?.caption?.base_caption || '';
  console.log('custom style used:', b0.includes('PICKEDSTYLE'), '| adult tags:', /nsfw, explicit/.test(b0), '| requests:', reqs.length);
  // 노벨AI 가 말풍선을 그리게 하면: 대사 말풍선은 얹지 않고 컷에 적어 두었다가 그림 프롬프트에 Text: 로
  await p.evaluate(() => { const c = document.querySelector('#wtNaiText'); c.checked = true; c.dispatchEvent(new Event('change')); });
  await p.evaluate(() => { const b = document.querySelector('#wtAutoBox'); if (b) b.hidden = false; }); await p.click('#wtAutoGo'); for (let i = 0; i < 30; i++){ if (/만들었어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  await p.waitForTimeout(1200); d = await proj();
  const last = d.pages.slice(-2); const speech = last.flatMap(x => x.items).filter(i => i.k === 'bubble' && i.shape !== 'box').length; const said = last.flatMap(x => x.panels).flatMap(q => q.say || []);
  console.log('nai text mode: overlay speech', speech, '| said:', said.join('/'));
  await p.evaluate(() => { window.__nai = []; }); await p.click('#wtGenAll'); for (let i = 0; i < 60; i++){ if (/끝났어요|멈췄어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(400); }
  const r2 = await p.evaluate(() => window.__nai); console.log('text in prompt:', r2.some(r => /\nText: 멈춰!/.test(r.parameters.v4_prompt.caption.base_caption || r.input || '')));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
