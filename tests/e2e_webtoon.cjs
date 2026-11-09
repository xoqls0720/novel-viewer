// 눈으로 보는 시험: 실제 사용 흐름대로 웹툰 한 화를 만들고 쪽마다 PNG 로 남긴다
const { chromium } = require('playwright'); const fs = require('fs');
const path = require('path'); const ROOT = path.resolve(__dirname, '..'); const APP = 'file://' + ROOT + '/index.html';
const OUT = path.join(__dirname, 'out/e2e'); fs.mkdirSync(OUT, {recursive: true});
const IMGS = fs.readdirSync(process.env.IMGDIR).filter(f => /^\d\d_.*\.jpg$/.test(f) && !/^00/.test(f)).sort().map(f => fs.readFileSync(path.join(process.env.IMGDIR, f)).toString('base64'));
const script = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/e2e_script.json'), 'utf8'));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1500, height: 940}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  p.on('dialog', d => d.accept());
  await ctx.route('https://generativelanguage.googleapis.com/**', r => { globalThis.__gem = r.request().postData(); r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: JSON.stringify(script)}]}, finishReason: 'STOP'}]})}\n\n`}); });
  await ctx.addInitScript(({imgs}) => {
    window.__nai = []; let k = 0;
    const fit = async (b64, w, h) => { const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], {type: 'image/jpeg'})); const c = document.createElement('canvas'); c.width = w; c.height = h; const s = Math.max(w / bm.width, h / bm.height); c.getContext('2d').drawImage(bm, (w - bm.width * s) / 2, (h - bm.height * s) / 2, bm.width * s, bm.height * s); return (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer(); };
    window.nvDesktop = { version: async () => '9.9.9', libPick: async () => null, libScan: async () => [], gdToken: async () => null, gdLogin: async () => null, gdLogout: async () => true, openFolder: async () => {}, naiCapture: async () => ({ok: false}),
      naiGen: async (token, body) => { window.__nai.push(body); const q = body.parameters; const ab = await fit(imgs[k++ % imgs.length], q.width, q.height); let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return {ok: true, images: [btoa(s)]}; } };
  }, {imgs: IMGS});
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); localStorage.setItem('nv.provider', '"gemini"'); localStorage.setItem('nv.set.provider', '"gemini"'); localStorage.setItem('nv.naiKey', JSON.stringify('nai-token-x')); });
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#gnav [data-g=toon]'); await p.click('#wtNew'); await p.waitForTimeout(400);
  await p.screenshot({path: OUT + '/0_editor_empty.png'});
  await p.click('#wtAuto'); await p.evaluate(() => document.querySelectorAll('#wtAutoBox details').forEach(d => d.open = true)); await p.waitForTimeout(300);
  await p.screenshot({path: OUT + '/1_auto_modal.png', fullPage: true});
  // 사용자가 하는 순서: 인물 짝 고르기 → 줄거리 대충 → 그림체 → 대본 만들기 → 컷 그림 모두
  const pair = await p.$$eval('#wtPair option', o => o.map(x => x.value + '=' + x.textContent));
  console.log('pairs:', pair.join(' | '));
  const yg = pair.find(x => /양아치/.test(x)); if (yg) await p.selectOption('#wtPair', yg.split('=')[0]);
  await p.waitForTimeout(300);
  console.log('cast after pair:', await p.inputValue('#wtCast'));
  await p.fill('#wtStory', process.env.STORY || '새벽 편의점. 양아치 재혁이 매일 와서 찐따 동구를 놀린다. 오늘은 옥상으로 오라고 한다. 옥상에서 재혁이 동구에게 바나나 우유를 건넨다.');
  await p.fill('#wtPagesN', '4'); await p.selectOption('#wtAI', 'gemini');
  if (process.env.STYLE) await p.selectOption('#wtStyle', process.env.STYLE);
  await p.click('#wtAutoGo'); for (let i = 0; i < 30; i++){ if (/만들었어요|못|읽지/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(300); }
  console.log('auto stat:', await p.textContent('#wtAutoStat'));
  await p.click('#wtGenAll'); for (let i = 0; i < 120; i++){ if (/끝났어요/.test(await p.textContent('#wtAutoStat'))) break; await p.waitForTimeout(400); }
  console.log('gen stat:', await p.textContent('#wtAutoStat'));
  const reqs = await p.evaluate(() => window.__nai);
  fs.writeFileSync(OUT + '/bodies.json', JSON.stringify(reqs));
  fs.writeFileSync(OUT + '/prompts.txt', reqs.map((r, i) => `#${i} ${r.parameters.width}x${r.parameters.height}\nBASE: ${r.parameters.v4_prompt.caption.base_caption}\nCHARS: ${(r.parameters.characterPrompts||[]).map(c => JSON.stringify(c.center) + ' ' + c.prompt).join(' || ')}\nNEG: ${r.parameters.negative_prompt}\n`).join('\n'));
  await p.click('#wtAutoX'); await p.waitForTimeout(300);
  await p.screenshot({path: OUT + '/2_editor_after.png'});
  const n = await p.evaluate(() => nvWT.WT.proj.pages.length);
  for (let i = 0; i < n; i++){
    const d = await p.evaluate(async i => { const pg = nvWT.WT.proj.pages[i]; const c = await nvWT.wtPageCanvas(pg, 750); return c.toDataURL('image/jpeg', 0.85); }, i).catch(e => 'ERR ' + e.message);
    if (d.startsWith('data:')) fs.writeFileSync(`${OUT}/page_${i + 1}.jpg`, Buffer.from(d.split(',')[1], 'base64')); else console.log(d);
  }
  console.log('errors:', errs.join(' / ') || 'none');
  await b.close();
})();
