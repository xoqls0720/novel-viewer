/* 같은 와이파이로 보여 주기.
   노트북(윈도우 프로그램)이 앱과 연결한 작품 폴더를 읽기 전용으로 내보내서,
   아이패드·폰은 사파리에 주소만 치면 폴더 연결도 로그인도 없이 서재를 본다.
   주소에 열쇠(token)를 넣어 같은 공유기의 다른 사람이 못 열게 한다. main.js 와 시험(tests/lan.test.cjs)이 같이 쓴다.
   /t/<열쇠>/
     lan/scan  lan/file?p=  (Range: 영상 넘기기·큰 EPUB 구간 읽기)   lan/info
     tr/…      PC 번역 엔진(127.0.0.1:8790)으로 이어 준다. 꺼져 있으면 켠다
     moa/…     모아받기(47616)    toki/…  토끼 다운로더(47615) — 폰에서 눌러도 PC 에서 받는다 */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const MIME = {html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8', epub: 'application/epub+zip', zip: 'application/zip', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', bat: 'text/plain',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4',
  vtt: 'text/vtt; charset=utf-8', srt: 'text/plain; charset=utf-8', pdf: 'application/pdf'};
const mimeOf = f => MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';

// 이 컴퓨터의 와이파이 주소들 (아이패드에 쳐 넣을 주소)
function lanIps(){
  // 공유기 안 주소(192.168·10.·172.16~31) → 인터넷 주소 → VPN·가상 어댑터(WARP 등은 폰이 못 닿는다) 순서
  const VIRT = /WARP|Cloudflare|VPN|TAP|Tailscale|ZeroTier|vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Bluetooth/i;
  const PRIV = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const it of list || [])
    if (it.family === 'IPv4' && !it.internal && !/^169\.254\./.test(it.address) && !TS_RANGE.test(it.address)) out.push({ip: it.address, rank: VIRT.test(name) ? 2 : PRIV.test(it.address) ? 0 : 1});
  return out.sort((a, b) => a.rank - b.rank).map(x => x.ip);
}
// Tailscale 주소(100.64.0.0/10): 와이파이 없이 데이터로도, 어디서든 폰이 닿는 길 (같은 Tailscale 계정)
const TS_RANGE = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
function tailscaleIps(){
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const it of list || [])
    if (it.family === 'IPv4' && !it.internal && TS_RANGE.test(it.address)) out.push(it.address);
  return out;
}
// 이 컴퓨터가 인터넷 주소를 바로 쓰는지(공유기 없이 연결) — 그러면 바깥에서도 닿으니 열쇠를 길게
const hasPublicIp = () => lanIps().some(ip => !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip));

// 연결 폴더의 이름: 윈도우 프로그램과 같게 '성인' 아래 폴더는 '성인/만화' 처럼 (같은 이름 폴더가 섞이지 않게)
const rootBase = r => (path.basename(path.dirname(r)) === '성인' ? '성인/' : '') + path.basename(r);

function sendFile(req, res, abs, extra = {}){
  const st = fs.statSync(abs), size = st.size, type = mimeOf(abs);
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && size){
    let a = m[1] === '' ? size - Number(m[2]) : Number(m[1]); let b = m[1] !== '' && m[2] !== '' ? Number(m[2]) : size - 1;
    a = Math.max(0, a); b = Math.min(size - 1, b);
    if (a > b){ res.writeHead(416, {'Content-Range': `bytes */${size}`}); return res.end(); }
    res.writeHead(206, {'Content-Type': type, 'Content-Length': b - a + 1, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', ...extra});
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs, {start: a, end: b}).pipe(res);
  }
  res.writeHead(200, {'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', ...extra});
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}
const readBody = req => new Promise((ok, no) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 127.0.0.1:port 로 그대로 넘긴다. 꺼져 있으면 start() 로 켜고 기다렸다 다시 한 번.
function forward({port, method, path: p, headers, body, rewrite}, res, start){
  return new Promise(done => {
    const go = (retry) => {
      const h = {...headers}; delete h.origin; delete h.referer; delete h.host; delete h['accept-encoding']; h.host = `127.0.0.1:${port}`;
      if (body) h['content-length'] = body.length;
      const up = http.request({host: '127.0.0.1', port, method, path: p, headers: h}, r => {
        const ct = String(r.headers['content-type'] || '');
        if (rewrite && /text\/html|javascript/.test(ct)){
          const c = []; r.on('data', d => c.push(d)); r.on('end', () => {
            const out = Buffer.from(rewrite(Buffer.concat(c).toString('utf8')));
            const hh = {...r.headers}; delete hh['content-length']; delete hh['transfer-encoding'];
            res.writeHead(r.statusCode, {...hh, 'content-length': out.length}); res.end(out); done();
          });
          return;
        }
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res); r.on('end', done);
        res.on('close', () => { r.destroy(); done(); });   // 이벤트 스트림: 폰이 닫으면 같이 끊는다
      });
      up.on('error', async e => {
        if (retry && start && /ECONNREFUSED|ECONNRESET/.test(e.code || e.message)){
          const ok = await start().catch(() => false);
          if (ok) return go(false);
        }
        try{ res.writeHead(502, {'Content-Type': MIME.json}); res.end(JSON.stringify({error: retry ? '연결하지 못했어요' : 'PC 에서 켜지 못했어요', detail: e.code || e.message})); }catch{}
        done();
      });
      if (body) up.end(body); else up.end();
    };
    go(true);
  });
}
// 앱이 '/api/…' 처럼 맨 앞 / 로 부르는 주소를 지금 위치 기준(api/…)으로 바꾼다
const relRewrite = s => s.replace(/(["'`])\/api\//g, '$1api/').replace(/(href|src)="\/(?!\/)/g, '$1="');
// 터널로 열었을 때: EventSource 대신 짧게 묻기(빠른 터널은 이벤트 스트림을 그대로 넘기지 못할 수 있다)
const POLL_SHIM = `<script>(function(){var cid=Math.random().toString(36).slice(2);function P(url){var s=this;s.url=url;s.readyState=0;s._l={};s._since=0;s._on=true;s.onmessage=null;s.onerror=null;s.onopen=null;setTimeout(function(){s._loop()},0)}
P.prototype.addEventListener=function(t,f){(this._l[t]=this._l[t]||[]).push(f)};
P.prototype.removeEventListener=function(t,f){var a=this._l[t]||[],i=a.indexOf(f);if(i>=0)a.splice(i,1)};
P.prototype.close=function(){this._on=false;this.readyState=2};
P.prototype._fire=function(t,ev){var a=(this._l[t]||[]).slice();for(var i=0;i<a.length;i++){try{a[i].call(this,ev)}catch(e){console.error(e)}}if(t==='message'&&this.onmessage)this.onmessage(ev);if(t==='open'&&this.onopen)this.onopen(ev);if(t==='error'&&this.onerror)this.onerror(ev)};
P.prototype._loop=function(){var s=this;if(!s._on)return;var u=s.url+(s.url.indexOf('?')<0?'?':'&')+'__poll=1&cid='+cid+'&since='+s._since;
fetch(u).then(function(r){return r.json()}).then(function(j){if(s.readyState!==1){s.readyState=1;s._fire('open',{type:'open'})}if(j.reset)s._since=0;(j.events||[]).forEach(function(e){s._since=e.id;s._fire(e.event||'message',{type:e.event||'message',data:e.data,lastEventId:String(e.id)})});setTimeout(function(){s._loop()},50)}).catch(function(){s._fire('error',{type:'error'});setTimeout(function(){s._loop()},3000)})};
P.CONNECTING=0;P.OPEN=1;P.CLOSED=2;window.EventSource=P})();</script>`;
const injectShim = s => /<head[^>]*>/i.test(s) ? s.replace(/<head[^>]*>/i, m => m + POLL_SHIM) : POLL_SHIM + s;
// 다운로더의 이벤트 스트림을 받아 두었다가 묻는 대로 돌려준다 (페이지마다 하나, 1분 안 물으면 닫는다)
const hubs = new Map();
setInterval(() => { for (const [k, h] of hubs) if (Date.now() - h.seen > 60000){ try{ h.up.destroy(); }catch{} hubs.delete(k); } }, 15000).unref?.();
function hubOf(key, port, p){
  let h = hubs.get(key);
  if (h && !h.dead){ h.seen = Date.now(); return h; }
  h = {q: [], n: 0, waiters: [], seen: Date.now(), up: null, buf: '', dead: false};
  const wake = () => h.waiters.splice(0).forEach(f => f());
  h.up = http.get({host: '127.0.0.1', port, path: p, headers: {accept: 'text/event-stream', host: `127.0.0.1:${port}`}}, r => {
    r.setEncoding('utf8');
    r.on('data', d => {
      h.buf += d.replace(/\r/g, ''); let i;
      while ((i = h.buf.indexOf('\n\n')) >= 0){
        const block = h.buf.slice(0, i); h.buf = h.buf.slice(i + 2);
        let ev = 'message'; const data = [];
        for (const line of block.split('\n')){ if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, '')); }
        if (!data.length) continue;
        h.q.push({id: ++h.n, event: ev, data: data.join('\n')}); if (h.q.length > 500) h.q.splice(0, h.q.length - 500);
        wake();
      }
    });
    r.on('end', () => { h.dead = true; wake(); });
  });
  h.up.on('error', () => { h.dead = true; wake(); });
  hubs.set(key, h); return h;
}
function pollReply(h, since, res){
  const reset = since > h.n;   // 다시 연결된 스트림: 처음부터
  if (reset) since = 0;
  const send = () => { if (res.writableEnded) return; res.writeHead(200, {'Content-Type': MIME.json, 'Cache-Control': 'no-store'}); res.end(JSON.stringify({reset, events: h.q.filter(e => e.id > since)})); };
  if (reset || h.dead || h.q.some(e => e.id > since)) return send();
  const t = setTimeout(done, 20000); h.waiters.push(done); res.on('close', () => clearTimeout(t));
  function done(){ clearTimeout(t); send(); }
}
async function waitPort(port, ms){
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(500)){
    const ok = await new Promise(r => { const q = http.get({host: '127.0.0.1', port, path: '/', timeout: 1500}, s => { s.resume(); r(true); }); q.on('error', () => r(false)); q.on('timeout', () => { q.destroy(); r(false); }); });
    if (ok) return true;
  }
  return false;
}

/* apps: {moa: {port, start()}, toki: {port, start()}}  start 는 켜는 명령만, 기다리기는 여기서
   tr: {port, start()}  번역 엔진 */
// sync: {list(), get(name), put(name, buf), del(name)} — PC로 맞추기 칸 (main.js 의 pcStore). onSync: 폰이 바꾸면 부른다
function createLanServer({appDir, roots, token, port = 8787, apps: appsIn = {}, tr = null, sync = null, onSync = null, trPages = null}){
  const getApps = () => (typeof appsIn === 'function' ? appsIn() : appsIn) || {};
  const normRoots = () => (typeof roots === 'function' ? roots() : roots).map(r => path.normalize(r));
  // rel('노벨/작품/0001.txt', '성인/만화/…') → 연결 폴더 안의 실제 경로. 폴더 밖은 null.
  function resolveRel(rel){
    rel = String(rel).replace(/\\/g, '/');
    for (const r of normRoots()){
      const base = rootBase(r);
      if (rel !== base && !rel.startsWith(base + '/')) continue;
      const abs = path.normalize(path.join(r, rel.slice(base.length + 1)));
      if (abs === r || abs.startsWith(r + path.sep)) return abs;
    }
    return null;
  }
  async function scan(){
    const out = [];
    async function walk(dir, rel){
      let ents = []; try{ ents = await fs.promises.readdir(dir, {withFileTypes: true}); }catch{ return; }
      for (const d of ents){
        if (d.name.startsWith('.') || d.name === 'desktop.ini' || d.name === 'Thumbs.db' || /\.(part|tmp|crdownload)$/i.test(d.name)) continue;
        const abs = path.join(dir, d.name), r = rel + '/' + d.name;
        if (d.isDirectory()) await walk(abs, r);
        else if (d.isFile()){ try{ const st = await fs.promises.stat(abs); out.push({rel: r, size: st.size, mtime: st.mtimeMs}); }catch{} }
      }
    }
    for (const r of normRoots()) await walk(r, rootBase(r));
    return out;
  }
  const starting = {};
  const badTries = new Map();   // 열쇠를 자꾸 틀리는 곳은 10분 막는다 (인터넷 주소일 때 대비)
  const starter = (name, cfg) => () => (starting[name] ||= (async () => { try{ await cfg.start(); return await waitPort(cfg.port, cfg.wait || 25000); } finally{ setTimeout(() => { delete starting[name]; }, 1000); } })());

  const server = http.createServer(async (req, res) => {
    try{
      const u = new URL(req.url, 'http://x');
      const m = u.pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
      // 터널(cloudflared)로 들어오면 소켓은 127.0.0.1 이라 실제 주소는 머리말에서
      // 터널(cloudflared)·Tailscale Funnel 로 들어오면 소켓은 127.0.0.1 이라 실제 주소는 머리말에서 (안 그러면 남이 열쇠를 틀릴 때 내 폰도 같이 막힌다)
      const sock = req.socket.remoteAddress || ''; const loop = /^(127\.|::1|::ffff:127\.)/.test(sock);
      const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      const tunneled = loop && !!fwd;
      const who = tunneled ? String(fwd) : sock;
      const bad = badTries.get(who);
      if (bad && bad.n >= 20 && Date.now() - bad.t < 10 * 60000){ res.writeHead(429); return res.end('too many'); }
      if (!m || m[1] !== token){ badTries.set(who, {n: (bad && Date.now() - bad.t < 10 * 60000 ? bad.n : 0) + 1, t: Date.now()}); res.writeHead(403); return res.end('forbidden'); }
      const rawRest = m[2] || '/';
      let p = decodeURIComponent(rawRest);
      if (p === '/lan/scan'){ const list = await scan(); res.writeHead(200, {'Content-Type': MIME.json, 'Cache-Control': 'no-store'}); return res.end(JSON.stringify(list)); }
      if (p === '/lan/info'){ res.writeHead(200, {'Content-Type': MIME.json, 'Cache-Control': 'no-store'}); let ver = 0; try{ ver = Math.round(fs.statSync(path.join(appDir, 'index.html')).mtimeMs); }catch{} return res.end(JSON.stringify({apps: Object.keys(getApps()), tr: !!tr, sync: !!sync, ver})); }
      // 번역해 둔 쪽 (엔진 없이 PC 디스크에서): 하나 읽기 / 여러 열쇠가 있는지
      if (trPages && p === '/lan/trcache'){
        if (req.method === 'POST'){ let keys = []; try{ keys = JSON.parse((await readBody(req)).toString('utf8')).keys || []; }catch{} res.writeHead(200, {'Content-Type': MIME.json, 'Cache-Control': 'no-store'}); return res.end(JSON.stringify(trPages.has(keys))); }
        const j = trPages.get(u.searchParams.get('k') || ''); if (!j){ res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, {'Content-Type': MIME.json, 'Cache-Control': 'no-store'}); return res.end(j);
      }
      // PC로 맞추기: 목록 / 파일 읽기·쓰기·지우기
      if (sync && p === '/lan/sync'){ res.writeHead(200, {'Content-Type': MIME.json, 'Cache-Control': 'no-store'}); return res.end(JSON.stringify(sync.list())); }
      if (sync && p === '/lan/sync/file'){
        const n = u.searchParams.get('n') || '';
        try{
          if (req.method === 'GET'){ const b = sync.get(n); if (!b){ res.writeHead(404); return res.end('not found'); } res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': b.length, 'Cache-Control': 'no-store'}); return res.end(b); }
          if (req.method === 'PUT'){ const b = await readBody(req); if (b.length > 80 * 1048576){ res.writeHead(413); return res.end('too big'); } sync.put(n, b); onSync?.(); res.writeHead(204); return res.end(); }
          if (req.method === 'DELETE'){ sync.del(n); onSync?.(); res.writeHead(204); return res.end(); }
        }catch(e){ res.writeHead(400); return res.end(String(e.message || e)); }
        res.writeHead(405); return res.end();
      }
      if (p === '/lan/file'){
        const abs = resolveRel(u.searchParams.get('p') || '');
        if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()){ res.writeHead(404); return res.end('not found'); }
        return sendFile(req, res, abs, {'Cache-Control': 'private, max-age=3600'});
      }
      // 번역 엔진: 폰은 PC 경로를 모르니 'lan:<rel>' 을 실제 경로로 바꿔 준다
      if (tr && (p === '/tr' || p.startsWith('/tr/'))){
        const sub = rawRest.slice(3) || '/';
        let body = req.method === 'POST' ? await readBody(req) : null;
        if (body && /^\/video\b/.test(sub)){
          try{ const d = JSON.parse(body.toString('utf8')); if (String(d.path || '').startsWith('lan:')){ d.path = resolveRel(d.path.slice(4)) || ''; body = Buffer.from(JSON.stringify(d)); } }catch{}
        }
        return forward({port: tr.port, method: req.method, path: sub + u.search, headers: {'content-type': req.headers['content-type'] || 'application/json'}, body}, res, starter('tr', tr));
      }
      // 다운로더: 폰에서 누르면 PC 가 받는다
      const apps = getApps(); const am = p.match(/^\/(moa|toki)(\/.*)?$/);
      if (am && apps[am[1]]){
        if (!am[2]){ res.writeHead(302, {Location: `/t/${token}/${am[1]}/`}); return res.end(); }
        const sub = rawRest.slice(am[1].length + 1);
        const body = req.method === 'POST' ? await readBody(req) : null;
        if (u.searchParams.has('__poll')){
          const q = new URLSearchParams(u.search); const cid = q.get('cid') || ''; const since = Number(q.get('since') || 0); ['__poll', 'cid', 'since'].forEach(k => q.delete(k));
          const up = sub + (q.toString() ? '?' + q : '');
          if (!(await waitPort(apps[am[1]].port, 800))) await starter(am[1], apps[am[1]])().catch(() => false);
          return pollReply(hubOf(`${am[1]}|${cid}|${up}`, apps[am[1]].port, up), since, res);
        }
        return forward({port: apps[am[1]].port, method: req.method, path: sub + u.search, headers: req.headers, body, rewrite: tunneled ? x => injectShim(relRewrite(x)) : relRewrite}, res, starter(am[1], apps[am[1]]));
      }
      // 앱 파일 (읽기 전용, appDir 밖 금지)
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(appDir, p));
      if (!file.startsWith(path.normalize(appDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {'Content-Type': mimeOf(file), 'Cache-Control': 'no-cache'});
      fs.createReadStream(file).pipe(res);
    }catch(e){ try{ res.writeHead(500); res.end(String(e.message || e)); }catch{} }
  });
  server.requestTimeout = 0; server.headersTimeout = 60000;   // 영상 번역·긴 스트림
  return {
    server,
    start: () => new Promise((ok, no) => { server.once('error', no); server.listen(port, '0.0.0.0', () => ok(server.address().port)); }),
    stop: () => new Promise(ok => { for (const [k, h] of hubs){ try{ h.up.destroy(); }catch{} hubs.delete(k); } server.closeAllConnections?.(); server.close(ok); }),
    urls: () => { const pr = server.address()?.port || port; return lanIps().map(ip => `http://${ip}:${pr}/t/${token}/`); },
    outsideUrls: () => { const pr = server.address()?.port || port; return tailscaleIps().map(ip => `http://${ip}:${pr}/t/${token}/`); },
    resolveRel,
  };
}

module.exports = {createLanServer, lanIps, tailscaleIps, hasPublicIp, rootBase, relRewrite};
