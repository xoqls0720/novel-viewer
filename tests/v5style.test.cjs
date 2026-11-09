// 2026-11-09 최종 4종(V5 문법): 품질 태그 자동 끔·네거 프리셋 없음·guidance 5·rescale 0 이 요청까지 가고,
// 남자 인물 칸엔 'man, mature male' 이 붙고, 안경 쓴 인물이 있으면 안 쓴 인물 칸 UC 에 안경이 들어간다. 4종 모두 child 를 막는다.
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '..') + '/index.html'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const st = document.querySelector('#wtStyle');
    const opts = [...st.options].map(o => o.value).filter(v => /^(toon|manga|chat|adult)3$/.test(v));
    document.querySelector('#naiChars').value = '재혁: 1boy, adult, blond undercut, fox eyes\n서호: 1boy, adult, black hair, round silver glasses';
    const out = {};
    for (const k of ['toon3', 'manga3', 'chat3', 'adult3']){
      st.value = k; st.dispatchEvent(new Event('change'));
      const x = nvWtPrompt({chars: '재혁, 서호', tags: 'upper body'});
      out[k] = {params: x.params, c0: x.chars[0].prompt, c0neg: x.chars[0].negative, c1: x.chars[1].prompt, c1neg: x.chars[1].negative, base: x.base, neg: x.neg};
    }
    st.value = 'neon'; st.dispatchEvent(new Event('change'));
    const old = nvWtPrompt({chars: '재혁', tags: 'upper body'});
    st.value = 'toon3'; st.dispatchEvent(new Event('change'));
    const body = nvNai.body(nvWtPrompt({chars: '재혁', tags: 'upper body'}), 1, 'portrait');
    return {opts, out, oldParams: old.params, body: body.parameters};
  });
  const o = r.out;
  console.log('picks:', r.opts.join(','));
  console.log('v5 params all:', ['toon3', 'manga3', 'chat3', 'adult3'].every(k => o[k].params && o[k].params.qualityToggle === false && o[k].params.ucPreset === 3 && o[k].params.scale === 5 && o[k].params.cfg_rescale === 0), '| old style untouched:', r.oldParams === undefined);
  console.log('male prefix:', /^man, mature male, /.test(o.toon3.c0), '| glasses leak blocked:', o.toon3.c0neg === 'glasses, eyewear', '| glasses owner free:', !o.toon3.c1neg);
  console.log('attractive male:', ['toon3', 'manga3', 'chat3', 'adult3'].every(k => /attractive male/.test(o[k].base)), '| child neg:', ['toon3', 'manga3', 'chat3', 'adult3'].every(k => /(^|, )child(,|$)/.test(o[k].neg)), '| official art neg:', /official art/.test(o.chat3.neg));
  console.log('manga mono:', /monochrome/.test(o.manga3.base) && /color, colorful/.test(o.manga3.neg), '| chat ink:', /ink drips/.test(o.chat3.base), '| adult mood:', /mature romance manhwa/.test(o.adult3.base));
  console.log('request:', r.body.qualityToggle, r.body.ucPreset, r.body.scale, r.body.cfg_rescale);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close(); })();
