/* ================= 노벨AI로 그림 바로 만들기 (윈도우 프로그램 전용) =================
   브라우저는 노벨AI에 바로 요청할 수 없어서(CORS) 프로그램이 대신 보낸다(desktop/main.js의 nai-gen).
   장면 목록을 넣으면 ① AI가 프롬프트를 만들고 ② 노벨AI가 그려서 ③ 장면 노트에 저장한다. 사이트에 일일이 넣지 않아도 된다. */
// 인수인계 문서 기준 고정값 (house_style v15 / 암실 룩 공통)
const NAI_MODEL = 'nai-diffusion-5-full';
const NAI_FIXED = {sampler: 'k_euler_ancestral', noise_schedule: 'karras', cfg_rescale: 0.08, prefer_brownian: true, ucPreset: 2, steps: 28, scale: 5};
const NAI_SIZE = {portrait: [832, 1216], landscape: [1216, 832], square: [1024, 1024]};
const NG = {run: false, stop: false, done: 0, fail: 0};
const naiToken = () => store.get('naiKey', '');
function ngStat(t){ const el = $('#ngStat'); if (el) el.textContent = t; }
function ngBusy(on){ NG.run = on; $('#pane-nai')?.classList.toggle('ngbusy', on); $('#ngGo').disabled = on; $('#ngStop').hidden = !on; }

// 프롬프트 묶음 → 노벨AI 요청 본문. V4 이상은 인물마다 칸이 따로 있다.
// 노벨AI에서 가져온 설정(ngTpl)이 있으면 그 값을 바탕으로 삼고, 글·인물·씨앗만 갈아 끼운다.
function naiBody(p, seed, sizeKey){
  const tpl = store.get('set.ngTpl', null);
  const [w, h] = NAI_SIZE[sizeKey || $('#ngSize').value] || NAI_SIZE.portrait;
  const model = $('#ngModel').value.trim() || tpl?.model || NAI_MODEL;
  const steps = Math.max(1, Math.min(50, +$('#ngSteps').value || 28));
  const chars = (p.chars || []).slice(0, 6);
  const pos = c => { const m = /^(\d)[,:](\d)$/.exec(String(c.position || '').trim()); return m ? {x: +m[1] / 5 + 0.1, y: +m[2] / 5 + 0.1} : {x: 0.5, y: 0.5}; };
  const cp = chars.map(c => ({prompt: c.prompt, uc: c.negative || '', center: pos(c), enabled: true}));
  const base = tpl?.parameters ? {...tpl.parameters} : {};
  for (const k of ['image', 'mask', 'reference_image', 'reference_image_multiple', 'reference_strength_multiple', 'reference_information_extracted_multiple', 'director_reference_images', 'extra_noise_seed', 'stream']) delete base[k];
  const coords = cp.some(c => c.center.x !== 0.5 || c.center.y !== 0.5);
  return {
    input: p.base, model, action: 'generate',
    parameters: {
      // ① 기본값 → ② 노벨AI에서 가져온 설정(샘플러·노이즈 같은 건 가져온 쪽이 이긴다) → ③ 내가 칸에서 정한 값
      params_version: 3, n_samples: 1, qualityToggle: true,
      ...NAI_FIXED, autoSmea: false, dynamic_thresholding: false, controlnet_strength: 1,
      legacy: false, add_original_image: true, legacy_v3_extend: false,
      skip_cfg_above_sigma: null, legacy_uc: false, normalize_reference_strength_multiple: true,
      ...base,
      width: w, height: h, scale: +$('#ngScale').value || 5, steps,
      use_coords: coords,
      seed: seed ?? Math.floor(Math.random() * 4294967295),
      characterPrompts: cp,
      v4_prompt: {caption: {base_caption: p.base, char_captions: cp.map(c => ({char_caption: c.prompt, centers: [c.center]}))}, use_coords: coords, use_order: true},
      v4_negative_prompt: {caption: {base_caption: p.neg, char_captions: cp.map(c => ({char_caption: c.uc, centers: [c.center]}))}, legacy_uc: false},
      negative_prompt: p.neg, deliberate_euler_ancestral_bug: false, prefer_brownian: true,
    },
  };
}
// 노벨AI 그림 요청: 윈도우 프로그램은 프로그램이, 폰·아이패드(웹)는 브라우저가 바로 보낸다(노벨AI 가 다른 사이트에서의 요청을 허락한다).
// V4 이후 모델은 흘려 받기(msgpack) 끝 장면만, 옛 모델(V3)은 zip.
async function naiFetch(token, body){
  if (DESKTOP) return window.nvDesktop.naiGen(token, body);
  const stream = /nai-diffusion-(?:[4-9]|\d\d)/.test(String(body?.model || ''));
  if (stream) body = {...body, parameters: {...body.parameters, stream: 'msgpack'}};
  let r;
  try{ r = await fetch('https://image.novelai.net/ai/generate-image' + (stream ? '-stream' : ''), {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: stream ? 'application/x-msgpack' : 'application/zip'}, body: JSON.stringify(body)}); }
  catch(e){ return {ok: false, status: 0, text: e.message}; }
  const raw = new Uint8Array(await r.arrayBuffer());
  if (!r.ok) return {ok: false, status: r.status, text: new TextDecoder().decode(raw.subarray(0, 400))};
  if (!stream) return {ok: true, zipBytes: raw};
  const imgs = msgpackFinals(raw);
  return imgs.length ? {ok: true, blobs: imgs.map(b => new Blob([b], {type: 'image/png'}))} : {ok: false, status: r.status, text: '그림을 받지 못했어요 (' + raw.length + '바이트)'};
}
// 흘려 받은 조각들(4바이트 길이 + msgpack) 중 event_type 'final' 의 그림만 (main.js 와 같은 읽개)
function msgpackFinals(buf){
  const out = [], dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), dec = new TextDecoder();
  const read = p => {
    const t = buf[p];
    if (t < 0x80) return [t, p + 1];
    if (t >= 0xe0) return [t - 256, p + 1];
    if (t <= 0x8f) return map(p + 1, t - 0x80);
    if (t <= 0x9f) return arr(p + 1, t - 0x90);
    if (t <= 0xbf) return str(p + 1, t - 0xa0);
    switch (t){
      case 0xc0: return [null, p + 1]; case 0xc2: return [false, p + 1]; case 0xc3: return [true, p + 1];
      case 0xc4: return bin(p + 2, buf[p + 1]); case 0xc5: return bin(p + 3, dv.getUint16(p + 1)); case 0xc6: return bin(p + 5, dv.getUint32(p + 1));
      case 0xca: return [dv.getFloat32(p + 1), p + 5]; case 0xcb: return [dv.getFloat64(p + 1), p + 9];
      case 0xcc: return [buf[p + 1], p + 2]; case 0xcd: return [dv.getUint16(p + 1), p + 3]; case 0xce: return [dv.getUint32(p + 1), p + 5]; case 0xcf: return [Number(dv.getBigUint64(p + 1)), p + 9];
      case 0xd0: return [dv.getInt8(p + 1), p + 2]; case 0xd1: return [dv.getInt16(p + 1), p + 3]; case 0xd2: return [dv.getInt32(p + 1), p + 5]; case 0xd3: return [Number(dv.getBigInt64(p + 1)), p + 9];
      case 0xd9: return str(p + 2, buf[p + 1]); case 0xda: return str(p + 3, dv.getUint16(p + 1)); case 0xdb: return str(p + 5, dv.getUint32(p + 1));
      case 0xdc: return arr(p + 3, dv.getUint16(p + 1)); case 0xdd: return arr(p + 5, dv.getUint32(p + 1));
      case 0xde: return map(p + 3, dv.getUint16(p + 1)); case 0xdf: return map(p + 5, dv.getUint32(p + 1));
    }
    throw new Error('msgpack 0x' + t.toString(16));
  };
  const str = (p, n) => [dec.decode(buf.subarray(p, p + n)), p + n];
  const bin = (p, n) => [buf.slice(p, p + n), p + n];
  const arr = (p, n) => { const o = []; for (let i = 0; i < n; i++){ const [v, q] = read(p); o.push(v); p = q; } return [o, p]; };
  const map = (p, n) => { const o = {}; for (let i = 0; i < n; i++){ const [k, q] = read(p); const [v, r] = read(q); o[k] = v; p = r; } return [o, p]; };
  for (let at = 0; at + 4 <= buf.length; ){
    const len = dv.getUint32(at); at += 4;
    if (!len || at + len > buf.length) break;
    try{ const [obj] = read(at); if (obj && obj.event_type === 'final' && obj.image) out.push(obj.image); }catch{}
    at += len;
  }
  return out;
}
// 한 장 그려서 장면 노트에 저장
// 한 장 그려서 그림(PNG blob)만 돌려준다. 웹툰 만들기에서도 쓴다.
async function naiGenBlob(p, sizeKey, edit){
  const body = naiBody(p, undefined, sizeKey); if (edit) edit(body);
  const r = await naiFetch(naiToken(), body);
  if (!r?.ok) throw new Error(r?.status === 401 ? '토큰이 맞지 않아요 (노벨AI 토큰을 다시 넣어 주세요)' : r?.status === 402 ? '남은 생성 수가 없어요' : r?.status === 429 ? '너무 자주 보냈어요. 잠시 뒤 다시 해 주세요' : (r?.text || '실패'));
  if (r.blobs?.length) return r.blobs[0];
  if (r.zipBytes){ const z = await JSZip.loadAsync(r.zipBytes); const f = Object.values(z.files).find(x => /\.png$/i.test(x.name)); return new Blob([await f.async('arraybuffer')], {type: 'image/png'}); }
  if (r.images?.length) return new Blob([Uint8Array.from(atob(r.images[0]), c => c.charCodeAt(0))], {type: 'image/png'});
  const z = await JSZip.loadAsync(r.zip, {base64: true}); const f = Object.values(z.files).find(x => /\.png$/i.test(x.name)); return new Blob([await f.async('arraybuffer')], {type: 'image/png'});
}
async function naiOne(p, desc){ return naiSaveBlob(await naiGenBlob(p), desc); }
window.nvNai = {one: naiOne};   // 시험용
async function naiSaveBlob(blob, desc){
  const im = await loadImgEl(blob);
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
  const tc = document.createElement('canvas'); const ts = Math.min(1, 360 / c.width); tc.width = Math.round(c.width * ts); tc.height = Math.round(c.height * ts); tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
  const rec = {id: uid(), work: cur?.key || '', workName: cur?.name || '노벨AI', epName: (desc || '그림').slice(0, 40), where: {}, note: desc || '',
    blob: await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92)), thumb: await new Promise(res => tc.toBlob(res, 'image/jpeg', 0.8)), base: null, strokes: null, t: Date.now()};
  await idb.tx('readwrite', s => s.put(rec), 'scraps'); window.gdSoon?.(); renderScraps();
  return rec;
}
// 장면 설명 → 프롬프트(AI). naiGo 와 같은 길을 쓴다.
async function naiPromptFor(desc){
  const rating = $('#naiRating').value, dict = naiCharsDict();
  const c = await client('#naiProv'); if (!c) throw new Error('AI 설정이 필요해요');
  const content = [{type: 'text', text:
`용도: ${$('#naiUse').selectedOptions[0].text}
등급: ${rating === 'nsfw' ? '성인(nsfw). 성인 플랫폼용이고 모든 인물은 성인이다. 각 인물 prompt에 adult를 넣는다.' : '일반(safe). 노출·성적 요소 없이.'}
인물 사전:
${dict.length ? dict.join('\n') : '(없음 — 장면 설명에서 외형을 정해 태그로 쓴다)'}

장면:
${desc}`}];
  const res = await stream(c, {messages: [{role: 'user', content}], system: SYSTEM_NAI, format: {type: 'json_schema', schema: NAI_SCHEMA}});
  if (!res.ok) throw new Error((res.note || '프롬프트 실패').trim().slice(0, 80));
  const p = naiPack(parseJSON(res.text));
  if (rating === 'nsfw' && MINOR_RE.test([p.base, ...p.chars.map(x => x.prompt)].join(' '))) throw new Error('미성년을 떠올리게 하는 태그가 섞여서 건너뛰었어요');
  return p;
}

/* ---------- 묶음 돌리기 ---------- */
$('#ngGo').onclick = async () => {
  if (NG.run) return;
  if (!naiToken()) { openTool('nai'); return toast('노벨AI 토큰을 먼저 넣어 주세요'); }
  const lines = $('#ngList').value.split('\n').map(s => s.trim()).filter(Boolean);
  const each = Math.max(1, Math.min(8, +$('#ngEach').value || 1));
  const useLast = !lines.length;
  if (useLast && !naiState.last) return toast('장면을 한 줄에 하나씩 적거나, 먼저 프롬프트를 하나 만들어 주세요');
  if ($('#naiRating').value === 'nsfw' && !adultGuard(lines.join('\n') + '\n' + naiCharsDict().join('\n'), 'adult')) return;
  const jobs = useLast ? [{desc: $('#naiIn').value.trim() || '방금 만든 프롬프트', p: naiState.last}] : lines.map(desc => ({desc, p: null}));
  NG.stop = false; NG.done = 0; NG.fail = 0; ngBusy(true);
  const total = jobs.length * each;
  for (const job of jobs){
    if (NG.stop) break;
    try{
      if (!job.p){ ngStat(`프롬프트 만드는 중… ${esc(job.desc).slice(0, 24)}`); job.p = await naiPromptFor(job.desc); renderNai(job.p); const h = store.get('naiHist', []); h.unshift({t: Date.now(), desc: job.desc, p: job.p}); store.set('naiHist', h.slice(0, 30)); renderNaiHist(); }
      for (let i = 0; i < each; i++){
        if (NG.stop) break;
        ngStat(`그리는 중 ${NG.done + NG.fail + 1}/${total} · ${job.desc.slice(0, 24)}`);
        try{ await naiOne(job.p, job.desc); NG.done++; }
        catch(e){ NG.fail++; ngStat('멈췄어요: ' + e.message); if (/토큰|생성 수/.test(e.message)){ NG.stop = true; break; } }
        if (!NG.stop && NG.done + NG.fail < total) await new Promise(r => setTimeout(r, 1200));   // 너무 빨리 보내지 않는다
      }
    }catch(e){ NG.fail++; ngStat('건너뜀: ' + e.message); }
  }
  ngBusy(false);
  ngStat(`끝났어요 · 만든 그림 ${NG.done}장${NG.fail ? ` · 실패 ${NG.fail}` : ''}${NG.stop ? ' · 멈춤' : ''}`);
  if (NG.done) toast(`그림 ${NG.done}장을 장면 노트에 저장했어요`);
};
// 노벨AI에서 지금 쓰는 설정을 그대로 가져온다(토큰·모델·크기·스텝·샘플러…)
$('#ngGrab').onclick = async () => {
  if (!DESKTOP) return toast('윈도우 프로그램에서만 돼요');
  ngStat('노벨AI 창에서 그림을 한 장 만들어 주세요…');
  toast('열린 노벨AI 창에서 평소처럼 그림을 한 장 만들면 설정을 가져와요');
  let r; try{ r = await window.nvDesktop.naiCapture(); }catch(e){ return ngStat('가져오지 못했어요 (' + e.message + ')'); }
  if (!r?.ok) return ngStat(r?.text || '가져오지 못했어요');
  const pm = r.body.parameters || {};
  store.set('set.ngTpl', {model: r.body.model, parameters: pm});
  if (r.body.model) $('#ngModel').value = r.body.model;
  if (pm.steps) $('#ngSteps').value = pm.steps;
  if (pm.scale) $('#ngScale').value = pm.scale;
  const sz = Object.entries(NAI_SIZE).find(([, [w, h]]) => w === pm.width && h === pm.height);
  if (sz) $('#ngSize').value = sz[0]; else if (pm.width) ngStat(`크기 ${pm.width}×${pm.height}는 목록에 없어 세로로 둬요`);
  for (const id of ['ngModel', 'ngSteps', 'ngScale', 'ngSize']) store.set('set.' + id, $('#' + id).value);
  if (r.token){ store.set('naiKey', r.token); keySaved('naiKey'); }
  ngStat(`가져왔어요 · ${r.body.model || ''} · ${pm.width}×${pm.height} · ${pm.steps}스텝 · ${pm.sampler || ''}${r.token ? ' · 토큰도 받음' : ' (토큰은 직접 넣어 주세요)'}`);
};
$('#ngTplClear').onclick = () => { store.set('set.ngTpl', null); ngStat('가져온 설정을 지웠어요. 기본값으로 보내요'); };
$('#ngStop').onclick = () => { NG.stop = true; ngStat('멈추는 중… (그리던 한 장은 끝나요)'); };
$('#naiKey').value = ''; keySaved('naiKey');
$('#ngSave').onclick = () => saveKey('naiKey');
$('#ngDel').onclick = () => delKey('naiKey');
// 예전 판에서 저장해 둔 옛 모델이 새 기본값(V5 full)을 덮지 않게 한 번만 올린다
if (!store.get('set.ngV5', false)){
  const old = store.get('set.ngModel', '');
  if (/^nai-diffusion-4/.test(old) && !store.get('set.ngTpl', null)) store.set('set.ngModel', NAI_MODEL);
  store.set('set.ngV5', true);
}
for (const id of ['ngModel', 'ngSteps', 'ngScale', 'ngSize']){ const el = $('#' + id); const v = store.get('set.' + id, null); if (v !== null) el.value = v; el.addEventListener('change', () => store.set('set.' + id, el.value)); }
if (store.get('set.ngTpl', null)) ngStat('노벨AI에서 가져온 설정을 쓰고 있어요');
$$('.nai-desktop').forEach(el => el.hidden = false);   // 폰·아이패드에서도 바로 그린다
if (!DESKTOP) $('#ngGrab').hidden = true;   // 노벨AI 창을 띄워 설정 가져오기는 프로그램에서만 (토큰은 기기끼리 맞춰진다)

/* ---------- 구도 스케치를 밑그림으로 그리기 (img2img) ---------- */
// 스케치의 가로세로에 맞는 노벨AI 크기를 고르고, 스케치를 그 크기에 꽉 차게 얹는다.
if ($('#skNaiBox')) $('#skNaiBox').hidden = false;
$('#skNai') && ($('#skNai').onclick = async () => {
  if (!naiToken()){ openTool('nai'); return toast('노벨AI 토큰을 먼저 넣어 주세요'); }
  const btn = $('#skNai'); if (btn.disabled) return;
  const note = $('#skNote').value.trim();
  if ($('#naiRating').value === 'nsfw' && !adultGuard(note + '\n' + naiCharsDict().join('\n'), 'adult')) return;
  btn.disabled = true; const t0 = btn.textContent;
  try{
    let p = null;
    if (note){ btn.textContent = '프롬프트 만드는 중…'; p = await naiPromptFor(note); renderNai(p); }
    else if (naiState.last) p = naiState.last;
    else { toast('아래 메모 칸에 장면을 한 줄 적어 주세요 (비워 두면 마지막 프롬프트를 써요)'); return; }
    btn.textContent = '노벨AI가 그리는 중…';
    const cv = $('#skCanvas'); const r = cv.width / cv.height;
    const key = r > 1.3 ? 'landscape' : r < 0.78 ? 'portrait' : 'square';
    const [w, h] = NAI_SIZE[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const sc = Math.max(w / cv.width, h / cv.height);
    g.drawImage(cv, (w - cv.width * sc) / 2, (h - cv.height * sc) / 2, cv.width * sc, cv.height * sc);
    const img = c.toDataURL('image/png').split(',')[1];
    const blob = await naiGenBlob(p, key, body => {
      body.action = 'img2img';
      body.parameters.image = img;
      body.parameters.strength = +$('#skNaiStr').value || 0.65;
      body.parameters.noise = 0;
      body.parameters.extra_noise_seed = Math.floor(Math.random() * 4294967295);
    });
    await naiSaveBlob(blob, (note || $('#naiIn').value.trim() || '구도 스케치').slice(0, 30) + ' · 스케치 따라');
    toast('스케치를 따라 그렸어요 — 장면 노트에 저장됐어요. 더 다르게 하려면 "자유롭게"로 다시 눌러 보세요');
  }catch(e){ toast('그리지 못했어요: ' + String(e.message || e).slice(0, 60)); }
  finally{ btn.disabled = false; btn.textContent = t0; }
});
