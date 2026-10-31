/* ================= 노벨AI: 바로 쓰는 장면 틀 =================
   사용자가 모아 둔 노벨AI 프롬프트(2컷 대비, 새벽 소파 포스터, 버섯숲 랜턴, 다음 날 아침 등 뒤, 위에서 본 놀링, 결박 상반신)와
   성인 BL 만화(사무실·출장지·판타지 용사·여름 바다 등)의 장면 구성을 바탕으로 만든 틀.
   고르면 AI 없이 바로 프롬프트가 나온다. 그림체(기본 C · 성인 웹코믹 룩 등)·등급 태그·네거티브는 naiPack 이 덧붙인다.
   모든 인물은 성인이다. 학교·학생·미성년을 떠올리는 소재와 강제·공개 굴욕 장면은 넣지 않는다.
   인물 외형: 인물 사전의 1·2번째 줄을 쓰고, 없으면 아래 기본 외형. */
const NP_LOOK = [
  '1boy, adult, mature male, 30s, tall, broad shoulders, muscular, thick neck, short black hair, undercut, sharp dark eyes, thick eyebrows, light stubble',
  '1boy, adult, mature male, late 20s, athletic build, defined muscles, short messy brown hair, warm light brown eyes, soft features',
];
const NP_NEG = 'child, young, aged down, shota, loli, teenager, school uniform, student, 1girl, female, breasts, bad anatomy, bad hands, extra fingers, missing fingers, deformed, blurry, lowres, worst quality, jpeg artifacts, watermark, signature, username';
const NAI_PRESETS = [
  // ---------- 사용자가 준 프롬프트를 남자 성인 인물용으로 다듬은 것 ----------
  {id: 'twopanel', group: '모아 둔 프롬프트', name: '2컷 대비 · 소파에서 책 읽기', rating: 'nsfw', size: '832x1216',
    base: '2panels, two equal-sized rectangular panels stacked vertically, clear black rectangular border, 1boy, solo, full body, straight-on, living room, throw pillows on the sofa, a casually draped blanket over the backrest, framed pictures on the wall, warm afternoon light, [top panel]: sitting curled up on the sofa, feet on the sofa, 1.3::knees drawn up to chest, knees together, feet together ::, holding an open book in front of chest, reading a book, looking down at the book, calm expression, [bottom panel]: sitting on the sofa, 1.2::knees bent, knees apart, relaxed open posture, feet planted wide apart ::, holding an open book in front of mouth, mouth hidden behind the book, looking at viewer, 1.4::playful smile, mischievous grin, narrowed eyes ::, chin slightly tilted, motion lines near knees',
    chars: [{who: 0, pos: 'C3', act: 'white oversized t-shirt, black oversized shorts, barefoot, toned calves'}],
    note: '위·아래 컷의 분위기 차이(얌전함 → 장난기)가 핵심. 옷 색과 소품만 바꿔 써요.'},
  {id: 'dawn', group: '모아 둔 프롬프트', name: '새벽 소파 · 음악 영상 포스터', rating: 'safe', size: '1216x832',
    base: '1boy, solo, very aesthetic, masterpiece, 2::profile, full body ::, 1.1::wide shot, room interior visible ::, 1.5::long plush sofa, deep soft sofa, rounded curved armrests, overstuffed cushions, throw blanket draped on sofa ::, 1.5::apartment living room at dawn, before sunrise, blue hour ::, 1.3::cold blue light coming through a large window, sheer curtains, city lights outside the window ::, 1.2::soft blue ambient light filling the room, well-lit character, rim light from the window ::, faint orange glow from cigarette ember, 1.2::messy room, ashtray on the floor, clothes tossed on the floor ::, empty beer cans, low coffee table, rug, plants, wooden floor, quiet atmosphere, melancholic, cinematic, 1.5::thin white progress bar at the bottom, progress bar partially filled, small round white knob, small white pause icon in the bottom left corner, minimal UI overlay ::, 1.6::magazine cover layout, empty space on the right for a title ::',
    chars: [{who: 0, pos: 'B3', act: '1.6::half-lying on the sofa, upper body propped against the armrest, body sinking into the cushions ::, 1.5::one knee slightly bent, other leg stretched out ::, 1.4::head resting against the armrest, head tilted back, chin raised ::, 1.5::eyes looking up at the ceiling ::, half-closed eyes, hollow expression, loose white shirt, unbuttoned, grey sweatpants, one arm hanging off the sofa holding a single cigarette, smoke rising'}],
    note: '노래 제목·가수는 그림에 넣지 말고 나중에 글자로 얹어요(노벨AI 글자는 깨지기 쉬워요).'},
  {id: 'spore', group: '모아 둔 프롬프트', name: '버섯숲 · 랜턴 든 여행자', rating: 'safe', size: '832x1216',
    base: '1boy, solo, post-apocalyptic fungal spore forest, colossal mushroom trees and layered spore canopies, bioluminescent mycelium veins, luminous spores drifting like pollen, a glowing butterfly, full body, centered, eye-level to slight low angle, medium-wide environmental shot, clear silhouette, deep indigo and violet sky, bright sparkling stars, faint milky nebula, giant mushrooms glowing cyan, magenta and amber, lantern light pooling on nearby fungi and clothing, 1.2::a single oblique shaft of cool moonlight from upper left, soft volumetric moonbeam, glittering spore motes inside the beam ::, 5::colorful and detailed background ::, 2::rim light ::, cinematic lighting, quiet awe',
    chars: [{who: 0, pos: 'C3', act: 'traveler coat, scarf, leather boots, satchel, holding a warm oil lantern slightly lifted, looking up in wonder'}],
    note: '표지·티저용. 등급을 성인으로 바꿔도 장면 자체는 일반이에요.'},
  {id: 'morning', group: '모아 둔 프롬프트', name: '다음 날 아침 · 등의 자국', rating: 'nsfw', size: '832x1216',
    base: '1boy, solo, back view, standing, kitchen background, indoor, kitchen counter, kitchen appliances, coffee maker, morning light, soft indoor lighting, sunlight through window, detailed background, detailed skin texture',
    chars: [{who: 0, pos: 'C3', act: 'shirtless, bare back, 1.2::muscular back, defined back muscles ::, light gray sweatpants, low-rise, 1.1::scratch marks on back, red nail marks ::, 1.2::kiss marks and faint bite marks on shoulder blade ::, 1.3::one hand scratching the back of his head ::, relaxed casual pose, looking over shoulder, sleepy expression, messy bed hair'}],
    note: '전날 밤을 보여 주지 않고 흔적으로 암시하는 컷. 표지 다음 장으로 좋아요.'},
  {id: 'knolling', group: '모아 둔 프롬프트', name: '위에서 본 놀링 · 흩어진 물건', rating: 'safe', size: '832x1216',
    base: '1boy, solo, masterpiece, best quality, 1.9::from above, flat lay, knolling, overhead view ::, full body, lying on back, light pink pillow, 2::objects arranged around character, scattered items ::, 1.7::light blue denim jacket, cream knit sweater, red plaid scarf, black cargo pants, brown leather belt, white sneakers, striped socks ::, discarded clothes laid out, 1.5::vintage film camera, silver body, leather strap ::, 1.4::white wireless headphones ::, 1.6::skateboard, pastel deck, yellow wheels ::, cassette tapes, takeout coffee cup, sunglasses, smartphone, 1.2::an orange dog, fluffy fur, lying on clothes ::, 1.8::pastel paint splatter, pink and yellow paint drops ::, confetti, scattered flower petals, 1.8::clear white background, simple background ::, 1.4::pastel colors, cream, mustard yellow, sage green, soft pink ::, cozy',
    chars: [{who: 0, pos: 'C3', act: 'one arm raised above head, hand on pillow, bent knee, barefoot, 2.2::oversized hoodie, loose hoodie, shirt lift, midriff, abs, toned body ::, 2.2::plaid pajama pants, rolled up pant legs ::, waistband visible, relaxed smile'}],
    note: '[color] 자리에 옷 색을 넣어 써요. 소품을 인물의 직업·취미에 맞게 바꾸면 캐릭터 소개 컷이 돼요.'},
  {id: 'rope', group: '모아 둔 프롬프트', name: '결박 상반신 · 잉크 초상', rating: 'nsfw', size: '832x1216',
    base: '1boy, solo, 2.5::upper body portrait ::, 2.4::three-quarter view ::, slightly lowered head, character filling the frame, 2.5::plain white background ::, bold black lineart, rough expressive ink strokes, strong black shadows, muted cool colors, sharp anatomical definition, high contrast',
    chars: [{who: 0, pos: 'C3', act: '2.5::very muscular masculine body ::, 2.4::massive defined pectorals ::, broad shoulders, defined abs, 2.6::shirtless ::, 2.6::black shibari ropes binding the torso ::, rope coils around chest and upper arms, arms bound behind back, visible rope tension against skin, braided rope texture, secure knots, 2.3::defiant glare ::, furrowed eyebrows, clenched jaw, sweat droplets on neck and chest'}],
    note: '원래 프롬프트의 재갈·침 묘사는 빼고 표정과 밧줄 질감에 힘을 줬어요. 필요하면 인물 칸에 더해요.'},
  // ---------- 성인 BL 만화 구성을 참고한 장면 (모두 성인, 서로 원하는 관계) ----------
  {id: 'cover4', group: '성인 만화 장면', name: '표지 · 4컷 콜라주 + 제목 띠', rating: 'nsfw', size: '832x1216',
    base: '2boys, yaoi, 1.4::comic cover collage, 4koma-like grid of six panels, thin white gutters ::, 1.3::empty ornate parchment title banner in the center, empty caption box below it ::, varied shots: close-up of flushed faces, embrace, hands intertwined, full body silhouette in a doorway, warm interior lighting, cinematic, dramatic composition, korean webtoon cover',
    chars: [{who: 0, pos: 'B2', act: 'shirt half unbuttoned, loosened tie, looking at the other man, intense gaze, flushed cheeks'}, {who: 1, pos: 'D4', act: 'shy smile, blush, glancing away, collarbone visible'}],
    note: '가운데 띠와 설명 칸은 비워 두고, 그린 뒤에 제목·한 줄 소개를 얹어요(받아 둔 만화 표지 형식).'},
  {id: 'office', group: '성인 만화 장면', name: '야근하는 사무실 · 책상 앞 키스', rating: 'nsfw', size: '832x1216',
    base: '2boys, yaoi, adult, office at night, after hours, empty open-plan office, desk lamp light, monitor glow, city night view through floor-to-ceiling windows, blinds casting stripe shadows, cowboy shot, from side, intimate atmosphere, warm and cool contrast lighting, sweat, heavy breathing',
    chars: [{who: 0, pos: 'C2', act: 'source#kiss, office worker, white dress shirt, sleeves rolled up, loosened necktie, suit vest, pressing the other man against the desk, one hand on the desk, leaning in, dominant gaze'},
            {who: 1, pos: 'C4', act: 'target#kiss, office worker, dress shirt unbuttoned, necktie pulled loose, sitting on the edge of the desk, hands gripping the shirt of the other man, eyes half-closed, blush, flustered, documents scattered'}],
    note: '아끼던 후배·직장 동료 구도. 수위는 웹툰 탭의 수위나 등급으로 조절해요.'},
  {id: 'hotel', group: '성인 만화 장면', name: '출장지 호텔 · 넥타이 풀기', rating: 'nsfw', size: '832x1216',
    base: '2boys, yaoi, adult, business hotel room at night, king bed with white sheets, city lights through large window, warm bedside lamp, suitcase, discarded suit jackets on the chair, medium shot, from slightly above, intimate atmosphere, soft warm lighting, sweat, steamy',
    chars: [{who: 0, pos: 'B3', act: 'source#undressing another, shirtless, suit trousers, belt undone, untying the necktie of the other man with one hand, smirk, half-lidded eyes'},
            {who: 1, pos: 'D3', act: 'target#undressing another, sitting on the bed, dress shirt open, bare chest, flushed face, biting lip, looking up, nervous but eager'}],
    note: '출장 첫날 밤 구도. 침대 시트·창밖 야경이 분위기를 만들어요.'},
  {id: 'hero', group: '성인 만화 장면', name: '용사와 기사 · 여관 촛불', rating: 'nsfw', size: '832x1216',
    base: '2boys, yaoi, adult, medieval fantasy inn room, wooden walls, candlelight, flickering warm light, fireplace glow, armor pieces and a longsword resting against the wall, rumpled bed, cowboy shot, romantic atmosphere, painterly lighting, sweat',
    chars: [{who: 0, pos: 'B3', act: 'source#embrace, hero, battle scars on chest, shirtless, leather trousers, hugging from behind, kissing the neck of the other man, eyes closed'},
            {who: 1, pos: 'C3', act: 'target#embrace, knight, half-removed white tunic, bare shoulders, leaning back into the embrace, blush, head tilted, gasping'}],
    note: '용사의 구애·용사의 시간 같은 판타지 회차. 칼은 장검(longsword)으로 두어요.'},
  {id: 'beach', group: '성인 만화 장면', name: '여름 휴가 · 해 질 녘 바닷가 (어른)', rating: 'nsfw', size: '832x1216',
    base: '2boys, adult, summer vacation, tropical beach at sunset, palm trees, golden hour, ocean waves, wet sand, warm orange sky, lens flare, medium shot, playful atmosphere, wet skin, water droplets, tan lines',
    chars: [{who: 0, pos: 'B3', act: 'swim trunks, tanned skin, wet hair, laughing, pulling the other man by the wrist toward the sea'},
            {who: 1, pos: 'D3', act: 'board shorts, open short-sleeve shirt, bare chest, wet, blush, embarrassed smile'}],
    note: '휴가 온 직장인 둘. 학교·방학 느낌 태그는 넣지 않아요.'},
  {id: 'shower', group: '성인 만화 장면', name: '샤워 후 · 김 서린 욕실', rating: 'nsfw', size: '832x1216',
    base: '1boy, solo, adult, bathroom, steam, fogged mirror, soft diffused light, white tiles, water droplets, cowboy shot, from side, sensual atmosphere, wet skin, glistening skin',
    chars: [{who: 0, pos: 'C3', act: 'towel around waist, wet hair slicked back, water dripping down chest and abs, wiping fog off the mirror with one hand, looking at his reflection, half-lidded eyes'}],
    note: '혼자 나오는 쉬어 가기 컷.'},
  {id: 'bed', group: '성인 만화 장면', name: '침대 위 · 서로 껴안기 (높은 수위)', rating: 'nsfw', size: '832x1216',
    base: '2boys, yaoi, adult, explicit, sex, on bed, rumpled white sheets, dim bedroom, warm lamp light, intimate, loving, sweat, steam, heavy breathing, close-up, from above, intertwined fingers, pinned hands',
    chars: [{who: 0, pos: 'C2', act: 'source#sex, nude, muscular back, on top, kissing, gentle expression, sweat'},
            {who: 1, pos: 'C4', act: 'target#sex, nude, lying on back, arms around the neck of the other man, blush, tears of pleasure, open mouth, half-lidded eyes'}],
    note: '서로 원하는 관계로 그려요(껴안기·손깍지·다정한 표정). 더 높은 수위는 웹툰 탭의 장면 지시로 더해요.'},
];

// 인물 사전 1·2번째 줄 → 외형 태그 (이름: 태그)
function npLook(i){
  const line = naiCharsDict()[i] || ''; const k = line.indexOf(':');
  return {name: k > 0 ? line.slice(0, k).trim() : (i ? '인물 B' : '인물 A'), tags: k > 0 ? line.slice(k + 1).trim() : NP_LOOK[i]};
}
// 벗은 장면(nude·shirtless 등)이면 인물 사전의 옷 태그를 뺀다 (노벨AI 로 뽑아 보니 정장·셔츠 태그가 남아 서로 부딪쳤다)
const NP_CLOTHES = /(shirt|suit|tie\b|coat|vest|tank top|shorts|uniform|jacket|pants|trousers|boots|armor|cloak|tabard|belt|brooch|gloves|badge|wristwatch|sword|lanyard|sleeves|hoodie|sweater|dress|scarf|cap|hat)/i;
function npUndress(tags, act){
  if (!/\b(nude|naked|shirtless|topless|undressed|towel around waist)\b/i.test(act)) return tags;
  const top = /\b(shirtless|topless)\b/i.test(act) && !/\b(nude|naked)\b/i.test(act);   // 윗옷만 벗었으면 바지 쪽은 둔다
  return tags.split(', ').filter(t => !NP_CLOTHES.test(t) || (top && /(pants|trousers|shorts|boots|belt)/i.test(t))).join(', ');
}
function npBuild(pr){
  $('#naiRating').value = pr.rating; store.set('set.naiRating', pr.rating);
  const res = {
    base_prompt: pr.base,
    characters: pr.chars.map(c => { const L = npLook(c.who); return {name: L.name, prompt: `${npUndress(L.tags, c.act)}, ${c.act}`, negative: '', position: c.pos}; }),
    negative: NP_NEG, size: pr.size, notes: pr.note,
  };
  const p = naiPack(res);
  if (MINOR_RE.test([p.base, ...p.chars.map(x => x.prompt)].join(' '))) throw new Error('미성년을 떠올리게 하는 태그가 섞여 있어요. 인물 사전을 고쳐 주세요');
  return p;
}
function npFill(){
  const sel = $('#naiPreset'); if (!sel) return;
  const groups = [...new Set(NAI_PRESETS.map(p => p.group))];
  sel.innerHTML = '<option value="">고르기…</option>' + groups.map(g => `<optgroup label="${esc(g)}">` + NAI_PRESETS.filter(p => p.group === g).map(p => `<option value="${p.id}">${esc(p.name)}${p.rating === 'nsfw' ? ' · 성인' : ''}</option>`).join('') + '</optgroup>').join('');
  sel.onchange = () => {
    const pr = NAI_PRESETS.find(p => p.id === sel.value); if (!pr) return;
    try{
      const p = npBuild(pr); renderNai(p);
      $('#naiIn').value = `[틀] ${pr.name}`;
      toast('틀을 넣었어요. 그대로 그리거나, 인물 사전·태그를 고쳐 써요');
    }catch(e){ toast(e.message); }
  };
}
npFill();
window.nvNaiPresets = {list: NAI_PRESETS, build: id => npBuild(NAI_PRESETS.find(p => p.id === id))};   // 시험용

/* ---------- 인물 틀: 받아 둔 성인 BL 만화의 인물 유형을 본뜬 '새' 인물들 ----------
   만화 속 인물을 그대로 옮기지 않고, 체형·머리·분위기 유형만 가져와 이름·외형을 새로 지었다. 모두 성인.
   고르면 인물 사전 맨 위 두 줄로 들어간다(장면 틀은 1·2번째 줄을 쓴다). 이미 있는 줄은 지우지 않는다. */
const NP_CAST = {
  '차민혁': '1boy, adult, mature male, 34 years old, tall, broad shoulders, fit muscular build, neat black side-parted hair, sharp narrow dark eyes, thin rimless glasses, clean-shaven, strong jaw, charcoal suit, white dress shirt, dark tie, wristwatch',
  '윤시우': '1boy, adult, mature male, 27 years old, athletic build, defined chest, soft messy brown hair, round warm brown eyes, thick eyebrows, easily flushed cheeks, light blue dress shirt, sleeves rolled up, lanyard id badge',
  '강도현': '1boy, adult, mature male, 36 years old, very muscular, massive chest, thick neck, broad shoulders, tanned skin, short black hair, faded sides, thick straight eyebrows, sharp dark eyes, light stubble, square jaw, small scar on chin, navy blue field uniform jacket, shoulder patch, cargo pants, combat boots',
  '백무진': '1boy, adult, mature male, 45 years old, burly, thick arms, chest hair, salt and pepper short hair, full trimmed beard, round wire glasses, kind eyes, crow\'s feet, tweed vest, rolled shirt sleeves',
  '서이준': '1boy, adult, mature male, 26 years old, tall, lean muscular build, pale skin, black hair swept back with loose strands over forehead, sharp grey eyes, long eyelashes, aristocratic features, black high-collar coat, silver brooch, leather gloves',
  '레온': '1boy, adult, mature male, 28 years old, muscular, broad chest, fair skin, golden blond short wavy hair, bright blue eyes, light freckles across nose, warm smile, white linen shirt, knight tabard, leather belt',
  '카엘': '1boy, adult, mature male, 33 years old, rugged, very muscular, sun-tanned skin, dark brown hair tied in a short low ponytail, amber eyes, scar across the bridge of the nose, stubble, worn leather armor, travel cloak, longsword at hip',
  '한태오': '1boy, adult, mature male, 29 years old, very muscular, bulky chest, thick thighs, tanned skin, short black crew cut, thick dark eyebrows, bright dark eyes, boyish grin, sleeveless black tank top, gym shorts',
};
const NP_PAIRS = [
  {id: 'office', name: '사무실 선배·후배', cast: ['차민혁', '윤시우'], for: '야근 사무실 · 출장지 호텔'},
  {id: 'agency', name: '현장 요원 · 노련한 국장', cast: ['강도현', '백무진'], for: '사무실 · 표지 콜라주'},
  {id: 'knights', name: '귀족 기사 · 금발 기사', cast: ['서이준', '레온'], for: '여관 촛불 · 표지 콜라주'},
  {id: 'hero', name: '떠돌이 용사 · 금발 기사', cast: ['카엘', '레온'], for: '용사와 기사 · 버섯숲'},
  {id: 'summer', name: '휴가 온 직장인 둘', cast: ['한태오', '윤시우'], for: '여름 바닷가 · 샤워 후'},
  {id: 'vr', name: 'VR 게임 잠입 파티', cast: ['한태오', '강도현'], for: '결박 상반신 · 다음 날 아침',
    outfit: {'한태오': 'black stealth bodysuit, black cloth face mask covering mouth and nose, fingerless gloves, thigh straps'}},
];
function npCastLine(name, outfit){
  let tags = NP_CAST[name];
  if (outfit) tags = tags.split(', ').filter(t => !/(shirt|suit|tie|coat|vest|tank top|shorts|uniform|jacket|pants|boots|armor|cloak|tabard|belt|brooch|gloves|badge|wristwatch|sword|lanyard|sleeves)/i.test(t)).join(', ') + ', ' + outfit;
  return `${name}: ${tags}`;
}
function npCastFill(){
  const sel = $('#naiCast'); if (!sel) return;
  sel.innerHTML = '<option value="">고르기…</option>' + NP_PAIRS.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.cast.join('·'))})</option>`).join('');
  sel.onchange = () => {
    const pr = NP_PAIRS.find(p => p.id === sel.value); if (!pr) return;
    const top = pr.cast.map(n => npCastLine(n, pr.outfit?.[n]));
    const rest = naiCharsDict().filter(l => !pr.cast.some(n => l.startsWith(n + ':')));
    $('#naiChars').value = [...top, ...rest].join('\n');
    store.set('set.naiChars', $('#naiChars').value); if ($('#wtChars')) $('#wtChars').value = $('#naiChars').value;
    toast(`${pr.cast.join('·')} 을 인물 사전 맨 위에 넣었어요 · 잘 맞는 틀: ${pr.for}`);
    const pv = $('#naiPreset'); if (pv?.value) pv.dispatchEvent(new Event('change'));   // 고른 장면 틀이 있으면 새 인물로 다시
  };
}
npCastFill();
window.nvNaiCast = {cast: NP_CAST, pairs: NP_PAIRS, line: npCastLine};   // 시험용
