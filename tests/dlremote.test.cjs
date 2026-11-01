// 받기 칸: 깃허브 주소로 연 폰·아이패드·노트북이 구글로 맞춘 PC 바깥 주소(pcRemote)로 토끼 다운로더에 '주소로 받기'를 맡긴다
const {chromium} = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const {createLanServer} = require('../desktop/lan-server.js'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  // 가짜 토끼 다운로더: /api/jobs 로 받은 일을 적어 둔다
  const jobs = [];
  const toki = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => {
    if (req.method === 'POST' && req.url === '/api/jobs'){ jobs.push(JSON.parse(b)); res.writeHead(200, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({id: jobs.length})); }
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end('<title>토끼 다운로더</title><p>토끼'); }); });
  await new Promise(r => toki.listen(0, '127.0.0.1', r)); const tport = toki.address().port;
  const lan = createLanServer({appDir: ROOT, roots: [], token: 'tokR', port: 0, apps: () => ({toki: {port: tport, start: async () => {}}})});
  const lport = await lan.start(); const direct = `http://127.0.0.1:${lport}/t/tokR/`; const remote = 'https://pc-tunnel.test/t/tokR/';   // 진짜는 https://….trycloudflare.com
  // 다른 주소에서는 CORS 가 열리지 않는다
  const other = await fetch(direct + 'lan/info', {headers: {Origin: 'https://evil.example'}}); console.log('cors other origin:', other.headers.get('access-control-allow-origin'));
  const b = await chromium.launch(); const p = await (await b.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'})).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));   // 진짜 깃허브 sw.js 가 붙지 않게 const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://xoqls0720.github.io/**', r => r.request().url().endsWith('/sw.js') ? r.fulfill({status: 404}) : r.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'index.html'))}));
  // 터널 흉내: 바깥 주소로 온 요청(미리 묻기 OPTIONS 포함)을 그대로 PC 서버로 넘긴다
  await p.route('https://pc-tunnel.test/**', async r => { const rq = r.request(); const u = rq.url().replace('https://pc-tunnel.test/', `http://127.0.0.1:${lport}/`);
    const resp = await fetch(u, {method: rq.method(), headers: rq.headers(), body: rq.postDataBuffer() || undefined});
    r.fulfill({status: resp.status, headers: Object.fromEntries(resp.headers), body: Buffer.from(await resp.arrayBuffer())}); });
  await p.goto('https://xoqls0720.github.io/novel-viewer/index.html');
  await p.evaluate(u => { localStorage.setItem('nv.set.stStart', 'false'); localStorage.setItem('nv.coachDone', 'true'); localStorage.setItem('nv.pcRemote', JSON.stringify({url: u, at: Date.now()})); }, remote);
  await p.reload(); await p.waitForFunction(() => !document.querySelector('#gnav [data-g=dl]').hidden, null, {timeout: 15000}).catch(() => {});
  console.log('dl tab on phone:', await p.evaluate(() => !document.querySelector('#gnav [data-g=dl]').hidden), '| tabs:', await p.evaluate(() => [...document.querySelectorAll('#dlTabs button')].map(x => x.textContent).join(',')));
  await p.click('#gnav [data-g=dl]'); await p.waitForTimeout(800);
  const fr = p.frames().find(f => f.url().includes('/toki/')); console.log('toki in frame:', fr ? await fr.title() : 'none');
  await p.click('#dlTabs [data-k=ext]');
  console.log('window programs hidden on phone:', await p.evaluate(() => !document.querySelector('#dlExt .dl-app')));
  await p.fill('#dlUrls', 'https://kemono.cr/fanbox/user/1\nhttps://hitomi.la/galleries/2.html'); await p.click('#dlGo'); await p.waitForTimeout(1000);
  console.log('job sent:', JSON.stringify(jobs), '| msg:', await p.textContent('#dlMsg'));
  console.log('ERRORS:', errs.length ? errs : 'none'); await b.close(); await lan.stop(); toki.close();
})();
