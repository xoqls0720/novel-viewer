// 작품 동기화: 기기 A가 작품을 올리고, 새 기기 B가 같은 가짜 드라이브에서 받아 연다
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const DATA = path.join(__dirname, 'data');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  // 두 기기가 함께 쓰는 가짜 앱 전용 드라이브 칸
  const DB = new Map(); let seq = 0, uploads = 0, mediaGets = 0;
  const mk = async () => {
    const ctx = await b.newContext({viewport: {width: 1300, height: 900}}); const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/ERR_|net::|40[14]/.test(m.text()) && errs.push('console ' + m.text()));
    p.on('dialog', d => d.accept());
    await ctx.route('https://nv.test/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: html}));
    await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({status: 200, contentType: 'text/javascript', body: `window.google = {accounts: {oauth2: {initTokenClient: o => ({requestAccessToken: () => { setTimeout(() => o.callback({access_token: 'tok', expires_in: 3600}), 10); }})}}};`}));
    await ctx.route('https://www.googleapis.com/**', async r => {
      const rq = r.request(); const u = new URL(rq.url()); const m = u.pathname.match(/files\/(\w+)$/); const j = (o, s = 200) => r.fulfill({status: s, contentType: 'application/json', body: JSON.stringify(o)});
      if (u.pathname.endsWith('/about')) return j({storageQuota: {limit: '16106127360', usage: '1000'}});
      if (rq.method() === 'GET' && !m){ return j({files: [...DB.values()].map(f => ({id: f.id, name: f.name, modifiedTime: f.mt}))}); }
      if (rq.method() === 'GET' && m){ const f = [...DB.values()].find(x => x.id === m[1]); if (!f) return r.fulfill({status: 404, body: '{}'}); if (u.searchParams.get('alt') === 'media'){ mediaGets++; return r.fulfill({status: 200, contentType: f.type || 'application/octet-stream', body: f.body}); } return j({id: f.id, name: f.name}); }
      if (rq.method() === 'DELETE'){ for (const [k, f] of DB) if (f.id === m[1]) DB.delete(k); return r.fulfill({status: 204, body: ''}); }
      if (rq.method() === 'POST'){   // multipart: 메타데이터 + 파일
        const buf = rq.postDataBuffer(); const ct = rq.headers()['content-type']; const bd = '--' + ct.match(/boundary=(.+)$/)[1]; const parts = []; let at = buf.indexOf(bd);
        while (at >= 0){ const nx = buf.indexOf(bd, at + bd.length); if (nx < 0) break; parts.push(buf.slice(at + bd.length + 2, nx - 2)); at = nx; }
        const split = p => { const i = p.indexOf('\r\n\r\n'); return {head: p.slice(0, i).toString(), body: p.slice(i + 4)}; };
        const meta = JSON.parse(split(parts[0]).body.toString()); const fp = split(parts[1]); const id = 'G' + (++seq); uploads++;
        DB.set(id, {id, name: meta.name, body: fp.body, type: (fp.head.match(/Content-Type: ([^\r\n]+)/i) || [])[1], mt: new Date().toISOString()});
        return j({id, name: meta.name, modifiedTime: DB.get(id).mt});
      }
      if (rq.method() === 'PATCH'){ const f = [...DB.values()].find(x => x.id === m[1]); f.body = rq.postDataBuffer(); f.mt = new Date().toISOString(); uploads++; return j({id: f.id, name: f.name}); }
      r.fulfill({status: 404, body: '{}'});
    });
    await p.goto('https://nv.test/index.html'); await p.waitForTimeout(700);
    await p.evaluate(() => { localStorage.setItem('nv.gd.client', JSON.stringify('x.apps.googleusercontent.com')); localStorage.setItem('nv.set.stStart', 'false'); });
    await p.reload(); await p.waitForTimeout(800);
    return {ctx, p};
  };
  // ── 기기 A: 작품을 불러오고 올린다
  const A = (await mk()).p;
  await A.setInputFiles('#pickFolder', path.join(DATA, 'vt2')); await A.waitForTimeout(1200);
  await A.click('#gdConnect').catch(()=>{}); await A.waitForTimeout(1500);
  await A.click('#btnLink'); await A.waitForTimeout(300);
  await A.check('#libSyncOn'); await A.waitForTimeout(500);
  for (let i = 0; i < 40; i++){ const t = await A.textContent('#libSyncStat'); if (/클라우드에 있어요/.test(t)) break; await A.waitForTimeout(500); }
  console.log('A status:', await A.textContent('#libSyncStat'));
  const names = [...DB.values()].map(f => f.name);
  console.log('cloud files: library.json', names.includes('library.json'), '| LW', names.filter(n => n.startsWith('LW-')).length, '| LF', names.filter(n => n.startsWith('LF-')).length);
  console.log('no empty uploads:', [...DB.values()].filter(f => f.name.startsWith('LF-')).every(f => f.body.length > 0));
  const idx = JSON.parse(DB.get([...DB].find(([k, f]) => f.name === 'library.json')[0]).body.toString());
  console.log('index works:', Object.keys(idx.works).sort());
  console.log('A rows:', await A.$$eval('#libSyncList .lsw .s', e => e.map(x => x.textContent.replace(/^[\d.]+(KB|MB|GB) · /, '')).sort()));
  const upBefore = uploads;
  await A.click('#libSyncNow'); await A.waitForTimeout(2500);
  console.log('re-run uploads nothing new:', uploads - upBefore <= 2, '(' + (uploads - upBefore) + ')');
  // API 키: A에서 넣은 키가 B로 간다(state.json에는 들어가지 않는다)
  await A.evaluate(() => { document.querySelector('#gemKey').value = 'AIza-sync-test'; document.querySelector('[data-ksave=gemKey]').click(); });
  await A.evaluate(() => document.querySelector('#gdNow').click()); await A.waitForTimeout(2500);
  const stateTxt = [...DB.values()].find(f => f.name === 'state.json')?.body.toString() || '';
  console.log('keys file:', [...DB.values()].some(f => f.name === 'keys.json'), '| key not in state.json:', !stateTxt.includes('AIza-sync-test'));
  // ── 기기 B: 처음 켠 기기. 구글 로그인만 해도 작품이 보인다
  const B = (await mk()).p;
  await B.click('#gdConnect').catch(()=>{}); await B.waitForTimeout(2500);
  for (let i = 0; i < 20; i++){ if ((await B.$$('.grid .card')).length >= 4) break; await B.waitForTimeout(400); }
  console.log('B works:', await B.$$eval('.grid .card .t', e => e.map(x => x.textContent).sort()));
  console.log('B got key:', await B.evaluate(() => JSON.parse(localStorage.getItem('nv.gemKey') || '""')), '| status:', /API 키 받음 1/.test(await B.textContent('#gdStatus')));
  // B에서 지우면 A에서도 지워진다
  await B.evaluate(() => document.querySelector('[data-kdel=gemKey]').click()); await B.evaluate(() => document.querySelector('#gdNow').click()); await B.waitForTimeout(2000);
  await A.evaluate(() => document.querySelector('#gdNow').click()); await A.waitForTimeout(2000);
  console.log('A key after B deleted:', JSON.stringify(await A.evaluate(() => JSON.parse(localStorage.getItem('nv.gemKey') || '"x"'))));
  const g0 = mediaGets;
  await B.evaluate(() => nvGo('lib')); await B.click('.grid .card:has-text("hwasan")'); await B.waitForTimeout(1500); 
  console.log('B novel text:', (await B.textContent('#reader .novel')).length > 20, '| downloads:', mediaGets - g0);
  await B.evaluate(() => nvGo('lib')); await B.click('.grid .card:has-text("misaeng")').catch(async () => { await B.click('#btnLib').catch(()=>{}); await B.evaluate(() => nvGo('lib')); await B.click('.grid .card:has-text("misaeng")'); }); await B.waitForTimeout(2000);
  console.log('B webtoon imgs:', await B.$$eval('#reader img', e => e.filter(i => i.complete && i.naturalWidth > 0).length));
  // 새로 켜도(인터넷 없이) 목록이 그대로
  await B.context().setOffline(true); await B.reload(); await B.waitForTimeout(1500);
  console.log('B offline works:', await B.$$eval('.grid .card .t', e => e.map(x => x.textContent).sort()));
  await B.context().setOffline(false);
  // 클라우드에서 지우기
  await A.click('#libSyncList .lsw:has-text("deathnote") [data-a=del]'); await A.waitForTimeout(1500);
  console.log('after delete:', Object.keys(JSON.parse([...DB.values()].find(f => f.name === 'library.json').body.toString()).works).sort());
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
