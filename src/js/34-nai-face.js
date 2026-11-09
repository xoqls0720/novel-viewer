/* ---------- 얼굴 고정 (2026-11-09) ----------
   노벨AI V5 는 정밀 참조(director reference)를 아직 받지 않는다(V4.5 만, 장당 +5 Anlas). 그래서 세 가지 길을 둔다.
   ① 씨앗 고정: 같은 씨앗 + 같은 인물 태그면 얼굴이 꽤 비슷해진다(무료).
   ② 기준 그림 이어 그리기(img2img, V5): 기준 그림을 같은 크기로 맞춰 strength 만큼만 바꾼다(무료, 얼굴·옷이 남는다).
   ③ 정밀 참조(V4.5): director_reference_* 다섯 칸(이미지·설명·세기·1-충실도·1). 기준 그림은 1024×1536 / 1536×1024 / 1472×1472 중 가까운 크기에 검은 여백으로 맞춘 PNG.
   (요청 모양은 NovelAI 웹 앱과 같게: NAIWeaver 요청 빌더 참고) */
const NGF = {img: null};   // 기준 그림 dataURL(jpeg)
const ngFaceMode = () => $('#ngFace')?.value || 'off';
function ngFaceSync(){
  const m = ngFaceMode();
  $('#ngSeedRow').hidden = m !== 'seed'; $('#ngRefRow').hidden = !(m === 'i2i' || m === 'ref');
  $('#ngI2iRow').hidden = m !== 'i2i'; $('#ngPrRow').hidden = m !== 'ref';
  const pv = $('#ngRefPrev'); if (NGF.img){ pv.src = NGF.img; pv.style.display = ''; } else { pv.removeAttribute('src'); pv.style.display = 'none'; }
}
async function ngRefSet(blob){
  const bm = await createImageBitmap(blob); const k = Math.min(1, 1536 / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  NGF.img = c.toDataURL('image/jpeg', 0.92); try{ store.set('set.ngRefImg', NGF.img); }catch{ toast('기준 그림이 커서 이번에만 써요(저장은 못 했어요)'); }
  ngFaceSync(); toast('기준 그림을 정했어요');
}
async function ngRefCanvas(W, H, pad){   // 기준 그림을 W×H 로: pad=true 면 비율 유지 + 검은 여백, 아니면 가운데 맞춰 꽉 채우기
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = NGF.img; });
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const k = pad ? Math.min(W / im.width, H / im.height) : Math.max(W / im.width, H / im.height);
  const w = im.width * k, h = im.height * k; g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  return c.toDataURL('image/png').split(',')[1];
}
let ngRefOk = false;
async function ngFaceApply(body){
  const m = ngFaceMode(), P = body.parameters; if (m === 'off') return body;
  if (m === 'seed'){ const s = +$('#ngSeedFix').value; if (s > 0) P.seed = s; return body; }
  if (!NGF.img) throw new Error('얼굴 고정: 기준 그림을 먼저 골라 주세요');
  if (m === 'i2i' && $('#wt') && !$('#wt').hidden) return body;   // 웹툰 컷은 컷마다 구도가 달라야 해서 이어 그리기는 쓰지 않는다(씨앗·정밀 참조만)
  if (m === 'i2i'){
    body.action = 'img2img'; P.image = await ngRefCanvas(P.width, P.height, false); P.strength = +$('#ngI2iStr').value || 0.6; P.noise = 0; P.extra_noise_seed = P.seed; P.add_original_image = true;
    return body;
  }
  // ③ 정밀 참조: 모델을 V4.5 로(같은 계열 full/curated), V5 전용 키는 뺀다
  if (!ngRefOk){ if (!confirm('정밀 참조는 노벨AI V4.5 로 그리고, 한 장마다 5 Anlas 가 들어요. 계속할까요?')) throw new Error('정밀 참조를 취소했어요'); ngRefOk = true; }
  if (!/nai-diffusion-4-5/.test(body.model)) body.model = /curated/.test(body.model) ? 'nai-diffusion-4-5-curated' : 'nai-diffusion-4-5-full';
  delete P.deliberate_euler_ancestral_bug;
  const ar = P.width / P.height, T = [[1024, 1536], [1536, 1024], [1472, 1472]].sort((a, b) => Math.abs(a[0] / a[1] - ar) - Math.abs(b[0] / b[1] - ar))[0];
  const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = NGF.img; }), iar = im.width / im.height;
  const TT = [[1024, 1536], [1536, 1024], [1472, 1472]].sort((a, b) => Math.abs(a[0] / a[1] - iar) - Math.abs(b[0] / b[1] - iar))[0];
  P.director_reference_images = [await ngRefCanvas(TT[0], TT[1], true)];
  P.director_reference_descriptions = [{caption: {base_caption: $('#ngRefType').value || 'character', char_captions: []}, legacy_uc: false}];
  P.director_reference_strength_values = [Math.max(0, Math.min(1, +$('#ngRefStr').value || 1))];
  P.director_reference_secondary_strength_values = [1 - Math.max(0, Math.min(1, +$('#ngRefFid').value || 1))];
  P.director_reference_information_extracted = [1];
  void T; return body;
}
(function(){
  if (!$('#ngFaceBox')) return;
  $('#ngFace').value = store.get('set.ngFace', 'off'); $('#ngSeedFix').value = store.get('set.ngSeedFix', '') || '';
  NGF.img = store.get('set.ngRefImg', null);
  ['ngI2iStr', 'ngRefStr', 'ngRefFid'].forEach(id => { const v = store.get('set.' + id, null); if (v != null) $('#' + id).value = v; $('#' + id).addEventListener('input', () => { store.set('set.' + id, $('#' + id).value); if (id === 'ngI2iStr') $('#ngI2iOut').textContent = $('#ngI2iStr').value; }); });
  $('#ngI2iOut').textContent = $('#ngI2iStr').value;
  const rt = store.get('set.ngRefType', null); if (rt) $('#ngRefType').value = rt; $('#ngRefType').onchange = () => store.set('set.ngRefType', $('#ngRefType').value);
  $('#ngFace').onchange = () => { store.set('set.ngFace', ngFaceMode()); ngFaceSync(); };
  $('#ngSeedFix').oninput = () => store.set('set.ngSeedFix', $('#ngSeedFix').value);
  $('#ngSeedLast').onclick = () => { const s = store.get('set.ngLastSeed', 0); if (!s) return toast('아직 그린 그림이 없어요'); $('#ngSeedFix').value = s; store.set('set.ngSeedFix', s); toast('방금 그림의 씨앗을 넣었어요'); };
  $('#ngRefFile').onchange = e => { const f = e.target.files?.[0]; if (f) ngRefSet(f); e.target.value = ''; };
  $('#ngRefClear').onclick = () => { NGF.img = null; store.set('set.ngRefImg', null); ngFaceSync(); };
  $('#ngRefScrap').onclick = async () => {
    let all = []; try{ all = await idb.tx('readonly', st => st.getAll(), 'scraps'); }catch{}
    const r = all.filter(x => x.blob).sort((a, b) => b.t - a.t)[0]; if (!r) return toast('장면 노트에 그림이 없어요');
    ngRefSet(r.blob instanceof Blob ? r.blob : new Blob([r.blob], {type: 'image/jpeg'}));
  };
  ngFaceSync();
})();
window.nvNgFace = {apply: ngFaceApply, set: ngRefSet, NGF};   // 시험용
