// 구글 드라이브의 zip 만화·영상을 폰처럼 연다. 진짜 드라이브처럼 주소에 붙인 토큰(access_token=)은 거절하고 머리글(Authorization)만 받는다.
// 영상은 <video> 가 머리글을 못 붙이니 서비스 워커(./__drv/)를 거쳐야 하고, 구간 응답(206·Content-Range)을 워커가 만들어야 재생된다.
const {chromium} = require('playwright'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..');
// 압축 없는(store) zip 을 직접 만든다: 그림 두 장
function storeZip(files){
  const t = []; for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const loc = [], cen = []; let off = 0;
  for (const [name, data] of files){
    const nb = Buffer.from(name); const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc(data), 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc(data), 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
    loc.push(h, nb, data); cen.push(c, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(cen); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, e]);
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const ZIP = storeZip([['01.png', PNG], ['02.png', PNG]]); const CLIP = fs.readFileSync(path.join(__dirname, 'drv-clip.webm'));
const FOLDER = 'application/vnd.google-apps.folder';
const D = {root: [{id: 'H', name: '노벨리스트', mimeType: FOLDER}], H: [{id: 'K1', name: '만화', mimeType: FOLDER}, {id: 'K2', name: '영상', mimeType: FOLDER}],
  K1: [{id: 'W1', name: '시험만화', mimeType: FOLDER}], W1: [{id: 'Z1', name: '0001 1화.zip', mimeType: 'application/zip', size: String(ZIP.length), modifiedTime: '2026-10-01T00:00:00Z'}],
  K2: [{id: 'W2', name: '시험영상', mimeType: FOLDER}], W2: [{id: 'V1', name: 'clip.webm', mimeType: 'video/webm', size: String(CLIP.length), modifiedTime: '2026-10-01T00:00:00Z'}]};
const BODY = {Z1: ZIP, V1: CLIP};
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const html = fs.readFileSync(path.join(ROOT, 'index.html')), sw = fs.readFileSync(path.join(ROOT, 'sw.js'));
  await ctx.route('https://nv.test/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith('/sw.js')) return r.fulfill({status: 200, contentType: 'text/javascript', body: sw});
    if (u.pathname.endsWith('/index.html') || u.pathname === '/') return r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html});
    return r.fulfill({status: 200, contentType: 'application/octet-stream', body: ''});   // 아이콘 등: 워커 설치(addAll)가 실패하지 않게
  });
  await ctx.route('https://accounts.google.com/**', r => r.fulfill({status: 200, contentType: 'text/javascript', body: 'window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:"tok",expires_in:3600}),10)})}}};'}));
  const seen = {qp: 0, hdr: 0, range: 0};
  await ctx.route('https://www.googleapis.com/**', async r => {
    const rq = r.request(); const u = new URL(rq.url()); const H = {'access-control-allow-origin': '*'};
    const J = o => r.fulfill({status: 200, contentType: 'application/json', headers: H, body: JSON.stringify(o)});
    if (rq.method() === 'OPTIONS') return r.fulfill({status: 204, headers: {...H, 'access-control-allow-headers': 'authorization,range', 'access-control-allow-methods': 'GET'}});
    if (u.searchParams.has('access_token')){ seen.qp++; return r.fulfill({status: 401, body: 'no'}); }   // 진짜 드라이브처럼: CORS 머리글 없이 거절
    if (rq.headers()['authorization'] !== 'Bearer tok') return r.fulfill({status: 401, headers: H, body: '{}'});
    if (u.pathname.endsWith('/changes/startPageToken')) return J({startPageToken: '1'});
    if (u.pathname.endsWith('/changes')) return J({changes: [], newStartPageToken: '1'});
    if (u.searchParams.get('spaces') === 'appDataFolder') return J({files: []});
    const m = u.pathname.match(/files\/(\w+)$/);
    if (m){
      seen.hdr++; const buf = BODY[m[1]]; const rg = /bytes=(\d+)-(\d+)/.exec(rq.headers()['range'] || '');
      // Content-Range 는 다른 주소에 보여 주지 않는다(진짜 드라이브와 같이)
      if (rg){ seen.range++; const a = +rg[1], e = Math.min(buf.length - 1, +rg[2]); return r.fulfill({status: 206, headers: {...H, 'content-type': 'application/octet-stream'}, body: buf.subarray(a, e + 1)}); }
      return r.fulfill({status: 200, headers: {...H, 'content-type': 'application/octet-stream'}, body: buf});
    }
    const q = u.searchParams.get('q') || '';
    if (q.includes("'root' in parents")) return J({files: D.root.map(f => ({...f, parents: ['root']}))});
    return J({files: [...q.matchAll(/'(\w+)' in parents/g)].flatMap(x => (D[x[1]] || []).map(f => ({...f, parents: [x[1]]})))});
  });
  await p.goto('https://nv.test/index.html'); await p.waitForTimeout(300);
  await p.evaluate(() => { const S = (k, v) => localStorage.setItem('nv.' + k, JSON.stringify(v)); S('set.stStart', false); S('gd.linked', true); S('coachDone', true);
    S('gd.tok', {t: 'tok', exp: Date.now() + 3600e3, s: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly'}); });
  await p.evaluate(() => navigator.serviceWorker.ready); await p.reload();
  await p.waitForFunction(() => window.nvMedia && nvMedia.works().length >= 2, null, {timeout: 30000}).catch(() => {});
  console.log('sw controls:', await p.evaluate(() => !!navigator.serviceWorker.controller), '| works:', await p.evaluate(() => nvMedia.works().map(w => w.kind + ':' + w.name).sort().join(',')));
  const manga = await p.evaluate(async () => {
    await nvMedia.openWork(nvMedia.works().find(w => w.name === '시험만화'));
    for (let i = 0; i < 50; i++){ const im = [...document.querySelectorAll('#reader img')].filter(x => x.complete && x.naturalWidth > 0); if (im.length) return im.length; await new Promise(r => setTimeout(r, 200)); }
    return 0;
  });
  console.log('zip manga imgs:', manga);
  await p.evaluate(() => nvGo('lib'));
  const vid = await p.evaluate(async () => {
    await nvMedia.openWork(nvMedia.works().find(w => w.name === '시험영상'));
    const v = document.querySelector('#reader video'); for (let i = 0; i < 50 && v && v.readyState < 1 && !v.error; i++) await new Promise(r => setTimeout(r, 200));
    return v ? `src proxied ${v.src.includes('/__drv/')} | ready ${v.readyState >= 1} | duration ${Math.round(v.duration)} | error ${v.error?.code || 0}` : 'no video';
  });
  console.log('video:', vid);
  console.log('token in drive urls:', seen.qp, '| header reads:', seen.hdr > 0, '| range reads:', seen.range > 0);
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close();
})();
