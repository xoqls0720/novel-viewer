/* ================= 다른 앱으로 보내기 (굿노트·프로크리에이트·파일) ================= */
async function shareFiles(files, title, fresh = false){
  if (navigator.canShare?.({files})){
    const go = async () => { try{ await navigator.share({files, title}); }catch(e){ if (e.name !== 'AbortError') saveFiles(files); } };
    if (fresh) return go();
    // 파일을 만드는 사이 탭 권한이 끝나므로, 준비됐다는 버튼을 한 번 더 누르게 한다
    const b = $('#shareReady'); b.querySelector('span').textContent = `${title} 준비됐어요 · 보내기`; b.hidden = false;
    b.onclick = () => { b.hidden = true; go(); }; clearTimeout(b._t); b._t = setTimeout(() => b.hidden = true, 20000);
    return;
  }
  saveFiles(files);
}
function saveFiles(files){
  for (const f of files){ const u = URL.createObjectURL(f); const a = document.createElement('a'); a.href = u; a.download = f.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  toast('파일로 저장했어요. 굿노트·프로크리에이트에서 이 파일을 열면 돼요');
}
const safeName = s => String(s).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
async function loadImgEl(blob){ const u = URL.createObjectURL(blob); const im = new Image(); im.src = u; await im.decode(); URL.revokeObjectURL(u); return im; }
async function getScraps(scope = $('#noteScope').value){
  let all = []; try{ all = await idb.tx('readonly', st => st.getAll(), 'scraps'); }catch{}
  return all.filter(x => scope === 'all' || !cur || x.work === cur.key).sort((a,b) => a.t - b.t);
}
// 굿노트용: 장면 위, 손글씨 줄 칸 아래. 한글 글꼴 문제를 피하려고 쪽마다 그림으로 그려 PDF에 넣는다
function wrapText(g, text, maxW){ const out = []; for (const para of String(text).split('\n')){ let line = ''; for (const ch of para){ if (g.measureText(line + ch).width > maxW){ out.push(line); line = ch; } else line += ch; } out.push(line); } return out; }
async function notePages(){
  const W = 1240, H = 1754, M = 90; const pages = [];
  const page = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#fffefb'; g.fillRect(0,0,W,H); return [c, g]; };
  const ruled = (g, y0) => { g.strokeStyle = '#d9d4c7'; g.lineWidth = 2; for (let y = y0; y < H - M; y += 56){ g.beginPath(); g.moveTo(M, y); g.lineTo(W - M, y); g.stroke(); } };
  const head = (g, t, sub) => { g.fillStyle = '#a8834a'; g.font = '600 24px "Pretendard Variable", sans-serif'; g.fillText(sub, M, M); g.fillStyle = '#1c1b19'; g.font = '700 38px "Gowun Batang", serif'; g.fillText(t, M, M + 52); };
  for (const x of await getScraps()){
    const [c, g] = page(); head(g, x.epName, x.workName);
    const im = await loadImgEl(x.blob); const maxW = W - M*2, maxH = H * 0.5; const k = Math.min(maxW / im.width, maxH / im.height);
    const w = im.width * k, h = im.height * k; g.drawImage(im, M + (maxW - w)/2, M + 90, w, h);
    let y = M + 90 + h + 50;
    if (x.note){ g.fillStyle = '#3b3833'; g.font = '28px "Noto Serif KR", serif'; for (const l of wrapText(g, x.note, maxW)){ g.fillText(l, M, y); y += 44; } y += 20; }
    ruled(g, Math.max(y, M + 90 + h + 60)); pages.push(c);
  }
  if (cur){
    const notes = getNotes().sort(noteSort);
    if (notes.length){
      let [c, g] = page(); head(g, '문장 형광펜', cur.name); let y = M + 120;
      const label = {y:'좋은 문장', g:'구조·기술', p:'대사'}, col = {y:'#f8e3a1', g:'#cdeed6', p:'#f7d3e3'};
      for (const n of notes){
        g.font = '28px "Noto Serif KR", serif'; const lines = wrapText(g, n.text, W - M*2 - 30); const nl = n.note ? wrapText(g, '→ ' + n.note, W - M*2 - 30) : [];
        const need = 40 + lines.length * 44 + nl.length * 40 + 120;
        if (y + need > H - M){ pages.push(c); [c, g] = page(); head(g, '문장 형광펜', cur.name); y = M + 120; }
        g.fillStyle = '#8a857c'; g.font = '600 20px "Pretendard Variable", sans-serif'; g.fillText(`${n.epName} · ${label[n.color]}`, M, y); y += 34;
        g.fillStyle = col[n.color]; g.fillRect(M, y - 30, 8, lines.length * 44 + 4);
        g.fillStyle = '#24221f'; g.font = '28px "Noto Serif KR", serif'; for (const l of lines){ g.fillText(l, M + 30, y); y += 44; }
        g.fillStyle = '#6b665d'; g.font = '24px "Noto Serif KR", serif'; for (const l of nl){ g.fillText(l, M + 30, y); y += 40; }
        g.strokeStyle = '#e6e1d6'; g.lineWidth = 2; for (let k2 = 0; k2 < 2; k2++){ y += 40; g.beginPath(); g.moveTo(M + 30, y); g.lineTo(W - M, y); g.stroke(); }   // 손글씨 칸 두 줄
        y += 50;
      }
      pages.push(c);
    }
  }
  return pages;
}
let jsPDFLib = null;
async function loadJsPDF(){
  if (jsPDFLib) return jsPDFLib;
  await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
  return (jsPDFLib = window.jspdf.jsPDF);
}
async function exportNotesPDF(){
  const pages = await notePages(); if (!pages.length) return toast('담은 장면이나 형광펜이 없어요');
  toast('PDF 만드는 중…');
  let J; try{ J = await loadJsPDF(); }catch{ return toast('PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요'); }
  const doc = new J({unit:'px', format:[1240, 1754], hotfixes:['px_scaling']});
  pages.forEach((c, i) => { if (i) doc.addPage([1240, 1754]); doc.addImage(c.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 1240, 1754); });
  const name = `${safeName(cur?.name || '모든작품')}_필기노트.pdf`;
  await shareFiles([new File([doc.output('blob')], name, {type:'application/pdf'})], name);
}
// 프로크리에이트용: 아이패드 화면 크기 캔버스 가운데에 장면을 놓은 PNG
async function procreateFile(x){
  const W = 2048, H = 2732; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0,0,W,H);
  const im = await loadImgEl(x.base || x.blob); const k = Math.min((W - 160) / im.width, (H - 160) / im.height); const w = im.width * k, h = im.height * k;
  g.drawImage(im, (W - w)/2, (H - h)/2, w, h);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  return new File([blob], `${safeName(x.workName)}_${safeName(x.epName)}_캔버스.png`, {type:'image/png'});
}
async function moodboard(){
  const xs = await getScraps(); if (!xs.length) return toast('담은 장면이 없어요');
  const W = 2048, H = 2732, cols = xs.length > 4 ? 3 : 2, gap = 28, M = 90;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#f7f5f0'; g.fillRect(0,0,W,H);
  g.fillStyle = '#1c1b19'; g.font = '700 64px "Gowun Batang", serif'; g.fillText(cur ? cur.name : '장면 모음', M, M + 40);
  g.fillStyle = '#a8834a'; g.font = '600 28px "Pretendard Variable", sans-serif'; g.fillText('무드보드 · Novelist', M, M + 90);
  const cw = (W - M*2 - gap*(cols-1)) / cols; const colY = Array(cols).fill(M + 140);
  for (const x of xs.slice(0, 18)){
    const ci = colY.indexOf(Math.min(...colY)); const im = await loadImgEl(x.blob); const h = im.height * cw / im.width;
    if (colY[ci] + h > H - M) continue;
    g.save(); g.beginPath(); if (g.roundRect) g.roundRect(M + ci*(cw+gap), colY[ci], cw, h, 18); else g.rect(M + ci*(cw+gap), colY[ci], cw, h); g.clip(); g.drawImage(im, M + ci*(cw+gap), colY[ci], cw, h); g.restore();
    colY[ci] += h + gap;
  }
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  await shareFiles([new File([blob], `${safeName(cur?.name || '장면')}_무드보드.png`, {type:'image/png'})], '무드보드');
}
// Claude 앱(굿노트 연결)에 붙여 넣을 꾸러미
function copyForClaude(){
  const md = notesMarkdown(); const xs = lastScraps;
  const scenes = xs.map(x => `- ${x.workName} · ${x.epName}${x.note ? ` — ${x.note}` : ''}`).join('\n');
  const text = `아래는 내가 Novelist에서 읽으며 남긴 메모야. 굿노트에 넣어 줘:
1) 문서: 작품별로 정리한 독서 노트(좋은 문장·구조·대사 구분, 내 메모 포함)
2) 마인드맵: 등장인물과 관계
3) 타임라인: 회차별 주요 사건과 절단

${md}${scenes ? `\n## 담은 장면\n${scenes}\n` : ''}`;
  navigator.clipboard?.writeText(text).then(() => toast('복사했어요. Claude 앱에 붙여 넣고 보내면 굿노트에 들어가요'), () => toast('복사하지 못했어요'));
}
$('#noteGN').onclick = exportNotesPDF;
$('#noteMood').onclick = moodboard;
$('#noteClaude').onclick = copyForClaude;

/* ================= 장면 노트 (담고 필기하기) ================= */
const sk = {img: null, strokes: [], tool: 'pen', color: '#e5484d', size: 6, cur: null, meta: null, editId: null};
async function captureScene(){
  if (!cur) return null;
  const r = $('#reader').getBoundingClientRect();
  if ($('#reader .manga')){
    const ims = $$('#reader .manga img'); if (!ims.length) return null;
    const bmps = []; for (const im of ims){ await im.decode().catch(()=>{}); bmps.push(im); }
    const H = Math.max(...bmps.map(b => b.naturalHeight)); const W = bmps.reduce((s,b) => s + b.naturalWidth * H / b.naturalHeight, 0);
    const sc = Math.min(1, 2000 / Math.max(W, H)); const cv = document.createElement('canvas'); cv.width = Math.round(W*sc); cv.height = Math.round(H*sc);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,cv.width,cv.height); let x = 0;
    for (const b of bmps){ const w = b.naturalWidth * H / b.naturalHeight * sc; g.drawImage(b, x, 0, w, cv.height); x += w; }
    return {canvas: cv, where: {ep: curEp, page: mangaPos}};
  }
  if ($('#reader .webtoon')){
    const ims = $$('#reader .webtoon img').filter(im => { const b = im.getBoundingClientRect(); return im.naturalWidth && b.bottom > r.top && b.top < r.bottom; });
    if (!ims.length) return null;
    const imm = $('#app').classList.contains('immersive');
    const top = Math.max(r.top + (imm ? 0 : $('.bar').offsetHeight), ims[0].getBoundingClientRect().top), bot = Math.min(r.bottom - (imm ? 0 : $('.botbar').offsetHeight), ims[ims.length-1].getBoundingClientRect().bottom);
    if (bot - top < 40) return null;
    const scale = ims[0].naturalWidth / ims[0].getBoundingClientRect().width;
    const cv = document.createElement('canvas'); cv.width = Math.round(ims[0].naturalWidth * Math.min(1, 1200/ims[0].naturalWidth)); const k = cv.width / ims[0].getBoundingClientRect().width;
    cv.height = Math.max(1, Math.round((bot - top) * k)); const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,cv.width,cv.height);
    for (const im of ims){ const b = im.getBoundingClientRect(); g.drawImage(im, 0, (b.top - top) * k, cv.width, b.height * k); }
    return {canvas: cv, where: {ep: curEp, ...webtoonAnchor()}};
  }
  if (curText){
    // 소설: 보이는 문단을 카드 그림으로
    const ps = $$('#reader .novel p').filter(p => { const b = p.getBoundingClientRect(); return b.bottom > r.top + 60 && b.top < r.bottom - 60 && b.left >= r.left - 2 && b.right <= r.right + 2; }).slice(0, 12);
    if (!ps.length) return null;
    const W = 900, pad = 56, fs = 26, lh = 44; const cv = document.createElement('canvas'); const g = cv.getContext('2d');
    g.font = `${fs}px "Noto Serif KR", serif`;
    const lines = []; for (const p of ps){ let line = ''; for (const ch of p.textContent){ if (g.measureText(line + ch).width > W - pad*2){ lines.push(line); line = ch; } else line += ch; } lines.push(line); lines.push(''); }
    cv.width = W; cv.height = pad*2 + lines.length * lh + 40;
    g.fillStyle = '#fbfaf7'; g.fillRect(0,0,cv.width,cv.height); g.fillStyle = '#a8834a'; g.font = '600 18px sans-serif'; g.fillText(`${cur.name} · ${cur.eps[curEp].name}`, pad, pad - 10);
    g.fillStyle = '#24221f'; g.font = `${fs}px "Noto Serif KR", serif`; lines.forEach((l, i) => g.fillText(l, pad, pad + 30 + i * lh));
    return {canvas: cv, where: {ep: curEp, para: +ps[0].dataset.i}};
  }
  return null;
}
const skLayer = document.createElement('canvas'), skTemp = document.createElement('canvas');
function strokePath(g, pts){
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++){ const [x0,y0] = pts[i-1], [x1,y1] = pts[i]; g.quadraticCurveTo(x0, y0, (x0+x1)/2, (y0+y1)/2); }
  if (pts.length === 1) g.lineTo(pts[0][0] + 0.1, pts[0][1]); else g.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
}
function paintStroke(g, st){
  if (!st.pts.length) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = st.size;
  if (st.tool === 'erase'){ g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; }
  else { g.strokeStyle = st.color; g.globalAlpha = st.tool === 'hl' ? 0.38 : 1; }
  strokePath(g, st.pts); g.stroke(); g.restore();
}
function skRebuildLayer(){
  const g = skLayer.getContext('2d'); g.clearRect(0, 0, skLayer.width, skLayer.height);
  for (const st of sk.strokes) if (st !== sk.cur) paintStroke(g, st);
}
let skRaf = 0;
function skRedraw(){
  cancelAnimationFrame(skRaf);
  skRaf = requestAnimationFrame(() => {
    const cv = $('#skCanvas'); const g = cv.getContext('2d');
    g.clearRect(0,0,cv.width,cv.height); g.drawImage(sk.img, 0, 0);
    if (sk.cur && sk.cur.tool === 'erase'){
      // 지우는 중: 층 복사본에서 지금 획만큼 빼고 그린다
      const t = skTemp.getContext('2d'); t.clearRect(0,0,skTemp.width,skTemp.height); t.drawImage(skLayer, 0, 0); paintStroke(t, sk.cur); g.drawImage(skTemp, 0, 0);
    } else {
      g.drawImage(skLayer, 0, 0);
      if (sk.cur){ const t = skTemp.getContext('2d'); t.clearRect(0,0,skTemp.width,skTemp.height); paintStroke(t, {...sk.cur, tool: 'pen'}); g.save(); if (sk.cur.tool === 'hl'){ g.globalAlpha = 0.38; g.globalCompositeOperation = 'multiply'; } g.drawImage(skTemp, 0, 0); g.restore(); }
    }
  });
}
async function openSketch(src, meta, note = '', editId = null, strokes = []){
  sk.img = src; sk.strokes = strokes.map(x => ({...x, pts: x.pts.map(p => [...p])})); sk.meta = meta; sk.editId = editId; sk.cur = null;
  const cv = $('#skCanvas'); for (const c of [cv, skLayer, skTemp]){ c.width = src.width; c.height = src.height; }
  skRebuildLayer(); skRedraw();
  $('#skNote').value = note; $('#sketch').classList.add('open');
}
function canvasPt(e){ const cv = $('#skCanvas'); const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; }
$('#skCanvas').addEventListener('pointerdown', e => {
  if (!e.isPrimary || sk.cur) return;
  e.preventDefault(); $('#skCanvas').setPointerCapture(e.pointerId);
  const cv = $('#skCanvas'); const k = cv.width / cv.getBoundingClientRect().width;
  sk.cur = {tool: sk.tool, color: sk.color, size: sk.size * k * (sk.tool === 'hl' ? 3 : sk.tool === 'erase' ? 3 : 1), pts: [canvasPt(e)], pid: e.pointerId};
  sk.strokes.push(sk.cur); sk.redo = []; skRedraw();
});
$('#skCanvas').addEventListener('pointermove', e => {
  if (!sk.cur || e.pointerId !== sk.cur.pid) return;
  for (const ev of (e.getCoalescedEvents?.() || [e])) sk.cur.pts.push(canvasPt(ev));
  skRedraw();
});
const skEnd = e => { if (!sk.cur || e.pointerId !== sk.cur.pid) return; paintStroke(skLayer.getContext('2d'), sk.cur); sk.cur = null; skRedraw(); };
$('#skCanvas').addEventListener('pointerup', skEnd);
$('#skCanvas').addEventListener('pointercancel', skEnd);
$$('#skTools button').forEach(b => b.onclick = () => { sk.tool = b.dataset.tool; $$('#skTools button').forEach(x => x.classList.toggle('on', x === b)); });
$$('#skColors button').forEach(b => b.onclick = () => { sk.color = b.dataset.c; $$('#skColors button').forEach(x => x.classList.toggle('on', x === b)); if (sk.tool === 'erase') $('#skTools [data-tool=pen]').click(); });
$('#skSize').oninput = () => sk.size = +$('#skSize').value;
$('#skUndo').onclick = () => { const st = sk.strokes.pop(); if (st) (sk.redo ||= []).push(st); skRebuildLayer(); skRedraw(); };
$('#skRedo').onclick = () => { const st = sk.redo?.pop(); if (st){ sk.strokes.push(st); skRebuildLayer(); skRedraw(); } };
$('#skClear').onclick = () => { if (sk.strokes.length && !confirm('필기를 모두 지울까요?')) return; sk.redo = [...sk.strokes].reverse(); sk.strokes = []; skRebuildLayer(); skRedraw(); };
$('#skCancel').onclick = () => $('#sketch').classList.remove('open');
async function saveSketch(){
  const cv = $('#skCanvas');
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.88));
  const thumbC = document.createElement('canvas'); const ts = Math.min(1, 360 / cv.width); thumbC.width = Math.round(cv.width*ts); thumbC.height = Math.round(cv.height*ts); thumbC.getContext('2d').drawImage(cv, 0, 0, thumbC.width, thumbC.height);
  const thumb = await new Promise(res => thumbC.toBlob(res, 'image/jpeg', 0.8));
  const rec = {id: sk.editId || (Date.now().toString(36) + Math.random().toString(36).slice(2,6)), work: sk.meta.work, workName: sk.meta.workName, epName: sk.meta.epName, where: sk.meta.where, note: $('#skNote').value, blob, thumb, base: sk.meta.base || null, strokes: sk.strokes.map(({pid, ...st}) => st), t: Date.now()};
  if (!rec.base){ rec.base = await new Promise(res => { const c = document.createElement('canvas'); c.width = sk.img.width; c.height = sk.img.height; c.getContext('2d').drawImage(sk.img, 0, 0); c.toBlob(res, 'image/jpeg', 0.9); }); }
  try{ await idb.tx('readwrite', st => st.put(rec), 'scraps'); window.gdSoon?.(); }catch{ toast('기기 저장 공간이 부족해 저장하지 못했어요'); return null; }
  $('#sketch').classList.remove('open'); toast('장면을 저장했어요'); renderScraps(); return rec;
}
$('#skSave').onclick = saveSketch;
$('#skAsk').onclick = async () => {
  const rec = await saveSketch(); if (!rec) return;
  const block = await toImageBlock(rec.blob);
  openTool('ai'); chats.ai.reset();
  chats.ai.ask({question: `내가 ${rec.workName} · ${rec.epName}에서 인상 깊어서 담은 장면이야(내가 그 위에 필기한 표시가 있을 수 있어).${rec.note ? `\n내 메모: ${rec.note}` : ''}\n이 장면의 연출(구도·칸·시선·여백·대사·감정 전환)이 왜 효과적인지 분석하고, 웹소설 문장이나 내 작품에 옮겨 쓸 방법 3가지를 알려 줘.`, display: '[장면 노트 분석]', ctx: {key: 'scrap:' + rec.id, blocks: [block], fresh: true}});
};
$('#btnScrap').onclick = async () => {
  if (!cur) return toast('작품을 먼저 열어 주세요');
  const cap = await captureScene(); if (!cap) return toast('담을 장면이 화면에 없어요');
  openSketch(cap.canvas, {work: cur.key, workName: cur.name, epName: cur.eps[curEp].name, where: cap.where});
};
let lastScraps = [];
async function renderScraps(){
  const box = $('#scrapList'); if (!box) return;
  let all = []; try{ all = await idb.tx('readonly', st => st.getAll(), 'scraps'); }catch{}
  const scope = $('#noteScope').value;
  all = all.filter(x => scope === 'all' || !cur || x.work === cur.key).sort((a,b) => b.t - a.t);
  lastScraps = [...all].reverse();
  box.innerHTML = all.length ? '' : '<div class="hint" style="grid-column:1/-1">보다가 아래 막대의 <b>장면 노트</b>(카메라) 버튼을 누르면 지금 장면을 담아 그 위에 필기할 수 있어요.</div>';
  for (const x of all){
    const d = document.createElement('div'); d.className = 'card scrap';
    const u = URL.createObjectURL(x.thumb);
    d.innerHTML = `<div class="cv"><img alt="" src="${u}"></div><div class="m"></div><div class="note"></div><div class="acts"><button data-a="go">가기</button><button data-a="edit">필기</button><button data-a="share">보내기</button><button data-a="pc">프로크리에이트</button><button data-a="imp">그림 가져오기</button><button data-a="del">삭제</button></div>`;
    d.querySelector('.m').textContent = `${x.workName} · ${x.epName}`; d.querySelector('.note').textContent = x.note || '';
    d.querySelector('img').onload = () => URL.revokeObjectURL(u);
    d.querySelector('[data-a=go]').onclick = async () => { const w = works.find(v => v.key === x.work); if (!w) return toast('이 작품이 지금 서재에 없어요'); if (cur !== w) await openWork(w); const wh = x.where || {}; if (wh.page !== undefined){ await openEp(wh.ep, {}); mangaPos = wh.page; await renderManga(); } else if (wh.para !== undefined) openEp(wh.ep, {}, {para: wh.para, keep:true}); else openEp(wh.ep, wh); if (isMobile()) $('#app').classList.remove('show-tool'); };
    d.querySelector('[data-a=edit]').onclick = async () => {
      const useBase = x.base && x.strokes;   // 원본과 획이 있으면 획을 되살려 고칠 수 있게
      const bmp = await createImageBitmap(useBase ? x.base : x.blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
      openSketch(c, {work: x.work, workName: x.workName, epName: x.epName, where: x.where, base: useBase ? x.base : null}, x.note, x.id, useBase ? x.strokes : []); };
    d.querySelector('[data-a=share]').onclick = () => shareFiles([new File([x.blob], `${safeName(x.workName)}_${safeName(x.epName)}_장면.jpg`, {type:'image/jpeg'})], '장면 노트', true);
    d.querySelector('[data-a=pc]').onclick = async () => shareFiles([await procreateFile(x)], '프로크리에이트로');
    d.querySelector('[data-a=imp]').onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return; const im = await loadImgEl(f);
      const tc = document.createElement('canvas'); const ts = Math.min(1, 360 / im.width); tc.width = Math.round(im.width*ts); tc.height = Math.round(im.height*ts); tc.getContext('2d').drawImage(im, 0, 0, tc.width, tc.height);
      x.blob = f; x.base = null; x.strokes = null; x.thumb = await new Promise(res => tc.toBlob(res, 'image/jpeg', 0.8)); x.t = Date.now();
      await idb.tx('readwrite', st => st.put(x), 'scraps'); window.gdSoon?.(); toast('그린 그림으로 바꿨어요'); renderScraps(); }; inp.click(); };
    d.querySelector('[data-a=del]').onclick = async () => { if (!confirm('이 장면 노트를 지울까요?')) return; await idb.tx('readwrite', st => st.delete(x.id), 'scraps'); tomb('scraps', x.id); renderScraps(); };
    box.append(d);
  }
}


