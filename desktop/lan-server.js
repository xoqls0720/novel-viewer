/* 같은 와이파이로 보여 주기.
   노트북(윈도우 프로그램)이 앱과 연결한 작품 폴더를 읽기 전용으로 내보내서,
   아이패드·폰은 사파리에 주소만 치면 폴더 연결도 로그인도 없이 서재를 본다.
   주소에 열쇠(token)를 넣어 같은 공유기의 다른 사람이 못 열게 한다. main.js 와 시험(tests/lan.test.cjs)이 같이 쓴다. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const MIME = {html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webmanifest: 'application/manifest+json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8', epub: 'application/epub+zip', zip: 'application/zip', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', bat: 'text/plain'};
const mimeOf = f => MIME[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';

// 이 컴퓨터의 와이파이 주소들 (아이패드에 쳐 넣을 주소)
function lanIps(){
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const it of list || [])
    if (it.family === 'IPv4' && !it.internal) out.push(it.address);
  return out;
}

function createLanServer({appDir, roots, token, port = 8787}){
  const normRoots = () => (typeof roots === 'function' ? roots() : roots).map(r => path.normalize(r));
  // rel('노벨/작품/0001.txt') → 첫 칸과 이름이 같은 연결 폴더 안의 실제 경로. 폴더 밖은 null.
  function resolveRel(rel){
    const first = String(rel).split('/')[0];
    for (const r of normRoots()){
      if (path.basename(r) !== first) continue;
      const abs = path.normalize(path.join(path.dirname(r), rel));
      if (abs === r || abs.startsWith(r + path.sep)) return abs;
    }
    return null;
  }
  async function scan(){
    const out = [];
    async function walk(dir, rel){
      let ents = []; try{ ents = await fs.promises.readdir(dir, {withFileTypes: true}); }catch{ return; }
      for (const d of ents){
        if (d.name.startsWith('.') || d.name === 'desktop.ini' || d.name === 'Thumbs.db') continue;
        const abs = path.join(dir, d.name), r = rel + '/' + d.name;
        if (d.isDirectory()) await walk(abs, r);
        else if (d.isFile()){ try{ const st = await fs.promises.stat(abs); out.push({rel: r, size: st.size, mtime: st.mtimeMs}); }catch{} }
      }
    }
    for (const r of normRoots()) await walk(r, path.basename(r));
    return out;
  }
  const server = http.createServer(async (req, res) => {
    try{
      const u = new URL(req.url, 'http://x');
      const m = u.pathname.match(/^\/t\/([^/]+)(\/.*)?$/);
      if (!m || m[1] !== token){ res.writeHead(403); return res.end('forbidden'); }
      let p = decodeURIComponent(m[2] || '/');
      if (p === '/lan/scan'){ const list = await scan(); res.writeHead(200, {'Content-Type': MIME.json}); return res.end(JSON.stringify(list)); }
      if (p === '/lan/file'){
        const abs = resolveRel(u.searchParams.get('p') || '');
        if (!abs || !fs.existsSync(abs)){ res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, {'Content-Type': mimeOf(abs), 'Content-Length': fs.statSync(abs).size});
        return fs.createReadStream(abs).pipe(res);
      }
      // 앱 파일 (읽기 전용, appDir 밖 금지)
      if (p === '/' || p === '') p = '/index.html';
      const file = path.normalize(path.join(appDir, p));
      if (!file.startsWith(path.normalize(appDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){ res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {'Content-Type': mimeOf(file), 'Cache-Control': 'no-cache'});
      fs.createReadStream(file).pipe(res);
    }catch(e){ try{ res.writeHead(500); res.end(String(e.message || e)); }catch{} }
  });
  return {
    server,
    start: () => new Promise((ok, no) => { server.once('error', no); server.listen(port, '0.0.0.0', () => ok(server.address().port)); }),
    stop: () => new Promise(ok => server.close(ok)),
    urls: () => { const pr = server.address()?.port || port; return lanIps().map(ip => `http://${ip}:${pr}/t/${token}/`); },
  };
}

module.exports = {createLanServer, lanIps};
