// 그림체 → 노벨AI 프롬프트: 성별대로 인원수, 여자 인물이면 '1girl, female' 막기를 풀고, 풍경 컷엔 얼굴 태그를 빼고, 두 그림체 모두 child 를 막는다
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '..') + '/index.html'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    document.querySelector('#naiChars').value = '카엘: 1boy, adult, black hair, grey eyes\n레비안: 1girl, adult, silver hair, red eyes';
    const f = c => { const x = nvWtPrompt(c); return {base: x.base.slice(0, 400), neg: x.neg}; };
    return {pair: f({chars: '카엘, 레비안', tags: 'upper body'}), her: f({chars: '레비안', tags: 'upper body'}), land: f({chars: '', tags: 'castle gate, snow'})};
  });
  const has = (s, t) => s.includes(t);
  console.log('pair count:', /1boy, 1girl/.test(r.pair.base), '| pair neg keeps female:', !/(^|, )(1girl|female)(,|$)/.test(r.pair.neg));
  console.log('her focus:', has(r.her.base, 'the face is the focal point'), '| no his:', !has(r.her.base, 'his handsome face'), '| count 1girl:', /(^|, )1girl(,|$)/.test(r.her.base));
  console.log('landscape: no humans', has(r.land.base, 'no humans'), '| no face tags:', !/looking at viewer|closed mouth|focal point|handsome man/.test(r.land.base));
  const r2 = await p.evaluate(() => {
    document.querySelector('#wtNaiText').checked = true;
    const x = nvWtPrompt({chars: '카엘', tags: 'upper body'}, ['뭐라고!', 'STOP']);
    const off = (document.querySelector('#wtNaiText').checked = false, nvWtPrompt({chars: '카엘', tags: 'upper body'}, ['뭐라고!']));
    return {on: x.base.slice(-200), onNeg: x.neg, off: off.base.slice(-60)};
  });
  console.log('nai text on:', /\nText: 뭐라고!\n\nSTOP$/.test(r2.on) && /, text, speech bubble/.test(r2.on), '| neg freed:', !/(^|, )(speech bubble|english text)(,|$)/.test(r2.onNeg));
  console.log('nai text off:', /no text$/.test(r2.off));
  console.log('child in neg:', /(^|, )child(,|$)/.test(r.pair.neg));
  await b.close(); })();
