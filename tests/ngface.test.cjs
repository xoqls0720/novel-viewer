// 얼굴 고정: 씨앗 고정 / 기준 그림 이어 그리기(img2img) / 정밀 참조(V4.5 director_reference_*) 요청 모양
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto('file://' + path.resolve(__dirname, '..') + '/index.html'); await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    const o = {}; const body = () => ({model: 'nai-diffusion-5-full', action: 'generate', input: 'x', parameters: {width: 832, height: 1216, seed: 123, deliberate_euler_ancestral_bug: false}});
    const F = document.querySelector('#ngFace'), set = v => { F.value = v; F.dispatchEvent(new Event('change')); };
    set('seed'); document.querySelector('#ngSeedFix').value = '777'; let b1 = await nvNgFace.apply(body()); o.seed = b1.parameters.seed === 777 && b1.action === 'generate';
    o.rowsSeed = !document.querySelector('#ngSeedRow').hidden && document.querySelector('#ngRefRow').hidden;
    const c = document.createElement('canvas'); c.width = 600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 600, 900);
    await nvNgFace.set(await new Promise(r => c.toBlob(r, 'image/png')));
    set('i2i'); const b2 = await nvNgFace.apply(body()); const im2 = new Image(); im2.src = 'data:image/png;base64,' + b2.parameters.image; await im2.decode();
    o.i2i = b2.action === 'img2img' && im2.width === 832 && im2.height === 1216 && b2.parameters.strength === 0.6 && b2.parameters.extra_noise_seed === 123 && b2.model === 'nai-diffusion-5-full';
    set('ref'); const b3 = await nvNgFace.apply(body()); const P = b3.parameters; const im3 = new Image(); im3.src = 'data:image/png;base64,' + P.director_reference_images[0]; await im3.decode();
    o.ref = b3.model === 'nai-diffusion-4-5-full' && b3.action === 'generate' && im3.width === 1024 && im3.height === 1536 && P.director_reference_descriptions[0].caption.base_caption === 'character' && P.director_reference_strength_values[0] === 1 && P.director_reference_secondary_strength_values[0] === 0 && P.director_reference_information_extracted[0] === 1 && !('deliberate_euler_ancestral_bug' in P);
    set('off'); const b4 = await nvNgFace.apply(body()); o.off = b4.action === 'generate' && b4.parameters.seed === 123 && !b4.parameters.image;
    return o;
  });
  console.log('seed:', r.seed, r.rowsSeed, '| i2i:', r.i2i, '| ref:', r.ref, '| off:', r.off);
  console.log('ERRORS:', errs.length ? errs.join(' / ') : 'none'); await b.close(); })();
