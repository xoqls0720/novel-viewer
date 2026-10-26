/* ================= PSD(포토샵) 파일 만들기: 프로크리에이트가 레이어째 열 수 있게 ================= */
// 8비트 RGB, 압축 없음. 레이어마다 RGBA, 맨 뒤에 합쳐진 그림(미리보기용)을 붙인다.
function buildPsd(W, H, layers, flat){
  const out = [];
  const u16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n); return b; };
  const i16 = n => { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, n); return b; };
  const u32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
  const i32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n); return b; };
  const asc = s => new TextEncoder().encode(s);
  const cat = list => { const n = list.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of list){ o.set(a, p); p += a.length; } return o; };
  // 머리말: 시그니처, 버전 1, 채널 3(RGB), 높이, 너비, 8비트, 색 모드 3(RGB)
  out.push(asc('8BPS'), u16(1), new Uint8Array(6), u16(3), u32(H), u32(W), u16(8), u16(3));
  out.push(u32(0), u32(0));   // 색 모드 자료, 이미지 자원: 없음
  // 레이어 기록
  const recs = [], datas = [];
  for (const L of layers){
    const w = L.canvas.width, h = L.canvas.height; const px = L.canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const planes = [0, 1, 2, 3].map(() => new Uint8Array(w * h));
    for (let i = 0, n = w * h; i < n; i++){ planes[0][i] = px[i*4 + 3]; planes[1][i] = px[i*4]; planes[2][i] = px[i*4 + 1]; planes[3][i] = px[i*4 + 2]; }   // 투명도, R, G, B 순
    const ids = [-1, 0, 1, 2];
    const asciiName = /^[\x20-\x7e]+$/.test(L.name) ? L.name : 'Layer';
    let pas = cat([new Uint8Array([Math.min(255, asciiName.length)]), asc(asciiName.slice(0, 255))]); while (pas.length % 4) pas = cat([pas, new Uint8Array(1)]);
    const uni = cat([u32(L.name.length), ...[...L.name].flatMap(ch => { const c = ch.charCodeAt(0); return [u16(c)]; })]);
    const luni = cat([asc('8BIM'), asc('luni'), u32(uni.length + (uni.length % 2)), uni, new Uint8Array(uni.length % 2)]);
    const extra = cat([u32(0), u32(0), pas, luni]);
    recs.push(cat([i32(L.y), i32(L.x), i32(L.y + h), i32(L.x + w), u16(4), ...ids.map(id => cat([i16(id), u32(2 + w * h)])), asc('8BIM'), asc('norm'), new Uint8Array([255, 0, 0, 0]), u32(extra.length), extra]));
    for (const p of planes) datas.push(u16(0), p);   // 압축 없음
  }
  let info = cat([i16(layers.length), ...recs, ...datas]); if (info.length % 2) info = cat([info, new Uint8Array(1)]);
  out.push(u32(4 + info.length + 4), u32(info.length), info, u32(0));
  // 합쳐진 그림
  const fp = flat.getContext('2d').getImageData(0, 0, W, H).data; const n = W * H; const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++){ rgb[i] = fp[i*4]; rgb[n + i] = fp[i*4 + 1]; rgb[2*n + i] = fp[i*4 + 2]; }
  out.push(u16(0), rgb);
  return new Blob(out, {type: 'image/vnd.adobe.photoshop'});
}

// PSD 읽기: 합쳐진 그림(맨 뒤 이미지 자료)만 읽는다. 프로크리에이트·포토샵이 내보낸 8비트 RGB(압축 없음·RLE)를 지원한다.
async function psdComposite(file){
  const buf = await (file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer()); const v = new DataView(buf); const u8 = new Uint8Array(buf);
  if (String.fromCharCode(...u8.slice(0, 4)) !== '8BPS') throw new Error('PSD 파일이 아니에요');
  const ch = v.getUint16(12), H = v.getUint32(14), W = v.getUint32(18), depth = v.getUint16(22), mode = v.getUint16(24);
  if (depth !== 8 || ![1, 3].includes(mode)) throw new Error('8비트 RGB PSD만 읽어요');
  let p = 26; p += 4 + v.getUint32(p); p += 4 + v.getUint32(p); p += 4 + v.getUint32(p);   // 색 모드, 이미지 자원, 레이어
  const comp = v.getUint16(p); p += 2; const n = W * H; const planes = [];
  if (comp === 0){ for (let c = 0; c < ch; c++){ planes.push(u8.subarray(p + c * n, p + (c + 1) * n)); } }
  else if (comp === 1){
    p += H * ch * 2; // 줄마다 압축 크기 표
    const counts = []; let q = 26; q += 4 + v.getUint32(q); q += 4 + v.getUint32(q); q += 4 + v.getUint32(q); q += 2;
    for (let i = 0; i < H * ch; i++) counts.push(v.getUint16(q + i * 2));
    let li = 0;
    for (let c = 0; c < ch; c++){
      const pl = new Uint8Array(n);
      for (let y = 0; y < H; y++){ const end = p + counts[li++]; let o = y * W; while (p < end){ const h = v.getInt8(p++); if (h >= 0){ for (let k = 0; k <= h; k++) pl[o++] = u8[p++]; } else if (h !== -128){ const b = u8[p++]; for (let k = 0; k < 1 - h; k++) pl[o++] = b; } } p = end; }
      planes.push(pl);
    }
  } else throw new Error('지원하지 않는 PSD 압축이에요');
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const im = g.createImageData(W, H);
  for (let i = 0; i < n; i++){ const r = planes[0][i]; im.data[i*4] = r; im.data[i*4+1] = planes[mode === 1 ? 0 : 1][i]; im.data[i*4+2] = planes[mode === 1 ? 0 : 2][i]; im.data[i*4+3] = ch === 2 || ch === 4 ? planes[ch - 1][i] : 255; }
  g.putImageData(im, 0, 0);
  const o = document.createElement('canvas'); o.width = W; o.height = H; const og = o.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, W, H); og.drawImage(c, 0, 0); return o;
}
