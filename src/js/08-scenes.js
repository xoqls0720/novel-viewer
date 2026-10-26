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
const NW = 1240, NH = 1754, NM = 90;
const notePage = () => { const c = document.createElement('canvas'); c.width = NW; c.height = NH; const g = c.getContext('2d'); g.fillStyle = '#fffefb'; g.fillRect(0,0,NW,NH); return [c, g]; };
const noteRuled = (g, y0) => { g.strokeStyle = '#d9d4c7'; g.lineWidth = 2; for (let y = y0; y < NH - NM; y += 56){ g.beginPath(); g.moveTo(NM, y); g.lineTo(NW - NM, y); g.stroke(); } };
const noteHead = (g, t, sub) => { g.fillStyle = '#a8834a'; g.font = '600 24px "Pretendard Variable", sans-serif'; g.fillText(sub, NM, NM); g.fillStyle = '#1c1b19'; g.font = '700 38px "Gowun Batang", serif'; g.fillText(t, NM, NM + 52); };
// 장면(또는 그림) 한 장을 굿노트용 쪽으로: 위에 그림, 가운데 내 메모, 아래 손글씨 줄 칸
async function scrapPage(x, im){
  const [c, g] = notePage(); noteHead(g, x.epName, x.workName);
  im = im || await loadImgEl(x.blob); const maxW = NW - NM*2, maxH = NH * 0.5; const k = Math.min(maxW / im.width, maxH / im.height);
  const w = im.width * k, h = im.height * k; g.drawImage(im, NM + (maxW - w)/2, NM + 90, w, h);
  let y = NM + 90 + h + 50;
  if (x.note){ g.fillStyle = '#3b3833'; g.font = '28px "Noto Serif KR", serif'; for (const l of wrapText(g, x.note, maxW)){ g.fillText(l, NM, y); y += 44; } y += 20; }
  noteRuled(g, Math.max(y, NM + 90 + h + 60)); return c;
}
async function notePages(){
  const W = NW, H = NH, M = NM; const pages = []; const page = notePage, head = noteHead;
  for (const x of await getScraps()) pages.push(await scrapPage(x));
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
async function canvasesToPdf(pages, name){
  let J; try{ J = await loadJsPDF(); }catch{ toast('PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요'); return null; }
  const doc = new J({unit: 'px', format: [pages[0].width, pages[0].height], hotfixes: ['px_scaling']});
  pages.forEach((c, i) => { if (i) doc.addPage([c.width, c.height]); doc.addImage(c.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, c.width, c.height); });
  return new File([doc.output('blob')], name, {type: 'application/pdf'});
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
const PC_SIZE = {tall: [2048, 2732], wide: [2732, 2048], square: [2732, 2732]};
const pcDims = () => PC_SIZE[$('#pcSize')?.value] || PC_SIZE.tall;
// 장면 그림(scene)과 필기(ink, 없을 수 있음)를 캔버스 가운데에 놓는다. 'psd'면 장면·필기를 따로 둔 레이어 파일, 아니면 한 장짜리 PNG
async function procreateFile(x, {scene, ink} = {}){
  const [W, H] = pcDims(); const fmt = $('#pcFormat')?.value || 'png';
  scene = scene || await loadImgEl(x.base || x.blob);
  const k = Math.min((W - 160) / scene.width, (H - 160) / scene.height); const w = Math.round(scene.width * k), h = Math.round(scene.height * k), ox = Math.round((W - w) / 2), oy = Math.round((H - h) / 2);
  const name = `${safeName(x.workName)}_${safeName(x.epName)}_캔버스`;
  const layer = src => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h); return c; };
  if (fmt === 'psd'){
    const layers = [{name: '장면', x: ox, y: oy, canvas: layer(scene)}]; if (ink) layers.push({name: '필기', x: ox, y: oy, canvas: layer(ink)});
    const flat = document.createElement('canvas'); flat.width = W; flat.height = H; const fg = flat.getContext('2d'); fg.fillStyle = '#fff'; fg.fillRect(0, 0, W, H); for (const l of layers) fg.drawImage(l.canvas, l.x, l.y);
    return new File([buildPsd(W, H, layers, flat)], name + '.psd', {type: 'image/vnd.adobe.photoshop'});
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.drawImage(scene, ox, oy, w, h); if (ink) g.drawImage(ink, ox, oy, w, h);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  return new File([blob], name + '.png', {type: 'image/png'});
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
const sk = {img: null, strokes: [], ops: [], redo: [], tool: 'pen', color: '#e5484d', cur: null, meta: null, editId: null, sel: null, lasso: null};
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
// 그리는 판은 지연을 줄이는 방식으로 한 번만 연다
const skCtx = () => $('#skCanvas').getContext('2d', {desynchronized: true});
function strokePath(g, pts){
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++){ const [x0,y0] = pts[i-1], [x1,y1] = pts[i]; g.quadraticCurveTo(x0, y0, (x0+x1)/2, (y0+y1)/2); }
  if (pts.length === 1) g.lineTo(pts[0][0] + 0.1, pts[0][1]); else g.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
}
// 필압(펜슬의 힘, 손가락·마우스는 빠르기로 흉내)에 따라 마디마다 굵기를 바꿔 이어 그린다
function paintPressure(g, st){
  const P = st.pts, n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let i = 1; i < n; i++){
    const a = P[i-1], b = P[i]; const from = i > 1 ? mid(P[i-2], a) : a, to = i < n - 1 ? mid(a, b) : b;
    g.lineWidth = st.size * (0.25 + 1.05 * (((a[2] ?? 0.5) + (b[2] ?? 0.5)) / 2));
    g.beginPath(); g.moveTo(from[0], from[1]); g.quadraticCurveTo(a[0], a[1], to[0], to[1]); g.stroke();
  }
}
const TOOL_ALPHA = {hl: 0.38, pencil: 0.72};
function paintStroke(g, st){
  if (!st.pts.length) return;
  const a = TOOL_ALPHA[st.tool];
  if (a && g !== skTemp.getContext('2d')){   // 반투명 도구는 한 획을 따로 그린 뒤 한 번에 얹어야 겹친 곳이 진해지지 않는다
    const t = skTemp.getContext('2d'); t.clearRect(0, 0, skTemp.width, skTemp.height); paintStroke(t, {...st, _solid: true});
    g.save(); g.globalAlpha = a; g.drawImage(skTemp, 0, 0); g.restore(); return;
  }
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = st.size;
  if (st.tool === 'erase'){ g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; strokePath(g, st.pts); g.stroke(); g.restore(); return; }
  g.strokeStyle = st.color;
  if (st.pr && st.pts.length > 1 && (st.tool === 'pen' || st.tool === 'pencil')) paintPressure(g, st);
  else { strokePath(g, st.pts); g.stroke(); }
  g.restore();
}
function skRebuildLayer(){
  const g = skLayer.getContext('2d'); g.clearRect(0, 0, skLayer.width, skLayer.height);
  for (const st of sk.strokes) if (st !== sk.cur) paintStroke(g, st);
}
let skRaf = 0;
function skRedraw(){
  cancelAnimationFrame(skRaf);
  skRaf = requestAnimationFrame(() => {
    const cv = $('#skCanvas'); const g = skCtx();
    g.clearRect(0,0,cv.width,cv.height); g.drawImage(sk.img, 0, 0);
    if (sk.cur && sk.cur.tool === 'erase'){
      const t = skTemp.getContext('2d'); t.clearRect(0,0,skTemp.width,skTemp.height); t.drawImage(skLayer, 0, 0); paintStroke(t, sk.cur); g.drawImage(skTemp, 0, 0);
    } else {
      g.drawImage(skLayer, 0, 0);
      if (sk.cur && sk.cur.tool !== 'lasso') paintStroke(g, sk.cur);
    }
    // 올가미: 그리는 선, 고른 획의 테두리
    if (sk.lasso?.length > 1){ g.save(); g.setLineDash([10, 8]); g.lineWidth = 2 * skK(); g.strokeStyle = '#2f3d6b'; g.beginPath(); sk.lasso.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore(); }
    if (sk.sel?.length){ const b = selBox(); g.save(); g.setLineDash([12, 8]); g.lineWidth = 2.5 * skK(); g.strokeStyle = '#a8834a'; g.fillStyle = 'rgba(168,131,74,.06)'; g.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); g.restore(); }
  });
}
async function openSketch(src, meta, note = '', editId = null, strokes = []){
  sk.img = src; sk.strokes = strokes.map(x => ({...x, pts: x.pts.map(p => [...p])})); sk.meta = meta; sk.editId = editId; sk.cur = null; sk.ops = []; sk.redo = []; sk.sel = null; sk.lasso = null;
  sk.note0 = note; sk.moved = false;
  const cv = $('#skCanvas'); for (const c of [cv, skLayer, skTemp]){ c.width = src.width; c.height = src.height; }
  skView(1, 0, 0); skRebuildLayer(); skRedraw();
  $('#skNote').value = note; $('#sketch').classList.add('open'); $('#sketch').classList.toggle('dock', store.get('lib.skDock', false)); skFingerBtn(); skToolUI(); skSelUI();
}
const skDirty = () => $('#sketch').classList.contains('open') && (sk.ops.length > 0 || sk.moved || $('#skNote').value !== sk.note0);
function skClose(force){ if (!force && skDirty() && !confirm('저장하지 않은 필기가 있어요. 저장하지 않고 닫을까요?')) return false; $('#sketch').classList.remove('open'); $('#skCursor').hidden = true; return true; }

/* ---------- 되돌리기: 한 번에 한 동작(획 더하기·지우기·옮기기) ---------- */
function skDo(op){ sk.ops.push(op); sk.redo = []; }
function skApply(op, back){
  if (op.t === 'add'){ if (back) sk.strokes.splice(sk.strokes.indexOf(op.st), 1); else sk.strokes.push(op.st); }
  else if (op.t === 'del'){ if (back) [...op.list].sort((a, b) => a[1] - b[1]).forEach(([st, i]) => sk.strokes.splice(i, 0, st)); else for (const [st] of op.list){ const i = sk.strokes.indexOf(st); if (i >= 0) sk.strokes.splice(i, 1); } }
  else if (op.t === 'move'){ const d = back ? -1 : 1; for (const st of op.sts){ for (const p of st.pts){ p[0] += op.dx * d; p[1] += op.dy * d; } st.bb = null; } }
  sk.sel = null; skSelUI(); skRebuildLayer(); skRedraw();
}
$('#skUndo').onclick = () => { const op = sk.ops.pop(); if (op){ skApply(op, true); sk.redo.push(op); } };
$('#skRedo').onclick = () => { const op = sk.redo.pop(); if (op){ skApply(op, false); sk.ops.push(op); } };
$('#skClear').onclick = () => { if (!sk.strokes.length || !confirm('필기를 모두 지울까요? (되돌리기로 살릴 수 있어요)')) return; const op = {t: 'del', list: sk.strokes.map((st, i) => [st, i])}; skDo(op); skApply(op, false); };
$('#skCancel').onclick = () => skClose();

/* ---------- 보기(확대·이동) ---------- */
// 캔버스 가운데를 기준으로 옮기고(t) 키운다(s). 그리는 좌표는 화면 위치에서 다시 계산하니 확대해도 어긋나지 않는다.
sk.v = {s: 1, x: 0, y: 0};
function skView(s, x, y){ sk.v = {s: Math.min(8, Math.max(0.4, s)), x, y}; const cv = $('#skCanvas'); cv.style.transform = sk.v.s === 1 && !x && !y ? '' : `translate(${sk.v.x}px, ${sk.v.y}px) scale(${sk.v.s})`; $('#skFit').hidden = !cv.style.transform; }
function skZoomAt(px, py, s2){ const r = $('#skStage').getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const k = Math.min(8, Math.max(0.4, s2)) / sk.v.s; skView(sk.v.s * k, (px - cx) - k * ((px - cx) - sk.v.x), (py - cy) - k * ((py - cy) - sk.v.y)); }
$('#skFit').onclick = () => skView(1, 0, 0);
$('#skStage').addEventListener('wheel', e => { if (!$('#sketch').classList.contains('open')) return; e.preventDefault(); if (e.ctrlKey || e.metaKey) skZoomAt(e.clientX, e.clientY, sk.v.s * Math.exp(-e.deltaY * 0.01)); else skView(sk.v.s, sk.v.x - e.deltaX, sk.v.y - e.deltaY); }, {passive: false});
// 화면 1px이 그림에서 몇 px인지(확대하지 않은 상태 기준: 확대해도 펜 굵기는 종이 위에서 같다)
const skK = () => { const cv = $('#skCanvas'); const w = cv.getBoundingClientRect().width / sk.v.s; return w ? cv.width / w : 1; };

/* ---------- 도구 ---------- */
// 도구마다 굵기를 따로 기억한다. 지우개는 크기 범위도 따로(크게 지울 수 있게)
const SK_SIZE = {pen: 6, ball: 4, pencil: 5, hl: 18, erase: 28};
const SK_RANGE = {erase: [6, 160], hl: [6, 60]};
const SK_PRESET = {erase: [[12, '작게'], [28, '보통'], [70, '크게']], hl: [[10, '가늘게'], [18, '보통'], [32, '굵게']]};
sk.sizes = {...SK_SIZE, ...store.get('lib.skSizes', {})}; sk.eraseMode = store.get('lib.skErase', 'part');
const skSize = () => sk.sizes[sk.tool] ?? 6;
function skToolUI(){
  $$('#skTools button').forEach(x => x.classList.toggle('on', x.dataset.tool === sk.tool));
  const t = sk.tool, [lo, hi] = SK_RANGE[t] || [1, 40]; const r = $('#skSize'); r.min = lo; r.max = hi; r.value = skSize(); $('#skSizeOut').textContent = skSize();
  $('#skSizeLab').textContent = t === 'erase' ? '지우개 크기' : t === 'lasso' ? '' : t === 'hl' ? '형광펜 굵기' : '펜 굵기';
  const pre = SK_PRESET[t] || [[3, '가늘게'], [6, '보통'], [16, '굵게']];
  $$('#skSizes button').forEach((b, i) => { b.dataset.z = pre[i][0]; b.textContent = pre[i][1]; b.classList.toggle('on', +b.dataset.z === skSize()); });
  $('#skSizeBox').hidden = t === 'lasso'; $('#skLassoHint').hidden = t !== 'lasso' || !!sk.sel?.length; $('#skEraseOpts').hidden = t !== 'erase';
  $$('#skEraseOpts button').forEach(b => b.classList.toggle('on', b.dataset.em === sk.eraseMode));
  $('#skCanvas').style.cursor = t === 'erase' ? 'none' : t === 'lasso' ? 'default' : 'crosshair';
}
const skPickTool = t => { sk.tool = t; if (t !== 'lasso'){ sk.sel = null; sk.lasso = null; skSelUI(); skRedraw(); } skToolUI(); };
$$('#skTools button').forEach(b => b.onclick = () => skPickTool(b.dataset.tool));
$$('#skEraseOpts button').forEach(b => b.onclick = () => { sk.eraseMode = b.dataset.em; store.set('lib.skErase', sk.eraseMode); skToolUI(); toast(sk.eraseMode === 'stroke' ? '획 지우개: 닿은 획을 통째로 지워요' : '부분 지우개: 닿은 곳만 지워요'); });
$('#skSize').oninput = () => { sk.sizes[sk.tool] = +$('#skSize').value; store.set('lib.skSizes', sk.sizes); $('#skSizeOut').textContent = skSize(); $$('#skSizes button').forEach(b => b.classList.toggle('on', +b.dataset.z === skSize())); };
$$('#skSizes button').forEach(b => b.onclick = () => { $('#skSize').value = b.dataset.z; $('#skSize').oninput(); });
function skSetColor(c, remember){
  sk.color = c; $$('#skColors button').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === c.toLowerCase())); $('#skColorPick').value = c;
  if (sk.tool === 'erase' || sk.tool === 'lasso') skPickTool('pen');
  if (remember && !$$('#skColors button').some(x => x.dataset.c.toLowerCase() === c.toLowerCase())){ const rc = [c, ...store.get('lib.skRecent', []).filter(x => x !== c)].slice(0, 6); store.set('lib.skRecent', rc); skRecent(); }
}
function skRecent(){ const box = $('#skRecent'); box.innerHTML = ''; for (const c of store.get('lib.skRecent', [])){ const b = document.createElement('button'); b.dataset.c = c; b.style.background = c; b.title = c; b.onclick = () => skSetColor(c); box.append(b); } }
$$('#skColors button').forEach(b => b.onclick = () => skSetColor(b.dataset.c));
$('#skColorPick').oninput = () => skSetColor($('#skColorPick').value);
$('#skColorPick').onchange = () => skSetColor($('#skColorPick').value, true);
skRecent();

/* ---------- 펜·손가락 ---------- */
// 펜슬이 한 번이라도 보인 기기는 손가락으로 움직이고(확대·이동), 펜슬로만 그린다. 펜슬이 없는 기기는 손가락으로 그린다.
const skFingerDraws = () => { const v = store.get('lib.skFinger', null); return v === null ? !store.get('lib.penSeen', false) : v; };
function skFingerBtn(){ const b = $('#skFinger'); b.classList.toggle('on', skFingerDraws()); b.title = skFingerDraws() ? '손가락으로 그려요 (누르면 손가락은 확대·이동만)' : '펜슬로만 그려요. 손가락은 확대·이동 (누르면 손가락으로도 그리기)'; }
$('#skFinger').onclick = () => { store.set('lib.skFinger', !skFingerDraws()); skFingerBtn(); toast(skFingerDraws() ? '손가락으로도 그려요' : '펜슬로만 그려요. 손가락 두 개로 확대·이동, 두 손가락 톡 되돌리기, 세 손가락 톡 다시'); };
const skTouch = new Map(); let skG = null, skSess = null;
function canvasPt(e){ const cv = $('#skCanvas'); const b = cv.getBoundingClientRect(); const p = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5; return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height, p]; }
const skGesture = () => { const t = [...skTouch.values()]; return {mx: t.reduce((q, p) => q + p.x, 0) / t.length, my: t.reduce((q, p) => q + p.y, 0) / t.length, d: t.length > 1 ? Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) : 0}; };
function skGestureStart(){ if (!skSess) skSess = {t0: Date.now(), max: 0, move: 0}; skSess.max = Math.max(skSess.max, skTouch.size); skG = {...skGesture(), v: {...sk.v}}; }
function skGestureMove(){
  const g = skGesture(), r = $('#skStage').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, v0 = skG.v;
  const s = skTouch.size > 1 && skG.d > 0 ? Math.min(8, Math.max(0.4, v0.s * g.d / skG.d)) : v0.s, k = s / v0.s;
  skView(s, (skG.mx - cx) - k * ((skG.mx - cx) - v0.x) + (g.mx - skG.mx), (skG.my - cy) - k * ((skG.my - cy) - v0.y) + (g.my - skG.my));
}

/* ---------- 획 지우개·올가미에 쓰는 계산 ---------- */
function stBox(st){ if (st.bb) return st.bb; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of st.pts){ if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } const h = st.size / 2; return st.bb = [a - h, b - h, c + h, d + h]; }
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
// 지우개가 지나간 길(a→b, 반지름 r)에 닿은 획을 통째로 지운다
function skEraseStrokes(a, b, r){
  const hit = [];
  sk.strokes.forEach((st, i) => {
    if (st.tool === 'erase' || st === sk.cur) return; const bb = stBox(st);
    if (Math.max(a[0], b[0]) + r < bb[0] || Math.min(a[0], b[0]) - r > bb[2] || Math.max(a[1], b[1]) + r < bb[1] || Math.min(a[1], b[1]) - r > bb[3]) return;
    const rr = r + st.size / 2; if (st.pts.some(([x, y]) => segDist(x, y, a[0], a[1], b[0], b[1]) <= rr)) hit.push([st, i]);
  });
  if (!hit.length) return;
  for (const [st] of hit) sk.strokes.splice(sk.strokes.indexOf(st), 1);
  sk.cur.erased.push(...hit); skRebuildLayer(); skRedraw();
}
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
function selBox(){ let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const st of sk.sel){ const bb = stBox(st); a = Math.min(a, bb[0]); b = Math.min(b, bb[1]); c = Math.max(c, bb[2]); d = Math.max(d, bb[3]); } const m = 8 * skK(); return [a - m, b - m, c + m, d + m]; }
function skSelUI(){ const on = !!sk.sel?.length; $('#skSelBar').hidden = !on; $('#skLassoHint').hidden = sk.tool !== 'lasso' || on; if (on) $('#skSelN').textContent = `${sk.sel.length}개 고름`; }
$('#skSelDel').onclick = () => { if (!sk.sel?.length) return; const op = {t: 'del', list: sk.sel.map(st => [st, sk.strokes.indexOf(st)])}; skDo(op); skApply(op, false); };
$('#skSelColor').onclick = () => { if (!sk.sel?.length) return; for (const st of sk.sel) if (st.tool !== 'erase') st.color = sk.color; sk.moved = true; skRebuildLayer(); skRedraw(); toast('고른 획을 지금 색으로 바꿨어요'); };
$('#skSelDup').onclick = () => { if (!sk.sel?.length) return; const d = 24 * skK(); const copies = sk.sel.map(st => ({...st, bb: null, pts: st.pts.map(([x, y, p]) => [x + d, y + d, p])})); for (const st of copies){ sk.strokes.push(st); skDo({t: 'add', st}); } sk.sel = copies; skRebuildLayer(); skRedraw(); skSelUI(); };

/* ---------- 그리기 ---------- */
// 지우개 모양(동그라미)을 펜슬·마우스가 있는 자리에 보여 준다
function skCursor(e){
  const c = $('#skCursor'); if (sk.tool !== 'erase' || e.pointerType === 'touch'){ c.hidden = true; return; }
  const st = $('#skStage').getBoundingClientRect(); const d = skSize() * sk.v.s * 3; c.hidden = false; c.style.width = c.style.height = d + 'px'; c.style.left = (e.clientX - st.left - d / 2) + 'px'; c.style.top = (e.clientY - st.top - d / 2) + 'px';
}
// 선을 긋고 끝에서 잠깐 멈추면 곧은 선으로 바뀐다(굿노트처럼). 놓기 전까지 끝점을 움직일 수 있다
let skHold = 0;
function skHoldArm(){ clearTimeout(skHold); const st = sk.cur; if (!st || st.line || !['pen', 'ball', 'pencil', 'hl'].includes(st.tool) || st.pts.length < 6) return;
  skHold = setTimeout(() => { if (sk.cur !== st) return; const a = st.pts[0], b = st.pts.at(-1); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 30 * skK()) return; st.pts = [a, b]; st.line = true; skRedraw(); if (navigator.vibrate) navigator.vibrate(8); }, 550); }
$('#skCanvas').addEventListener('pointerdown', e => {
  if (e.pointerType === 'pen'){ sk.penUntil = Date.now() + 1500; if (!store.get('lib.penSeen', false)){ store.set('lib.penSeen', true); skFingerBtn(); } }
  if (e.pointerType === 'touch' && (!skFingerDraws() || Date.now() < (sk.penUntil || 0))){
    e.preventDefault(); if (sk.cur || Date.now() < (sk.penUntil || 0)) return;   // 펜슬로 쓰는 동안 손바닥은 무시
    try{ $('#skCanvas').setPointerCapture(e.pointerId); }catch{} skTouch.set(e.pointerId, {x: e.clientX, y: e.clientY}); skGestureStart(); return;
  }
  if (!e.isPrimary || sk.cur) return;
  e.preventDefault(); try{ $('#skCanvas').setPointerCapture(e.pointerId); }catch{}
  const k = skK(), pt = canvasPt(e);
  if (sk.tool === 'lasso'){
    if (sk.sel?.length){ const b = selBox(); if (pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3]){ sk.cur = {tool: 'lasso', move: true, from: pt, dx: 0, dy: 0, pid: e.pointerId}; return; } }
    sk.sel = null; skSelUI(); sk.lasso = [pt]; sk.cur = {tool: 'lasso', pid: e.pointerId}; skRedraw(); return;
  }
  const erStroke = sk.tool === 'erase' && sk.eraseMode === 'stroke';
  const pr = sk.tool === 'pen' || (sk.tool === 'pencil' && e.pointerType === 'pen');
  sk.cur = {tool: sk.tool, color: sk.color, size: skSize() * k * (sk.tool === 'erase' ? 3 : 1), pts: [pt], pid: e.pointerId, pr, ptype: e.pointerType, t: e.timeStamp};
  if (erStroke){ sk.cur.whole = true; sk.cur.erased = []; skEraseStrokes(pt, pt, sk.cur.size / 2); return; }
  sk.strokes.push(sk.cur); skRedraw(); skHoldArm();
});
$('#skCanvas').addEventListener('pointermove', e => {
  if (skTouch.has(e.pointerId)){
    const p = skTouch.get(e.pointerId); skSess.move += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    skGestureMove(); return;
  }
  skCursor(e);
  if (!sk.cur || e.pointerId !== sk.cur.pid) return;
  const evs = e.getCoalescedEvents?.() || [e];
  if (sk.cur.tool === 'lasso'){
    const pt = canvasPt(evs.at(-1));
    if (sk.cur.move){ const dx = pt[0] - sk.cur.from[0], dy = pt[1] - sk.cur.from[1]; for (const st of sk.sel){ for (const q of st.pts){ q[0] += dx; q[1] += dy; } st.bb = null; } sk.cur.dx += dx; sk.cur.dy += dy; sk.cur.from = pt; skRebuildLayer(); }
    else for (const ev of evs) sk.lasso.push(canvasPt(ev));
    skRedraw(); return;
  }
  if (sk.cur.whole){ let a = sk.cur.pts.at(-1); for (const ev of evs){ const b = canvasPt(ev); skEraseStrokes(a, b, sk.cur.size / 2); a = b; } sk.cur.pts.push(a); return; }
  if (sk.cur.line){ sk.cur.pts[1] = canvasPt(evs.at(-1)); skRedraw(); return; }
  let last = sk.cur.pts.at(-1);
  for (const ev of evs){
    const pt = canvasPt(ev);
    if (sk.cur.pr){
      // 펜슬은 실제 힘, 손가락·마우스는 빨리 그을수록 가늘게
      let raw = pt[2]; if (sk.cur.ptype !== 'pen'){ const dt = Math.max(1, ev.timeStamp - (sk.cur.t || ev.timeStamp - 16)); const v = Math.hypot(pt[0] - last[0], pt[1] - last[1]) / skK() / dt; raw = Math.max(0.15, Math.min(1, 1.1 - v * 0.45)); sk.cur.t = ev.timeStamp; }
      pt[2] = last[2] * 0.6 + raw * 0.4;
    }
    sk.cur.pts.push(pt); last = pt;
  }
  const a = sk.cur.pts.at(-1), b = sk.cur.pts[Math.max(0, sk.cur.pts.length - 4)];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 3 * skK()) skHoldArm();
  skRedraw();
});
$('#skCanvas').addEventListener('pointerleave', () => { $('#skCursor').hidden = true; });
const skEnd = e => {
  if (skTouch.has(e.pointerId)){
    skTouch.delete(e.pointerId);
    if (skTouch.size){ skGestureStart(); return; }
    if (skSess && Date.now() - skSess.t0 < 320 && skSess.move < 20){ if (skSess.max === 2) $('#skUndo').click(); else if (skSess.max === 3) $('#skRedo').click(); }   // 두 손가락 톡 되돌리기, 세 손가락 톡 다시
    skG = skSess = null; return;
  }
  if (!sk.cur || e.pointerId !== sk.cur.pid) return; clearTimeout(skHold);
  const st = sk.cur; sk.cur = null;
  if (st.tool === 'lasso'){
    if (st.move){ if (st.dx || st.dy) skDo({t: 'move', sts: [...sk.sel], dx: st.dx, dy: st.dy}); }
    else { const poly = sk.lasso || []; sk.lasso = null; if (poly.length > 4){ sk.sel = sk.strokes.filter(s => s.tool !== 'erase' && s.pts.filter(([x, y]) => inPoly(x, y, poly)).length >= Math.max(1, s.pts.length * 0.5)); if (!sk.sel.length) sk.sel = null; } }
    skSelUI(); skRedraw(); return;
  }
  if (st.whole){ if (st.erased.length) skDo({t: 'del', list: st.erased}); return; }
  skDo({t: 'add', st}); paintStroke(skLayer.getContext('2d'), st); skRedraw();
};
$('#skCanvas').addEventListener('pointerup', skEnd);
$('#skCanvas').addEventListener('pointercancel', skEnd);

/* ---------- 옆에 두기·새 쪽 ---------- */
// 옆에 두기: 읽는 화면을 가리지 않고 오른쪽(세로 화면은 아래)에 필기 칸을 붙인다
$('#skDock').onclick = () => { const on = !$('#sketch').classList.contains('dock'); $('#sketch').classList.toggle('dock', on); store.set('lib.skDock', on); skView(1, 0, 0); };
$('#skNewPage').onclick = async () => {
  if (skDirty() && !(await saveSketch({keep: true}))) return;
  const meta = {...sk.meta, base: null, epName: sk.meta?.epName || new Date().toLocaleDateString('ko-KR')};
  openSketch(paperCanvas(store.get('lib.paper', 'plain'), store.get('lib.paperSize', 'tall')), meta, '');
  toast('새 쪽을 열었어요. 앞 쪽은 장면 노트에 저장했어요');
};

/* ---------- 굿노트·프로크리에이트로 보내고 받기 ---------- */
// 지금 그린 그림을 파일로: 굿노트는 PDF(공유 시트 → 굿노트), 프로크리에이트는 PNG 또는 레이어가 있는 PSD(공유 시트 → 프로크리에이트)
async function skFlat(){ sk.sel = null; sk.lasso = null; skSelUI(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); const c = document.createElement('canvas'); c.width = sk.img.width; c.height = sk.img.height; const g = c.getContext('2d'); g.drawImage(sk.img, 0, 0); g.drawImage(skLayer, 0, 0); return c; }
const skMeta = () => ({workName: sk.meta?.workName || '그림', epName: sk.meta?.epName || '장면', note: $('#skNote').value});
// 앱 바로 열기: 그림을 클립보드에 복사하고 그 앱의 주소(goodnotes://, procreate://)를 불러 앱을 띄운다. 앱에서 붙여 넣기 하면 들어간다.
// 웹 앱은 다른 앱에 파일을 직접 꽂을 수 없어서 이 방식이 가장 가까운 길이다. 앱이 안 뜨면(주소를 못 알아들으면) 공유 시트로 바꾼다.
const APP_URL = {gn: ['goodnotes://', '굿노트'], pc: ['procreate://', '프로크리에이트']};
const sendMode = () => $('#sendMode')?.value || 'open';
async function openInApp(kind, canvas, file){
  const [url, label] = APP_URL[kind]; let copied = false;
  try{ await navigator.clipboard.write([new ClipboardItem({'image/png': new Promise(res => canvas.toBlob(res, 'image/png'))})]); copied = true; }catch{}
  let left = false; const onv = () => { if (document.hidden) left = true; }; document.addEventListener('visibilitychange', onv); window.addEventListener('pagehide', onv, {once: true});
  toast(copied ? `그림을 복사했어요. ${label}이 열리면 붙여 넣기 하세요` : `${label}을 여는 중…`);
  setTimeout(() => { location.href = url; }, 350);
  setTimeout(() => { document.removeEventListener('visibilitychange', onv); if (!left){ toast(`${label}이 바로 안 열려요. 공유 시트로 보낼게요`); shareFiles([file], label + '로'); } }, 2600);
}
async function skToGoodnotes(){
  const m = skMeta(); const flat = await skFlat(); const page = $('#gnPage')?.value || 'a4';
  const pg = page === 'fit' ? flat : await scrapPage(m, flat); const name = `${safeName(m.workName)}_${safeName(m.epName)}`;
  if (sendMode() === 'open'){ const b = await new Promise(r => pg.toBlob(r, 'image/png')); return openInApp('gn', pg, new File([b], name + '.png', {type: 'image/png'})); }
  const pdf = await canvasesToPdf([pg], name + '.pdf'); if (pdf) shareFiles([pdf], '굿노트로', true);
}
async function skToProcreate(){
  const m = skMeta(); const ink = sk.strokes.length ? skLayer : null;
  if (sendMode() === 'open'){
    const [W, H] = pcDims(); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const k = Math.min((W - 160) / sk.img.width, (H - 160) / sk.img.height), w = sk.img.width * k, h = sk.img.height * k; g.drawImage(sk.img, (W - w) / 2, (H - h) / 2, w, h); if (ink) g.drawImage(ink, (W - w) / 2, (H - h) / 2, w, h);
    const b = await new Promise(r => c.toBlob(r, 'image/png')); return openInApp('pc', c, new File([b], `${safeName(m.workName)}_${safeName(m.epName)}_캔버스.png`, {type: 'image/png'}));
  }
  const f = await procreateFile(m, {scene: sk.img, ink}); shareFiles([f], '프로크리에이트로', true);
}
$('#skSend').onchange = async e => { const v = e.target.value; e.target.value = ''; ({gn: skToGoodnotes, pc: skToProcreate, file: async () => { const m = skMeta(); const flat = await skFlat(); const b = await new Promise(r => flat.toBlob(r, 'image/png')); shareFiles([new File([b], `${safeName(m.workName)}_${safeName(m.epName)}.png`, {type: 'image/png'})], '그림', true); }}[v])?.(); };
// 바깥에서 그린 그림(굿노트·프로크리에이트에서 내보낸 PNG·JPG)을 이 노트의 바탕으로
$('#skImportBtn').onclick = () => $('#skImportFile').click();
$('#skImportFile').onchange = async () => {
  const f = $('#skImportFile').files[0]; $('#skImportFile').value = ''; if (!f) return;
  if (sk.strokes.length && !confirm('지금 필기는 사라지고 가져온 그림으로 바뀌어요. 계속할까요?')) return;
  let c; try{ c = (await fileToCanvases(f))[0]; }catch(e){ return toast('가져오지 못했어요 (' + e.message + ')'); }
  const meta = {...sk.meta, base: null}; const note = $('#skNote').value; await openSketch(c, meta, note, sk.editId, []); sk.moved = true; toast('가져온 그림 위에 이어서 그릴 수 있어요');
};
// 다른 앱에서 내보낸 파일을 그림(캔버스)으로: 이미지, 굿노트 PDF(쪽마다), 프로크리에이트 PSD(합쳐진 그림), .procreate(미리보기만)
let pdfjsP = null;
function loadPdfJs(){
  return pdfjsP ||= new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); }; sc.onerror = () => { pdfjsP = null; rej(new Error('PDF 도구를 불러오지 못했어요')); }; document.head.append(sc); });
}
const fitCanvas = (im, max = 3000) => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c; };
async function fileToCanvases(f){
  const n = f.name.toLowerCase();
  if (n.endsWith('.pdf')){
    const lib = await loadPdfJs(); const pdf = await lib.getDocument({data: await f.arrayBuffer()}).promise; const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 40); i++){
      const pg = await pdf.getPage(i); const base = pg.getViewport({scale: 1}); const vp = pg.getViewport({scale: Math.min(3, 2400 / Math.max(base.width, base.height))});
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({canvasContext: g, viewport: vp}).promise; out.push(c);
    }
    if (pdf.numPages > 40) toast(`쪽이 많아서 앞 40쪽만 가져왔어요 (전체 ${pdf.numPages}쪽)`);
    return out;
  }
  if (n.endsWith('.psd')) return [fitCanvas(await psdComposite(f))];
  if (n.endsWith('.procreate')){
    const z = await JSZip.loadAsync(f); const th = z.file(/(^|\/)Thumbnail\.png$/i)[0]; if (!th) throw new Error('미리보기가 없는 파일이에요');
    toast('프로크리에이트 원본은 레이어를 읽을 수 없어서 미리보기만 가져와요. 그림 전체는 프로크리에이트에서 PNG나 PSD로 내보내 주세요'); return [fitCanvas(await loadImgEl(new Blob([await th.async('arraybuffer')], {type: 'image/png'})))];
  }
  return [fitCanvas(await loadImgEl(f))];
}
async function importDrawings(files){
  let n = 0, bad = '';
  for (const f of files){
    try{
      const cs = await fileToCanvases(f); let i = 0;
      for (const c of cs){
        const tc = document.createElement('canvas'); const ts = Math.min(1, 360 / c.width); tc.width = Math.round(c.width * ts); tc.height = Math.round(c.height * ts); tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)), thumb = await new Promise(r => tc.toBlob(r, 'image/jpeg', 0.8));
        const base = f.name.replace(/\.[^.]+$/, '') || '가져온 그림';
        await idb.tx('readwrite', st => st.put({id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), work: cur?.key || '', workName: cur?.name || '내 그림', epName: cs.length > 1 ? `${base} ${++i}쪽` : base, where: {}, note: '', blob, thumb, base: null, strokes: null, t: Date.now()}), 'scraps'); n++;
      }
    }catch(e){ bad = e.message; }
  }
  if (n){ window.gdSoon?.(); renderScraps(); toast(`그림 ${n}장을 장면 노트로 가져왔어요`); } else toast(bad ? `가져오지 못했어요 (${bad})` : '그림을 읽지 못했어요');
}
$('#noteImport').onclick = () => $('#noteImportFile').click();
$('#noteImportFile').onchange = () => { const fs = [...$('#noteImportFile').files]; $('#noteImportFile').value = ''; if (fs.length) importDrawings(fs); };
async function saveSketch(opt = {}){
  sk.sel = null; sk.lasso = null; skSelUI(); skRedraw(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);   // 고른 테두리가 그림에 찍히지 않게
  const cv = $('#skCanvas');
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.88));
  const thumbC = document.createElement('canvas'); const ts = Math.min(1, 360 / cv.width); thumbC.width = Math.round(cv.width*ts); thumbC.height = Math.round(cv.height*ts); thumbC.getContext('2d').drawImage(cv, 0, 0, thumbC.width, thumbC.height);
  const thumb = await new Promise(res => thumbC.toBlob(res, 'image/jpeg', 0.8));
  const rec = {id: sk.editId || (Date.now().toString(36) + Math.random().toString(36).slice(2,6)), work: sk.meta.work, workName: sk.meta.workName, epName: sk.meta.epName, where: sk.meta.where, note: $('#skNote').value, blob, thumb, base: sk.meta.base || null, strokes: sk.strokes.map(({pid, bb, erased, ptype, t, ...st}) => st), t: Date.now()};
  if (!rec.base){ rec.base = await new Promise(res => { const c = document.createElement('canvas'); c.width = sk.img.width; c.height = sk.img.height; c.getContext('2d').drawImage(sk.img, 0, 0); c.toBlob(res, 'image/jpeg', 0.9); }); }
  try{ await idb.tx('readwrite', st => st.put(rec), 'scraps'); window.gdSoon?.(); }catch{ toast('기기 저장 공간이 부족해 저장하지 못했어요'); return null; }
  renderScraps(); if (opt.keep) return rec;
  $('#sketch').classList.remove('open'); $('#skCursor').hidden = true; toast('장면을 저장했어요'); return rec;
}
$('#skSave').onclick = () => saveSketch();
$('#skAskProv').value = store.get('lib.skAskProv', 'default');
$('#skAsk').onclick = async () => {
  const pv = $('#skAskProv').value; store.set('lib.skAskProv', pv);
  const name = PROV[provOf(pv === 'default' ? '' : '#skAskProv')]?.name || 'AI';
  if (['groq', 'ollama'].includes(provOf(pv === 'default' ? '' : '#skAskProv'))) toast(`${name}은 그림을 볼 수 있는 모델이어야 해요 (설정의 모델 칸을 확인해 주세요)`);
  const rec = await saveSketch(); if (!rec) return;
  $('#aiProv').value = pv;   // 필기 칸에서 고른 AI로 질문을 보낸다
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


