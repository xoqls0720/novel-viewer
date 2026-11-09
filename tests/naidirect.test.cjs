// 태그로 바로 만들기: | 로 나눈 태그 → 그림체·인물 사전·등급으로 감싸기, 성인 태그면 등급 자동 성인, 미성년 표현은 막기, 내 조각 저장·넣기
const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.type() === 'prompt' ? d.accept('옥상 기본') : d.accept());
  await p.goto('file://' + path.resolve(__dirname, '..') + '/index.html'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const o = {};
    document.querySelector('#naiChars').value = '강재혁: 1boy, adult, bleached blond undercut, piercings\n오동구: 1boy, adult, chubby, round glasses';
    const sel = document.querySelector('#naiStyleSel'); sel.value = 'v43a17'; sel.dispatchEvent(new Event('change'));
    document.querySelector('#naiRating').value = 'safe';
    document.querySelector('#naiTags').value = '2boys, rooftop, dusk, cowboy shot | 강재혁, smirk | 오동구, flustered';
    const p1 = nvNaiTags.build();
    o.safe = !!p1 && p1.base.includes('crosshatching') && p1.chars.length === 2 && p1.chars[0].prompt.includes('bleached') && p1.chars[0].prompt.includes('smirk') && p1.chars[1].prompt.includes('round glasses') && /(^|, )nsfw(,|$)/.test(p1.neg);
    document.querySelector('#naiTags').value = 'nsfw, 2boys, bedroom | 강재혁 | 오동구';
    const p2 = nvNaiTags.build();
    o.adultAuto = document.querySelector('#naiRating').value === 'nsfw' && !!p2 && p2.base.includes('nsfw') && !/(^|, )nsfw(,|$)/.test(p2.neg) && p2.chars.every(c => /\badult\b/.test(c.prompt));
    document.querySelector('#naiTags').value = 'nsfw, 1boy, shota';
    o.minorBlocked = nvNaiTags.build() === null;
    o.out = document.querySelector('#naiOut').textContent.includes('강재혁') || document.querySelector('#naiOut').textContent.includes('bleached');
    return o;
  });
  const r2 = await p.evaluate(async () => {
    const T = document.querySelector('#naiTags'); T.value = 'dusk, rooftop | 강재혁, smirk'; document.querySelector('#naiSnipName').value = '옥상 기본'; document.querySelector('#naiSnipSave').click(); await new Promise(r => setTimeout(r, 150));
    T.value = 'rain'; const S = document.querySelector('#naiSnip'); S.value = '옥상 기본'; document.querySelector('#naiSnipAdd').click(); const merged = T.value;
    document.querySelector('#naiTagChars').click(); return {merged, withChars: T.value};
  });
  const merged = r2.merged, withChars = r2.withChars;
  console.log('safe build:', r.safe, '| adult auto:', r.adultAuto, '| minor blocked:', r.minorBlocked, '| shown:', r.out);
  console.log('snip merge:', merged === 'rain, dusk, rooftop | 강재혁, smirk', '| chars added:', /\| 강재혁 \| 오동구$/.test(withChars));
  console.log('ERRORS:', errs.length ? errs.join(' / ') : 'none'); await b.close(); })();
