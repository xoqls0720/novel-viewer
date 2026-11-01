// 보고 있는 만화 그림의 그림체를 AI(가짜 Gemini)가 노벨AI 태그로 → 하우스 스타일 칸·'직접 쓰기'·되돌리기
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1300, height: 900}}); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(__dirname, '..', 'index.html'))}));
  let sent = null;
  await p.route('https://generativelanguage.googleapis.com/**', r => {
    sent = JSON.parse(r.request().postData());
    const t = 'korean webtoon style, semi realistic, Thick Lineart, cel shading, "dramatic lighting", muted colors, 1boy, silver hair';
    r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: t}], role: 'model'}, finishReason: 'STOP'}], usageMetadata: {promptTokenCount: 5, candidatesTokenCount: 5}})}\r\n\r\n`});
  });
  await p.goto('https://nv.test/index.html');
  await p.evaluate(() => { const S = (k, v) => localStorage.setItem('nv.' + k, JSON.stringify(v)); S('set.stStart', false); S('coachDone', true); S('gemKey', 'g-test'); S('set.provider', 'gemini'); S('set.naiStyle', 'old style'); });
  await p.reload(); await p.waitForTimeout(800);
  // 만화 쪽 그림 두 장(캔버스로 그린 640×900)
  await p.evaluate(async () => { const fs = []; for (const i of [1, 2]){ const c = document.createElement('canvas'); c.width = 640; c.height = 900; const g = c.getContext('2d'); for (let k = 0; k < 9; k++){ g.fillStyle = `hsl(${k * 40} 70% 55%)`; g.fillRect(0, k * 100, 640, 100); }
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([blob], `00${i}.png`, {type: 'image/png'}); f._rel = `만화/그림체시험/0001 1화/00${i}.png`; fs.push(f); }
    await nvMedia.addFiles(fs); await nvMedia.openWork(nvMedia.works().find(w => w.name === '그림체시험')); });
  await p.waitForTimeout(1200);
  p.on('dialog', d => { console.log('confirm shows tags:', d.message().includes('korean webtoon style')); d.accept(); });
  await p.evaluate(() => document.querySelector('#spPick').click()); await p.waitForTimeout(1500);
  const img = sent?.contents?.[0]?.parts?.find(x => x.inline_data);
  console.log('image sent:', !!img && img.inline_data.mime_type === 'image/jpeg' && img.inline_data.data.length > 1000);
  console.log('style:', await p.$eval('#naiStyle', e => e.value));
  console.log('select custom:', await p.$eval('#naiStyleSel', e => e.value), '| stat:', await p.textContent('#spStat'));
  await p.click('#spUndo').catch(() => p.evaluate(() => document.querySelector('#spUndo').click()));
  console.log('undo:', await p.$eval('#naiStyle', e => e.value));
  // 작품 전체에서: 8화 × 4장 작품 → 앞·가운데·뒤 회차에 걸쳐 6장, 회차 첫 장은 쓰지 않는다
  await p.evaluate(async () => { const fs = []; for (let e = 1; e <= 8; e++) for (let i = 1; i <= 4; i++){ const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d'); g.fillStyle = `hsl(${e * 30 + i * 5} 60% 50%)`; g.fillRect(0, 0, 300, 420);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const f = new File([blob], `00${i}.png`, {type: 'image/png'}); f._rel = `만화/전체시험/000${e} ${e}화/00${i}.png`; fs.push(f); }
    await nvMedia.addFiles(fs); await nvMedia.openWork(nvMedia.works().find(w => w.name === '전체시험')); });
  await p.waitForTimeout(800);
  console.log('whole picks:', await p.evaluate(() => nvStylePick.files(nvMedia.works().find(w => w.name === '전체시험')).map(f => f._rel.split('/').slice(-2).join('/').replace(/^000\d /, '')).join(',')));
  sent = null; await p.evaluate(() => document.querySelector('#spWhole').click()); await p.waitForTimeout(2500);
  const parts = sent?.contents?.[0]?.parts || [];
  console.log('whole sent:', parts.filter(x => x.inline_data).length, 'images |', /여러 쪽 6장/.test(parts.find(x => x.text)?.text || ''), '| sys says common:', /공통된 그림체/.test(JSON.stringify(sent?.systemInstruction || sent?.system_instruction || '')));
  // 여러 작품 골라서: 두 작품을 고르면 두 작품의 그림을 함께 보이고 '공통된 그림체'를 묻는다. 웹툰 '직접 쓰기' 칸에도 들어간다
  await p.evaluate(() => document.querySelector('#spMany').click()); await p.waitForTimeout(300);
  console.log('many list:', await p.$$eval('.spm .ap-it .t', e => e.map(x => x.textContent).sort().join(',')));
  await p.click('.spm .ap-it:has-text("그림체시험")'); await p.click('.spm .ap-it:has-text("전체시험")');
  console.log('many count:', await p.textContent('#spmN'));
  sent = null; await p.click('#spmGo'); await p.waitForTimeout(2500);
  const mp = sent?.contents?.[0]?.parts || [];
  console.log('many sent:', mp.filter(x => x.inline_data).length, 'images |', /서로 다른 작품 2개/.test(mp.find(x => x.text)?.text || ''));
  console.log('webtoon custom box:', await p.evaluate(() => document.querySelector('#wtStyleIn').value.includes('korean webtoon style')), '| remembered:', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.naiStyleMany')).length));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
