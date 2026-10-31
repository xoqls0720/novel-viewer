// 폰·아이패드(웹)에서 노벨AI 그림 바로 만들기: 프로그램 없이 브라우저가 노벨AI 에 보낸다(가짜 노벨AI, 흘려 받기 msgpack)
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
const PNG = fs.readFileSync(path.join(__dirname, 'data', 'vt2', 'webtoon', 'misaeng', '0001 ep', '001.png'));
// msgpack 조각 하나: {event_type, image}
function frame(type, img){
  const s = t => Buffer.concat([Buffer.from([0xa0 | Buffer.byteLength(t)]), Buffer.from(t)]);
  const parts = [Buffer.from([0x82]), s('event_type'), s(type), s('image')];
  const h = Buffer.alloc(5); h[0] = 0xc6; h.writeUInt32BE(img.length, 1); parts.push(h, img);
  const body = Buffer.concat(parts); const len = Buffer.alloc(4); len.writeUInt32BE(body.length); return Buffer.concat([len, body]);
}
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
  const reqs = [];
  await ctx.route('https://image.novelai.net/**', r => {
    const q = r.request(); reqs.push({url: q.url(), auth: q.headers()['authorization'], body: JSON.parse(q.postData() || '{}')});
    if (q.headers()['authorization'] !== 'Bearer nai-web') return r.fulfill({status: 401, body: 'bad', headers: {'access-control-allow-origin': '*'}});
    r.fulfill({status: 200, contentType: 'application/x-msgpack', headers: {'access-control-allow-origin': '*'}, body: Buffer.concat([frame('intermediate', Buffer.from('x')), frame('final', PNG)])});
  });
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.naiKey', JSON.stringify('nai-web')); });
  await p.reload(); await p.waitForTimeout(1000);
  await p.evaluate(() => nvGo('set')); await p.click('.tabs button[data-tab=nai]'); await p.waitForTimeout(300);
  console.log('web ui: go', await p.isVisible('#ngGo'), '| grab hidden', !(await p.isVisible('#ngGrab')), '| old hint hidden', !(await p.isVisible('#ngWeb')));
  // 프롬프트(AI) 다음 단계: 노벨AI 에 그려 달라고 보내고 장면 노트에 저장
  const res = await p.evaluate(() => window.nvNai.one({base: '1boy, adult, snowy castle', chars: [], neg: 'lowres'}, '카엘').then(() => 'ok', e => e.message));
  console.log('web gen:', res, '| reqs', reqs.length, '| stream', /generate-image-stream$/.test(reqs[0]?.url || ''), '| msgpack asked', reqs[0]?.body?.parameters?.stream);
  const sc = await p.evaluate(() => new Promise(ok => { const r = indexedDB.open('nv'); r.onsuccess = () => { const g = r.result.transaction('scraps').objectStore('scraps').getAll(); g.onsuccess = () => ok(g.result.map(x => x.blob?.size || 0)); }; }));
  console.log('saved scraps:', sc.length, '| has image:', sc.every(n => n > 100));
  // 웹툰 만들기: 컷 그림 단추가 폰에서도 켜진다
  console.log('webtoon gen enabled on web:', await p.evaluate(() => { const b = document.querySelector('#wtGenAll'); return !!b && !/윈도우 프로그램에서만/.test(String(document.querySelector('#wtImgGen').onclick)); }));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
