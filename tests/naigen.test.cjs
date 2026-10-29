// 노벨AI 그림 바로 만들기: 장면 목록 → 프롬프트(AI) → 그림 → 장면 노트 저장
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1366, height: 900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  p.on('dialog', d => d.accept());
  // 제미나이(프롬프트 만들기) 가짜 응답
  const prompt = {base_prompt: 'snowy castle gate, night', negative: 'blurry', size: '832x1216', notes: '', characters: [{name: '카엘', prompt: '1boy, adult, black hair, golden eyes', negative: 'lowres', position: '2:3'}]};
  await ctx.route('https://generativelanguage.googleapis.com/**', r => r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(prompt)}]}, finishReason: 'STOP'}]})}\n\n`}));
  // 가짜 데스크톱 다리: 노벨AI 요청 본문을 모아 둔다
  await ctx.addInitScript(({png}) => {
    window.__nai = [];
    window.nvDesktop = {
      version: async () => '9.9.9', libPick: async () => null, libScan: async () => [], gdToken: async () => null, gdLogin: async () => null, gdLogout: async () => true, openFolder: async () => {},
      naiGen: async (token, body) => { window.__nai.push({token, body}); if (token !== 'nai-token-x') return {ok: false, status: 401, text: 'bad'}; return {ok: true, images: [png]}; },
      naiCapture: async () => window.__cap || {ok: false, text: '취소'},
    };
  }, {png: PNG.toString('base64')});
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => { localStorage.setItem('nv.set.ngModel', JSON.stringify('nai-diffusion-4-5-full')); localStorage.removeItem('nv.set.ngV5'); localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); localStorage.setItem('nv.provider', '"gemini"'); localStorage.setItem('nv.set.provider', '"gemini"'); localStorage.setItem('nv.set.naiChars', JSON.stringify('카엘: 1boy, adult, black hair, golden eyes')); localStorage.setItem('nv.set.naiStyle', JSON.stringify('masterpiece, korean webtoon style')); });
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#tgTool').catch(() => {}); await p.click('.tabs button[data-tab=nai]'); await p.waitForTimeout(200);
  console.log('desktop ui:', await p.isVisible('#ngGo'), '| web hint hidden:', !(await p.isVisible('#ngWeb')));
  console.log('old model upgraded:', await p.inputValue('#ngModel'), '| style sel:', await p.$eval('#naiStyleSel', e => e.value), '|', (await p.textContent('#naiStyleNow')).slice(0, 22));
  // 토큰 없이 누르면 안내
  await p.click('#ngGo'); await p.waitForTimeout(300);
  console.log('no token:', (await p.textContent('#toast')).includes('토큰'), '| no request:', await p.evaluate(() => window.__nai.length) === 0);
  // 토큰 저장(동기화 대상)
  await p.fill('#naiKey', 'nai-token-x'); await p.click('#ngSave'); await p.waitForTimeout(200);
  console.log('token saved:', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.naiKey'))), '| in key sync list:', await p.evaluate(() => !!JSON.parse(localStorage.getItem('nv.__kts') || '{}').naiKey), '| not in backup:', await p.evaluate(() => !/naiKey/.test(JSON.stringify(Object.keys(localStorage).filter(k => !/^nv\.(apiKey|gemKey|grKey|naiKey|gd\.secret)$/.test(k))))));
  // 노벨AI에서 설정 가져오기: 토큰·모델·크기·스텝·샘플러까지
  await p.evaluate(() => { window.__cap = {ok: true, token: 'nai-token-x', body: {model: 'nai-diffusion-5-full', action: 'generate', input: 'x', parameters: {width: 1216, height: 832, steps: 23, scale: 6, sampler: 'k_dpmpp_2m', noise_schedule: 'exponential', cfg_rescale: 0.4, image: 'BIGBASE64', stream: 'msgpack', characterPrompts: [], seed: 1}}}; });
  await p.click('#ngGrab'); await p.waitForTimeout(600);
  console.log('grab:', await p.textContent('#ngStat'));
  console.log('grabbed fields:', await p.inputValue('#ngModel'), await p.inputValue('#ngSteps'), await p.inputValue('#ngScale'), await p.$eval('#ngSize', e => e.value), '| token:', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.naiKey'))));
  // 노벨AI 탭에서 프롬프트를 만들면 그림체가 들어간다
  await p.click('.tabs button[data-tab=nai]'); await p.fill('#naiIn', '성문 앞의 카엘'); await p.selectOption('#naiProv', 'gemini'); await p.click('#naiGo'); await p.waitForTimeout(1200);
  const nb = await p.$$eval('#naiOut .fv', e => e.map(x => x.textContent));
  console.log('tab style in base:', nb[0].startsWith('0.4::artist:ask_(askzy) ::') && nb[0].includes('snowy castle gate') && nb[0].endsWith('no text'));
  console.log('tab neg from style:', /hand on face/.test(nb.at(-2) || '') || /hand on face/.test(nb.join(' ')));
  // 장면 두 줄 × 2장
  await p.fill('#ngList', '카엘이 눈 내리는 성 앞에서 뒤돌아본다\n레비안이 새벽 얼음 호수에서 검을 휘두른다');
  await p.fill('#ngEach', '2'); await p.selectOption('#ngSize', 'portrait'); await p.fill('#ngSteps', '28'); await p.evaluate(() => { document.querySelector('#ngSize').dispatchEvent(new Event('change')); });
  await p.click('#ngGo');
  for (let i = 0; i < 60; i++){ if (/끝났어요/.test(await p.textContent('#ngStat'))) break; await p.waitForTimeout(500); }
  console.log('stat:', await p.textContent('#ngStat'));
  const reqs = await p.evaluate(() => window.__nai.map(x => x.body));
  console.log('requests:', reqs.length, '| model:', reqs[0].model, '| size:', reqs[0].parameters.width + 'x' + reqs[0].parameters.height, '| steps:', reqs[0].parameters.steps);
  console.log('kept from grab:', reqs[0].parameters.sampler, reqs[0].parameters.noise_schedule, reqs[0].parameters.cfg_rescale, '| dropped img/stream:', !('image' in reqs[0].parameters) && !('stream' in reqs[0].parameters));
  console.log('payload keys ok:', ['input', 'model', 'action'].every(k => k in reqs[0]), '| v4 caption:', reqs[0].parameters.v4_prompt.caption.base_caption.includes('snowy castle'), '| style in base:', reqs[0].parameters.v4_prompt.caption.base_caption.startsWith('0.4::artist:ask_(askzy) ::'));
  console.log('char prompt:', reqs[0].parameters.characterPrompts[0].prompt, '| center:', JSON.stringify(reqs[0].parameters.characterPrompts[0].center), '| use_coords:', reqs[0].parameters.use_coords);
  console.log('neg:', reqs[0].parameters.v4_negative_prompt.caption.base_caption.includes('blurry'), '| seeds differ:', new Set(reqs.map(r => r.parameters.seed)).size === reqs.length);
  const scraps = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').getAll(); g.onsuccess = () => res(g.result.map(x => x.epName)); }; }));
  console.log('saved scraps:', scraps.length, '| names:', [...new Set(scraps.map(s => s.slice(0, 6)))].sort());
  console.log('in scrap list:', (await p.$$('#scrapList .card')).length >= 4 || await p.evaluate(() => document.querySelectorAll('#scrapList .card').length));
  // 틀린 토큰이면 멈춘다
  // 구도 스케치를 밑그림으로 (img2img): 메모를 비우면 마지막 프롬프트로 그린다
  await p.click('#naiSketch'); await p.waitForTimeout(500);
  console.log('sketch nai btn:', await p.isVisible('#skNai'));
  await p.evaluate(() => { window.__nai = []; }); await p.fill('#skNote', '');
  await p.click('#skNai');
  for (let i = 0; i < 40; i++){ if (await p.evaluate(() => window.__nai.length)) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
  const skq = await p.evaluate(() => window.__nai[0]?.body);
  console.log('img2img:', skq?.action === 'img2img', '| has image:', !!skq?.parameters.image, '| strength:', skq?.parameters.strength, '| noise:', skq?.parameters.noise, '| size:', skq?.parameters.width + 'x' + skq?.parameters.height);
  const skScrap = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').getAll(); g.onsuccess = () => res(g.result.sort((a, b) => b.t - a.t)[0]?.epName || ''); }; }));
  console.log('sketch scrap saved:', /스케치 따라/.test(skScrap));
  await p.click('#skCancel').catch(() => {}); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__nai = []; });
  await p.fill('#naiKey', 'wrong'); await p.click('#ngSave'); await p.fill('#ngList', '한 장면'); await p.fill('#ngEach', '3'); await p.click('#ngGo');
  for (let i = 0; i < 40; i++){ if (/끝났어요/.test(await p.textContent('#ngStat'))) break; await p.waitForTimeout(400); }
  console.log('bad token stops:', await p.evaluate(() => window.__nai.length), await p.textContent('#ngStat'));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
