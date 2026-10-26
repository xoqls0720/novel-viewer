/* ================= 노벨AI로 그림 바로 만들기 (윈도우 프로그램 전용) =================
   브라우저는 노벨AI에 바로 요청할 수 없어서(CORS) 프로그램이 대신 보낸다(desktop/main.js의 nai-gen).
   장면 목록을 넣으면 ① AI가 프롬프트를 만들고 ② 노벨AI가 그려서 ③ 장면 노트에 저장한다. 사이트에 일일이 넣지 않아도 된다. */
const NAI_SIZE = {portrait: [832, 1216], landscape: [1216, 832], square: [1024, 1024]};
const NG = {run: false, stop: false, done: 0, fail: 0};
const naiToken = () => store.get('naiKey', '');
function ngStat(t){ const el = $('#ngStat'); if (el) el.textContent = t; }
function ngBusy(on){ NG.run = on; $('#pane-nai')?.classList.toggle('ngbusy', on); $('#ngGo').disabled = on; $('#ngStop').hidden = !on; }

// 프롬프트 묶음 → 노벨AI 요청 본문. V4 이상은 인물마다 칸이 따로 있다.
function naiBody(p, seed){
  const [w, h] = NAI_SIZE[$('#ngSize').value] || NAI_SIZE.portrait;
  const model = $('#ngModel').value.trim() || 'nai-diffusion-4-5-full';
  const steps = Math.max(1, Math.min(50, +$('#ngSteps').value || 28));
  const chars = (p.chars || []).slice(0, 6);
  const pos = c => { const m = /^(\d)[,:](\d)$/.exec(String(c.position || '').trim()); return m ? {x: +m[1] / 5 + 0.1, y: +m[2] / 5 + 0.1} : {x: 0.5, y: 0.5}; };
  const cp = chars.map(c => ({prompt: c.prompt, uc: c.negative || '', center: pos(c), enabled: true}));
  return {
    input: p.base, model, action: 'generate',
    parameters: {
      params_version: 3, width: w, height: h, scale: +$('#ngScale').value || 5,
      sampler: 'k_euler_ancestral', steps, n_samples: 1, ucPreset: 0, qualityToggle: true,
      autoSmea: false, dynamic_thresholding: false, controlnet_strength: 1, legacy: false,
      add_original_image: true, cfg_rescale: 0, noise_schedule: 'karras', legacy_v3_extend: false,
      skip_cfg_above_sigma: null, use_coords: cp.some(c => c.center.x !== 0.5 || c.center.y !== 0.5),
      legacy_uc: false, normalize_reference_strength_multiple: true,
      seed: seed ?? Math.floor(Math.random() * 4294967295),
      characterPrompts: cp,
      v4_prompt: {caption: {base_caption: p.base, char_captions: cp.map(c => ({char_caption: c.prompt, centers: [c.center]}))}, use_coords: cp.some(c => c.center.x !== 0.5 || c.center.y !== 0.5), use_order: true},
      v4_negative_prompt: {caption: {base_caption: p.neg, char_captions: cp.map(c => ({char_caption: c.uc, centers: [c.center]}))}, legacy_uc: false},
      negative_prompt: p.neg, deliberate_euler_ancestral_bug: false, prefer_brownian: true,
    },
  };
}
// 한 장 그려서 장면 노트에 저장
async function naiOne(p, desc){
  const r = await window.nvDesktop.naiGen(naiToken(), naiBody(p));
  if (!r?.ok) throw new Error(r?.status === 401 ? '토큰이 맞지 않아요 (노벨AI 토큰을 다시 넣어 주세요)' : r?.status === 402 ? '남은 생성 수가 없어요' : r?.status === 429 ? '너무 자주 보냈어요. 잠시 뒤 다시 해 주세요' : (r?.text || '실패'));
  let blob;
  if (r.images?.length) blob = new Blob([Uint8Array.from(atob(r.images[0]), c => c.charCodeAt(0))], {type: 'image/png'});
  else { const z = await JSZip.loadAsync(r.zip, {base64: true}); const f = Object.values(z.files).find(x => /\.png$/i.test(x.name)); blob = new Blob([await f.async('arraybuffer')], {type: 'image/png'}); }
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
  if (!DESKTOP) return toast('그림 바로 만들기는 윈도우 프로그램에서만 돼요');
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
$('#ngStop').onclick = () => { NG.stop = true; ngStat('멈추는 중… (그리던 한 장은 끝나요)'); };
$('#naiKey').value = ''; keySaved('naiKey');
$('#ngSave').onclick = () => saveKey('naiKey');
$('#ngDel').onclick = () => delKey('naiKey');
if (DESKTOP) $$('.nai-desktop').forEach(el => el.hidden = false); else $('#ngWeb').hidden = false;
