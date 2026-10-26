// 아이패드 그림: 펜슬 필압·손가락 확대·두 손가락 되돌리기·종이·굿노트 PDF·프로크리에이트 PSD·그림 가져오기
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1180, height: 820}, hasTouch: true, acceptDownloads: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::/.test(m.text()) && errs.push('console ' + m.text()));
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.accept(); });
  await p.goto(APP); await p.waitForTimeout(700);
  await p.evaluate(() => localStorage.setItem('nv.set.stStart', 'false')); await p.reload(); await p.waitForTimeout(700);
  const setSel = (id, v) => p.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = x; el.dispatchEvent(new Event('change', {bubbles: true})); }, [id, v]);
  const cdp = await ctx.newCDPSession(p);
  await p.click('#tgTool').catch(() => {}); await p.click('.tabs button[data-tab=notes]'); await p.waitForTimeout(200);
  // 종이: 격자·가로
  await p.selectOption('#ideaPaper', 'grid'); await p.selectOption('#ideaSize', 'wide'); await p.click('#ideaDraw'); await p.waitForTimeout(400);
  console.log('paper:', await p.$eval('#skCanvas', c => c.width + 'x' + c.height), '| pixel grid:', await p.$eval('#skCanvas', c => { const d = c.getContext('2d').getImageData(56, 300, 1, 1).data; return d[0] < 250; }));
  const box = await p.$eval('#skCanvas', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  // 펜슬로 필압이 다른 획
  const pen = async (pts, f) => { await cdp.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: pts[0][2] ?? f}); for (const q of pts.slice(1)){ await cdp.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: q[0], y: q[1], button: 'left', buttons: 1, pointerType: 'pen', force: q[2] ?? f}); } const e = pts.at(-1); await cdp.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: e[0], y: e[1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen', force: 0}); };
  const x0 = box.x + 60, y0 = box.y + 60;
  await pen([[x0, y0, .1], [x0 + 40, y0 + 10, .3], [x0 + 80, y0 + 30, .6], [x0 + 120, y0 + 50, .9], [x0 + 160, y0 + 60, .9]]);
  await pen([[x0, y0 + 80], [x0 + 100, y0 + 100], [x0 + 200, y0 + 90]], .5);
  await p.waitForTimeout(200);
  console.log('pen seen:', await p.evaluate(() => JSON.parse(localStorage.getItem('nv.lib.penSeen'))), '| finger draws:', await p.$eval('#skFinger', b => b.classList.contains('on')));
  // 손가락 두 개로 벌리기 = 확대
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((q, i) => ({x: q[0], y: q[1], id: i + 1}))});
  await p.waitForTimeout(1600);   // 펜슬 직후 손바닥 무시 구간이 지난 뒤
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - 40 - i * 15, cy], [cx + 40 + i * 15, cy]]); await touch('touchEnd', []);
  await p.waitForTimeout(150);
  const tf = await p.$eval('#skCanvas', c => c.style.transform); console.log('pinch zoom:', /scale\((?:1\.[2-9]|[2-9])/.test(tf), tf.replace(/\s+/g, ' '), '| fit btn:', await p.isVisible('#skFit'));
  await p.click('#skFit'); console.log('fit reset:', (await p.$eval('#skCanvas', c => c.style.transform)) === '');
  // 두 손가락 톡 = 되돌리기 (획 2개 → 1개)
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]); await touch('touchEnd', []); await p.waitForTimeout(250);
  await p.fill('#skNote', '필압 시험'); await p.click('#skSave'); await p.waitForTimeout(700);
  const rec = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').getAll(); g.onsuccess = () => res(g.result.map(x => ({n: x.strokes?.length, pr: x.strokes?.[0]?.pr, ps: x.strokes?.[0]?.pts.map(q => +(q[2] ?? 0).toFixed(2)), note: x.note, w: 0}))); }; })); 
  console.log('saved strokes after 2-finger undo:', rec[0].n, '| pressure stroke:', rec[0].pr, '| p varied:', new Set(rec[0].ps).size > 2);
  // 다시 열어 PDF·PSD
  await p.click('#scrapList .card [data-a=edit]'); await p.waitForTimeout(500);
  await setSel('gnPage', 'a4'); await setSel('sendMode', 'share');
  const dl1 = p.waitForEvent('download', {timeout: 20000}); await p.selectOption('#skSend', 'gn'); const pdf = await dl1; const pf = path.join(__dirname, 'out', 'sk.pdf'); await pdf.saveAs(pf);
  console.log('goodnotes pdf:', fs.readFileSync(pf).slice(0, 4).toString());
  await setSel('pcFormat', 'psd'); await setSel('pcSize', 'tall');
  const dl2 = p.waitForEvent('download', {timeout: 20000}); await p.selectOption('#skSend', 'pc'); const psd = await dl2; const sf = path.join(__dirname, 'out', 'sk.psd'); await psd.saveAs(sf);
  console.log('procreate psd:', fs.readFileSync(sf).slice(0, 4).toString());
  await setSel('pcFormat', 'png');
  const dl3 = p.waitForEvent('download', {timeout: 20000}); await p.selectOption('#skSend', 'pc'); const png = await dl3; const nf = path.join(__dirname, 'out', 'sk_pc.png'); await png.saveAs(nf);
  console.log('procreate png:', fs.readFileSync(nf).slice(1, 4).toString());
  // 앱 바로 열기: 그림을 클립보드에 복사하고 앱 주소를 부른다. 앱이 안 뜨는 환경에서는 공유 시트 단추가 나온다
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']); await setSel('sendMode', 'open');
  await p.evaluate(() => { window.__nav = []; const orig = Object.getOwnPropertyDescriptor(Location.prototype, 'href'); });
  await p.selectOption('#skSend', 'gn'); await p.waitForTimeout(700);
  console.log('open mode copied image:', await p.evaluate(async () => { try{ const it = await navigator.clipboard.read(); return it[0].types.join(',') ; }catch(e){ return 'err ' + e.message; } }), '| toast:', (await p.textContent('#toast')).includes('복사했어요'));
  await p.waitForTimeout(2600); console.log('open fallback to share:', await p.isVisible('#shareReady') || (await p.textContent('#toast')).includes('파일로 저장했어요'));
  // 바깥 그림 가져오기(바탕 바꾸기): 닫을 때 저장 확인 · 가져오기
  const src = path.join(DATA, 'vt2', 'novel', 'hwasan', 'cover.png');
  await p.setInputFiles('#skImportFile', src); await p.waitForTimeout(600);
  console.log('imported size:', await p.$eval('#skCanvas', c => c.width + 'x' + c.height));
  const d0 = dialogs; await p.click('#skX'); await p.waitForTimeout(300); console.log('close asks when changed:', dialogs > d0);
  // 메모 칸에서 그림 여러 장 가져오기
  await p.setInputFiles('#noteImportFile', [src, path.join(DATA, 'vt2', 'webtoon', 'misaeng', '0001 ep', '001.png')]); await p.waitForTimeout(900);
  console.log('scraps after import:', await p.$$eval('#scrapList .card', e => e.length));
  // 다른 앱 파일: 굿노트 PDF(위에서 만든 것), RLE 압축 PSD, .procreate 미리보기
  const fx = path.join(__dirname, 'out', 'fx'); fs.mkdirSync(fx, {recursive: true});
  require('child_process').execFileSync('python3', ['-I', '-c', `
from PIL import Image
from psd_tools import PSDImage
import zipfile, io
im = Image.new('RGB', (120, 80), (200, 30, 30)); im.paste((30, 30, 200), (60, 0, 120, 80)); PSDImage.frompil(im).save('${fx}/rle.psd')
b = io.BytesIO(); im.save(b, 'PNG'); z = zipfile.ZipFile('${fx}/art.procreate', 'w'); z.writestr('QuickLook/Thumbnail.png', b.getvalue()); z.writestr('Document.archive', b'x'); z.close()
`]);
  const before = (await p.$$('#scrapList .card')).length;
  await p.setInputFiles('#noteImportFile', [path.join(__dirname, 'out', 'sk.pdf'), path.join(fx, 'rle.psd'), path.join(fx, 'art.procreate')]); await p.waitForTimeout(4000);
  console.log('other-app files imported:', (await p.$$('#scrapList .card')).length - before, '| names:', (await p.$$eval('#scrapList .card .m', e => e.map(x => x.textContent.split(' · ')[1]))).slice(0, 3));
  const px = await p.evaluate(async () => { const all = await new Promise(res => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').getAll(); g.onsuccess = () => res(g.result); }; }); const x = all.find(a => a.epName === 'rle'); if (!x) return 'none'; const bm = await createImageBitmap(x.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); const l = g.getImageData(10, 40, 1, 1).data, r = g.getImageData(c.width - 10, 40, 1, 1).data; return [l[0] > 150 && l[2] < 80, r[2] > 150 && r[0] < 80, c.width + 'x' + c.height].join(' '); });
  console.log('psd rle colors:', px);
  // 필기 칸에서 Gemini에게 연출 묻기: 그림이 inline_data로 간다
  let gemBody = null; await p.route('https://generativelanguage.googleapis.com/**', r => { gemBody = r.request().postData(); r.fulfill({status: 200, headers: {'content-type': 'text/event-stream', 'access-control-allow-origin': '*'}, body: `data: ${JSON.stringify({candidates: [{content: {parts: [{text: '제미나이 연출 답'}]}, finishReason: 'STOP'}]})}\n\n`}); });
  await p.evaluate(() => { localStorage.setItem('nv.gemKey', JSON.stringify('AIza-x')); });
  await p.reload(); await p.waitForTimeout(700); await p.click('#tgTool').catch(() => {}); await p.click('.tabs button[data-tab=notes]'); await p.click('#ideaDraw'); await p.waitForTimeout(300);
  await p.selectOption('#skAskProv', 'gemini'); await p.click('#skAsk'); await p.waitForTimeout(1500);
  console.log('ask gemini: image sent', /inline_data/.test(gemBody || ''), '| answer shown', (await p.textContent('#chat')).includes('제미나이 연출 답'), '| ai tab provider', await p.$eval('#aiProv', e => e.value));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
