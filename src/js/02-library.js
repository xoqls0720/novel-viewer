/* ================= 서재 ================= */
let works = [];
let cur = null, curEp = -1, curText = '', curParas = [], curImgs = [], mangaPos = 0, objectUrls = [];
let openToken = 0;

async function expandZips(list){
  const out = [];
  for (const f of list){
    if (!/\.zip$/i.test(f.name)){ out.push(f); continue; }
    toast(`${f.name} 푸는 중…`);
    try{
      const zip = await JSZip.loadAsync(f, {decodeFileName: bytes => { try{ return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }catch{ try{ return new TextDecoder('euc-kr').decode(bytes); }catch{ return String.fromCharCode(...bytes); } } }});
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

async function addFiles(fileList, {persist = true, quiet = false} = {}){
  fileList = await expandZips(fileList);
  if (persist && $('#keepLocal').checked && fileList.length){
    try{ await navigator.storage?.persist?.(); await idb.putMany(fileList); showStore(); }
    catch{ toast('기기 저장 공간이 부족해 일부는 저장하지 못했어요(지금은 열 수 있어요)'); }
  }
  const groups = new Map();
  for (const f of fileList){
    const rel = relPath(f).split('/');
    if (rel.some(p => p.startsWith('.'))) continue;
    let workPath, epName = null;
    // 웹툰·만화 회차 폴더: 작품/0001 1화/이미지, 작품/001/이미지, 작품/1화/이미지
    if (IMG.test(f.name) && rel.length >= 3 && /^\d{1,4}(?:\D|$)/.test(rel[rel.length-2])) { workPath = rel.slice(0,-2).join('/'); epName = rel[rel.length-2]; }
    else workPath = rel.length > 1 ? rel.slice(0,-1).join('/') : '낱개/' + f.name.replace(/\.[^.]+$/, '');
    if (!groups.has(workPath)) groups.set(workPath, {files:[], imgEps:new Map(), paths:[]});
    const g = groups.get(workPath); g.paths.push(relPath(f));
    if (epName){ if(!g.imgEps.has(epName)) g.imgEps.set(epName, []); g.imgEps.get(epName).push(f); }
    else g.files.push(f);
  }
  let added = 0;
  for (const [path, g] of groups){
    const segs = path.split('/');
    const name = segs.pop();
    const top = segs.find(x => /노벨|소설|novel|웹툰|webtoon|만화|망가|manga|comic/i.test(x)) || segs[0] || '낱개';
    const eps = []; let cover = null, info = null; const loose = [];
    for (const f of g.files){
      const n = f.name.toLowerCase();
      if (/^cover\./.test(n)) cover = f;
      else if (n === 'info.txt') info = f;
      else if (n.endsWith('.txt')) eps.push({name: f.name.replace(/\.txt$/i,''), type:'txt', file:f});
      else if (n.endsWith('.epub')) eps.push({name: f.name.replace(/\.epub$/i,''), type:'epub', file:f});
      else if (IMG.test(n)) loose.push(f);
    }
    for (const [ep, files] of g.imgEps) eps.push({name: ep, type:'imgs', files: files.sort((a,b)=>natural(a.name,b.name))});
    if (loose.length) eps.push({name: '이미지', type:'imgs', files: loose.sort((a,b)=>natural(a.name,b.name))});
    if (!eps.length) continue;
    eps.sort((a,b)=>natural(a.name,b.name));
    const hasTxt = eps.some(e=>e.type==='txt'), hasEpub = eps.some(e=>e.type==='epub');
    const finalEps = hasTxt && hasEpub ? eps.filter(e=>e.type!=='epub') : eps;
    const kind = /웹툰|webtoon/i.test(top) ? 'webtoon' : /만화|망가|manga|comic/i.test(top) ? 'manga'
               : finalEps.every(e=>e.type==='imgs') ? 'webtoon' : 'novel';
    const key = (TOPNAME(top) || '기타') + '/' + name;
    migrateKey(path, key);
    const w = {key, name, top: TOPNAME(top) || top, kind, cover, info, eps: finalEps, paths: g.paths};
    const old = works.findIndex(x=>x.key===w.key);
    if (old >= 0){ if (works[old].coverUrl) URL.revokeObjectURL(works[old].coverUrl); works[old] = w; } else works.push(w);
    added++;
  }
  works.sort((a,b)=>natural(a.top+a.name, b.top+b.name));
  renderLib(); if (!quiet) toast(`작품 ${added}개를 불러왔어요`);
}

// 폴더 이름을 한국어 분류로
function TOPNAME(t){ if (/노벨|소설|novel/i.test(t)) return '소설'; if (/웹툰|webtoon/i.test(t)) return '웹툰'; if (/만화|망가|manga|comic/i.test(t)) return '만화'; if (t === '낱개') return '낱개 파일'; return ''; }
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
function coverUrl(w){ if (w.cover && !w.coverUrl) w.coverUrl = URL.createObjectURL(w.cover); return w.coverUrl || ''; }
function workCard(w){
  const pos = store.get('pos.'+w.key, null);
  const total = pos?.n || w.eps.length;
  const pct = pos ? Math.min(100, Math.round(((pos.ep + (pos.f||0)) / total) * 100)) : 0;
  const d = document.createElement('div'); d.className = 'card' + (w===cur?' on':'');
  const cu = coverUrl(w);
  d.innerHTML = `<div class="cv">${cu ? `<img alt="" src="${cu}">` : `<div class="ph"></div>`}<span class="kind">${({novel:'소설',webtoon:'웹툰',manga:'만화'})[w.kind]}</span>${pos?`<div class="pb"><i style="width:${pct}%"></i></div>`:''}</div><div class="t"></div><div class="m">${pos?`${Math.min(pos.ep+1,total)} / ${total}화`:`${total}화`}</div>`;
  d.querySelector('.t').textContent = w.name;
  const ph = d.querySelector('.ph'); if (ph){ ph.textContent = w.name; ph.style.setProperty('--h', hueOf(w.name)); }   // 표지 없는 작품은 이름으로 색
  d.onclick = () => openWork(w);
  return d;
}
function renderLib(){
  const q = $('#libSearch').value.trim();
  const sort = $('#libSort').value;
  const lib = $('#lib'); lib.innerHTML = '';
  let list = works.filter(w => !q || w.name.includes(q));
  const recent = works.filter(w => store.get('pos.'+w.key, null)).sort((a,b)=>(store.get('pos.'+b.key,{t:0}).t||0)-(store.get('pos.'+a.key,{t:0}).t||0)).slice(0, 8);
  if (!q && recent.length && sort === 'name'){
    const h = document.createElement('h4'); h.textContent = '이어 읽기'; lib.append(h);
    const row = document.createElement('div'); row.className = 'cont'; recent.forEach(w => row.append(workCard(w))); lib.append(row);
  }
  if (sort === 'recent') list = [...list].sort((a,b)=>(store.get('pos.'+b.key,{t:0}).t||0)-(store.get('pos.'+a.key,{t:0}).t||0));
  let lastTop = null, grid = null;
  for (const w of list){
    if (!grid || (sort === 'name' && w.top !== lastTop)){
      if (sort === 'name'){ const h = document.createElement('h4'); h.textContent = w.top; lib.append(h); }
      grid = document.createElement('div'); grid.className = 'grid'; lib.append(grid); lastTop = w.top;
    }
    grid.append(workCard(w));
  }
  if (!list.length) lib.insertAdjacentHTML('beforeend', `<div class="hint" style="padding:16px 4px">${works.length ? '찾는 작품이 없어요' : '아직 불러온 작품이 없어요. 위의 폴더 열기나 파일·zip으로 가져오세요.'}</div>`);
}

/* ================= EPUB ================= */
const epubCache = new Map();
async function readEpub(file){
  if (epubCache.has(file)) return epubCache.get(file);
  const zip = await JSZip.loadAsync(file);
  const container = await zip.file('META-INF/container.xml').async('string');
  const opfPath = container.match(/full-path="([^"]+)"/)[1];
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')+1) : '';
  const opf = new DOMParser().parseFromString(await zip.file(opfPath).async('string'), 'application/xml');
  const items = {}; for (const it of opf.querySelectorAll('manifest > item')) items[it.getAttribute('id')] = it.getAttribute('href');
  const spine = [...opf.querySelectorAll('spine > itemref')].map(r => items[r.getAttribute('idref')]).filter(Boolean);
  const join = (dir, href) => { const out=[]; for (const p of (dir + decodeURIComponent(href.split('#')[0])).split('/')){ if(p==='..') out.pop(); else if(p!=='.' && p!=='') out.push(p);} return out.join('/'); };
  const chapters = [];
  for (const href of spine){
    const path = join(base, href);
    const f = zip.file(path); if (!f) continue;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'text/html');
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')+1) : '';
    const imgs = [...doc.querySelectorAll('img, image')].map(i => join(dir, i.getAttribute('src') || i.getAttribute('xlink:href') || i.getAttribute('href') || '')).filter(p => zip.file(p));
    const paras = [...doc.body.querySelectorAll('p, h1, h2, h3, h4, div, li')].filter(e => !e.querySelector('p, div, li')).map(e => e.textContent.trim()).filter(Boolean);
    const title = (doc.querySelector('body h1, body h2, body h3')?.textContent || doc.title || '').trim();
    chapters.push({title, text: paras.join('\n\n'), imgs});
  }
  const textChars = chapters.reduce((s,c)=>s+c.text.length, 0);
  const imgCount = chapters.reduce((s,c)=>s+c.imgs.length, 0);
  const res = {zip, chapters: chapters.filter(c => c.text.length > 20 || c.imgs.length), isComic: imgCount > 10 && textChars / Math.max(1,imgCount) < 200};
  epubCache.set(file, res);
  while (epubCache.size > 3) epubCache.delete(epubCache.keys().next().value);
  return res;
}

