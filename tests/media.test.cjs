// 성인 폴더(작가별)·종류 칸·웹툰 화 나누기·영상 회차(조작 단추)·세로/펼침 바꾸기·번역(가짜 번역 엔진·가짜 Ollama) 시험
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const ROOT = path.resolve(__dirname, '..'); const APP = process.env.APP || 'file://' + ROOT + '/index.html';
const DATA = path.join(__dirname, 'data', 'media');
const PNG = fs.readFileSync(path.join(__dirname, 'data', 'vt2', 'webtoon', 'misaeng', '0001 ep', '001.png'));
function put(rel, buf){ const f = path.join(DATA, rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, buf); }
// 아주 작은 zip(EPUB) 만들기: 저장(무압축)만
function zip(entries){
  const crcT = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], cen = []; let off = 0;
  for (const [name, data0] of entries){
    const data = Buffer.isBuffer(data0) ? data0 : Buffer.from(data0); const nm = Buffer.from(name); const c = crc(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cen.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(cen); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
fs.rmSync(DATA, {recursive: true, force: true});
for (const ep of ['0001 첫 갤러리', '0002 둘째 갤러리']) for (const n of ['001', '002', '003']) put(`성인/만화/artistA/${ep}/${n}.png`, PNG);
put('성인/만화/creatorB (123)/12418913 글 제목/01_a.png', PNG); put('성인/만화/creatorB (123)/12418913 글 제목/02_b.png', PNG);
put('성인/영상/creatorB (123)/12418913 글 제목/03_v.mp4', Buffer.alloc(64));
put('성인/영상/creatorB (123)/12418913 글 제목/03_v.en.srt', Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\nGood night\n'));
put('만화/artistA/0001 1화/001.png', PNG);
put('만화/pawchive/fanbox/hintC/0001 글/001.png', PNG);   // 성인 폴더 밖이지만 이름(pawchive)으로 성인
// 영상 글: 표지 그림 + 영상이 한 폴더에 → 영상 회차 하나(표지 붙음), 그림 회차는 따로 생기지 않아야
put('성인/영상/creatorB (123)/33333333 애니 예고/01_cover.png', PNG);   // 영상 파일 없이 표지만 있는 글: 그래도 작품은 '영상'
put('성인/영상/creatorB (123)/22222222 영상 글/01_cover.png', PNG); put('성인/영상/creatorB (123)/22222222 영상 글/02_v.mp4', Buffer.alloc(64));
// 웹툰 EPUB: 화 3개(목차), 화마다 쪽 하나에 그림 두 장(띠)
{
  const imgs = []; for (let i = 1; i <= 6; i++) imgs.push([`OEBPS/images/${String(i).padStart(4, '0')}.png`, PNG]);
  const page = (t, a, b) => `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${t}</title></head><body><div class="strip"><img src="images/${a}.png"/><img src="images/${b}.png"/></div></body></html>`;
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="p1" href="p00001.xhtml" media-type="application/xhtml+xml"/><item id="p2" href="p00002.xhtml" media-type="application/xhtml+xml"/><item id="p3" href="p00003.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="p1"/><itemref idref="p2"/><itemref idref="p3"/></spine></package>`;
  const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc"><ol><li><a href="p00001.xhtml">제 1 화</a></li><li><a href="p00002.xhtml">제 2 화</a></li><li><a href="p00003.xhtml">제 3 화</a></li></ol></nav></body></html>`;
  put('웹툰/테스트웹툰/테스트웹툰.epub', zip([['mimetype', 'application/epub+zip'], ['META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'],
    ['OEBPS/content.opf', opf], ['OEBPS/nav.xhtml', nav], ['OEBPS/p00001.xhtml', page('제 1 화', '0001', '0002')], ['OEBPS/p00002.xhtml', page('제 2 화', '0003', '0004')], ['OEBPS/p00003.xhtml', page('제 3 화', '0005', '0006')], ...imgs]));
}

(async () => {
  // 디스크 파일 흉내: 구간(Range) 요청만 받는 작은 서버 (윈도우 프로그램의 app://novel/__disk/ 처럼)
  let rangeReqs = 0, fullReqs = 0;
  const http = require('http');
  const srv = http.createServer((req, res) => {
    if (req.method === 'OPTIONS'){ res.writeHead(204, {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range'}); return res.end(); }
    const f = path.join(DATA, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(f).size; const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    if (!m){ fullReqs++; res.writeHead(200, {'Content-Length': size}); return fs.createReadStream(f).pipe(res); }
    rangeReqs++; const a = +m[1], z = Math.min(+m[2], size - 1);
    res.writeHead(206, {'Content-Range': `bytes ${a}-${z}/${size}`, 'Content-Length': z - a + 1}); fs.createReadStream(f, {start: a, end: z}).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1300, height: 900}}); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::|Failed to load|media|DEMUXER|NotSupported|8790/i.test(m.text()) && errs.push('console ' + m.text()));
  // 가짜 Ollama(자막 번역·모델 목록)
  await p.route('http://localhost:11434/**', async r => {
    const u = r.request().url(); const h = {'content-type': 'application/json', 'access-control-allow-origin': '*'};
    if (u.endsWith('/api/tags')) return r.fulfill({status: 200, headers: h, body: JSON.stringify({models: [{name: 'qwen3:8b'}]})});
    if (u.endsWith('/api/chat')) return r.fulfill({status: 200, headers: h, body: JSON.stringify({message: {content: '{"items":[{"id":1,"ko":"안녕"},{"id":2,"ko":"잘 자"}]}'}})});
    r.fulfill({status: 404, headers: h, body: '{}'});
  });
  // 가짜 번역 엔진
  let pageReqs = 0, videoReqs = 0, lastPage = null, lastSubs = null, lastModels = null, forgetReqs = [];
  await p.route('http://127.0.0.1:8790/**', async r => {
    const u = r.request().url(); const h = {'content-type': 'application/json', 'access-control-allow-origin': '*'};
    if (u.endsWith('/health')) return r.fulfill({status: 200, headers: h, body: JSON.stringify({ok: true, ollama: true, device: 'cuda'})});
    if (u.endsWith('/page')){ pageReqs++; const d = JSON.parse(r.request().postData()); lastPage = d; return r.fulfill({status: 200, headers: h, body: JSON.stringify({lang: 'ja', model: 'qwen3:8b', ms: 1200, image: PNG.toString('base64'), by: [d.provider?.id || 'local'], blocks: [{x: 1, y: 1, w: 9, h: 9, src: 'こんにちは', ko: '안녕하세요'}], ctxSent: d.context.length})}); }
    if (u.endsWith('/forget')){ forgetReqs.push(JSON.parse(r.request().postData())); return r.fulfill({status: 200, headers: h, body: JSON.stringify({ok: true, removed: 1})}); }
    if (u.endsWith('/models')){ lastModels = JSON.parse(r.request().postData()); return r.fulfill({status: 200, headers: h, body: JSON.stringify({models: ['llama-3.3-70b-versatile', 'gemma2-9b-it']})}); }
    if (u.endsWith('/subs')){ lastSubs = JSON.parse(r.request().postData()); return r.fulfill({status: 200, headers: h, body: JSON.stringify({vtt: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n안녕\n', lines: 1, by: ['local']})}); }
    if (u.endsWith('/video')){ videoReqs++; return r.fulfill({status: 200, headers: h, body: JSON.stringify({id: 'v1'})}); }
    if (u.includes('/job')) return r.fulfill({status: 200, headers: h, body: JSON.stringify({state: 'done', progress: 1, msg: '자막 1줄 (ja → 한국어)', vtt: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n엔진 자막\n'})});
    r.fulfill({status: 404, headers: h, body: '{}'});
  });
  await p.goto(APP); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.setItem('nv.set.stStart', 'false'); });
  await p.reload(); await p.waitForTimeout(800);
  await p.setInputFiles('#pickFolder', DATA); await p.waitForTimeout(1500);
  const W = () => p.evaluate(() => nvMedia.works().map(w => `${w.key}:${w.kind}:${w.eps.length}`).sort().join(' | '));
  console.log('works:', await W());
  console.log('video cover merged:', await p.evaluate(() => { const w = nvMedia.works().find(w => w.key === '성인 영상/creatorB (123)'); return w.kind + ' ' + w.eps.map(e => e.type + (e.cover ? '+cover' : '')).join(','); }));
  console.log('normal kept apart:', await p.evaluate(() => nvMedia.works().some(w => w.key === '만화/artistA') && nvMedia.works().some(w => w.key === '성인 만화/artistA')));
  // 종류 칸: 전체에는 성인이 없고, 성인 칸에만
  await p.evaluate(() => nvGo('lib')); await p.waitForTimeout(300);
  const tabs = await p.$$eval('#libKinds .kind-tab span', s => s.map(x => x.textContent));
  const shownAll = await p.$$eval('#lib .card .t', s => s.map(x => x.textContent));
  console.log('tabs:', tabs.join(','), '| all has adult:', shownAll.includes('creatorB (123)'));
  await p.click('#libKinds .kind-tab.adult'); await p.waitForTimeout(300);
  console.log('adult tab:', (await p.$$eval('#lib .card .t', s => s.map(x => x.textContent))).sort().join(','));
  await p.click('#libKinds .kind-tab:has-text("만화")'); await p.waitForTimeout(300);
  console.log('manga tab:', (await p.$$eval('#lib .card .t', s => s.map(x => x.textContent))).join(','));
  // 오른쪽 클릭으로 성인 칸에 보내기 / 되돌리기 (이름으로 알아본 작품은 처음부터 성인 칸에만)
  const cards = async () => (await p.$$eval('#lib .card .t', s => s.map(x => x.textContent))).sort().join(',');
  const okDlg = d => d.accept(); p.on('dialog', okDlg);
  await p.click('#lib .card:has-text("artistA")', {button: 'right'}); await p.waitForTimeout(300);
  const mangaAfter = await cards();
  await p.click('#libKinds .kind-tab.adult'); await p.waitForTimeout(300); const adultAfter = await cards();
  await p.click('#lib .card:has-text("hintC")', {button: 'right'}); await p.waitForTimeout(300); const adultBack = await cards();
  p.off('dialog', okDlg); await p.evaluate(() => { localStorage.removeItem('nv.adultMark'); nvMedia.setKind('all'); });
  console.log('adult marks: manga tab', JSON.stringify(mangaAfter), '| adult tab', adultAfter, '| hintC back out', !adultBack.includes('hintC'));
  // 웹툰 EPUB → 화 3개 (디스크에서 구간으로 읽기: 통째로 받지 않는다)
  await p.evaluate(u => { const w = nvMedia.works().find(w => w.key === '웹툰/테스트웹툰'); w.eps[0].file.streamUrl = u; }, BASE + '/' + encodeURIComponent('웹툰') + '/' + encodeURIComponent('테스트웹툰') + '/' + encodeURIComponent('테스트웹툰.epub'));
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.key === '웹툰/테스트웹툰'))); await p.waitForTimeout(1500); await p.click('#coachOk').catch(() => {});
  console.log('webtoon split:', await p.evaluate(() => [...document.querySelectorAll('#epSel option')].map(o => o.textContent).join(',')), '| imgs:', await p.$$eval('#reader .webtoon img', x => x.length));
  await p.waitForTimeout(800);
  console.log('range zip:', rangeReqs > 3, '| full reads:', fullReqs, '| img decoded:', await p.$$eval('#reader .webtoon img', x => x.filter(i => i.complete && i.naturalWidth > 0).length));
  // 성인 작품을 읽다 홈으로 → 이어 읽기에 안 나오고, 뒤 화면도 가린다
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.key === '성인 만화/artistA'))); await p.waitForTimeout(900);
  console.log('opened manga:', !!(await p.$('#reader .manga')), '| flow btn:', await p.isVisible('#btnFlow'));
  await p.click('#btnFlow'); await p.waitForTimeout(800);
  console.log('after flow: webtoon', !!(await p.$('#reader .webtoon')), '| saved mode:', await p.evaluate(() => localStorage.getItem('nv.set.mode.manga')));
  await p.evaluate(() => nvGo('home')); await p.waitForTimeout(500);
  console.log('home resume adult:', await p.evaluate(() => !document.querySelector('#wResume').hidden && document.querySelector('#wResume .n').textContent), '| reader hidden:', await p.evaluate(() => document.querySelector('#app').classList.contains('hide-adult')));
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.key === '만화/artistA'))); await p.waitForTimeout(800);
  console.log('other manga also scroll:', !!(await p.$('#reader .webtoon')));
  // 화 고르기: 그림 목차 (첫 쪽 작은 그림)
  await p.click('#epBtn'); await p.waitForTimeout(1500);
  console.log('ep grid manga:', await p.evaluate(() => document.querySelector('#epList').classList.contains('epgrid')), '| tiles', await p.$$eval('#epList .ept', x => x.length), '| thumbs', await p.$$eval('#epList .ept.has', x => x.length) > 0);
  await p.evaluate(() => closeSheets?.() ?? document.querySelector('#epClose').click()).catch(() => p.click('#epClose'));
  await p.waitForTimeout(300);
  // 만화 번역: 엔진이 돌려준 그림으로 바뀌고, 원문 보기로 되돌린다 (윈도우 프로그램 기능은 가짜로)
  await p.evaluate(() => { window.nvDesktop = {trStatus: async () => ({installed: true, health: {ok: true, ollama: true}}), trStart: async () => ({ok: true})}; });
  await p.evaluate(() => { localStorage.setItem('nv.set.trProv', '"groq"'); localStorage.setItem('nv.grKey', '"gsk_test"'); });
  const src0 = await p.$eval('#reader .webtoon img[data-i="0"]', i => i.src);
  await p.click('#btnTrans'); await p.waitForTimeout(1500);
  const src1 = await p.$eval('#reader .webtoon img[data-i="0"]', i => i.src);
  console.log('translate: req', pageReqs, '| shown', (await p.textContent('#trBox .trb')).includes('안녕하세요'), '| img swapped', src1 !== src0);
  console.log('provider sent:', lastPage?.provider?.id, lastPage?.provider?.key, '| adult:', lastPage?.adult, '| by shown:', (await p.textContent('#trBox')).includes('Groq'));
  await p.click('#trBox [data-a=cfg]'); await p.waitForTimeout(800);
  console.log('cfg: models', await p.$$eval('#trModelSel option', o => o.length), '| asked', lastModels?.provider?.id, '| key link', await p.isVisible('#trKeyUrl'));
  await p.selectOption('#trProv', 'deepl'); await p.waitForTimeout(300);
  console.log('deepl: model row hidden', await p.isHidden('#trModelSel'), '| key empty', (await p.getAttribute('#trKey', 'placeholder')) === 'API 키');
  await p.selectOption('#trProv', 'groq'); await p.click('#trBox [data-a=cfg]');
  await p.click('#trBox [data-a=orig]'); await p.waitForTimeout(300);
  console.log('orig toggle:', (await p.$eval('#reader .webtoon img[data-i="0"]', i => i.src)) !== src1);
  await p.click('#trBox [data-a=orig]'); await p.waitForTimeout(200);
  const before = pageReqs; await p.click('#btnTrans'); await p.waitForTimeout(500);
  console.log('cached (no new request):', pageReqs === before);
  // 번역해 둔 쪽: 쪽 열쇠를 함께 보내고, 회차를 다시 열면 엔진에 묻지 않고 바로 한국어로
  console.log('page key sent:', /^만화\/artistA\|.+\|.+/.test(lastPage?.key || ''));
  const before2 = pageReqs;
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.key === '만화/artistA'))); await p.waitForTimeout(1800);
  console.log('saved on reopen:', pageReqs === before2, '| shown translated', await p.evaluate(() => { const im = document.querySelector('#reader .webtoon img[data-i="0"]'); return !!im && !!window.nvTrFirstSrc && im.src === window.nvTrFirstSrc; }), '| toast', (await p.evaluate(() => window.nvTrSavedN)) > 0);
  // 처음부터 다시: 엔진에 force 를 보내고, 저장해 둔 쪽을 지우라고 한다
  const before3 = pageReqs; await p.evaluate(() => document.querySelector('#trBox [data-a=again]').click()); await p.waitForTimeout(1500);
  console.log('retranslate:', pageReqs === before3 + 1, '| force', lastPage?.force === true, '| forget', forgetReqs.some(f => (f.keys || []).some(k => k === lastPage?.key)));
  // 영상: 조작 단추, 키가 쪽 넘기기로 새지 않음, 자막 번역(자막 파일 있음), 엔진 자막(자막 없음)
  await p.evaluate(() => nvMedia.openWork(nvMedia.works().find(w => w.key === '성인 영상/creatorB (123)'))); await p.waitForTimeout(1000);
  console.log('video:', !!(await p.$('#reader video')), '| buttons:', await p.$$eval('.vinfo [data-a]', b => b.map(x => x.dataset.a).join(',')), '| flow hidden:', await p.isHidden('#btnFlow'));
  await p.click('#epBtn'); await p.waitForTimeout(1500);
  console.log('ep grid video:', await p.evaluate(() => document.querySelector('#epList').classList.contains('epgrid')), '| video tiles', await p.$$eval('#epList .ept.v', x => x.length), '| play mark', await p.$$eval('#epList .ept.v .pl', x => x.length) > 0, '| cover thumb', await p.$$eval('#epList .ept.has', x => x.length) > 0);
  await p.click('#epClose'); await p.waitForTimeout(300);
  const epBefore = await p.evaluate(() => document.querySelector('#epSel').value);
  await p.keyboard.press(' '); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
  console.log('keys stay in video:', (await p.evaluate(() => document.querySelector('#epSel').value)) === epBefore && !!(await p.$('#reader video')));
  await p.click('.vinfo [data-a=tr]'); await p.waitForTimeout(1500);
  console.log('sub translated:', await p.$$eval('#reader video track', t => t.some(x => x.label.includes('한국어'))), '| select:', await p.$$eval('#vSub option', o => o.length), '| via engine, adult→local:', lastSubs?.provider?.id, lastSubs?.adult);
  await p.evaluate(async () => { const w = nvMedia.works().find(w => w.key === '성인 영상/creatorB (123)'); const ep = w.eps[0]; ep.subs = []; ep.file.abs = 'D:\\x\\a.mp4'; await nvMedia.openWork(w); });
  await p.waitForTimeout(800); await p.click('.vinfo [data-a=tr]'); await p.waitForTimeout(2500);
  console.log('engine video:', videoReqs, '| track:', await p.$$eval('#reader video track', t => t.some(x => x.label.includes('한국어'))));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close(); srv.close();
})();
