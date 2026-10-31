/* ================= 서재 ================= */
let works = [];
let cur = null, curEp = -1, curText = '', curParas = [], curImgs = [], mangaPos = 0, objectUrls = [];
let openToken = 0;

// 디스크·구글 드라이브에 있는 파일을 필요할 때만 읽는 가벼운 파일(작품 폴더 연결)
class LazyFile {
  constructor({name, size = 0, rel, type = '', mtime = 0, get}){ Object.assign(this, {name, size, _rel: rel, type, lastModified: mtime, _get: get, isLazy: true}); }
  blob(){ return this._get(); }
  async text(){ return (await this._get()).text(); }
  async arrayBuffer(){ return (await this._get()).arrayBuffer(); }
}
const realBlob = async f => f?.isLazy ? await f.blob() : f;

async function expandZips(list){
  const out = [];
  for (const f of list){
    if (!/\.zip$/i.test(f.name)){ out.push(f); continue; }
    toast(`${f.name} 푸는 중…`);
    // 폴더·PC 서재의 zip: 목록만 읽고, 그림은 볼 때 그 부분만 (수백 MB 를 통째로 받지 않는다)
    if (f.streamUrl){
      try{
        const zip = await RangeZip.open(f.streamUrl, f.size);
        const base = relPath(f).replace(/\.zip$/i, '');
        const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')+1) : '';
        const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
        const rooted = entries.every(e => e.name.includes('/'));
        for (const e of entries){
          const rel = rooted ? dir + e.name : base + '/' + e.name;
          out.push(new LazyFile({name: e.name.split('/').pop(), size: e.usize, rel, mtime: f.lastModified || 0, get: () => zip.file(e.name).async('blob')}));
        }
        continue;
      }catch{}   // 구간 읽기가 안 되면 아래처럼 통째로
    }
    try{
      const zip = await JSZip.loadAsync(await realBlob(f), {decodeFileName: bytes => { try{ return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }catch{ try{ return new TextDecoder('euc-kr').decode(bytes); }catch{ return String.fromCharCode(...bytes); } } }});
      const base = relPath(f).replace(/\.zip$/i, '');
      const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')+1) : '';
      const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
      const rooted = entries.every(e => e.name.includes('/'));   // zip 안에 작품 폴더가 이미 있으면 그대로
      for (const e of entries){
        const blob = await e.async('blob');
        const nf = new File([blob], e.name.split('/').pop(), {type: blob.type});
        nf._rel = rooted ? dir + e.name : base + '/' + e.name;
        out.push(nf);
      }
    }catch{ toast(`${f.name}을 풀지 못했어요`); }
  }
  return out;
}

async function addFiles(fileList, {persist = true, quiet = false, fromLib = false} = {}){
  fileList = await expandZips(fileList);
  const own = fileList.filter(f => !f.isLazy);   // 연결한 폴더의 파일은 그 자리에서 읽으니 따로 저장하지 않는다
  if (persist && $('#keepLocal').checked && own.length){
    try{ await navigator.storage?.persist?.(); await idb.putMany(own); showStore(); }
    catch{ toast('기기 저장 공간이 부족해 일부는 저장하지 못했어요(지금은 열 수 있어요)'); }
  }
  const groups = new Map();
  for (const f of fileList){
    const rel = relPath(f).split('/');
    if (rel.some(p => p.startsWith('.'))) continue;
    let workPath, epName = null;
    const media = IMG.test(f.name) || VID.test(f.name) || SUB.test(f.name);   // 자막도 영상과 같은 회차 자리로
    // 성인 폴더(모아받기): 성인/만화/작가/0001 제목/그림, 성인/영상/작가 (번호)/글번호 제목/영상 → 작품=작가, 회차=그 아래 폴더
    const ai = rel.findIndex(p => p === '성인');
    if (ai >= 0 && media && rel.length >= ai + 5) { workPath = rel.slice(0, ai + 3).join('/'); epName = rel.slice(ai + 3, -1).join(' · '); }
    // 웹툰·만화 회차 폴더: 작품/0001 1화/이미지, 작품/001/이미지, 작품/1화/이미지
    else if (media && rel.length >= 3 && /^\d{1,4}(?:\D|$)/.test(rel[rel.length-2])) { workPath = rel.slice(0,-2).join('/'); epName = rel[rel.length-2]; }
    else workPath = rel.length > 1 ? rel.slice(0,-1).join('/') : '낱개/' + f.name.replace(/\.[^.]+$/, '');
    if (!groups.has(workPath)) groups.set(workPath, {files:[], imgEps:new Map(), vidEps:[], subs:[], paths:[]});
    const g = groups.get(workPath); g.paths.push(relPath(f));
    if (VID.test(f.name)) g.vidEps.push({name: epName ? `${epName} · ${f.name.replace(/\.[^.]+$/, '')}` : f.name.replace(/\.[^.]+$/, ''), type: 'video', file: f, post: epName});
    else if (SUB.test(f.name)) g.subs.push(f);
    else if (epName && IMG.test(f.name)){ if(!g.imgEps.has(epName)) g.imgEps.set(epName, []); g.imgEps.get(epName).push(f); }
    else g.files.push(f);
  }
  let added = 0;
  for (const [path, g] of groups){
    const segs = path.split('/');
    const name = segs.pop();
    const adult = segs.includes('성인');
    const top = segs.find(x => /노벨|소설|novel|웹툰|webtoon|만화|망가|manga|comic|영상|video|갤러리/i.test(x)) || segs[0] || '낱개';
    const eps = []; let cover = null, info = null; const loose = [];
    for (const f of g.files){
      const n = f.name.toLowerCase();
      if (/^cover\./.test(n)) cover = f;
      else if (n === 'info.txt') info = f;
      else if (n.endsWith('.txt')) eps.push({name: f.name.replace(/\.txt$/i,''), type:'txt', file:f});
      else if (n.endsWith('.epub')) eps.push({name: f.name.replace(/\.epub$/i,''), type:'epub', file:f});
      else if (IMG.test(n)) loose.push(f);
    }
    // 영상이 든 글의 그림 몇 장(표지·미리보기)은 따로 회차로 두지 않고 그 영상의 표지로 쓴다
    for (const v of g.vidEps){
      const imgs = v.post && g.imgEps.get(v.post); if (!imgs) continue;
      const sorted = [...imgs].sort((a,b)=>natural(a.name,b.name)); v.cover = sorted.find(f => /cover|thumb|表紙|サムネ/i.test(f.name)) || sorted[0];
      if (imgs.length <= 4) g.imgEps.delete(v.post);
    }
    for (const [ep, files] of g.imgEps) eps.push({name: ep, type:'imgs', files: files.sort((a,b)=>natural(a.name,b.name))});
    if (loose.length) eps.push({name: '이미지', type:'imgs', files: loose.sort((a,b)=>natural(a.name,b.name))});
    // 영상: 같은 이름(앞부분)의 자막(srt·vtt)을 붙인다
    for (const v of g.vidEps){ const base = v.file.name.replace(/\.[^.]+$/, ''); v.subs = g.subs.filter(s => s.name.startsWith(base)); eps.push(v); }
    if (!eps.length) continue;
    eps.sort((a,b)=>natural(a.name,b.name));
    const hasTxt = eps.some(e=>e.type==='txt'), hasEpub = eps.some(e=>e.type==='epub');
    const finalEps = hasTxt && hasEpub ? eps.filter(e=>e.type!=='epub') : eps;
    // 영상 폴더의 작품은 표지·미리보기 그림 글이 섞여 있어도 '영상' (예전엔 그림 글이 하나만 있어도 웹툰으로 갔다)
    const kind = finalEps.every(e => e.type === 'video') || (/영상|video/i.test(top) && finalEps.some(e => e.type === 'video')) ? 'video'
               : /웹툰|webtoon/i.test(top) ? 'webtoon' : /만화|망가|manga|comic|갤러리/i.test(top) ? 'manga'
               : finalEps.every(e=>e.type==='imgs' || e.type==='video') ? 'webtoon' : 'novel';
    // 성인 작품은 '성인 만화'·'성인 영상' 칸에 작가별로 (보통 만화와 섞이지 않게 열쇠도 따로)
    const topName = adult ? '성인 ' + (kind === 'video' || /영상|video/i.test(top) ? '영상' : '만화') : (TOPNAME(top) || '');
    const key = (topName || '기타') + '/' + name;
    migrateKey(path, key);
    // 이름으로 알아본 성인 작품: 열쇠(읽던 자리)는 그대로 두고 칸·묶음 이름만 성인으로
    const guess = !adult && ADULT_NAME.test(path);
    const shown = guess ? '성인 ' + (kind === 'video' ? '영상' : kind === 'novel' ? '소설' : '만화') : topName || top;
    const w = {key, name, top: shown, kind, adult: adult || guess, cover, info, eps: finalEps, paths: g.paths};
    const old = works.findIndex(x=>x.key===w.key);
    if (old >= 0){ if (works[old].coverUrl) URL.revokeObjectURL(works[old].coverUrl); works[old] = w; } else works.push(w);
    added++;
  }
  works.sort((a,b)=>natural(a.top+a.name, b.top+b.name));
  renderLib(); if (!quiet) toast(`작품 ${added}개를 불러왔어요`);
  if (!fromLib) window.libSoon?.();   // 새로 불러온 작품은 잠시 뒤 클라우드에도 올린다(켜 둔 경우)
}

// 폴더 이름을 한국어 분류로
function TOPNAME(t){ if (/노벨|소설|novel/i.test(t)) return '소설'; if (/웹툰|webtoon/i.test(t)) return '웹툰'; if (/만화|망가|manga|comic/i.test(t)) return '만화'; if (/영상|video/i.test(t)) return '영상'; if (t === '낱개') return '낱개 파일'; return ''; }
const KIND_LABEL = {novel: '소설', webtoon: '웹툰', manga: '만화', video: '영상'};
// 예전 키(고른 폴더 경로)에 남은 메모·진도·읽은 화를 새 키로 옮긴다
function migrateKey(oldKey, key){
  if (oldKey === key) return;
  for (const pre of ['notes.','pos.','read.','bm.']){
    const ov = localStorage.getItem('nv.' + pre + oldKey); if (ov === null) continue;
    if (localStorage.getItem('nv.' + pre + key) === null) localStorage.setItem('nv.' + pre + key, ov);
    localStorage.removeItem('nv.' + pre + oldKey);
  }
}
// 보기 좋은 회차 이름: "0001 ep" → "1화", "vol01" → "1권", "0534 534화" → "534화"
function prettyEp(n){
  let m = n.match(/^0*(\d+)\s*(ep|화|話)?$/i); if (m) return `${+m[1]}화`;
  m = n.match(/^vol\.?\s*0*(\d+)$/i); if (m) return `${+m[1]}권`;
  m = n.match(/^(.*?)\s*0*(\d+)\s*권$/); if (m && m[1]) return `${+m[2]}권`;
  return n.replace(/^\d{3,4}\s+(?=\S)/, '');
}
function coverUrl(w){
  // 표지 파일이 없는 작품(성인 작가 폴더 등)은 첫 그림을 표지로 보여 준다 (w.cover 는 그대로: 동기화가 쓰는 값)
  const cv = w.cover || w.eps.find(e => e.type === 'imgs')?.files?.[0] || w.eps.find(e => e.type === 'video' && e.cover)?.cover;
  if (cv?.thumbUrl) return cv.thumbUrl;   // PC 서재: PC 가 줄여 준 작은 표지를 바로 (다시 그리지 않는다)
  if (cv?.isLazy && !w.coverUrl){ if (!w._coverP) w._coverP = cv.blob().then(b => { w.coverUrl = URL.createObjectURL(b); renderLib(); }).catch(() => {}); return ''; }
  if (cv && !w.coverUrl) w.coverUrl = URL.createObjectURL(cv); return w.coverUrl || '';
}
// 성인 폴더 밖에 있어도 성인으로 보는 이름: 후원 사이트에서 받은 폴더, 성인 애니 제작사, 동인지 쪽수 표기((37P)+PDF), 커플링(_가x나_)
const ADULT_NAME = /pawchive|fanbox|pixiv|patreon|fantia|kemono|hentai|hitomi|\bR-?18\b|19금|mobneko|danzi ?engine|dnazi|luxsumildo|\(\d+\s*P\s*(\+\s*PDF)?\)|\d+\s*P\s*\+\s*PDF|_[^_/]{1,4}x[^_/]{1,4}_|\[(Korean|Japanese|English)[,\]]/i;
// 이름으로 못 알아본 작품은 카드를 오른쪽 클릭(길게 누르기)해 성인 칸으로 보내거나 되돌린다. 고른 것은 기기끼리 맞춰진다
const isAdult = w => !!w && (store.get('adultMark', {})[w.key] ?? !!w.adult);
function adultToggle(w){
  const a = isAdult(w);
  if (!confirm(a ? `'${w.name}'을(를) 성인 칸에서 빼서 보통 칸으로 돌릴까요?` : `'${w.name}'을(를) 성인 칸으로 옮길까요?\n성인 칸을 눌렀을 때만 보여요.`)) return;
  const m = store.get('adultMark', {}); m[w.key] = !a; store.set('adultMark', m); renderLib();
  toast(a ? '보통 칸으로 돌렸어요' : '성인 칸으로 옮겼어요');
}
function workCard(w){
  const pos = store.get('pos.'+w.key, null);
  const total = pos?.n || w.eps.length;
  const pct = pos ? Math.min(100, Math.round(((pos.ep + (pos.f||0)) / total) * 100)) : 0;
  const d = document.createElement('div'); d.className = 'card' + (w===cur?' on':'');
  const cu = coverUrl(w);
  d.innerHTML = `<div class="cv">${cu ? `<img alt="" loading="lazy" decoding="async" src="${cu}">` : `<div class="ph"></div>`}<span class="kind">${KIND_LABEL[w.kind]}</span>${pos?`<div class="pb"><i style="width:${pct}%"></i></div>`:''}</div><div class="t"></div><div class="m">${pos?`${Math.min(pos.ep+1,total)} / ${total}화`:`${total}화`}</div>`;
  d.querySelector('.t').textContent = w.name;
  const ph = d.querySelector('.ph'); if (ph){   // 표지 없는 작품: 이름으로 고른 깊은 색 + 활자 표지
    const HS = [356, 22, 38, 95, 152, 185, 210, 250, 322, 8];   // 책 표지에 어울리는 열 가지 색
    let n = 0; for (const ch of w.name) n = (n * 31 + ch.codePointAt(0)) >>> 0;
    ph.style.setProperty('--h', String(HS[n % HS.length]));
    ph.innerHTML = '<i></i><b></b>';
    ph.querySelector('i').textContent = KIND_LABEL[w.kind] || '';
    ph.querySelector('b').textContent = w.name;
  }
  d.onclick = () => openWork(w);
  d.oncontextmenu = e => { e.preventDefault(); adultToggle(w); };
  return d;
}
function renderLib(){
  const q = $('#libSearch').value.trim();
  const sort = $('#libSort').value;
  const lib = $('#lib'); lib.innerHTML = '';
  let list = works.filter(w => !q || w.name.includes(q));
  const recent = works.filter(w => store.get('pos.'+w.key, null)).sort((a,b)=>(store.get('pos.'+b.key,{t:0}).t||0)-(store.get('pos.'+a.key,{t:0}).t||0)).slice(0, 8);
  if (!q && recent.length && sort === 'name'){
    // 읽던 책: 큰 카드 하나로, 한 번에 이어 읽기 (전문 뷰어들의 hero 패턴)
    const hw = recent[0]; const hp = store.get('pos.'+hw.key, {ep: 0});
    const htotal = hp?.n || hw.eps.length;
    const hpct = Math.min(100, Math.round(((hp.ep + (hp.f || 0)) / (htotal || 1)) * 100));
    const days = Math.floor((Date.now() - (hp.t || Date.now())) / 86400000);
    const when = days <= 0 ? '오늘' : days === 1 ? '어제' : days < 30 ? `${days}일 전` : new Date(hp.t).toLocaleDateString('ko-KR', {month: 'long', day: 'numeric'});
    const hero = document.createElement('div'); hero.className = 'lib-hero'; hero.setAttribute('role', 'button');
    const hcu = coverUrl(hw);
    hero.innerHTML = `<div class="cv">${hcu ? `<img alt="" src="${hcu}">` : '<div class="ph"><b></b></div>'}</div>
      <div class="hx"><div class="hk">읽던 책</div><b class="ht"></b>
      <div class="hm">${Math.min(hp.ep + 1, htotal)} / ${htotal}화 · ${hpct}% · ${when}</div>
      <div class="pb"><i style="width:${hpct}%"></i></div></div>
      <button class="primary hgo">이어 읽기</button>`;
    hero.querySelector('.ht').textContent = hw.name;
    const hph = hero.querySelector('.ph b'); if (hph){ hph.textContent = hw.name;
      const HS = [356, 22, 38, 95, 152, 185, 210, 250, 322, 8]; let n = 0; for (const ch of hw.name) n = (n * 31 + ch.codePointAt(0)) >>> 0;
      hero.querySelector('.ph').style.setProperty('--h', String(HS[n % HS.length])); }
    hero.onclick = () => openWork(hw);
    lib.append(hero);
    if (recent.length > 1){
      const h = document.createElement('h4'); h.textContent = '최근'; lib.append(h);
      const row = document.createElement('div'); row.className = 'cont'; recent.slice(1).forEach(w => row.append(workCard(w))); lib.append(row);
    }
  }
  if (sort === 'recent') list = [...list].sort((a,b)=>(store.get('pos.'+b.key,{t:0}).t||0)-(store.get('pos.'+a.key,{t:0}).t||0));
  let lastTop = null, grid = null;
  const counts = {}; for (const w of list) counts[w.top] = (counts[w.top] || 0) + 1;
  for (const w of list){
    if (!grid || (sort === 'name' && w.top !== lastTop)){
      if (sort === 'name'){ const h = document.createElement('h4'); h.innerHTML = `<span></span><em>${counts[w.top]}권</em>`; h.querySelector('span').textContent = w.top; lib.append(h); }
      grid = document.createElement('div'); grid.className = 'grid'; lib.append(grid); lastTop = w.top;
    }
    grid.append(workCard(w));
  }
  if (!list.length) lib.insertAdjacentHTML('beforeend', works.length
    ? '<div class="hint" style="padding:16px 4px">찾는 작품이 없어요</div>'
    : /^\/t\/[^/]+\//.test(location.pathname) ? `<div class="lib-empty"><svg class="i"><use href="#i-book"/></svg><b>PC 서재를 불러오는 중…</b><p>PC 의 Novelist 가 켜져 있어야 해요. 오래 걸리면 위의 <b>새로 받은 작품 보기</b>를 눌러 주세요.</p></div>`
    : `<div class="lib-empty"><svg class="i"><use href="#i-book"/></svg><b>서재가 비어 있어요</b><p>위의 <b>폴더 열기</b>로 작품 폴더(노벨·만화·웹툰)를 고르거나,<br>txt·epub·zip 파일을 끌어다 놓아도 돼요. OneDrive 폴더를 연결하면 켤 때마다 저절로 들어와요.</p></div>`);
}

/* ================= EPUB ================= */
// 큰 zip 을 구간(Range) 요청으로 읽는 가벼운 읽개. JSZip 과 같은 모양(zip.file(이름).async('string'|'blob'))만 갖춘다.
// 그림은 보통 압축 없이(store), 글(xhtml)은 deflate 로 들어 있다. ZIP64(4GB 넘는 zip)도 읽는다.
const RangeZip = {
  async open(url, size){
    const get = async (a, b) => { const r = await fetch(url, {headers: {Range: `bytes=${a}-${b}`}}); if (!r.ok) throw new Error('읽지 못했어요 ' + r.status); return new Uint8Array(await r.arrayBuffer()); };
    if (!size){ const r = await fetch(url, {headers: {Range: 'bytes=0-0'}}); size = +((r.headers.get('content-range') || '').split('/')[1] || 0); }
    const tailN = Math.min(size, 66000); const tail = await get(size - tailN, size - 1); const dv = new DataView(tail.buffer);
    let e = -1; for (let i = tailN - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50){ e = i; break; }
    if (e < 0) throw new Error('zip 이 아니에요');
    let count = dv.getUint16(e + 10, true), cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF){   // ZIP64
      const loc = e - 20; if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50){
        const z64 = Number(dv.getBigUint64(loc + 8, true)); const h = new DataView((await get(z64, z64 + 55)).buffer);
        count = Number(h.getBigUint64(32, true)); cdSize = Number(h.getBigUint64(40, true)); cdOff = Number(h.getBigUint64(48, true));
      }
    }
    const cd = await get(cdOff, cdOff + cdSize - 1); const cv = new DataView(cd.buffer); const dec = new TextDecoder();
    const nameOf = (u, utf) => { if (utf) return dec.decode(u); try{ return new TextDecoder('utf-8', {fatal: true}).decode(u); }catch{ try{ return new TextDecoder('euc-kr').decode(u); }catch{ return dec.decode(u); } } };   // 옛 한국어 zip(EUC-KR)
    const files = {};
    for (let p = 0, i = 0; i < count && p + 46 <= cd.length; i++){
      if (cv.getUint32(p, true) !== 0x02014b50) break;
      const method = cv.getUint16(p + 10, true); let csize = cv.getUint32(p + 20, true), usize = cv.getUint32(p + 24, true);
      const nl = cv.getUint16(p + 28, true), xl = cv.getUint16(p + 30, true), cl = cv.getUint16(p + 32, true); let off = cv.getUint32(p + 42, true);
      const name = nameOf(cd.subarray(p + 46, p + 46 + nl), cv.getUint16(p + 8, true) & 0x800);
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || off === 0xFFFFFFFF){   // ZIP64 추가 필드
        let q = p + 46 + nl; const qe = q + xl;
        while (q + 4 <= qe){ const id = cv.getUint16(q, true), sz = cv.getUint16(q + 2, true); if (id === 1){ let r = q + 4; if (usize === 0xFFFFFFFF){ usize = Number(cv.getBigUint64(r, true)); r += 8; } if (csize === 0xFFFFFFFF){ csize = Number(cv.getBigUint64(r, true)); r += 8; } if (off === 0xFFFFFFFF) off = Number(cv.getBigUint64(r, true)); } q += 4 + sz; }
      }
      files[name] = {name, dir: name.endsWith('/'), method, csize, usize, off};
      p += 46 + nl + xl + cl;
    }
    const read = async ent => {
      const lh = new DataView((await get(ent.off, ent.off + 29)).buffer);
      const start = ent.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      const raw = ent.csize ? await get(start, start + ent.csize - 1) : new Uint8Array(0);
      if (ent.method === 0) return raw;
      const out = new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
      return new Uint8Array(await out.arrayBuffer());
    };
    const type = n => /\.png$/i.test(n) ? 'image/png' : /\.gif$/i.test(n) ? 'image/gif' : /\.webp$/i.test(n) ? 'image/webp' : /\.avif$/i.test(n) ? 'image/avif' : /\.jpe?g$/i.test(n) ? 'image/jpeg' : '';
    return {files, file(n){ const ent = files[n]; if (!ent || ent.dir) return null;
      return {name: n, async async(kind){ const u = await read(ent); return kind === 'string' ? dec.decode(u) : kind === 'uint8array' ? u : kind === 'arraybuffer' ? u.buffer : new Blob([u], {type: type(n)}); }}; }};
  }
};
// PC 서재(폰)의 EPUB·zip: PC 가 읽어 둔 목록·쪽 글을 한 번에 받고, 안의 파일은 하나씩 (그림은 폰 폭으로 줄여서, 폰이 담아 둔다)
const LanZip = {
  async open(f){
    const r = await fetch(f.lanZip); if (!r.ok) throw new Error('읽지 못했어요 ' + r.status);
    const j = await r.json(); const files = {};
    for (const [n, usize] of Object.entries(j.ents)) files[n] = {name: n, dir: false, usize};
    return {files, file(n){ if (!files[n]) return null;
      return {name: n, async async(kind){
        if (kind === 'string' && n in j.texts) return j.texts[n];
        const r = await fetch(f.lanEnt + encodeURIComponent(n) + (IMG.test(n) ? '&w=' + f.lanW : '')); if (!r.ok) throw new Error('읽지 못했어요 ' + r.status);
        if (kind === 'string') return r.text();
        const b = await r.blob(); if (kind === 'blob') return b;
        const ab = await b.arrayBuffer(); return kind === 'uint8array' ? new Uint8Array(ab) : ab;
      }}; }};
  }
};
const epubCache = new Map();
async function readEpub(file){
  if (epubCache.has(file)) return epubCache.get(file);
  // 내 컴퓨터 폴더의 EPUB 은 통째로 읽지 않고 필요한 부분만(목차, 그 회차 그림) 디스크에서 바로 읽는다.
  // 수 GB 짜리 웹툰 EPUB 도 열리고, 여는 데 걸리는 시간도 크기와 상관없다.
  const zip = file.lanZip ? await LanZip.open(file) : file.streamUrl ? await RangeZip.open(file.streamUrl, file.size) : await JSZip.loadAsync(await realBlob(file));
  const container = await zip.file('META-INF/container.xml').async('string');
  const opfPath = container.match(/full-path="([^"]+)"/)[1];
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')+1) : '';
  const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('string'), 'application/xml');
  const items = {}; for (const it of opf.querySelectorAll('manifest > item')) items[it.getAttribute('id')] = it.getAttribute('href');
  const spine = [...opf.querySelectorAll('spine > itemref')].map(r => items[r.getAttribute('idref')]).filter(Boolean);
  const join = (dir, href) => { const out=[]; for (const p of (dir + decodeURIComponent(href.split('#')[0])).split('/')){ if(p==='..') out.pop(); else if(p!=='.' && p!=='') out.push(p);} return out.join('/'); };
  // 목차(EPUB3 nav.xhtml 또는 toc.ncx): 회차가 시작하는 쪽 → 회차 이름. 웹툰 EPUB 을 화별로 나눌 때 쓴다
  const tocStart = new Map();
  try{
    const mitems = [...opf.querySelectorAll('manifest > item')];
    const navIt = mitems.find(it => /\bnav\b/.test(it.getAttribute('properties') || ''));
    const ncxIt = mitems.find(it => /ncx/.test(it.getAttribute('media-type') || ''));
    const it = navIt || ncxIt;
    if (it){
      const np = join(base, it.getAttribute('href'));
      const ndir = np.includes('/') ? np.slice(0, np.lastIndexOf('/')+1) : '';
      const nd = new DOMParser().parseFromString(await zip.file(np).async('string'), navIt ? 'text/html' : 'application/xml');
      if (navIt) for (const a of nd.querySelectorAll('nav a[href]')){ const t = join(ndir, a.getAttribute('href')); if (!tocStart.has(t)) tocStart.set(t, a.textContent.trim()); }
      else for (const p of nd.querySelectorAll('navPoint')){ const src = p.querySelector('content')?.getAttribute('src'); const t = src && join(ndir, src); if (t && !tocStart.has(t)) tocStart.set(t, p.querySelector('navLabel text')?.textContent.trim() || ''); }
    }
  }catch{}
  const parts = [];   // 그림 EPUB 의 회차: 목차가 가리키는 쪽에서 새 회차가 시작한다
  const chapters = [];
  // 쪽 글(xhtml)을 16개씩 함께 읽어 둔다 (디스크에서 구간으로 읽을 때 수천 쪽도 빨리)
  const pageText = new Map(); { let k = 0; const paths = spine.map(h => join(base, h)); await Promise.all(Array.from({length: 16}, async () => { while (k < paths.length){ const p = paths[k++]; const f = zip.file(p); if (f) pageText.set(p, await f.async('string')); } })); }
  for (const href of spine){
    const path = join(base, href);
    if (!pageText.has(path)) continue;
    const doc = new DOMParser().parseFromString(pageText.get(path), 'text/html');
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')+1) : '';
    const imgs = [...doc.querySelectorAll('img, image')].map(i => join(dir, i.getAttribute('src') || i.getAttribute('xlink:href') || i.getAttribute('href') || '')).filter(p => zip.file(p));
    const paras = [...doc.body.querySelectorAll('p, h1, h2, h3, h4, div, li')].filter(e => !e.querySelector('p, div, li')).map(e => e.textContent.trim()).filter(Boolean);
    const title = (doc.querySelector('body h1, body h2, body h3')?.textContent || doc.title || '').trim();
    chapters.push({title, text: paras.join('\n\n'), imgs});
    if (imgs.length){
      if (!parts.length || tocStart.has(path)) parts.push({title: tocStart.get(path) || title || `${parts.length + 1}화`, imgs: []});
      parts.at(-1).imgs.push(...imgs);
    }
  }
  const textChars = chapters.reduce((s,c)=>s+c.text.length, 0);
  const imgCount = chapters.reduce((s,c)=>s+c.imgs.length, 0);
  const res = {zip, chapters: chapters.filter(c => c.text.length > 20 || c.imgs.length), parts: tocStart.size > 1 ? parts : [], isComic: (imgCount > 10 || (imgCount > 0 && tocStart.size > 1)) && textChars / Math.max(1,imgCount) < 200};
  epubCache.set(file, res);
  while (epubCache.size > 3) epubCache.delete(epubCache.keys().next().value);
  return res;
}

