// 폰(흉내)에서 PC 서재 작품을 '전체 받기': 진짜 서버를 켜고 txt·그림 폴더·EPUB 을 받은 뒤, PC 요청을 막고 다시 열어 본다
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data');
const { createLanServer } = require(path.join(ROOT, 'desktop', 'lan-server.js'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
function zipOf(ents){
  const t = []; for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], cen = []; let off = 0;
  for (const [name, d0, m] of ents){ const raw = Buffer.from(d0), data = m ? zlib.deflateRawSync(raw) : raw, nm = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(m, 8); h.writeUInt32LE(crc(raw), 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(m, 10); c.writeUInt32LE(crc(raw), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, data); cen.push(c, nm); off += 30 + nm.length + data.length; }
  const cd = Buffer.concat(cen); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(ents.length, 8); e.writeUInt16LE(ents.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
const page = n => `<html><body><img src="${n}.png"/></body></html>`;
const EPUB = zipOf([
  ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/c.opf"/></rootfiles></container>', 8],
  ['OEBPS/c.opf', `<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>${[1,2,3,4].map(i => `<item id="p${i}" href="p${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${[1,2,3,4].map(i => `<itemref idref="p${i}"/>`).join('')}</spine></package>`, 8],
  ['OEBPS/nav.xhtml', '<html><body><nav><ol><li><a href="p1.xhtml">1화</a></li><li><a href="p3.xhtml">2화</a></li></ol></nav></body></html>', 8],
  ...[1,2,3,4].flatMap(i => [[`OEBPS/p${i}.xhtml`, page(i), 8], [`OEBPS/${i}.png`, PNG, 0]]),
]);
(async () => {
  const dir = path.join(__dirname, 'out', 'dllan', '웹툰'), ani = path.join(__dirname, 'out', 'dllan', '애니'); fs.rmSync(path.dirname(dir), {recursive: true, force: true}); fs.mkdirSync(path.join(dir, '에펍웹툰'), {recursive: true}); fs.mkdirSync(path.join(ani, '시험애니'), {recursive: true});
  fs.writeFileSync(path.join(dir, '에펍웹툰', '에펍웹툰.epub'), EPUB);
  const CLIP = fs.readFileSync(path.join(__dirname, 'drv-clip.webm'));
  for (const n of ['0001 1화', '0002 2화']){ fs.writeFileSync(path.join(ani, '시험애니', n + '.webm'), CLIP); fs.writeFileSync(path.join(ani, '시험애니', n + '.ko.vtt'), 'WEBVTT\n\n00:00.000 --> 00:02.000\n자막 ' + n + '\n'); }
  const lan = createLanServer({appDir: ROOT, roots: [path.join(DATA, 'vt2', 'novel'), path.join(DATA, 'vt2', 'webtoon'), dir, ani], token: 'tok9', port: 0});
  const port = await lan.start(); const base = `http://127.0.0.1:${port}/t/tok9/`;
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.setDefaultTimeout(9000); const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await p.goto(base); await p.waitForTimeout(2500);
  await p.evaluate(() => localStorage.setItem('nv.coach', 'true'));
  const open = async name => { await p.evaluate(() => nvGo('lib')); await p.waitForTimeout(300); await p.tap(`:is(.grid,.shelf) .card:has-text("${name}")`); await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector('.coach button')?.click()); };
  const getAll = async name => {
    await open(name); await p.evaluate(() => document.querySelector('#app').classList.remove('immersive')); await p.waitForTimeout(300); await p.tap('#epBtn'); await p.waitForSelector('#epDl:not([hidden])', {timeout: 8000}); await p.waitForTimeout(300);
    const box = await p.$eval('#epDl', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width > 40; });
    const label = await p.textContent('#epDl'); await p.tap('#epDl');
    await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('받아 둠'), null, {timeout: 20000});
    await p.keyboard.press('Escape'); return {box, label};
  };
  const nov = await getAll('hwasan');
  console.log('phone btn:', nov.label, '| inside screen:', nov.box);
  console.log('http note:', /PC 가 켜져 있어야 앱이 열려요/.test(dialogs[0]));
  await p.tap('#epBtn'); await p.waitForTimeout(400); await p.screenshot({path: path.join(__dirname, 'out', 'dllan-phone.png')}); await p.keyboard.press('Escape');
  await getAll('misaeng');
  await getAll('에펍웹툰');
  // 애니: 조각으로 받는다. 중간에 끊겨도 받은 조각은 남고, 마저 받기는 남은 조각만 받는다
  await open('시험애니'); await p.evaluate(() => { nvDl.DLA.chunk = 5000; document.querySelector('#app').classList.remove('immersive'); }); await p.waitForTimeout(300);
  let parts = 0, cut = true;
  await p.route(/\/lan\/file/, r => { const m = /^bytes=(\d+)-(\d+)$/.exec(r.request().headers().range || ''); if (!m) return r.continue(); if (cut && +m[1] >= 10000) return r.abort(); parts++; r.continue(); });
  await p.tap('#epBtn'); await p.waitForSelector('#epDl:not([hidden])'); await p.waitForTimeout(300);
  console.log('video plan:', await p.evaluate(() => { const w = nvMedia.works().find(x => x.name === '시험애니'); const q = nvDl.plan(w); return [w.kind, q.videos.length, q.files.length].join(' '); }));
  await p.tap('#epDl'); await p.waitForFunction(() => document.querySelector('#epDl')?.textContent === '마저 받기', null, {timeout: 25000});
  const first = parts; parts = 0; cut = false; await p.tap('#epDl');
  await p.waitForFunction(() => document.querySelector('#epDl')?.textContent.includes('받아 둠'), null, {timeout: 25000});
  console.log('video resume:', first, parts, '| video note:', /영상 2편도 함께 받아요/.test(dialogs.at(-1)));
  await p.unroute(/\/lan\/file/); await p.keyboard.press('Escape');
  console.log('got all: true');
  await p.evaluate(() => nvGo('lib')); await p.selectOption('#libSort', 'kept'); await p.waitForTimeout(300);
  console.log('kept tab:', await p.$$eval('#lib .card', e => e.length), '| badges:', await p.$$eval('#lib .card .kept', e => e.length));
  await p.selectOption('#libSort', 'name'); await p.waitForTimeout(200);
  // PC 가 꺼졌다 (앱 화면은 https 서비스 워커가 주는 경우와 같다): 서재 자료 요청을 모두 막는다
  let blocked = 0; await ctx.route(/\/t\/tok9\/lan\//, r => { blocked++; r.abort(); });
  await p.reload(); await p.waitForTimeout(2500);
  console.log('off works:', await p.evaluate(() => ['hwasan', 'misaeng', '에펍웹툰', '시험애니'].every(n => nvMedia.works().some(w => w.name === n))));
  await open('hwasan'); const last = await p.evaluate(() => { const s = document.querySelector('#epSel'); return s.options.length; });
  await p.evaluate(i => { const s = document.querySelector('#epSel'); s.value = i; s.dispatchEvent(new Event('change')); }, String(last - 1)); await p.waitForTimeout(800);
  console.log('off novel last ep:', ((await p.textContent('#reader .novel')) || '').length > 20);
  await open('misaeng'); await p.evaluate(i => { const s = document.querySelector('#epSel'); s.value = i; s.dispatchEvent(new Event('change')); }, '1'); await p.waitForTimeout(1500);
  console.log('off webtoon imgs:', await p.$$eval('#reader .webtoon img', e => e.length > 0 && e.every(i => i.naturalWidth > 0)));
  await open('에펍웹툰'); console.log('off epub eps:', await p.$$eval('#epSel option', e => e.map(x => x.textContent).join(',')));
  await p.evaluate(i => { const s = document.querySelector('#epSel'); s.value = i; s.dispatchEvent(new Event('change')); }, '1'); await p.waitForTimeout(1500);
  console.log('off epub imgs:', await p.$$eval('#reader .webtoon img', e => e.length === 2 && e.every(i => i.naturalWidth > 0)), '| pc asked:', blocked > 0);
  await open('시험애니'); await p.evaluate(i => { const s = document.querySelector('#epSel'); s.value = i; s.dispatchEvent(new Event('change')); }, '1');
  await p.waitForFunction(() => { const v = document.querySelector('#reader video'); return v && v.readyState >= 1 && v.duration > 0; }, null, {timeout: 9000});
  console.log('off video:', await p.$eval('#reader video', v => [v.src.startsWith('blob:'), v.textTracks.length, v.error === null].join(' ')));
  await p.$eval('#reader video', v => { v.currentTime = v.duration / 2; }); await p.waitForTimeout(500);
  console.log('off video seek:', await p.$eval('#reader video', v => v.currentTime > 0 && !v.error));
  await open('oldman'); console.log('not kept tells:', /PC 가 켜져 있는지/.test(await p.textContent('#toast')));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close(); await lan.stop();
})();
