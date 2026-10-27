/* ================= 웹툰 만들기 =================
   쪽(1500 너비)마다 컷(다각형)을 깔고, 컷에 그림을 넣고, 말풍선·효과음·스티커를 얹는다.
   모든 좌표는 쪽 기준(너비 1500)으로 저장하고, 화면·내보내기에서 배율만 곱한다. */
document.body.classList.toggle('is-desktop', DESKTOP);
const WT_W = 1500;
const WT_FONT = {body: '"Pretendard Variable","Noto Sans KR",sans-serif', hand: '"Nanum Pen Script","Gowun Dodum",cursive'};
// 컷 틀: 쪽을 0~1 로 본 다각형. 'inset' 은 큰 컷 위에 겹치는 작은 확대 컷.
const WT_LAYOUTS = {
  '1':  {name: '한 컷', polys: [[[0,0],[1,0],[1,1],[0,1]]]},
  '2a': {name: '위아래 반반', polys: [[[0,0],[1,0],[1,.5],[0,.5]], [[0,.5],[1,.5],[1,1],[0,1]]]},
  '2b': {name: '위 작게', polys: [[[0,0],[1,0],[1,.36],[0,.36]], [[0,.36],[1,.36],[1,1],[0,1]]]},
  '2c': {name: '위 크게', polys: [[[0,0],[1,0],[1,.64],[0,.64]], [[0,.64],[1,.64],[1,1],[0,1]]]},
  '2d': {name: '사선 가로', polys: [[[0,0],[1,0],[1,.45],[0,.55]], [[0,.55],[1,.45],[1,1],[0,1]]]},
  '2e': {name: '사선 세로', polys: [[[0,0],[.58,0],[.44,1],[0,1]], [[.58,0],[1,0],[1,1],[.44,1]]]},
  '3a': {name: '세 칸', polys: [[[0,0],[1,0],[1,.333],[0,.333]], [[0,.333],[1,.333],[1,.667],[0,.667]], [[0,.667],[1,.667],[1,1],[0,1]]]},
  '3b': {name: '위 크게+아래 둘', polys: [[[0,0],[1,0],[1,.58],[0,.58]], [[0,.58],[.5,.58],[.5,1],[0,1]], [[.5,.58],[1,.58],[1,1],[.5,1]]]},
  '3c': {name: '왼쪽 길게', polys: [[[0,0],[.5,0],[.5,1],[0,1]], [[.5,0],[1,0],[1,.5],[.5,.5]], [[.5,.5],[1,.5],[1,1],[.5,1]]]},
  '3d': {name: '사선 세 칸', polys: [[[0,0],[1,0],[1,.27],[0,.33]], [[0,.33],[1,.27],[1,.68],[0,.74]], [[0,.74],[1,.68],[1,1],[0,1]]]},
  '4a': {name: '네 칸', polys: [[[0,0],[.5,0],[.5,.5],[0,.5]], [[.5,0],[1,0],[1,.5],[.5,.5]], [[0,.5],[.5,.5],[.5,1],[0,1]], [[.5,.5],[1,.5],[1,1],[.5,1]]]},
};
const INSET_POLY = [[.04,.03],[.4,.03],[.4,.27],[.04,.27]];
const WT_SFX_GRAD = [['#ff8a00', '#c2185b'], ['#ff4fb6', '#7b1fa2'], ['#ff3d3d', '#7a0000'], ['#4fc3f7', '#283593'], ['#ffd54f', '#e65100'], ['#ffffff', '#9e9e9e']];
const WT_TEXT_COL = ['#ffffff', '#111111', '#ffd54f', '#ff8a80'];
const WT = {list: [], proj: null, pi: 0, sel: null, hist: [], redo: [], imgs: new Map(), zoom: 1, drag: null, saveT: 0, thumbT: 0, busy: false};
const wtPage = () => WT.proj?.pages[WT.pi];

/* ---------- 보관 ---------- */
async function wtLoadList(){ try{ WT.list = (await idb.tx('readonly', s => s.getAll(), 'wt')).filter(x => x.t === 'proj').sort((a, b) => b.updated - a.updated); }catch{ WT.list = []; } }
function wtStatus(t){ const el = $('#wtSaved'); if (el) el.textContent = t; }
function wtSaveSoon(){ clearTimeout(WT.saveT); wtStatus('저장 중…'); WT.saveT = setTimeout(wtSaveNow, 800); }
async function wtSaveNow(){
  if (!WT.proj) return; WT.proj.updated = Date.now(); WT.proj.name = $('#wtName').value.trim() || WT.proj.name || '이름 없는 웹툰';
  try{ await idb.tx('readwrite', s => s.put({id: 'p:' + WT.proj.id, t: 'proj', name: WT.proj.name, updated: WT.proj.updated, data: JSON.stringify({pages: WT.proj.pages, gutter: WT.proj.gutter})}), 'wt'); wtStatus('저장됨'); }
  catch{ wtStatus('저장하지 못했어요'); }
}
async function wtPutImage(blob){
  const id = 'i:' + uid(); await idb.tx('readwrite', s => s.put({id, t: 'img', blob}), 'wt');
  WT.imgs.set(id, await createImageBitmap(blob)); return id;
}
async function wtImage(id){
  if (!id) return null; if (WT.imgs.has(id)) return WT.imgs.get(id);
  try{ const r = await idb.tx('readonly', s => s.get(id), 'wt'); if (r?.blob){ const bm = await createImageBitmap(r.blob); WT.imgs.set(id, bm); return bm; } }catch{}
  return null;
}
async function wtImageBlob(id){ try{ return (await idb.tx('readonly', s => s.get(id), 'wt'))?.blob || null; }catch{ return null; } }
// 쪽 목록에 쓰는 그림을 미리 불러 둔다(없으면 그리는 동안 비어 보인다)
async function wtPreload(){ const ids = new Set(); for (const pg of WT.proj.pages) for (const p of pg.panels) if (p.img) ids.add(p.img); await Promise.all([...ids].map(wtImage)); }

/* ---------- 쪽·컷 만들기 ---------- */
function wtNewPage(layout = '1', h = 2000){
  const L = WT_LAYOUTS[layout] || WT_LAYOUTS['1'];
  return {id: uid(), h, layout, kind: 'comic', panels: L.polys.map(poly => ({poly, img: null, view: {ox: 0, oy: 0, s: 1}, tags: '', chars: '', scene: ''})), items: []};
}
function wtApplyLayout(pg, layout){
  const L = WT_LAYOUTS[layout]; if (!L) return;
  const old = pg.panels.filter(p => !p.inset);
  const insets = pg.panels.filter(p => p.inset);
  const next = L.polys.map((poly, i) => ({poly, img: old[i]?.img || null, view: old[i]?.view || {ox: 0, oy: 0, s: 1}, tags: old[i]?.tags || '', chars: old[i]?.chars || '', scene: old[i]?.scene || ''}));
  pg.panels = [...next, ...insets]; pg.layout = layout; pg.kind = 'comic';
}
function wtNewProject(name){ return {id: uid(), name: name || '새 웹툰', pages: [wtNewPage('2a')], gutter: 'bleed', updated: Date.now()}; }

/* ---------- 도형 도우미 ---------- */
function polyPx(pg, panel){
  const H = pg.h, gut = WT.proj.gutter; let pts = panel.poly.map(([x, y]) => [x * WT_W, y * H]);
  if (panel.inset) return pts;
  if (gut === 'framed'){ const m = 46; pts = panel.poly.map(([x, y]) => [m + x * (WT_W - 2 * m), m + y * (H - 2 * m)]); pts = polyInset(pts, 16); }
  return pts;
}
function polyInset(p, d){   // 볼록 다각형 안쪽으로 d 만큼
  const n = p.length; let area = 0; for (let i = 0; i < n; i++){ const a = p[i], b = p[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1; const out = [];
  for (let i = 0; i < n; i++){
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    const nm = (u, v) => { const dx = v[0] - u[0], dy = v[1] - u[1], l = Math.hypot(dx, dy) || 1; return [-sg * dy / l, sg * dx / l]; };
    const n1 = nm(a, b), n2 = nm(b, c), k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    out.push([b[0] + d * (n1[0] + n2[0]) / k, b[1] + d * (n1[1] + n2[1]) / k]);
  }
  return out;
}
const polyBox = pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of pts){ a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
const inPolyPx = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){ const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const rnd = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function wrapLines(g, text, maxW){
  const out = [];
  for (const para of String(text || '').split('\n')){
    let line = '';
    for (const ch of para){ if (line && g.measureText(line + ch).width > maxW){ out.push(line); line = ch.trim() ? ch : ''; } else line += ch; }
    out.push(line);
  }
  return out;
}

/* ---------- 그리기: 컷 ---------- */
function drawPanels(g, pg, k){
  const order = [...pg.panels.filter(p => !p.inset), ...pg.panels.filter(p => p.inset)];
  for (const panel of order){
    const pts = polyPx(pg, panel); g.save(); g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.clip();
    const bb = polyBox(pts), bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    g.fillStyle = panel.img ? '#fff' : '#eceaf0'; g.fillRect(bb[0], bb[1], bw, bh);
    const im = panel.img ? WT.imgs.get(panel.img) : null;
    if (im){
      const s0 = Math.max(bw / im.width, bh / im.height), s = s0 * (panel.view.s || 1), w = im.width * s, h = im.height * s;
      const x = bb[0] + (bw - w) / 2 + (panel.view.ox || 0) * bw, y = bb[1] + (bh - h) / 2 + (panel.view.oy || 0) * bh;
      g.drawImage(im, x, y, w, h);
    } else if (!WT.exporting){ g.fillStyle = '#b9b5c4'; g.font = `600 ${Math.round(bw * 0.045)}px ${WT_FONT.body}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('그림 없음', bb[0] + bw / 2, bb[1] + bh / 2); }
    g.restore();
    // 꽉 차게: 쪽 가장자리에는 선을 긋지 않고 컷 사이 선만 긋는다(참고 자료처럼). 여백 있게·작은 컷은 테두리를 다 긋는다
    const full = panel.inset || WT.proj.gutter === 'framed';
    g.save(); g.lineJoin = 'miter'; g.lineCap = 'butt'; g.strokeStyle = '#111'; g.lineWidth = panel.inset ? 9 : (full ? 7 : 12);
    const onEdge = (a, b) => (a[0] < 1.5 && b[0] < 1.5) || (a[0] > WT_W - 1.5 && b[0] > WT_W - 1.5) || (a[1] < 1.5 && b[1] < 1.5) || (a[1] > pg.h - 1.5 && b[1] > pg.h - 1.5);
    if (full){ g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); }
    else for (let i = 0; i < pts.length; i++){ const a = pts[i], b = pts[(i + 1) % pts.length]; if (onEdge(a, b)) continue; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    g.restore();
  }
}

/* ---------- 그리기: 말풍선·글·효과음·스티커 ---------- */
const BUB_BW = 6;
function bubbleGeom(g, b){
  const size = b.size || 42; g.font = `800 ${size}px ${WT_FONT.body}`;
  const lines = wrapLines(g, b.text, b.w || 330), lh = size * 1.3, tw = Math.max(40, ...lines.map(l => g.measureText(l).width)), th = lines.length * lh;
  if (b.shape === 'box') return {lines, lh, size, rx: tw / 2 + size * 0.7, ry: th / 2 + size * 0.55, tw, th};
  return {lines, lh, size, rx: tw / 2 * 1.22 + size * 0.75, ry: th / 2 * 1.18 + size * 0.62, tw, th};
}
function bubbleOutline(g, b, geo){
  const {rx, ry} = geo, n = 18;
  g.beginPath();
  if (b.shape === 'shout'){
    const r = rnd(hash(b.id || b.text)); const m = 22;
    for (let i = 0; i < m * 2; i++){ const a = i / (m * 2) * Math.PI * 2, kk = i % 2 ? 0.86 : 1.18 + r() * 0.1; const x = b.x + Math.cos(a) * rx * kk * 1.08, y = b.y + Math.sin(a) * ry * kk * 1.08; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); return;
  }
  if (b.shape === 'thought'){
    for (let i = 0; i <= n; i++){
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const x0 = b.x + Math.cos(a0) * rx, y0 = b.y + Math.sin(a0) * ry, x1 = b.x + Math.cos(a1) * rx, y1 = b.y + Math.sin(a1) * ry;
      const cx = b.x + Math.cos(am) * rx * 1.2, cy = b.y + Math.sin(am) * ry * 1.2;
      if (!i) g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1);
    }
    g.closePath(); return;
  }
  g.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI * 2);
}
function tailPath(g, b, geo, tx, ty){
  const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const ang = Math.atan2(dy / geo.ry, dx / geo.rx), spread = 0.34;
  const p1 = [b.x + Math.cos(ang - spread) * geo.rx * 0.92, b.y + Math.sin(ang - spread) * geo.ry * 0.92];
  const p2 = [b.x + Math.cos(ang + spread) * geo.rx * 0.92, b.y + Math.sin(ang + spread) * geo.ry * 0.92];
  g.beginPath(); g.moveTo(p1[0], p1[1]);
  g.quadraticCurveTo((p1[0] + tx) / 2 - uy * 14, (p1[1] + ty) / 2 + ux * 14, tx, ty);
  g.quadraticCurveTo((p2[0] + tx) / 2 + uy * 6, (p2[1] + ty) / 2 - ux * 6, p2[0], p2[1]); g.closePath();
}
function drawBubble(g, b){
  const geo = bubbleGeom(g, b); b._hw = geo.rx; b._hh = geo.ry;
  if (b.shape === 'box'){
    g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = BUB_BW; g.fillRect(b.x - geo.rx, b.y - geo.ry, geo.rx * 2, geo.ry * 2); g.strokeRect(b.x - geo.rx, b.y - geo.ry, geo.rx * 2, geo.ry * 2);
  } else {
    const hasTail = b.tail && b.shape !== 'shout';
    g.lineJoin = 'round'; g.fillStyle = '#fff'; g.strokeStyle = '#111';
    if (b.shape === 'whisper') g.setLineDash([16, 12]);
    g.lineWidth = BUB_BW * 2; bubbleOutline(g, b, geo); g.stroke();
    if (hasTail && b.shape !== 'thought'){ tailPath(g, b, geo, b.tail.x, b.tail.y); g.stroke(); }
    g.setLineDash([]);
    bubbleOutline(g, b, geo); g.fill();
    if (hasTail && b.shape !== 'thought'){ tailPath(g, b, geo, b.tail.x, b.tail.y); g.fill(); }
    if (hasTail && b.shape === 'thought'){   // 구름은 작은 동그라미 세 개가 꼬리를 대신한다
      const dx = b.tail.x - b.x, dy = b.tail.y - b.y, a = Math.atan2(dy / geo.ry, dx / geo.rx), sx = b.x + Math.cos(a) * geo.rx * 1.05, sy = b.y + Math.sin(a) * geo.ry * 1.05;
      [[0.3, 20], [0.62, 14], [0.92, 9]].forEach(([t, r]) => { const cx = sx + (b.tail.x - sx) * t, cy = sy + (b.tail.y - sy) * t; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 5; g.stroke(); });
    }
  }
  g.fillStyle = b.shape === 'whisper' ? '#555' : '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `${b.shape === 'shout' ? 900 : 800} ${geo.size}px ${WT_FONT.body}`;
  const y0 = b.y - (geo.lines.length - 1) * geo.lh / 2; geo.lines.forEach((l, i) => g.fillText(l, b.x, y0 + i * geo.lh));
}
function drawOutlined(g, t){
  const size = t.size || 46; g.font = `800 ${size}px ${WT_FONT.body}`; const lines = wrapLines(g, t.text, t.w || 420), lh = size * 1.28;
  t._hw = Math.max(30, ...lines.map(l => g.measureText(l).width)) / 2 + 8; t._hh = lines.length * lh / 2 + 6;
  g.save(); g.translate(t.x, t.y); g.rotate((t.rot || 0) * Math.PI / 180); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const y0 = -(lines.length - 1) * lh / 2; const light = (t.color || '#fff') !== '#111111';
  lines.forEach((l, i) => { g.lineWidth = size * 0.26; g.strokeStyle = light ? '#111' : '#fff'; g.strokeText(l, 0, y0 + i * lh); g.fillStyle = t.color || '#fff'; g.fillText(l, 0, y0 + i * lh); });
  g.restore();
}
function drawSfx(g, s){
  const size = s.size || 120, font = s.font || 'Black Han Sans', chars = [...String(s.text || '')]; if (!chars.length){ s._hw = s._hh = 30; return; }
  const r = rnd(hash(s.text)); g.save(); g.translate(s.x, s.y); g.rotate((s.rot || 0) * Math.PI / 180);
  g.font = `900 ${size}px "${font}",${WT_FONT.body}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const cells = chars.map((ch, i) => ({ch, sc: 0.86 + r() * 0.3, dx: (r() - 0.5) * size * 0.12, dy: (r() - 0.5) * size * 0.05, rot: (r() - 0.5) * 0.28}));
  const adv = c => g.measureText(c.ch).width * c.sc * 0.98;
  let W, Hh;
  if (s.vert){ Hh = size * 0.98 * cells.length; W = size * 1.15; let y = -Hh / 2 + size * 0.5; cells.forEach(c => { c.px = c.dx; c.py = y + c.dy; y += size * 0.98; }); }
  else { W = cells.reduce((a, c) => a + adv(c), 0); Hh = size * 1.1; let x = -W / 2; cells.forEach(c => { const w = adv(c); c.px = x + w / 2; c.py = c.dy; x += w; }); }
  s._hw = W / 2 + size * 0.2; s._hh = Hh / 2 + size * 0.1;
  const gr = WT_SFX_GRAD[s.grad ?? 0] || WT_SFX_GRAD[0]; const grad = g.createLinearGradient(0, -Hh / 2, 0, Hh / 2); grad.addColorStop(0, gr[0]); grad.addColorStop(1, gr[1]);
  for (const pass of [0, 1, 2]){
    for (const c of cells){
      g.save(); g.translate(c.px, c.py); g.rotate(c.rot); g.scale(c.sc, c.sc);
      if (pass === 0){ g.lineWidth = size * 0.34; g.strokeStyle = '#fff'; g.strokeText(c.ch, 0, 0); }
      else if (pass === 1){ g.lineWidth = size * 0.17; g.strokeStyle = gr[1] === '#9e9e9e' ? '#555' : '#3a0830'; g.strokeText(c.ch, 0, 0); }
      else { g.fillStyle = grad; g.fillText(c.ch, 0, 0); }
      g.restore();
    }
  }
  g.restore();
}
function starPath(g, n, ro, ri, seed){ const r = rnd(seed); g.beginPath(); for (let i = 0; i < n * 2; i++){ const a = i / (n * 2) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? ri : ro * (0.92 + r() * 0.16); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
function drawSticker(g, s){
  const sz = s.size || 120; s._hw = s._hh = sz * 0.6;
  g.save(); g.translate(s.x, s.y); g.rotate((s.rot || 0) * Math.PI / 180); g.lineJoin = 'round';
  if (s.kind === 'sweat'){
    s._hw = sz * 0.5; s._hh = sz * 0.6;
    [[0, 0, 1], [sz * 0.5, sz * 0.34, 0.7], [-sz * 0.3, sz * 0.5, 0.55]].forEach(([dx, dy, k]) => { g.save(); g.translate(dx, dy); g.scale(k, k); g.beginPath(); g.moveTo(0, -sz * 0.4); g.bezierCurveTo(sz * 0.34, sz * 0.02, sz * 0.28, sz * 0.36, 0, sz * 0.36); g.bezierCurveTo(-sz * 0.28, sz * 0.36, -sz * 0.34, sz * 0.02, 0, -sz * 0.4); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#1a2840'; g.stroke(); g.beginPath(); g.arc(-sz * 0.08, sz * 0.12, sz * 0.06, 0, 7); g.fillStyle = '#bcd6ef'; g.fill(); g.restore(); });
  } else if (s.kind === 'burst'){
    starPath(g, 9, sz * 0.62, sz * 0.26, hash('b' + Math.round(s.x))); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#111'; g.stroke();
  } else if (s.kind === 'heart'){
    const p = () => { g.beginPath(); g.moveTo(0, sz * 0.34); g.bezierCurveTo(-sz * 0.7, -sz * 0.1, -sz * 0.36, -sz * 0.5, 0, -sz * 0.18); g.bezierCurveTo(sz * 0.36, -sz * 0.5, sz * 0.7, -sz * 0.1, 0, sz * 0.34); g.closePath(); };
    p(); g.lineWidth = sz * 0.2; g.strokeStyle = '#fff'; g.stroke(); const gr = g.createLinearGradient(0, -sz * 0.4, 0, sz * 0.4); gr.addColorStop(0, '#ff9a3c'); gr.addColorStop(1, '#e91e63'); g.fillStyle = gr; g.fill(); g.lineWidth = 4; g.strokeStyle = '#7a0d3a'; g.stroke();
  } else if (s.kind === 'speed'){
    s._hw = s._hh = sz * 0.9; const r = rnd(hash('s' + Math.round(s.x + s.y))); g.fillStyle = '#111';
    for (let i = 0; i < 70; i++){ const a = r() * Math.PI * 2, r0 = sz * (0.55 + r() * 0.2), r1 = sz * (1.0 + r() * 0.55), w = 0.012 + r() * 0.02; g.beginPath(); g.moveTo(Math.cos(a - w) * r1, Math.sin(a - w) * r1); g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a + w) * r1, Math.sin(a + w) * r1); g.closePath(); g.fill(); }
  }
  g.restore();
}
function drawItem(g, it){ ({speech: drawBubble, thought: drawBubble, shout: drawBubble, whisper: drawBubble, narr: drawBubble, text: drawOutlined, sfx: drawSfx, stk: drawSticker})[it.k === 'bubble' ? it.shape === 'box' ? 'narr' : it.shape : it.k]?.(g, it); }

/* ---------- 쪽 한 장 그리기 ---------- */
function wtRenderPage(g, pg, k, opts = {}){
  g.save(); g.scale(k, k); g.fillStyle = '#fff'; g.fillRect(0, 0, WT_W, pg.h);
  if (pg.kind === 'text'){ /* 글 쪽: 바탕만 */ } else drawPanels(g, pg, k);
  for (const it of pg.items) drawItem(g, it);
  if (opts.ui) wtDrawUI(g, pg);
  g.restore();
}
function wtDrawUI(g, pg){
  const sel = WT.sel; if (!sel) return;
  g.save(); g.lineJoin = 'round'; g.setLineDash([16, 10]); g.lineWidth = 4; g.strokeStyle = '#2f6df6';
  if (sel.t === 'panel'){ const p = pg.panels[sel.i]; if (p){ const pts = polyPx(pg, p); g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.stroke(); } }
  else if (sel.t === 'item'){
    const it = pg.items[sel.i]; if (it){
      g.translate(it.x, it.y); g.rotate((it.rot || 0) * Math.PI / 180);
      const hw = it._hw || 40, hh = it._hh || 40; g.strokeRect(-hw, -hh, hw * 2, hh * 2); g.setLineDash([]);
      g.fillStyle = '#fff'; g.strokeStyle = '#2f6df6'; g.lineWidth = 4;
      for (const [hx, hy] of [[hw, hh]]){ g.beginPath(); g.rect(hx - 14, hy - 14, 28, 28); g.fill(); g.stroke(); }
      if (it.k !== 'bubble'){ g.beginPath(); g.moveTo(0, -hh); g.lineTo(0, -hh - 36); g.stroke(); g.beginPath(); g.arc(0, -hh - 48, 13, 0, 7); g.fill(); g.stroke(); }
      g.rotate(-(it.rot || 0) * Math.PI / 180); g.translate(-it.x, -it.y);
      if (it.k === 'bubble' && it.tail){ g.beginPath(); g.arc(it.tail.x, it.tail.y, 14, 0, 7); g.fillStyle = '#2f6df6'; g.fill(); }
    }
  }
  g.restore();
}

/* ---------- 화면 ---------- */
let wtRaf = 0;
function wtRender(){
  cancelAnimationFrame(wtRaf);
  wtRaf = requestAnimationFrame(() => {
    const pg = wtPage(); if (!pg) return; const cv = $('#wtCv'), box = $('#wtScroll');
    const fitW = Math.max(240, box.clientWidth - 28), fitH = Math.max(240, box.clientHeight - 28);
    const base = Math.min(fitW / WT_W, fitH / pg.h), css = base * WT.zoom, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = Math.round(WT_W * css) + 'px'; cv.style.height = Math.round(pg.h * css) + 'px';
    const k = Math.min(1.2, css * dpr); cv.width = Math.round(WT_W * k); cv.height = Math.round(pg.h * k);
    wtRenderPage(cv.getContext('2d'), pg, k, {ui: true}); WT.k = k; WT.css = css;
    clearTimeout(WT.thumbT); WT.thumbT = setTimeout(wtThumbs, 350);
  });
}
function wtThumbs(){
  const box = $('#wtPages'); const cvs = box.querySelectorAll('canvas'); if (!WT.proj) return;
  WT.proj.pages.forEach((pg, i) => { const cv = cvs[i]; if (!cv) return; const k = 190 / WT_W; cv.width = 190; cv.height = Math.round(pg.h * k); wtRenderPage(cv.getContext('2d'), pg, k); });
}
function wtBuildPages(){
  const box = $('#wtPages'); box.innerHTML = '';
  WT.proj.pages.forEach((pg, i) => {
    const d = document.createElement('div'); d.className = 'pg' + (i === WT.pi ? ' on' : ''); d.innerHTML = `<canvas></canvas><b>${i + 1}</b>`;
    d.onclick = () => { WT.pi = i; WT.sel = null; wtBuildPages(); wtSideSync(); wtRender(); }; box.append(d);
  });
  const bt = document.createElement('div'); bt.className = 'pgbtns';
  bt.innerHTML = '<button data-a="add">+ 쪽</button><button data-a="dup">복제</button><button data-a="up">↑</button><button data-a="down">↓</button><button data-a="del" class="danger">삭제</button>';
  bt.onclick = e => { const a = e.target.dataset.a; if (a) wtPageOp(a); }; box.append(bt);
  setTimeout(wtThumbs, 30);
}
function wtPageOp(a){
  const ps = WT.proj.pages, i = WT.pi, cur = ps[i];
  if (a === 'add') ps.splice(i + 1, 0, wtNewPage('2a', cur?.h || 2000)), WT.pi = i + 1;
  else if (a === 'dup') ps.splice(i + 1, 0, {...JSON.parse(JSON.stringify(cur)), id: uid()}), WT.pi = i + 1;
  else if (a === 'up' && i > 0){ [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]]; WT.pi = i - 1; }
  else if (a === 'down' && i < ps.length - 1){ [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]]; WT.pi = i + 1; }
  else if (a === 'del'){ if (ps.length < 2) return toast('쪽이 하나는 있어야 해요'); if (!confirm('이 쪽을 지울까요?')) return; ps.splice(i, 1); WT.pi = Math.max(0, i - 1); }
  WT.sel = null; wtCommit(); wtBuildPages(); wtSideSync(); wtRender();
}

/* ---------- 되돌리기 ---------- */
const wtSnap = () => JSON.stringify({pages: WT.proj.pages, gutter: WT.proj.gutter});
function wtCommit(){ const s = wtSnap(); if (WT.hist.at(-1) === s) return; WT.hist.push(s); if (WT.hist.length > 80) WT.hist.shift(); WT.redo = []; wtSaveSoon(); }
function wtRestore(s){ const d = JSON.parse(s); WT.proj.pages = d.pages; WT.proj.gutter = d.gutter; WT.pi = Math.min(WT.pi, d.pages.length - 1); WT.sel = null; wtBuildPages(); wtSideSync(); wtRender(); wtSaveSoon(); }
$('#wtUndo').onclick = () => { if (WT.hist.length < 2) return; WT.redo.push(WT.hist.pop()); wtRestore(WT.hist.at(-1)); };
$('#wtRedo').onclick = () => { const s = WT.redo.pop(); if (!s) return; WT.hist.push(s); wtRestore(s); };

/* ---------- 옆 칸(선택에 맞춰 보이기) ---------- */
function wtSideSync(){
  const pg = wtPage(); if (!pg) return;
  $('#wtSize').value = String(pg.h); $('#wtGutter').value = WT.proj.gutter || 'bleed';
  $$('#wtLayouts button').forEach(b => b.classList.toggle('on', b.dataset.l === pg.layout));
  const sel = WT.sel, panel = sel?.t === 'panel' ? pg.panels[sel.i] : null, it = sel?.t === 'item' ? pg.items[sel.i] : null;
  $('#wtPanelSec').hidden = !panel; $('#wtItemSec').hidden = !it;
  if (panel){ $('#wtPanelTags').value = panel.tags || ''; $('#wtPanelChars').value = panel.chars || ''; }
  if (it){
    const textual = ['bubble', 'text', 'sfx'].includes(it.k); $('#wtText').hidden = !textual; $('#wtText').value = it.text || '';
    $('#wtSizeR').value = it.size || 100; $('#wtSizeO').textContent = it.size || 100; $('#wtRot').value = it.rot || 0; $('#wtRotO').textContent = (it.rot || 0) + '°';
    $('#wtRotRow').hidden = it.k === 'bubble'; $('#wtShapeRow').hidden = !(it.k === 'bubble' && it.shape !== 'box');
    $('#wtShape').value = it.shape || 'speech'; $('#wtTail').checked = !!it.tail;
    $('#wtColorRow').hidden = !['sfx', 'text'].includes(it.k); $('#wtVertRow').hidden = it.k !== 'sfx';
    $('#wtVert').checked = !!it.vert; $('#wtFont').value = it.font || 'Black Han Sans';
    const sw = $('#wtSw'); sw.innerHTML = '';
    if (it.k === 'sfx') WT_SFX_GRAD.forEach((g2, i) => { const b = document.createElement('button'); b.style.background = `linear-gradient(${g2[0]},${g2[1]})`; b.className = (it.grad ?? 0) === i ? 'on' : ''; b.onclick = () => { it.grad = i; wtCommit(); wtSideSync(); wtRender(); }; sw.append(b); });
    else if (it.k === 'text') WT_TEXT_COL.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.className = (it.color || '#ffffff') === c ? 'on' : ''; b.onclick = () => { it.color = c; wtCommit(); wtSideSync(); wtRender(); }; sw.append(b); });
  }
}
function wtBuildLayouts(){
  const box = $('#wtLayouts'); box.innerHTML = '';
  for (const [key, L] of Object.entries(WT_LAYOUTS)){
    const b = document.createElement('button'); b.dataset.l = key; b.title = L.name;
    b.innerHTML = `<svg viewBox="0 0 40 52">${L.polys.map(p => `<polygon points="${p.map(([x, y]) => `${(2 + x * 36).toFixed(1)},${(2 + y * 48).toFixed(1)}`).join(' ')}" fill="#d9d6e0" stroke="#111" stroke-width="1.6"/>`).join('')}</svg>`;
    b.onclick = () => { const pg = wtPage(); wtApplyLayout(pg, key); WT.sel = null; wtCommit(); wtSideSync(); wtRender(); }; box.append(b);
  }
}

/* ---------- 마우스·손가락 ---------- */
function wtPt(e){ const cv = $('#wtCv'), r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * WT_W, (e.clientY - r.top) / r.height * wtPage().h]; }
function localPt(it, x, y){ const a = -(it.rot || 0) * Math.PI / 180, dx = x - it.x, dy = y - it.y; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
function wtHit(pg, x, y){
  for (let i = pg.items.length - 1; i >= 0; i--){ const it = pg.items[i]; const [lx, ly] = localPt(it, x, y); if (Math.abs(lx) <= (it._hw || 40) && Math.abs(ly) <= (it._hh || 40)) return {t: 'item', i}; }
  const order = pg.panels.map((p, i) => [p, i]).sort((a, b) => (b[0].inset ? 1 : 0) - (a[0].inset ? 1 : 0));
  for (const [p, i] of order) if (inPolyPx(x, y, polyPx(pg, p))) return {t: 'panel', i};
  return null;
}
$('#wtCv').addEventListener('pointerdown', e => {
  const pg = wtPage(); if (!pg) return; e.preventDefault(); try{ $('#wtCv').setPointerCapture(e.pointerId); }catch{}
  const [x, y] = wtPt(e), sel = WT.sel;
  if (sel?.t === 'item'){
    const it = pg.items[sel.i];
    if (it){
      if (it.k === 'bubble' && it.tail && Math.hypot(x - it.tail.x, y - it.tail.y) < 30){ WT.drag = {m: 'tail'}; return; }
      const [lx, ly] = localPt(it, x, y), hw = it._hw || 40, hh = it._hh || 40;
      if (Math.abs(lx - hw) < 26 && Math.abs(ly - hh) < 26){ WT.drag = {m: 'size', s0: it.size || (it.k === 'sfx' ? 120 : 42), d0: Math.hypot(lx, ly), w0: it.w || 330}; return; }
      if (it.k !== 'bubble' && Math.hypot(lx, ly + hh + 48) < 28){ WT.drag = {m: 'rot'}; return; }
    }
  }
  const h = wtHit(pg, x, y); WT.sel = h; wtSideSync();
  if (h?.t === 'item'){ const it = pg.items[h.i]; WT.drag = {m: 'move', dx: x - it.x, dy: y - it.y, tx: it.tail ? it.tail.x - it.x : 0, ty: it.tail ? it.tail.y - it.y : 0}; }
  else if (h?.t === 'panel'){ const p = pg.panels[h.i], bb = polyBox(polyPx(pg, p)); WT.drag = {m: 'pan', x, y, ox: p.view.ox || 0, oy: p.view.oy || 0, bw: bb[2] - bb[0], bh: bb[3] - bb[1]}; }
  else WT.drag = null;
  wtRender();
});
$('#wtCv').addEventListener('pointermove', e => {
  const d = WT.drag, pg = wtPage(); if (!d || !pg) return; const [x, y] = wtPt(e), sel = WT.sel;
  if (d.m === 'pan'){ const p = pg.panels[sel.i]; p.view.ox = d.ox + (x - d.x) / d.bw; p.view.oy = d.oy + (y - d.y) / d.bh; d.moved = true; }
  else {
    const it = pg.items[sel.i]; if (!it) return;
    if (d.m === 'move'){ it.x = x - d.dx; it.y = y - d.dy; if (it.tail){ it.tail.x = it.x + d.tx; it.tail.y = it.y + d.ty; } }
    else if (d.m === 'tail'){ it.tail.x = x; it.tail.y = y; }
    else if (d.m === 'size'){ const [lx, ly] = localPt(it, x, y); const k = Math.max(0.2, Math.hypot(lx, ly) / (d.d0 || 1)); if (it.k === 'bubble'){ it.size = Math.max(16, Math.min(160, Math.round(d.s0 * k))); it.w = Math.max(120, Math.round(d.w0 * k)); } else it.size = Math.max(16, Math.min(300, Math.round(d.s0 * k))); wtSideSync(); }
    else if (d.m === 'rot'){ it.rot = Math.max(-90, Math.min(90, Math.round(Math.atan2(x - it.x, -(y - it.y)) * 180 / Math.PI))); wtSideSync(); }
    d.moved = true;
  }
  wtRender();
});
const wtUp = () => { if (WT.drag?.moved) wtCommit(); WT.drag = null; };
$('#wtCv').addEventListener('pointerup', wtUp); $('#wtCv').addEventListener('pointercancel', wtUp);
$('#wtCv').addEventListener('wheel', e => {
  const pg = wtPage(); if (!pg) return; const [x, y] = wtPt(e), h = wtHit(pg, x, y);
  if (e.ctrlKey || e.metaKey){ e.preventDefault(); WT.zoom = Math.max(0.4, Math.min(4, WT.zoom * Math.exp(-e.deltaY * 0.01))); wtRender(); return; }
  if (h?.t === 'panel'){ e.preventDefault(); const p = pg.panels[h.i]; p.view.s = Math.max(1, Math.min(6, (p.view.s || 1) * Math.exp(-e.deltaY * 0.0015))); WT.sel = h; wtSideSync(); wtRender(); clearTimeout(WT.wheelT); WT.wheelT = setTimeout(wtCommit, 300); }
}, {passive: false});
$('#wtZoomIn').onclick = () => { WT.zoom = Math.min(4, WT.zoom * 1.25); wtRender(); };
$('#wtZoomOut').onclick = () => { WT.zoom = Math.max(0.4, WT.zoom / 1.25); wtRender(); };
$('#wtFit').onclick = () => { WT.zoom = 1; wtRender(); };
window.addEventListener('resize', () => { if (!$('#wt').hidden) wtRender(); });
document.addEventListener('keydown', e => {
  if ($('#wt').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const pg = wtPage(); const sel = WT.sel;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){ e.preventDefault(); (e.shiftKey ? $('#wtRedo') : $('#wtUndo')).click(); return; }
  if (sel?.t === 'item' && (e.key === 'Delete' || e.key === 'Backspace')){ e.preventDefault(); $('#wtDel').click(); return; }
  if (sel?.t === 'item'){ const it = pg.items[sel.i], st = e.shiftKey ? 20 : 4; const mv = {ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st]}[e.key]; if (mv && it){ e.preventDefault(); it.x += mv[0]; it.y += mv[1]; if (it.tail){ it.tail.x += mv[0]; it.tail.y += mv[1]; } wtRender(); clearTimeout(WT.keyT); WT.keyT = setTimeout(wtCommit, 400); } }
});

/* ---------- 글·효과 넣기와 고치기 ---------- */
function wtCenterFor(pg){ const s = WT.sel; if (s?.t === 'panel'){ const bb = polyBox(polyPx(pg, pg.panels[s.i])); return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, bb]; } return [WT_W / 2, pg.h / 2, [0, 0, WT_W, pg.h]]; }
function wtAddItem(kind, at){
  const pg = wtPage(), [cx, cy] = at || wtCenterFor(pg); let it;
  if (['speech', 'thought', 'shout', 'whisper'].includes(kind)) it = {k: 'bubble', shape: kind, x: cx, y: cy, size: 42, w: 330, text: kind === 'shout' ? '뭐라고!' : '대사를 적어 주세요', tail: kind === 'shout' ? null : {x: cx + 40, y: cy + 150}};
  else if (kind === 'narr') it = {k: 'bubble', shape: 'box', x: cx, y: cy, size: 40, w: 520, text: '설명을 적어 주세요', tail: null};
  else if (kind === 'text') it = {k: 'text', x: cx, y: cy, size: 52, w: 520, text: '속마음을 적어 주세요', color: '#ffffff', rot: 0};
  else if (kind === 'sfx') it = {k: 'sfx', x: cx, y: cy, size: 150, text: '두근', grad: 0, rot: -10, vert: false, font: 'Black Han Sans'};
  else it = {k: 'stk', kind, x: cx, y: cy, size: kind === 'speed' ? 260 : 130, rot: 0};
  it.id = uid(); pg.items.push(it); WT.sel = {t: 'item', i: pg.items.length - 1}; wtCommit(); wtSideSync(); wtRender(); return it;
}
$('#wtAdd').onclick = e => { const k = e.target.dataset.add; if (k) wtAddItem(k); };
const wtItem = () => { const s = WT.sel; return s?.t === 'item' ? wtPage().items[s.i] : null; };
$('#wtText').oninput = () => { const it = wtItem(); if (!it) return; it.text = $('#wtText').value; wtRender(); clearTimeout(WT.txT); WT.txT = setTimeout(wtCommit, 500); };
$('#wtSizeR').oninput = () => { const it = wtItem(); if (!it) return; it.size = +$('#wtSizeR').value; $('#wtSizeO').textContent = it.size; if (it.k === 'bubble') it.w = Math.round(it.size * 7.8); wtRender(); clearTimeout(WT.txT); WT.txT = setTimeout(wtCommit, 400); };
$('#wtRot').oninput = () => { const it = wtItem(); if (!it) return; it.rot = +$('#wtRot').value; $('#wtRotO').textContent = it.rot + '°'; wtRender(); clearTimeout(WT.txT); WT.txT = setTimeout(wtCommit, 400); };
$('#wtShape').onchange = () => { const it = wtItem(); if (!it) return; it.shape = $('#wtShape').value; wtCommit(); wtRender(); };
$('#wtTail').onchange = () => { const it = wtItem(); if (!it) return; it.tail = $('#wtTail').checked ? {x: it.x + 40, y: it.y + 150} : null; wtCommit(); wtRender(); };
$('#wtVert').onchange = () => { const it = wtItem(); if (!it) return; it.vert = $('#wtVert').checked; wtCommit(); wtRender(); };
$('#wtFont').onchange = () => { const it = wtItem(); if (!it) return; it.font = $('#wtFont').value; document.fonts?.load(`900 40px "${it.font}"`, '가나다').then(wtRender).catch(() => {}); wtCommit(); wtRender(); };
$('#wtDup').onclick = () => { const it = wtItem(); if (!it) return; const c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.x += 50; c.y += 50; if (c.tail){ c.tail.x += 50; c.tail.y += 50; } wtPage().items.push(c); WT.sel = {t: 'item', i: wtPage().items.length - 1}; wtCommit(); wtSideSync(); wtRender(); };
$('#wtDel').onclick = () => { const s = WT.sel; if (s?.t !== 'item') return; wtPage().items.splice(s.i, 1); WT.sel = null; wtCommit(); wtSideSync(); wtRender(); };
$('#wtFront').onclick = () => { const s = WT.sel, pg = wtPage(); if (s?.t !== 'item') return; const [it] = pg.items.splice(s.i, 1); pg.items.push(it); WT.sel = {t: 'item', i: pg.items.length - 1}; wtCommit(); wtRender(); };

/* ---------- 쪽·컷 설정 ---------- */
$('#wtSize').onchange = () => { const pg = wtPage(); pg.h = +$('#wtSize').value; wtCommit(); wtBuildPages(); wtRender(); };
$('#wtGutter').onchange = () => { WT.proj.gutter = $('#wtGutter').value; wtCommit(); wtRender(); };
$('#wtAddInset').onclick = () => { const pg = wtPage(); pg.panels.push({poly: INSET_POLY, inset: true, img: null, view: {ox: 0, oy: 0, s: 1}, tags: '', chars: '', scene: ''}); WT.sel = {t: 'panel', i: pg.panels.length - 1}; wtCommit(); wtSideSync(); wtRender(); };
$('#wtPageText').onclick = () => { const pg = wtPage(); pg.kind = pg.kind === 'text' ? 'comic' : 'text'; if (pg.kind === 'text' && !pg.items.some(i => i.k === 'text')){ const it = wtAddItem('text', [WT_W / 2, pg.h / 2]); it.color = '#111111'; it.size = 78; it.text = '제목이나 글을\n적어 주세요'; } WT.sel = null; wtCommit(); wtSideSync(); wtRender(); };
$('#wtPanelTags').oninput = () => { const s = WT.sel; if (s?.t === 'panel'){ wtPage().panels[s.i].tags = $('#wtPanelTags').value; clearTimeout(WT.txT); WT.txT = setTimeout(wtCommit, 600); } };
$('#wtPanelChars').oninput = () => { const s = WT.sel; if (s?.t === 'panel'){ wtPage().panels[s.i].chars = $('#wtPanelChars').value; clearTimeout(WT.txT); WT.txT = setTimeout(wtCommit, 600); } };
$('#wtImgReset').onclick = () => { const s = WT.sel; if (s?.t === 'panel'){ wtPage().panels[s.i].view = {ox: 0, oy: 0, s: 1}; wtCommit(); wtRender(); } };
$('#wtImgClear').onclick = () => { const s = WT.sel; if (s?.t === 'panel'){ wtPage().panels[s.i].img = null; wtCommit(); wtRender(); } };
$('#wtPanelDel').onclick = () => { const s = WT.sel, pg = wtPage(); if (s?.t !== 'panel') return; if (pg.panels.filter(p => !p.inset).length < 2 && !pg.panels[s.i].inset) return toast('컷을 바꾸려면 위의 틀을 골라 주세요'); pg.panels.splice(s.i, 1); WT.sel = null; wtCommit(); wtSideSync(); wtRender(); };
async function wtSetPanelImage(blob, idx){
  const pg = wtPage(), s = idx ?? (WT.sel?.t === 'panel' ? WT.sel.i : pg.panels.findIndex(p => !p.img)); if (s < 0 || !pg.panels[s]) return toast('컷을 먼저 골라 주세요');
  const id = await wtPutImage(blob); pg.panels[s].img = id; pg.panels[s].view = {ox: 0, oy: 0, s: 1}; WT.sel = {t: 'panel', i: s}; wtCommit(); wtSideSync(); wtRender();
}
$('#wtImgFile').onclick = () => { if (WT.sel?.t !== 'panel') return toast('컷을 먼저 눌러 골라 주세요'); $('#wtImgInput').click(); };
$('#wtImgInput').onchange = async () => { const f = $('#wtImgInput').files[0]; $('#wtImgInput').value = ''; if (f) await wtSetPanelImage(f); };
$('#wtImgScrap').onclick = async () => {
  if (WT.sel?.t !== 'panel') return toast('컷을 먼저 눌러 골라 주세요');
  let all = []; try{ all = (await idb.tx('readonly', st => st.getAll(), 'scraps')).sort((a, b) => b.t - a.t); }catch{}
  if (!all.length) return toast('장면 노트에 그림이 없어요');
  const old = $('#wtPick'); old?.remove();
  const box = document.createElement('div'); box.id = 'wtPick'; box.className = 'wt-modal'; box.innerHTML = '<div class="wt-modalbox"><div class="shh"><b>장면 노트에서 고르기</b><button class="icon" data-x title="닫기"><svg class="i"><use href="#i-x"/></svg></button></div><div class="grid" style="grid-template-columns:repeat(3,1fr)"></div></div>';
  const grid = box.querySelector('.grid');
  for (const x of all.slice(0, 60)){ const d = document.createElement('div'); d.className = 'card'; d.style.cursor = 'pointer'; const u = URL.createObjectURL(x.thumb); d.innerHTML = `<div class="cv"><img alt="" src="${u}"></div><div class="m"></div>`; d.querySelector('.m').textContent = (x.epName || '').slice(0, 14); d.onclick = async () => { box.remove(); await wtSetPanelImage(x.blob); }; grid.append(d); }
  box.querySelector('[data-x]').onclick = () => box.remove(); $('#wt').append(box);
};

/* ---------- 내보내기 ---------- */
async function wtPageCanvas(pg, width = WT_W){ const k = width / WT_W, c = document.createElement('canvas'); c.width = Math.round(WT_W * k); c.height = Math.round(pg.h * k); WT.exporting = true; try{ wtRenderPage(c.getContext('2d'), pg, k); } finally { WT.exporting = false; } return c; }
const wtBlob = (c, type = 'image/png') => new Promise(r => c.toBlob(r, type));
function wtDownload(blob, name){ const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
$('#wtExport').onchange = async e => {
  const v = e.target.value; e.target.value = ''; if (!v || !WT.proj) return; await wtSaveNow(); await wtPreload();
  const name = safeName(WT.proj.name || '웹툰'); const pad = n => String(n).padStart(2, '0'); toast('내보내는 중…');
  try{
    if (v === 'this'){ wtDownload(await wtBlob(await wtPageCanvas(wtPage())), `${name}_${pad(WT.pi + 1)}.png`); }
    else if (v === 'zip'){ const z = new JSZip(); for (let i = 0; i < WT.proj.pages.length; i++) z.file(`${name}_${pad(i + 1)}.png`, await wtBlob(await wtPageCanvas(WT.proj.pages[i]))); wtDownload(await z.generateAsync({type: 'blob', compression: 'STORE'}), `${name}.zip`); }
    else if (v === 'strip'){
      const W = 800, cs = []; for (const pg of WT.proj.pages) cs.push(await wtPageCanvas(pg, W)); const H = cs.reduce((a, c) => a + c.height, 0);
      if (H > 32000) return toast('세로가 너무 길어요. 쪽을 나눠서 내보내 주세요 (zip)');
      const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d'); let y = 0; for (const c of cs){ g.drawImage(c, 0, y); y += c.height; }
      wtDownload(await wtBlob(out), `${name}_세로.png`);
    }
    else if (v === 'pdf'){ const cs = []; for (const pg of WT.proj.pages) cs.push(await wtPageCanvas(pg, 1240)); const pdf = await canvasesToPdf(cs, `${name}.pdf`); if (pdf) wtDownload(pdf, `${name}.pdf`); }
    toast('내보냈어요');
  }catch(err){ toast('내보내지 못했어요 (' + err.message + ')'); }
};

/* ---------- 열고 닫기 ---------- */
async function wtOpenProject(rec){
  const d = JSON.parse(rec.data); WT.proj = {id: rec.id.slice(2), name: rec.name, pages: d.pages, gutter: d.gutter || 'bleed', updated: rec.updated};
  WT.pi = 0; WT.sel = null; WT.hist = []; WT.redo = []; WT.zoom = 1; $('#wtName').value = rec.name; await wtPreload(); WT.hist.push(wtSnap());
  $('#wtHome').hidden = true; wtBuildPages(); wtSideSync(); wtRender(); wtStatus('');
}
async function wtHomeRender(){
  await wtLoadList(); const box = $('#wtList'); box.innerHTML = WT.list.length ? '' : '<div class="hint" style="padding:8px 2px">아직 만든 웹툰이 없어요</div>';
  for (const r of WT.list){
    const n = JSON.parse(r.data).pages.length; const d = document.createElement('div'); d.className = 'it';
    d.innerHTML = `<b></b><span>${n}쪽 · ${new Date(r.updated).toLocaleDateString('ko-KR')}</span><button data-a="del" class="danger">지우기</button>`; d.querySelector('b').textContent = r.name;
    d.onclick = e => { if (e.target.dataset.a === 'del') return; wtOpenProject(r); };
    d.querySelector('[data-a=del]').onclick = async () => { if (!confirm(`'${r.name}'을 지울까요? 쓴 그림도 함께 지워져요.`)) return; await idb.tx('readwrite', s => s.delete(r.id), 'wt'); wtHomeRender(); };
    box.append(d);
  }
}
async function wtOpen(){
  $('#wt').hidden = false; document.fonts?.load('900 40px "Black Han Sans"', '가나다두근').catch(() => {}); document.fonts?.load('800 40px "Pretendard Variable"', '가나다').catch(() => {});
  if (!WT.proj){ $('#wtHome').hidden = false; await wtHomeRender(); } else { wtRender(); }
}
async function wtClose(){ if (WT.proj){ clearTimeout(WT.saveT); await wtSaveNow(); } $('#wt').hidden = true; }
$('#btnWebtoon').onclick = () => { $('#app').classList.remove('show-side'); wtOpen(); };
$('#wtClose').onclick = wtClose; $('#wtHomeX').onclick = () => { if (WT.proj) $('#wtHome').hidden = true; else wtClose(); };
$('#wtNew').onclick = async () => { WT.proj = wtNewProject(); WT.pi = 0; WT.sel = null; WT.hist = [wtSnap()]; WT.redo = []; WT.zoom = 1; $('#wtName').value = WT.proj.name; $('#wtHome').hidden = true; await wtSaveNow(); wtBuildPages(); wtSideSync(); wtRender(); };
$('#wtName').oninput = () => wtSaveSoon();
$('#wtMy').onclick = async () => { if (WT.proj){ clearTimeout(WT.saveT); await wtSaveNow(); } WT.proj = null; $('#wtHome').hidden = false; wtHomeRender(); };
wtBuildLayouts();
