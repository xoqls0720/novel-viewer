/* ================= 웹툰 자동 만들기: 줄거리 → 대본 → 쪽·컷·말풍선 → (컴퓨터) 컷 그림 ================= */
const WT_LAYOUT_KEYS = Object.keys(WT_LAYOUTS);
// 우리 기본 그림체 2종 (인수인계 문서 house_style v15 / 암실 룩 기준, NAI V5)
// v43 B 시그니처: 작가 17명 믹스에서 얼굴을 평균으로 모으던 무게를 낮춘 판(CORE_DIV). 얼굴 원형(인물 사전)과 함께 쓴다
const V43_CORE_DIV = '0.8::artist:krenz_cushart ::, 1.0::artist:rei_(sanbonzakura) ::, 0.6::artist:wakabayashi_toshiya ::, artist:rei_(sanbonzakura), 0.45::artist:blackbox_(blackbox9158) ::, 1.2::artist:oharu-chan ::, 0.8::artist:yamamoto_souichirou ::, 0.25::artist:meyoco ::, 0.75::artist:mika_pikazo ::, 0.42::artist:tobo_katsuo ::, 0.23::artist:hungry_clicker ::, 0.45::artist:john_kafka ::, 0.27::artist:na_tarapisu153 ::, 0.9::artist:gongzuotianxiadiyi, artist:mnnd ::, 0.8::artist:pigeon666 ::, 0.8::artist:ashinamaturi ::, year 2025, year 2026, -2::flat color ::, -2::artist collaboration ::, 2::highres ::, 1.3::best quality ::, amazing quality, best illustration, 1.3::soft shading ::, glossy hair, detailed eyes, cinematic lighting, rim light, depth of field, 1.4::semi-realistic ::, 1.2::realistic lighting ::, -1::manga ::, film grain, very aesthetic, absurdres, detailed eyes, 1.2::key visual ::, highly detailed, dramatic lighting, rim light, volumetric lighting, particles, wind, depth of field, 0.4::artist:ask_(askzy) ::, -1.2::bishounen ::, 1.8::graphite pencil lines, textured pencil strokes over vivid color ::, 1.4::calligraphic ink lines, ink drips and splatter ::, 1.1::detailed hands ::, 1.5::torn paper edges, rough watercolor paper texture, painting fading into blank paper at borders ::';
const WT_STYLE = {
  neon: {
    name: '기본 A · 야수파 + 네온',
    // 공식 순서: ask + mika + 팔레트 + LINES + LUP + UPM + TORN + [FXP] + FOCUS + 인물(자세 1.4~1.5) + HAIR2 + FPM + DEV2 + 꼬리 + QG + no text
    head: '0.4::artist:ask_(askzy) ::, 0.75::artist:mika_pikazo ::, fauvist palette, bold complementary colors, vivid saturated color, thick confident lineart, dramatic rim lighting, 1.3::thin hot pink and electric cyan ribbon lines ::, torn paper border',
    fx: '1.2::paint splatter, dripping paint ::',                                   // 전투·각성 컷에서만
    focus: '1.8::his handsome face is the focal point, drawn with obsessive detail ::',
    tail: 'detailed hair strands, beautiful detailed eyes, painterly, high contrast, cinematic composition, looking at viewer, closed mouth, masterpiece, best quality, very aesthetic, absurdres',
    neg: 'child, bad face, bad eyes, deformed face, extra fingers, lipstick, makeup, eyeshadow, smile, grin, smirk, teeth, open mouth, katana, glasses, eyewear, 1girl, female, camera, hand on face, hands near face, bright pastel everyday palette',
  },
  dark: {
    name: '기본 B · 암실 룩',
    head: '0.4::artist:ask_(askzy) ::, -1.2::bishounen ::, -1::same face ::, 1.1::low key lighting ::, deep shadows',
    frame: '1.15::seen through {FRAME} ::, framed composition, foreground silhouette',   // 액자 효과가 핵심
    tail: 'extremely handsome man, beautiful detailed eyes, half-lidded eyes, looking at viewer, closed mouth, 1.2::limited palette ::, 1.2::{MONO} monochrome ::, ink black shadows, dust particles, sparkles, film grain, painterly, cinematic composition, storytelling, high contrast, masterpiece, best quality, very aesthetic',
    neg: 'bishounen, child, smile, grin, smirk, teeth, lipstick, makeup, katana, glasses, eyewear, 1girl, female',
    dropNeg: /\bfilm grain\b/gi,   // 암실 룩은 필름 그레인을 살린다
  },
  comic: {
    name: '기본 C · 성인 웹코믹 셀 음영',
    // 받아 둔 성인 만화(준호·아카데미·용사)의 결. 노벨AI(V4.5)로 뽑아 비교하며 맞췄다(2026-10-30):
    // 처음엔 피부가 번들거리고 일본 애니 얼굴이 됐다 → 중간 굵기 선, 셀 + 부드러운 에어브러시 홍조, 무광 피부, 한국 웹툰 얼굴, 흐린 단순 배경으로.
    head: 'korean webtoon, manhwa, digital comic art, 1.3::clean medium-weight black lineart ::, 1.3::cel shading with soft airbrushed gradients on skin, soft blush gradients ::, 1.2::semi-realistic proportions, korean male face, natural narrow eyes ::, muted desaturated warm palette, matte skin, 1.2::simple painted background, low-detail background, soft focus background ::, 1.1::mature male, adult man ::',
    tail: 'expressive face, clean composition, masterpiece, best quality, very aesthetic',
    neg: 'shiny skin, oily skin, glossy skin, specular highlights, anime style, sketch, rough lines, watercolor, 3d, realistic, photorealistic, detailed background, chibi, bishounen, child, young, aged down, shota, 1girl, female',
  },
  sketch: {
    name: '기본 D · 성인 웹코믹 손그림',
    // 노벨AI(V4.5)로 뽑아 비교: 연필 선·평평한 남색·밝은 배경·홍조·입김이 받아 둔 만화와 잘 맞아 그대로 둔다(2026-10-30)
    // 받아 둔 성인 만화(직장동료 류x최·최요원)의 결: 연필 같은 거친 손그림 선(굵기 들쭉날쭉), 거의 평평한 채색에 마른 붓 결 그림자,
    // 남색·회색 위주로 가라앉은 색, 밝고 단순한 배경, 볼·코끝 홍조, 작은 땀방울, 입김. 화가 이름은 쓰지 않는다
    head: 'korean webtoon, manhwa, 1.3::rough sketchy lineart, uneven hand-drawn line weight, pencil-like strokes ::, 1.3::flat colors, minimal shading, soft dry brush texture in shadows ::, 1.1::muted desaturated palette, navy and grey tones ::, bright simple background, light airy atmosphere, 1.2::rosy blush across cheeks and nose tip ::, small sweat drops, faint breath steam, 1.1::mature male, adult man ::',
    tail: 'expressive eyes, detailed hands, masterpiece, best quality, very aesthetic',
    neg: 'cel shading, hard shadows, glossy skin, 3d, realistic, high contrast, heavy shadows, neon, child, young, aged down, shota, 1girl, female',
  },
  spot: {
    name: '기본 E · 스팟컬러 에디토리얼',
    // 2026-11-06 설계(house_style_C_spot_editorial_1106.md): 트위터 V5 공유 프롬프트의 잡지·콜라주·먹 포스터 문법 + 우리 찢긴 종이·얼굴 초점.
    // 숯회색·흰색 단색 + 스팟컬러 하나({MONO} = 아래 '단색' 칸). 색은 넥타이·목도리 같은 작은 천 하나에만.
    head: '4::spot color, monochrome, grayscale ::, 1.4::charcoal grey and white, single {MONO} accent color ::, 1.4::bold ink illustration, thick brushstrokes, high contrast ::, 1.3::torn paper edges ::, 1.3::editorial poster layout, layered composition, clean negative space ::, high complexity, meta:golden era, depthness',
    focus: '1.8::his handsome face is the focal point, drawn with obsessive detail ::',
    tail: 'beautiful detailed eyes, calm composed expression, looking at viewer, closed mouth, masterpiece, best quality, very aesthetic',
    neg: 'full color, colorful, rainbow, multiple accent colors, smile, grin, teeth, lipstick, makeup, 1girl, female, child, bishounen, same face, watermark, signature',
  },
  // 트위터 #프롬공유 NV5 글에서 많이 쓰는 짜임(품질 태그 → 구도 → 가중치 준 매체 → 색)을 우리 말로 새로 쓴 것. 남의 프롬을 그대로 옮기지 않았다.
  // 2026-11-06 픽시AI 기본 모델로만 시험했다. 노벨AI V5 결과는 아직 못 봤다.
  editorial: {
    name: '화보 F · 흑백 에디토리얼',
    head: 'cinematic composition, 1.4::high-end fashion editorial ::, elegant monochrome illustration, screentone, sharp silhouette, negative space, 1.1::mature male, adult man ::',
    tail: 'beautiful detailed eyes, high contrast, masterpiece, best quality, very aesthetic',
    neg: 'color, saturated, cluttered background, chibi, child, young, aged down, shota, 1girl, female',
  },
  watercolor: {
    name: '로맨스 G · 수채 잉크',
    head: 'delicate illustration, 1.4::visible watercolor washes, pigment bleeding ::, thin ink outline, 1.2::pastel muted colors ::, soft bloom, paper grain, 1.1::mature male, adult man ::',
    tail: 'depth of field, gentle lighting, masterpiece, best quality, very aesthetic',
    neg: 'cel shading, hard shadows, glossy skin, 3d, realistic, neon, child, young, aged down, shota, 1girl, female',
  },
  gothic: {
    name: '판타지 H · 고딕 동판화',
    head: '1.4::ornate engraved linework ::, crosshatching, gothic illustration, 1.2::deep burgundy and antique gold ::, dramatic chiaroscuro, art nouveau frame, 1.1::mature male, adult man ::',
    tail: 'storytelling, cinematic composition, masterpiece, best quality, very aesthetic',
    neg: 'pastel, flat color, cute, chibi, 3d, child, young, aged down, shota, 1girl, female',
  },  // ---------- v43 라인업 (2026-11-08, house_style_v43_lineup.md) · NovelAI V5 로 시험해 고른 상업용 그림체 ----------
  v43nov: {
    name: '표지 1 · 남성향 웹소설 표지',
    head: '1.5::korean web novel cover illustration, epic action key visual, highly detailed digital painting ::, 1.3::dramatic rim lighting, glowing particles, cinematic depth ::, 1.1::dark sky area at the top ::, 1.4::the hero is large in the frame, face clearly visible ::, high complexity',
    tail: 'very aesthetic, masterpiece, best quality',
    neg: 'letters, tiny figure, small character, bad anatomy, bad hands, extra fingers, fused fingers, deformed face, watermark, signature, child, aged down, baby face, ugly, long face, big chin, old man, rugged, beard, stubble',
    safeNeg: 'nude, nipples, explicit',
    focusMale: '1.4::extremely handsome man, beautiful sharp face, small face ::',
  },
  v43rofan: {
    name: '표지 2 · 로판 표지',
    head: '1.5::romance fantasy web novel cover, ornate gold and ivory, soft glowing light, lavish costume detail, painterly semi-realistic ::, 1.3::flower petals drifting, sparkles ::, 1.2::empty space at the top for a title ::',
    tail: 'very aesthetic, masterpiece, best quality',
    neg: 'bad anatomy, bad hands, extra fingers, fused fingers, deformed face, watermark, signature, child, aged down, baby face, ugly, long face, big chin, old man, rugged, beard, stubble',
    safeNeg: 'nude, nipples, explicit',
    focusMale: '1.4::extremely handsome man, beautiful sharp face, small face ::',
  },
  v43real: {
    name: 'D · 감성 반실사 (팅글 결)',
    head: '1.5::semi-realistic korean webtoon illustration, painterly realism, soft realistic shading ::, 1.3::detailed skin texture, pale porcelain skin, faint flush on cheeks and eyelids, glossy lips ::, 1.3::muted desaturated colors, soft natural window light, film photography mood ::, thick dark eyelashes, delicate handsome face, slightly messy hair',
    tail: 'intimate close framing, shallow depth of field, high quality, very aesthetic',
    neg: 'lowres, worst quality, bad quality, jpeg artifacts, watermark, signature, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, blurry, chibi, child, aged down, baby face, flat color, cel shading, lineart, thick outlines, torn paper, ink splatter, vivid saturated colors, neon, 1girl, female, deformed face, cross-eyed',
    safeNeg: 'nude, nipples, explicit',
    wide: /\b(intimate close framing|shallow depth of field)\b,?\s*/gi,
  },
  v43realph: {
    name: 'D2 · 감성 실사풍',
    head: '1.5::semi-realistic korean webtoon illustration, painterly realism, soft realistic shading ::, 1.3::detailed skin texture, pale porcelain skin, faint flush on cheeks and eyelids, glossy lips ::, 1.3::muted desaturated colors, soft natural window light, film photography mood ::, thick dark eyelashes, delicate handsome face, slightly messy hair, 1.3::photorealistic rendering, cinematic photograph look ::',
    tail: 'intimate close framing, shallow depth of field, high quality, very aesthetic',
    neg: 'lowres, worst quality, bad quality, jpeg artifacts, watermark, signature, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, blurry, chibi, child, aged down, baby face, flat color, cel shading, lineart, thick outlines, torn paper, ink splatter, vivid saturated colors, neon, 1girl, female, deformed face, cross-eyed',
    safeNeg: 'nude, nipples, explicit',
    wide: /\b(intimate close framing|shallow depth of field)\b,?\s*/gi,
  },
  v43bneon: {
    name: 'B · 네온 (현판·헌터·아이돌·SF)',
    head: V43_CORE_DIV + ', ' + 'vivid saturated colors, 1.8::fauvism, wild unnatural colors, green and violet shadows on skin ::, 1.5::neon noir, hot pink and electric cyan rim lights ::, low key lighting',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43bwarm: {
    name: 'B · 따뜻함 (로맨스·일상·가족)',
    head: V43_CORE_DIV + ', ' + '1.5::warm afternoon sunlight, peach, cream and sky blue palette ::, 1.3::fauvism, lilac and mint colored shadows on skin ::, bright high key lighting',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43bhorror: {
    name: 'B · 호러 (호러·미스터리·피폐)',
    head: V43_CORE_DIV + ', ' + '1.5::cold blue-grey palette, pale skin, a single spot of red ::, 1.3::fog, deep shadows ::, low key lighting',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43bwuxia: {
    name: 'B · 무협 (무협·동양 판타지·사극)',
    head: V43_CORE_DIV + ', ' + '1.5::ink wash, jade green and black ink palette, vermilion accent ::, 1.3::fauvism, jade shadows on skin ::',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43bcourt: {
    name: 'B · 궁정 (로판·서양 판타지)',
    head: V43_CORE_DIV + ', ' + '1.5::gold and ivory palette, candlelight amber glow ::, 1.3::fauvism, violet shadows on skin ::',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43bnoir: {
    name: 'B · 느와르 (조직·형사·복수)',
    head: V43_CORE_DIV + ', ' + '1.5::blood red and ink black palette, crimson rim light ::, 1.3::fauvism, crimson shadows on skin ::, low key lighting',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43bmood: {
    name: 'B · 무드판 (감성 캐릭터챗·유료 화보)',
    head: V43_CORE_DIV + ', ' + '1.4::muted desaturated palette, soft grey and dusty rose, a single deep red accent ::, 1.3::soft natural window light, film photography mood ::, 1.2::fauvism, faint lilac shadows on skin ::, 1.3::pale porcelain skin, faint natural flush on cheeks and eyelids, slightly reddened eyelids, thick dark eyelashes, languid gaze ::, 1.1::naturally rosy lips ::',
    tail: 'very aesthetic, masterpiece',
    neg: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, dithering, multiple views, logo, too many watermarks, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy, bad hands, extra fingers, blurry, text, watermark, signature, chibi, child, aged down, baby face, deformed face, dull eyes, cross-eyed, open mouth, dripping liquid, bad face, poorly drawn face, bad eyes, bad proportions, wrong head size, 2::bad hands, malformed hands, extra digits, fewer digits, fused fingers::, bad perspective, merged bodies, deformed bodies, ribbon, streamers, floating ribbons, vivid saturated colors, neon, lipstick, makeup',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43toon: {
    name: '웹툰 · 컬러 웹툰 컷',
    head: '1.6::korean full color webtoon panel, clean crisp lineart, soft cel shading, polished digital coloring ::, 1.2::bright readable colors, simple clean background ::',
    tail: 'very aesthetic, best quality',
    neg: 'bad anatomy, bad hands, extra fingers, fused fingers, deformed face, watermark, signature, child, aged down, baby face, ugly, long face, big chin, old man, rugged, beard, stubble',
    safeNeg: 'nude, nipples, explicit',
    focusMale: '1.4::extremely handsome man, beautiful sharp face, small face ::',
  },
  v43manga: {
    name: '만화 · 흑백 만화 페이지',
    head: '4::monochrome, greyscale ::, 1.6::black and white manga page, ink lineart, screentone shading, speed lines ::, 1.4::clean black panel borders, white gutters ::',
    tail: 'very aesthetic, best quality',
    neg: 'color, colorful, bad anatomy, bad hands, extra fingers, fused fingers, deformed face, watermark, signature, child, aged down, baby face',
    safeNeg: 'nude, nipples, explicit',
  },  // ---------- 성인 그림체 5종 (2026-11-08) · 포스타입 성인 상위작·리디 BL 랭킹을 보고 만든 렌더링 결. 장면·수위는 인물 사전과 등급이 정한다 ----------
  v43abl: {
    name: '성인 1 · BL 광택 반실사 (리디 BL 결)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::mature handsome men, defined muscular build, broad shoulders, sharp jawline, sharp narrow eyes ::, 1.3::glossy skin highlights, warm amber key light with teal shadows, soft bloom ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43afilm: {
    name: '성인 2 · 관능 화보 필름 (땀·체온·조명)',
    head: '1.5::intimate film photograph style illustration, painterly semi-realism ::, 1.4::sweat sheen on skin, faint steam, warm tungsten lamp light, deep soft shadows ::, 1.3::35mm film grain, shallow depth of field, muted warm palette, a single deep red accent ::, 1.2::sensual mood, half-lidded eyes, slightly parted lips ::',
    tail: 'very aesthetic, masterpiece, best quality',
    neg: 'flat color, cel shading, thick outlines, vivid saturated colors, chibi, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43ahl: {
    name: '성인 3 · 로맨스 수채 페인팅 (HL·여성향)',
    head: '1.5::romance webtoon illustration, soft painterly coloring, delicate thin lineart ::, 1.3::pastel rose and cream palette, warm backlight, glowing rim light on skin ::, 1.2::dreamy bokeh, drifting petals ::',
    tail: 'very aesthetic, masterpiece, best quality',
    neg: 'dark, gritty, chibi, 3d, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
  },
  v43adark: {
    name: '성인 4 · 다크 집착물 (감금·집착·느와르)',
    head: '1.5::dark romance illustration, high contrast chiaroscuro ::, 1.4::crimson and black palette, single hard key light, deep black shadows ::, 1.3::glossy skin, wet hair, intense possessive gaze, eyes clearly visible ::, 1.2::cinematic noir, film grain ::',
    tail: 'very aesthetic, masterpiece, best quality',
    neg: 'pastel, bright, flat color, chibi, face in complete shadow, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43aline: {
    name: '성인 5 · 트레틀용 선화 (흑백 라인)',
    head: '4::monochrome, lineart ::, 1.6::clean black lineart on pure white background, no shading, no color, uniform line weight ::, 1.3::anatomically accurate adult bodies, clear readable silhouette ::',
    tail: 'best quality',
    neg: 'color, shading, gradient, screentone, grey, background, scenery, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
  },  // ---------- 성인 그림체 6~16 (2026-11-08) · 성인 1(BL 광택)의 변주 + 다른 결 후보 12종 시험(G:\포스타입\성인그림체_후보12_고르기.jpg)에서 태빈이 모두 넣기로 함 ----------
  v43a02: {
    name: '성인 6 · BL 더 실사 (실사풍 미남 화보)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::mature handsome men, defined muscular build, broad shoulders, sharp jawline, sharp narrow eyes ::, 1.3::glossy skin highlights, warm amber key light with teal shadows, soft bloom ::, 1.5::semi_realistic ::, 1.3::realistic skin texture, visible skin pores, photorealistic lighting, cinematic photograph ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, cel shading, beard, stubble, facial hair, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a03: {
    name: '성인 7 · BL 웹툰 선 강조 (연재 컷·표지)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::mature handsome men, defined muscular build, broad shoulders, sharp jawline, sharp narrow eyes ::, 1.3::glossy skin highlights, warm amber key light with teal shadows, soft bloom ::, 1.5::crisp clean manhwa lineart, ligne claire, sharp cel shading with glossy highlights ::, 1.2::korean webtoon cover art ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, blurry, painterly, sketch, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a04: {
    name: '성인 8 · BL 근육 강조 (체격차·바라)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::mature handsome men, defined muscular build, broad shoulders, sharp jawline, sharp narrow eyes ::, 1.3::glossy skin highlights, warm amber key light with teal shadows, soft bloom ::, 1.5::bara, manly, thick muscular build, huge pectorals, thick neck, thick thighs ::, 1.2::light chest hair, light stubble ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, slender, skinny, bishounen, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a05: {
    name: '성인 9 · 미인수 결 (가는 몸·고운 얼굴)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::slender beautiful man, delicate pretty face, long eyelashes, soft lean build, pale glossy skin ::, 1.3::warm amber key light with teal shadows, soft bloom ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, muscular, bara, stubble, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a06: {
    name: '성인 10 · 야경 네온 (호텔·도시 밤)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::mature handsome men, defined muscular build, broad shoulders, sharp jawline, sharp narrow eyes ::, 1.3::glossy skin highlights, warm amber key light with teal shadows, soft bloom ::, 1.2::night city neon light through the window, soft magenta and cyan rim light ::, 1.1::rain streaks on glass ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, neon stains on skin, colored blotches, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a07: {
    name: '성인 11 · 유화 붓터치 (소장용 화보)',
    head: '1.5::korean BL webtoon illustration, semi-realistic manhwa, glossy rendering ::, 1.4::mature handsome men, defined muscular build, broad shoulders, sharp jawline, sharp narrow eyes ::, 1.3::glossy skin highlights, warm amber key light with teal shadows, soft bloom ::, 1.5::oil painting, thick visible brushstrokes, impasto texture, painterly ::, 1.2::rich warm palette ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, lineart, cel shading, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a08: {
    name: '성인 12 · 게임 CG (오토메·BL 게임풍)',
    head: '1.6::otome game CG, gacha splash art, game_cg, polished anime rendering ::, 1.4::mature handsome man, sharp eyes, defined muscles ::, 1.3::sparkling light particles, dramatic rim light, glossy highlights ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, realistic, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.5::face fully visible, unobstructed face, clear space around the face, strong separation between character and background ::, 1.3::a single soft key light falling across the eyes and cheekbones ::',
    focusMale: '1.3::adult man, broad-shouldered silhouette, clean masculine presentation ::',
  },
  v43a09: {
    name: '성인 13 · 일본 BL 만화 (가는 선·파스텔)',
    head: '1.6::japanese BL manga illustration, thin sharp lineart, elegant long limbs, color screentone shading ::, 1.3::mature handsome man, narrow sharp eyes, tall slim muscular ::, 1.2::muted pastel palette, white background accents ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'flat color, chibi, 3d, realistic, thick lines, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
  },
  v43a10: {
    name: '성인 14 · 그래픽노블 (굵은 먹·2색)',
    head: '1.6::american graphic novel, bold black ink, heavy spot blacks, flat cel shadows, hatching ::, 1.4::rugged handsome man, square jaw, muscular ::, 1.2::limited palette, teal and orange ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'chibi, 3d, anime, soft shading, glossy, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
  },
  v43a11: {
    name: '성인 15 · 3D 렌더 (실사 3D 피부)',
    head: '1.6::semi-realistic 3d render, subsurface scattering skin, octane render, soft studio lighting ::, 1.4::handsome asian man, defined muscular build, sharp jawline ::, 1.2::shallow depth of field ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'chibi, 2d, lineart, flat color, anime, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
  },
  v43a12: {
    name: '성인 16 · 색연필 수채 (감성 굿즈)',
    head: '1.6::colored pencil and watercolor sketch, visible paper texture, loose expressive lines, watercolor_pencil ::, 1.4::mature handsome man, defined muscles, sharp eyes ::, 1.2::warm sepia and rose palette ::',
    tail: 'cinematic composition, very aesthetic, masterpiece, best quality',
    neg: 'chibi, 3d, photorealistic, glossy, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli',
    safeNeg: 'nude, nipples, explicit',
  },  v43a17: {
    name: '성인 17 · 흑백 망가 해칭 (2000년대 청년만화)',
    head: '1.5::manga style, detailed lineart, thin lineart, high contrast, ink, traditional media ::, 1.4::monochrome, greyscale, screentone, hatching, crosshatching, hatching (texture), detailed shading ::, 1.3::realistic proportions, semi realistic, sharp eyes, small pupils, detailed eyes, 2000s (style) ::',
    tail: 'masterpiece, best quality, very aesthetic',
    neg: 'color, colorful, flat color, chibi, 3d, bad anatomy, bad hands, extra fingers, fewer digits, fused fingers, deformed face, cross-eyed, watermark, signature, child, aged down, baby face, shota, loli, ugly, long face, big chin, old man, rugged, beard, stubble',
    safeNeg: 'nude, nipples, explicit',
    focusMale: '1.4::extremely handsome man, beautiful sharp face, small face ::',
  },



  // ---------- 2026-11-09 정리: 태빈이 고른 결 (강재혁 캐릭터챗 시험 A·D). 쓰는 그림체는 WT_PICK 5개, 나머지는 예전 작품 호환용으로 숨긴다 ----------
  mood: {
    name: '무드 일러스트',
    head: '1.0::artist:rei_(sanbonzakura) ::, 0.8::artist:krenz_cushart ::, 1.2::artist:oharu-chan ::, 0.75::artist:mika_pikazo ::, year 2025, 1.4::muted desaturated palette, soft grey and dusty rose ::, 1.3::soft natural light, film photography mood ::, 1.3::pale porcelain skin, faint natural flush, thick dark eyelashes ::, 1.3::soft shading, glossy hair, detailed eyes ::',
    tail: 'clean hair, very aesthetic, masterpiece',
    neg: 'lowres, worst quality, bad quality, jpeg artifacts, watermark, signature, text, logo, bad anatomy, bad hands, extra fingers, fused fingers, deformed face, cross-eyed, ugly, long face, big chin, old man, middle-aged, rugged, beard, stubble, child, aged down, baby face, shota, loli, stain, blotch, spots on hair, bad ears, feminine face, vivid saturated colors, neon, multiple views',
    safeNeg: 'nude, nipples, explicit',
    focus: '1.3::face clearly visible, beautiful detailed eyes ::',
    focusMale: '1.5::extremely handsome man, masculine beautiful face, idol visual, small face, fair skin ::',
  },
  // ---------- 2026-11-09 최종 3종: 그림체 라운드 1~6에서 태빈이 고른 결 ----------
  // ---------- 2026-11-09 최종 4종 (라운드 13~16 + 아카·X·공식 문서 학습). v5:true 는 노벨AI V5 문법 그대로 보낸다
  // (품질 태그 자동 추가 끔 → 직접 쓴 품질줄, 네거 프리셋 없음, guidance 5, rescale 0). 인물 외형은 인물 칸에만, 장면은 base 에.
  toon3: {
    name: '웹툰 · 반실사 한국 웹툰 컬러',
    v5: true,
    head: 'masterpiece, best quality, very aesthetic, high complexity, -0.34::low complexity::, 2::medium complexity::, -1::artist collaboration::, attractive male, depthness, 1.3::semi-realistic korean manhwa, full color webtoon panel, painterly, clean ink outlines::, cinematic composition, expressive facial acting, natural body language',
    tail: '',
    neg: 'official art, official style, lowres, artistic error, worst quality, bad quality, jpeg artifacts, very displeasing, multiple views, logo, watermark, signature, bad anatomy, bad hands, mismatched pupils, halftone, screentone, child, teenager, bishounen, aged down',
    safeNeg: 'nude, nipples, explicit',
    fx: '1.3::dynamic action, strong speed lines, impact effect, debris::',
    focusMale: 'handsome, sharp jawline, 1.4::detailed face, detailed eyes::, -2::rounded jawline::',
  },
  manga3: {
    name: '만화 · 일본 만화 흑백 (스크린톤·먹)',
    v5: true,
    head: 'masterpiece, best quality, high complexity, -1::artist collaboration::, attractive male, 1.6::japanese manga panel, black and white, monochrome, screentone, crisp ink lineart, solid black fills::, cinematic composition, expressive facial acting, natural body language, no color',
    tail: '',
    fx: '1.4::speed lines, impact lines, motion blur streaks::',
    neg: 'official art, official style, lowres, artistic error, worst quality, bad quality, jpeg artifacts, very displeasing, multiple views, logo, watermark, signature, bad anatomy, bad hands, mismatched pupils, 1.3::color, colorful::, 3d, korean webtoon, vertical scroll, child, teenager, bishounen, aged down',
    safeNeg: 'nude, nipples, explicit',
    focusMale: 'handsome, sharp jawline, 1.4::detailed face, detailed eyes::, -2::rounded jawline::',
  },
  chat3: {
    name: '캐릭터챗 · 우리 하우스 그림체 (먹 번짐·네온)',
    v5: true,
    head: '0.8::artist:krenz_cushart ::, 1.0::artist:rei_(sanbonzakura) ::, 0.6::artist:wakabayashi_toshiya ::, 0.45::artist:blackbox_(blackbox9158) ::, 1.2::artist:oharu-chan ::, 0.8::artist:yamamoto_souichirou ::, 0.25::artist:meyoco ::, 0.75::artist:mika_pikazo ::, 0.42::artist:tobo_katsuo ::, 0.45::artist:john_kafka ::, 0.9::artist:gongzuotianxiadiyi, artist:mnnd ::, 0.8::artist:pigeon666 ::, 0.8::artist:ashinamaturi ::, year 2025, -1::artist collaboration ::, best quality, amazing quality, very aesthetic, high complexity, depthness, attractive male, 1.3::soft shading ::, glossy hair, detailed eyes, cinematic lighting, rim light, depth of field, 1.4::semi-realistic ::, 1.2::realistic lighting ::, -1::manga ::, 1.2::key visual ::, dramatic lighting, -1.2::bishounen ::, 1.6::graphite pencil lines, textured pencil strokes over vivid color ::, 1.4::calligraphic ink lines, ink drips and splatter ::, 1.1::detailed hands ::',
    tail: '',
    neg: 'official art, official style, lowres, artistic error, worst quality, bad quality, jpeg artifacts, very displeasing, multiple views, logo, watermark, signature, bad anatomy, bad hands, mismatched pupils, child, teenager, aged down, torn paper, border, frame',
    safeNeg: 'nude, nipples, explicit',
    fx: '1.3::dynamic action, ink splatter bursting with the motion::',
    focusMale: 'handsome, sharp jawline, three quarter view, 1.5::detailed face, detailed eyes::, -2::rounded jawline::, -0.5::round face::',
    focusFemale: '1.4::beautiful face, detailed face, detailed eyes::',
  },
  adult3: {
    name: '성인 · 성인 로맨스 웹툰 (윤기 반실사)',
    v5: true,
    head: 'masterpiece, best quality, very aesthetic, high complexity, depthness, attractive male, -1::artist collaboration::, 1.4::mature romance manhwa, adult BL webtoon key visual, semi-realistic, glossy painterly rendering, soft skin shading, subsurface scattering::, 1.3::warm low key lighting, amber lamp light and deep shadows, intimate atmosphere, sensual tension::',
    tail: '',
    neg: 'official art, official style, lowres, artistic error, worst quality, bad quality, jpeg artifacts, very displeasing, multiple views, logo, watermark, signature, bad anatomy, bad hands, mismatched pupils, child, teenager, bishounen, aged down, flat color',
    safeNeg: 'nude, nipples, explicit',
    focusMale: 'handsome, sharp jawline, 1.4::detailed face, detailed eyes::, -2::rounded jawline::',
  },
};
// 쓰는 그림체 4개 (2026-11-09 최종). 예전 키는 숨긴 칸으로 남겨 예전 작품·설정이 그대로 열리게 한다
const WT_PICK = [['toon3', '1 · 웹툰 — 반실사 한국 웹툰 컬러 (웹툰 본문 기본)'], ['manga3', '2 · 만화 — 일본 만화 흑백 (스크린톤·먹)'], ['chat3', '3 · 캐릭터챗 — 우리 하우스 그림체 (표지·화보)'], ['adult3', '4 · 성인 — 성인 로맨스 웹툰 (윤기 반실사)']];
const WT_DEFAULT_STYLE = 'toon3';
function wtFillStyleSel(sel){
  if (!sel) return; const pick = new Set(WT_PICK.map(x => x[0]));
  sel.innerHTML = WT_PICK.map(([k, n]) => `<option value="${k}">${n}</option>`).join('') + '<option value="custom">직접 쓰기</option>'
    + Object.keys(WT_STYLE).filter(k => !pick.has(k)).map(k => `<option value="${k}" hidden>예전 · ${WT_STYLE[k].name}</option>`).join('');
}
wtFillStyleSel(document.querySelector('#wtStyle')); wtFillStyleSel(document.querySelector('#naiStyleSel'));
// 3종 정리(2026-11-09) 전에 저장된 그림체는 한 번만 새 기본으로 옮긴다 (예전 작품 안의 컷 설정은 그대로)
if (!store.get('set.wtStyle3', false)){ const o = store.get('set.wtStyle', ''); if (o && o !== 'custom' && !WT_PICK.some(x => x[0] === o)) store.set('set.wtStyle', WT_DEFAULT_STYLE); store.set('set.wtStyle3', true); }
const WT_FRAME = {mirror: 'a mirror', photo: 'a wet photograph', tank: 'aquarium glass', shutter: 'a gap in the shutters', fence: 'barbed wire', booth: 'recording booth glass', none: ''};
const WT_MONO = ['cold blue', 'red', 'gold', 'white and grey', 'teal', 'amber', 'magenta', 'dusty orange', 'moonlight blue', 'warm sepia'];
const WT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'synopsis', 'cast', 'pages'],
  properties: {
    title: {type: 'string'},
    synopsis: {type: 'string', description: '네가 채워 넣은 이번 화 줄거리. 한국어 3~6문장. 장소·시간, 무슨 일이 벌어지고, 감정이 어디서 꺾이고, 어떻게 끝나는지'},
    cast: {type: 'array', description: '사전에 없던 인물만. 외형 영어 태그와 한국어 말투를 지어서 채운다', items: {type: 'object', additionalProperties: false, required: ['name', 'tags', 'voice'],
      properties: {name: {type: 'string'}, tags: {type: 'string', description: '예: 1boy, adult, short black hair, grey eyes, black coat'}, voice: {type: 'string', description: '한국어 한 줄. 예: 낮은 반말, 짧고 명령적. 당황하면 말끝이 흐려진다'}}}},
    pages: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['layout', 'setting', 'panels'],
      properties: {
        setting: {type: 'string', description: '이 쪽의 장소·시간·빛과 인물별 옷을 영어 태그로. 예: "rooftop at night, chain-link fence, city lights, cold teal and amber light, 강재혁 wears black track jacket, 오동구 wears grey hoodie". 같은 장면이 이어지면 앞 쪽과 글자까지 똑같이'},
        layout: {type: 'string', description: '틀 키: ' + WT_LAYOUT_KEYS.join(', ')},
        panels: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['scene', 'tags', 'pose', 'fx', 'chars', 'bubbles', 'sfx', 'stickers'],
          properties: {
            scene: {type: 'string', description: '이 컷에서 일어나는 일(한국어 한 줄)'},
            tags: {type: 'string', description: '그림용 영어 태그: 구도·카메라·배경·조명·소품. 인물 외형은 쓰지 않는다'},
            pose: {type: 'string', description: '이 컷의 자세·표정만 영어 태그로. 예: leaning against the wall, looking down, hand reaching out'},
            fx: {type: 'boolean', description: '전투·각성 컷이면 true. 그 외에는 false'},
            chars: {type: 'array', items: {type: 'string'}, description: '인물 사전에 있는 이름만'},
            bubbles: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['type', 'text'],
              properties: {type: {type: 'string', enum: ['speech', 'round', 'thought', 'shout', 'whisper', 'narr', 'text']}, text: {type: 'string'}, who: {type: 'string'}}}},
            sfx: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['text', 'vert'], properties: {text: {type: 'string'}, vert: {type: 'boolean'}}}},
            stickers: {type: 'array', items: {type: 'string', enum: ['sweat', 'burst', 'heart', 'speed']}},
          }}},
      }}},
  }
};
const SYSTEM_WT_BASE = `너는 한국 웹툰 콘티 작가다. 줄거리를 쪽·컷 대본으로 바꾼다. 모든 글은 한국어, 그림 태그(tags)만 영어.
- 받은 줄거리가 한 줄이거나 거칠면 네가 채운다: 장소·시간, 둘 사이에 무슨 일이 있었는지, 감정이 꺾이는 지점, 끝을 정해서 synopsis 에 3~6문장으로 먼저 쓴다. 그 synopsis 대로 쪽을 나눈다.
- 받은 줄거리에 이미 있는 것은 바꾸지 않는다. 비어 있는 곳만 채운다.
- 줄거리의 사건은 하나도 빼지 않는다. 받은 줄거리의 [장면]·문장 순서대로 쪽에 나눠 담고, 인물이 한 말이 줄거리에 있으면 그 말을 대사로 살린다. 쪽이 모자라면 한 쪽에 컷을 4개까지 늘리고, 그래도 모자라면 쪽을 더 쓴다.
틀(layout) 키: 1=한 컷, 2a=위아래 반반, 2b=위 작은 컷+아래 큰 컷, 2c=위 큰 컷+아래 작은 컷, 2d=사선 가로 둘, 2e=사선 세로 둘, 3a=세 칸, 3b=위 큰 컷+아래 둘, 3c=왼쪽 길게+오른쪽 둘, 3d=사선 세 칸, 4a=네 칸.
- 한 쪽은 1~4컷. 컷 수는 틀과 맞춘다(1→1컷, 2*→2컷, 3*→3컷, 4a→4컷). 장면 전환·감정 고조에는 큰 컷, 반응에는 작은 컷을 쓴다.
- 첫 쪽은 상황을 한 번에 보여 주는 큰 컷으로 시작하고, 마지막 쪽은 다음이 궁금해지는 여운으로 끝낸다.
- 컷마다 scene(무슨 일), tags(구도·카메라·배경·조명 영어 태그, 예: "upper body, from side, snow, castle gate, night, soft rim light"), pose(그 인물의 자세·표정만, 예: "looking down, hand reaching out, parted lips"), fx(전투·각성 컷이면 true), chars(인물 사전의 이름만), bubbles, sfx, stickers.
- 밝고 화사한 일상 팔레트는 쓰지 않는다. 빛과 그림자 대비로 감정을 만든다.
- bubbles: type은 speech(보통 대사), round(둥근 네모 — 차분하거나 긴 대사), thought(속마음 구름), shout(외침), whisper(속삭임), narr(설명 상자: 시간·장소 전환, 회상), text(그림 위 외곽선 독백). 한 말풍선은 22자 안쪽, 한 컷에 말풍선 최대 3개. 대사는 말하듯 짧게, 설명하지 않는다. 감정은 이름 붙이지 않고 행동과 사물로 보여 준다.
- sfx: 효과음 2~4글자(예: 두근, 쿵, 스윽, 쮸웁). 꼭 필요한 컷에만. 긴 소리는 vert=true.
- stickers: sweat(당황), burst(충격), heart(설렘), speed(집중선)를 감정이 튀는 컷에만 쓴다.
- 인물: chars 에는 '나오는 인물'로 받은 이름과 사전에 있는 이름을 쓴다. 사전에 없던 이름은 cast 에 외형 영어 태그(성별·나이대·머리·눈·옷·특징 순, 모두 adult)와 한국어 말투를 지어서 한 번만 적는다. 줄거리에 새 인물이 필요하면 이름을 지어 cast 에 넣는다.
- 말투: 받은 말투 설명이 있으면 그 인물의 대사는 반드시 그 말투로 쓴다(존대·반말, 길이, 말버릇, 호칭). 말투가 없는 인물은 cast 에 적은 말투를 따른다. 인물마다 말이 달라야 누가 말하는지 알 수 있다.
- 이어짐(가장 중요): 컷은 따로 노는 그림이 아니라 한 흐름이다. 앞 컷의 마지막 동작·시선·대사가 다음 컷의 시작이 된다. 한 컷에서 질문하면 다음 컷에서 답하고, 누가 손을 뻗으면 다음 컷에서 그 손이 닿거나 뿌리쳐진다.
- 장소가 바뀌면 그 쪽 첫 컷은 장소를 보여 주는 넓은 컷(wide shot, establishing)으로 열고 narr 상자로 시간·장소를 적는다. 장소가 같으면 setting 을 앞 쪽과 글자까지 똑같이 쓴다.
- 옷은 화 전체에서 그대로다(갈아입는 사건이 있을 때만 바꾼다). 소품(우유·우산·담배)은 한 번 나오면 다음 컷에서도 같은 손, 같은 자리에 있다.
- 컷 크기 문법: 새 장면 = 넓은 컷 → 대화 = 상반신을 번갈아(말하는 사람 쪽) → 감정이 정점 = 얼굴·눈·손 클로즈업 → 쪽 끝 = 다음 쪽이 궁금한 반응 컷.
- 대사는 주고받는다. 같은 인물이 세 컷 넘게 혼자 말하지 않는다.
{ADULT}
출력은 JSON 하나만.`;
const SYSTEM_WT = () => SYSTEM_WT_BASE.replace('{ADULT}', wtAdultRules() + '\n' + WT_NATURAL);
// AI 티 지우기: 사람이 쓴 웹툰처럼 (줄거리·대본 모두)
const WT_NATURAL = `- AI 가 쓴 티가 나는 말은 쓰지 않는다: '그 순간', '마치 ~처럼', '~하는 것이었다', '이윽고', '묘한 감정', '알 수 없는 감정', '심장이 두근거렸다', '하나가 되었다', '두 사람은', '그렇게 밤이 깊어 갔다', '~을 느꼈다' 로 감정 설명하기.
- 웹툰 나레이션처럼 쓴다: 짧게 끊고, 장면을 바로 던진다. 한 문장 25자 안팎. 문어체 '~였다'만 이어 쓰지 말고 현재형·구어체를 섞는다.
- 사람은 정리해서 말하지 않는다: 말이 겹치고, 끊기고, 엉뚱한 데로 샌다. 사투리·비속어·말버릇을 인물마다 다르게 준다.
- 설명보다 장면: '부끄러웠다' 대신 귀가 빨개지고 시선을 피하는 걸 보여 준다.`;

/* ---------- 등급·수위 ---------- */
const wtRating = () => $('#wtRating')?.value || $('#naiRating').value;
const WT_HEAT = {
  tease: '은근하게. 옷 위로, 닿기 직전에서 멈추고, 숨소리와 눈빛으로 끌고 간다. 몸의 열과 긴장은 쓰되 행위는 암시로 남긴다.',
  mid: '직접적으로. 무엇을 어디에 어떻게 하는지 분명히 쓴다. 벗는 과정, 닿는 곳, 숨과 소리를 적는다. 한 장면에 한 번은 깊게 들어간다.',
  hard: '노골적으로, 끝까지. 행위를 돌려 말하지 않는다. 신체 부위와 동작을 그대로 적고, 젖은 소리·열·떨림·사정까지 쓴다. 장면을 중간에 끊지 않고 절정과 그 뒤까지 끌고 간다.',
};
const WT_NSFW_TAGS = {
  tease: 'sensual atmosphere, flushed skin, parted lips, sweat, intimate, suggestive',
  mid: 'nsfw, explicit, uncensored, intimate, sweat, blush, half-lidded eyes, open mouth, detailed skin',
  hard: 'nsfw, explicit, uncensored, sex, sweat, saliva, heavy breathing, blush, half-lidded eyes, open mouth, detailed skin, wet skin',
};
// 성인 컷에서 빼야 하는 태그: 입을 다물게 하거나 표정을 막는 것들
const NSFW_DROP_POS = /\bclosed mouth\b/gi;
const NSFW_DROP_NEG = /^(smile|grin|smirk|teeth|open mouth|parted lips)$/i;
const NSFW_NEG_ADD = 'censored, mosaic censoring, bar censor, pixelated, steam censor, convenient censoring';
const wtHeatKey = () => $('#wtHeat')?.value || store.get('set.wtHeat', 'mid');
// 톤: 치정(진지·끈적) / 뽕빨(성인 웹툰 특유의 가볍고 과장된 개그 + 노골)
const WT_TONE = {
  drama: '치정극. 진지하고 끈적하게. 관계의 긴장, 들킬까 하는 불안, 질투와 집착이 장면을 끌고 간다. 빛과 그림자, 침묵과 거리로 감정을 만든다.',
  pong: "뽕빨물. 가볍고 빠르고 노골적이다. 개연성보다 상황이 먼저다: '어쩌다 보니' 둘만 남고, 오해·우연·내기가 바로 침대로 이어진다. 과장된 리액션, 속마음 태클, 민망한 개그를 섞되 야한 장면은 진지하게 길게 간다. 대사는 능청스럽고 천박해도 된다. 화마다 끝은 다음 판을 예고하는 한 마디.",
};
const wtToneKey = () => $('#wtAdultTone')?.value || store.get('set.wtAdultTone', 'drama');
const wtHeat = () => WT_HEAT[wtHeatKey()] || WT_HEAT.mid;
const wtActTags = () => ($('#wtAct')?.value || store.get('set.wtAct', '')).trim().replace(/,\s*$/, '');
// 성인 등급일 때 AI에게 주는 작법 지침. 소재는 사용자가 정하고, 미성년만 막는다.
function wtAdultRules(){
  if (wtRating() !== 'nsfw') return '- 등급은 일반(safe)이다. 노출·성적 요소 없이 쓴다.';
  return `- 등급은 성인(19금)이다. 성인 독자가 돈을 내고 보는 성인 웹툰이다. 성적인 장면이 이 작품의 핵심이고, 그 장면을 피하거나 흐리면 작품이 실패한다.
- 수위: ${wtHeat()}
- 야하게 쓴다. 분위기만 깔지 말고 몸을 쓴다. 피부의 열, 땀, 젖은 소리, 떨림, 숨이 끊기는 지점, 참다가 새는 소리를 적는다.
- 행위를 추상어로 덮지 않는다. '하나가 되었다', '밤이 깊었다' 같은 문장으로 넘기지 않는다. 무엇을 어디에 어떻게 하는지 그대로 쓴다.
- 대사는 짧고 끊긴다. 신음을 글자로 적고(으, 하, 읏 같은 소리), 말을 하려다 못 끝내게 한다. 호칭이 무너지는 순간을 넣는다(존대→반말, 이름→부르다 만 소리).
- 감정과 몸을 같이 민다. 부끄러움·버티다 무너짐·원하면서 아니라고 하는 마음이 몸의 반응과 같이 움직이게 한다.
- 수위는 한 화 안에서 올라간다. 닿는다 → 벗긴다 → 애무 → 삽입 → 절정 → 끝난 뒤의 공기. 각 단계를 beats 에 분명히 적는다.
- 장소가 자극을 만든다. 누가 들어올 수 있는 곳, 소리가 새는 곳, 벗을 수 없는 옷, 멈출 수 없는 상황을 쓴다.
- 톤: ${WT_TONE[wtToneKey()] || WT_TONE.drama}
- 모든 인물은 20세 이상 성인이다. 미성년을 떠올리게 하는 말(학생·교복·어리다·작다 등)은 절대 쓰지 않는다. 실존 인물은 쓰지 않는다.`;
}
/* ---------- 그림체 ---------- */
const wtStyleKey = () => { const k = $('#wtStyle')?.value || store.get('set.wtStyle', WT_DEFAULT_STYLE); return WT_STYLE[k] ? k : (k === 'custom' ? 'custom' : WT_DEFAULT_STYLE); };
const wtMono = () => $('#wtMono')?.value || store.get('set.wtMono', 'cold blue');
const wtFrame = () => WT_FRAME[$('#wtFrame')?.value || store.get('set.wtFrame', 'mirror')] ?? WT_FRAME.mirror;
// 그림체를 머리·꼬리로 나눠 준다. 웹툰 컷과 노벨AI 탭이 같은 그림체를 쓰게 하는 한 곳.
function wtStyleParts(nsfw){
  const k = wtStyleKey();
  // 직접 쓰기: 웹툰 칸(wtStyleIn) → 비었으면 노벨AI 탭 하우스 스타일(그림체 가져오기가 채우는 칸). 성인이면 수위 태그도 붙인다(예전엔 빠졌다)
  if (k === 'custom'){
    const c = (($('#wtStyleIn')?.value || store.get('set.wtStyleIn', '')).trim() || $('#naiStyle').value.trim()).replace(/,\s*$/, '');
    const head = [c]; if (nsfw){ head.push(WT_NSFW_TAGS[wtHeatKey()] || WT_NSFW_TAGS.mid); const a = wtActTags(); if (a) head.push(a); }
    return {head: head.filter(Boolean).join(', '), tail: '', neg: '', key: k};
  }
  const st = WT_STYLE[k]; const head = [st.head.replace('{MONO}', wtMono())];
  if (k === 'dark'){ const fr = wtFrame(); if (fr) head.push(st.frame.replace('{FRAME}', fr)); }
  let tail = st.tail.replace('{MONO}', wtMono());
  if (nsfw){ tail = tail.replace(NSFW_DROP_POS, '').replace(/,\s*,/g, ','); head.push(WT_NSFW_TAGS[wtHeatKey()] || WT_NSFW_TAGS.mid); const a = wtActTags(); if (a) head.push(a); }
  return {head: head.filter(Boolean).join(', '), tail, neg: st.neg, focus: st.focus, focusMale: st.focusMale, focusFemale: st.focusFemale, fx: st.fx, wide: st.wide, key: k, v5: !!st.v5};
}
// 그림체 공식대로 base 를 만든다. 인물 자세(pose)는 1.45 로 올리고, 물감 튐은 전투·각성 컷에만 넣는다.
// who: {male, female, people} — 그림체가 남자 주인공을 전제로 쓴 말(his handsome face, handsome man)은 남자가 있을 때만,
// 얼굴·시선 태그는 사람이 있을 때만 붙인다. (인물 없는 풍경 컷에 looking at viewer 가 붙던 것을 막는다)
const WT_FACE_TAIL = /\b(extremely handsome man|beautiful detailed eyes|half-lidded eyes|looking at viewer|closed mouth|detailed hair strands)\b,?\s*/gi;
function wtStyleBase({count, tags, pose, fx, nsfw, who = {male: true, female: false, people: true}}){
  const P = wtStyleParts(nsfw); const parts = [P.head];
  if (P.key === 'neon' || P.key === 'spot'){ if (fx && P.fx) parts.push(P.fx); if (P.focus && who.people && who.face !== false) parts.push(who.male ? P.focus : P.focus.replace('his handsome face', 'the face')); }
  else if (who.people && who.face !== false){ if (P.focus) parts.push(!who.male && P.focusFemale ? P.focusFemale : P.focus); if (who.male && P.focusMale) parts.push(P.focusMale); }
  if (fx && P.fx && P.key !== 'neon' && P.key !== 'spot') parts.push(P.fx);   // 최종 3종: 전투·각성 컷에만 움직임·기운   // v43 B: 얼굴 보호 + 성인 남자 보정
  parts.push(count, tags);
  if (pose && who.people) parts.push(`1.45::${pose} ::`);
  let tail = P.tail || '';
  if (P.wide && /\b(full body|wide shot|from far|from above|aerial|back view)\b/i.test(`${tags} ${pose || ''}`)) tail = tail.replace(P.wide, '');   // 전신·원경 컷엔 근접 프레이밍을 뺀다
  if (!who.people || who.face === false) tail = tail.replace(WT_FACE_TAIL, '');
  else if (!who.male) tail = tail.replace(/\bextremely handsome man,?\s*/i, '');
  parts.push(tail, 'no text');
  return parts.filter(Boolean).join(', ').replace(/,\s*,/g, ',').replace(/,\s*$/, '');
}
function wtStyleTags(){   // 미리 보기·시험용: 지금 그림체의 앞 태그
  const k = wtStyleKey();
  if (k === 'custom') return (($('#wtStyleIn')?.value || store.get('set.wtStyleIn', '')).trim() || $('#naiStyle').value.trim()).replace(/,\s*$/, '');
  return WT_STYLE[k].head.replace('{MONO}', wtMono());
}
// 일반 등급에서 어린이·청소년 인물을 일부러 그릴 때(가족·학교·스포츠 장면)는 그림체의 '아이 막기' 네거티브를 푼다. 성인 등급은 그대로 막는다
const WT_KID_NEG = /^(child|children|young|aged down|shota|loli|baby face|kid|toddler|teen|teenager)$/i;
function wtKidsNeg(neg, text, nsfw){ return !nsfw && MINOR_RE.test(text || '') ? neg.split(',').map(x => x.trim()).filter(x => x && !WT_KID_NEG.test(x)).join(', ') : neg; }
function wtStyleNeg(neg, nsfwArg, who){
  const k = wtStyleKey(); const st = WT_STYLE[k]; const nsfw = nsfwArg ?? (wtRating() === 'nsfw');
  let out = (st ? [neg, st.neg].filter(Boolean).join(', ') : neg).split(',').map(x => x.trim()).filter(Boolean);
  if (st?.dropNeg) out = out.filter(x => !st.dropNeg.test(x));
  if (who?.female) out = out.filter(x => !/^(1girl|female|feminine face)$/i.test(x));   // 여자 인물이 나오는 컷에서 그림체의 '1girl, female' 막기를 푼다
  if (nsfw) out = out.filter(x => !NSFW_DROP_NEG.test(x));   // 성인 컷에서 벌린 입·표정을 막지 않는다
  if (nsfw) out.push(...NSFW_NEG_ADD.split(',').map(x => x.trim()));
  else if (st?.safeNeg) out.push(...st.safeNeg.split(',').map(x => x.trim()));
  return [...new Set(out)].join(', ');
}
/* ---------- 컷 → 노벨AI 프롬프트 ---------- */
function wtDict(){ const m = new Map(); for (const l of naiCharsDict()){ const i = l.indexOf(':'); if (i > 0) m.set(l.slice(0, i).trim(), l.slice(i + 1).trim()); } return m; }
const wtNaiTextOn = () => $('#wtNaiText')?.checked ?? store.get('set.wtNaiText', false);
// V5 최종 그림체 설정: 품질 태그 자동 추가 끔(no text 가 대사를 지운다), 네거 프리셋 없음, guidance 5(자글자글 방지), rescale 0
const WT_V5_PARAMS = {qualityToggle: false, ucPreset: 3, cfg_rescale: 0, scale: 5};
function wtPanelPrompt(panel, bubbleTexts){
  const rating = wtRating(), dict = wtDict();
  const names = String(panel.chars || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  const found = names.filter(n => dict.has(n)), n = found.length;
  // 인원수 태그는 성별대로 센다 (예전엔 두 사람 이상이면 무조건 2boys 였다)
  const isGirl = x => /\b(\d?girls?|woman|women|female)\b/i.test(x || '');
  const girls = found.filter(x => isGirl(dict.get(x))).length, boys = n - girls;
  const count = n === 0 ? 'no humans' : [boys ? (boys === 1 ? '1boy' : `${boys}boys`) : '', girls ? (girls === 1 ? '1girl' : `${girls}girls`) : ''].filter(Boolean).join(', ');
  const people = names.length > 0;
  // 손·물건 클로즈업 컷: 얼굴을 그리지 않게 (예전엔 '손에 쥔 우유' 컷에도 인물 얼굴 초상이 나왔다)
  let tags = (panel.tags || '').trim() || (people ? 'upper body, looking at viewer' : 'scenery, wide shot');
  // 쪽 설정(장소·빛·옷)을 컷마다 이어 붙여 컷끼리 같은 장면으로 보이게. 인물 이름은 사전 외형으로 바뀌므로 '이름 wears' 는 옷만 남긴다
  const outfit = new Map(), place = [];
  for (const seg of String(panel.setting || '').split(',').map(x => x.trim()).filter(Boolean)){ const m = seg.match(/^(.+?)\s+(?:wears|wearing|in)\s+(.+)$/i); if (m && (names.includes(m[1].trim()) || dict.has(m[1].trim()))){ if (names.includes(m[1].trim())) outfit.set(m[1].trim(), m[2].trim()); } else place.push(seg); }   // 이 컷에 없는 인물의 옷은 빼기
  if (place.length) tags += ', ' + place.join(', ');
  const handsOnly = people && /\b(hands?|fingers?|object focus|item focus|close-up of (?!(?:his |her |the )?face))\b/i.test(tags + ' ' + (panel.pose || '')) && !/\b(face|portrait|upper body|cowboy shot|full body|two shot|wide shot|head)\b/i.test(tags);
  if (handsOnly) tags += ', 1.3::hands focus, close-up, head out of frame ::';
  const who = {male: !n || boys > 0, female: girls > 0, people, face: !handsOnly};
  const base = wtStyleBase({count: people ? (n ? count : '') : 'no humans', tags, pose: (panel.pose || '').trim(), fx: !!panel.fx, nsfw: rating === 'nsfw', who});
  let neg = [$('#naiNeg').value.trim(), 'speech bubble, text, english text, korean text, subtitle, panel border'].filter(Boolean).join(', ');
  neg = wtStyleNeg(neg, undefined, who);
  neg = wtKidsNeg(neg, [tags, ...found.map(x => dict.get(x))].join(' '), rating === 'nsfw');
  if (rating === 'nsfw') neg = neg.split(',').map(s => s.trim()).filter(s => s && s !== 'nsfw').join(', '); else if (!/\bnsfw\b/.test(neg)) neg = 'nsfw, ' + neg;
  const cols = n === 1 ? [2] : n === 2 ? [1, 3] : n === 3 ? [0, 2, 4] : [0, 1, 3, 4, 2, 2];
  // 손 컷: 얼굴·머리·표정 태그를 빼고 옷·손에 걸린 것만 남긴다(얼굴 태그가 남으면 노벨AI 가 얼굴을 그려 넣는다)
  const HEADY = /\b(face|eyes?|eyebrows?|hair|undercut|bangs|ponytail|piercings?|ear|smirk|smile|grin|expression|glasses|acne|cheeks?|lips?|mouth|handsome|attractive|unattractive|plain|pretty|beautiful|nose|jaw|jawline|cigarette)\b/i;
  const handTags = t => t.split(',').map(x => x.trim()).filter(x => x && !HEADY.test(x)).join(', ') + ', hands only, head out of frame';
  const chars = found.slice(0, 6).map((name, i) => { let pr = dict.get(name); if (outfit.has(name)) pr += `, 1.2::wearing ${outfit.get(name)} ::`; if (handsOnly) pr = handTags(pr); return {name, prompt: (rating === 'nsfw' && !/\badult\b/.test(pr) ? 'adult, ' : '') + pr, negative: '', position: `${cols[i]},2`}; });
  if (handsOnly) neg += ', face, head, eyes, portrait, letters, writing on objects';
  // V5 최종 그림체: 남자 인물 칸엔 '성인 남자'를 앞에 박고(어려 보임·여성화 방지, 아카 남캐 프롬 공통), 안경 쓴 인물이 있으면 안 쓴 인물 칸 UC 에 안경을 넣어 번짐을 막는다(라운드 15 재혁 안경 번짐)
  const v5 = !!WT_STYLE[wtStyleKey()]?.v5;
  if (v5){
    const hasGlasses = chars.some(c => /\bglasses\b/i.test(c.prompt));
    for (const c of chars){
      if (!isGirl(c.prompt) && !/\b(man|men|male)\b/i.test(c.prompt)) c.prompt = 'man, mature male, ' + c.prompt;
      if (hasGlasses && !/\bglasses\b/i.test(c.prompt)) c.negative = 'glasses, eyewear';
    }
  }
  // 노벨AI 글자 그리기: 'no text' 를 빼고 프롬프트 맨 끝에 Text: 를 붙인다 (공식 문법: 맨 끝, 여러 개는 빈 줄로)
  let base2 = base;
  const bt = (bubbleTexts || []).map(x => String(x).trim()).filter(Boolean).slice(0, 2);
  if (wtNaiTextOn() && bt.length){
    base2 = base2.replace(/,\s*no text\s*$/i, '') + ', text, speech bubble';
    neg = neg.split(',').map(x => x.trim()).filter(x => x && !/^(speech bubble|text|english text|korean text|subtitle)$/i.test(x)).join(', ');
    base2 += '\nText: ' + bt.join('\n\n');
  }
  return {base: base2, neg, chars, size: '', notes: '', rating, params: v5 ? WT_V5_PARAMS : undefined};
}
function wtSizeKey(pg, panel){ const bb = polyBox(polyPx(pg, panel)), r = (bb[2] - bb[0]) / (bb[3] - bb[1]); return r > 1.3 ? 'landscape' : r < 0.78 ? 'portrait' : 'square'; }
const wtMinorBlock = p => wtRating() === 'nsfw' && MINOR_RE.test([p.base, ...p.chars.map(c => c.prompt)].join(' '));
async function wtGenPanel(pg, panel){
  const bb = polyBox(polyPx(pg, panel));
  const bt = panel.say?.length ? panel.say.map(t => t.slice(0, 40)) : (pg.items || []).filter(it => it.k === 'bubble' && it.text && it.x >= bb[0] && it.x <= bb[2] && it.y >= bb[1] && it.y <= bb[3]).map(it => it.text.slice(0, 40));
  const p = wtPanelPrompt(panel, bt);
  if (wtMinorBlock(p)) throw new Error('미성년을 떠올리게 하는 태그가 있어서 건너뛰었어요');
  if (pg.seed) p.seed = (pg.seed + pg.panels.indexOf(panel) * 7919) % 4294967295;   // 같은 쪽 컷은 이웃한 씨앗(빛·색 결이 비슷하게)
  const blob = await naiGenBlob(p, wtSizeKey(pg, panel));
  const id = await wtPutImage(blob); panel.img = id; panel.view = {ox: 0, oy: 0, s: 1}; wtAutoLayout(pg, panel); return id;
}

/* ---------- 대본 → 쪽 ---------- */
// 컷 하나에 말풍선·효과음·스티커를 놓는다. 자리는 wtAutoLayout 이 잡는다(그림이 생기면 그림의 빈 곳을 찾아 다시 잡는다).
// '말풍선 글자도 그림에 그리기'를 켜면 대사는 노벨AI 가 그림 안에 그리므로 겹치지 않게 대사 말풍선은 놓지 않고 컷에 적어 둔다(panel.say)
const wtMonoStyle = () => { const k = wtStyleKey(); const st = WT_STYLE[k]; return !!st && /\b(monochrome|greyscale|grayscale|black and white)\b/i.test(st.head); };
function wtPlace(pg, panel, spec){
  const bb = polyBox(polyPx(pg, panel)), bw = bb[2] - bb[0], bh = bb[3] - bb[1], sc = Math.max(0.75, Math.min(1.2, bw / 1000));
  const items = []; const mk = o => { o.id = uid(); o.auto = true; o.pid = panel.id; items.push(o); return o; };
  const pi = pg.panels.indexOf(panel), mono = wtMonoStyle();
  const names = (spec.chars || []).map(String);
  if (spec.stickers?.includes('speed')) mk({k: 'stk', kind: 'speed', x: bb[0] + bw * 0.5, y: bb[1] + bh * 0.5, size: Math.round(Math.min(bw, bh) * 0.42), rot: 0, pi, fixed: true});   // pi: 이 컷 안에서만 보이게 자른다
  const naiText = wtNaiTextOn(); panel.say = [];
  const fs = Math.round(40 * Math.max(0.95, Math.min(1.12, bw / 1000)));   // 대사 글씨: 쪽 너비 1500 의 2.7% 안팎 (폰에서 읽히는 크기)
  let order = 0;
  for (const b of (spec.bubbles || []).slice(0, 3)){
    const text = String(b.text || '').trim(); if (!text) continue;
    if (b.type === 'narr'){ mk({k: 'bubble', shape: 'box', x: bb[0] + bw * 0.3, y: bb[1] + bh * 0.1, size: Math.round(36 * sc), w: Math.round(Math.min(bw * 0.62, 560 * sc)), text, line: 'thin', tail: null, bf: 'serif', role: 'narr', ord: order++}); continue; }
    if (b.type === 'text'){ mk({k: 'text', x: bb[0] + bw * 0.5, y: bb[1] + bh * 0.85, size: Math.round(50 * sc), w: Math.round(bw * 0.7), text, color: '#ffffff', rot: 0, role: 'mono', ord: order++}); continue; }
    if (naiText){ panel.say.push(text); continue; }
    const shape = ['speech', 'round', 'thought', 'shout', 'whisper'].includes(b.type) ? b.type : 'speech';
    const who = names.indexOf(String(b.who || '').trim());
    const w = Math.round(Math.max(220, Math.min(bw * 0.46, 330 * Math.max(0.9, sc))));
    mk({k: 'bubble', shape, x: bb[0] + bw / 2, y: bb[1] + bh * 0.2, size: shape === 'shout' ? Math.round(fs * 1.12) : fs, w, line: 'thin', text, bold: shape === 'shout', bf: shape === 'thought' ? 'hand' : undefined,
      tail: shape === 'shout' ? null : {x: bb[0] + bw / 2, y: bb[1] + bh * 0.5}, who: who, nwho: names.length, role: 'say', ord: order++});
  }
  (spec.sfx || []).slice(0, 2).forEach((s, i) => { const t = String(s.text || '').trim(); if (t) mk({k: 'sfx', x: bb[0] + bw * (i ? 0.25 : 0.78), y: bb[1] + bh * (i ? 0.75 : 0.6), size: Math.round(Math.min(bw, bh) * 0.19), text: t, grad: mono ? 6 : (hash(t) % 4), rot: i ? 8 : -10, vert: !!s.vert, font: 'heavy', role: 'sfx', ord: 50 + i}); });
  (spec.stickers || []).filter(k => k !== 'speed').forEach((k, i) => mk({k: 'stk', kind: k, x: bb[0] + bw * (0.14 + i * 0.12), y: bb[1] + bh * 0.8, size: Math.round(Math.min(bw, bh) * 0.13), rot: i * 8 - 4, mono, role: 'stk', ord: 60 + i}));
  return items;
}
/* ---------- 말풍선 자동 배치 ----------
   그림이 있으면 그림을 작게 줄여 '복잡한 정도(윤곽선 밀도)' 지도를 만들고, 얼굴·몸처럼 선이 몰린 곳을 피해 빈 하늘·벽·여백에 놓는다.
   웹툰 읽는 순서(위→아래)를 지키고, 서로 겹치지 않게, 꼬리는 말하는 사람 쪽으로 짧게. 사용자가 옮긴 것(auto=false)은 건드리지 않는다. */
function wtBusyMap(pg, panel){
  const im = panel.img ? WT.imgs.get(panel.img) : null; if (!im) return null;
  const bb = polyBox(polyPx(pg, panel)), bw = bb[2] - bb[0], bh = bb[3] - bb[1], C = 12;   // 12px 한 칸
  const cw = Math.max(4, Math.ceil(bw / C)), ch = Math.max(4, Math.ceil(bh / C));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d', {willReadFrequently: true});
  const v = panel.view || {}, s0 = Math.max(bw / im.width, bh / im.height), s = s0 * (v.s || 1), w = im.width * s, h = im.height * s;
  g.drawImage(im, ((bw - w) / 2 + (v.ox || 0) * bw) / C, ((bh - h) / 2 + (v.oy || 0) * bh) / C, w / C, h / C);
  const d = g.getImageData(0, 0, cw, ch).data, L = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  const I = new Float64Array((cw + 1) * (ch + 1));   // 윤곽 세기의 누적합(아무 네모나 바로 평균을 낸다)
  for (let y = 0; y < ch; y++){ let row = 0; for (let x = 0; x < cw; x++){
    const i = y * cw + x, gx = x + 1 < cw ? L[i + 1] - L[i] : 0, gy = y + 1 < ch ? L[i + cw] - L[i] : 0;
    const e = Math.min(1, Math.hypot(gx, gy) / 60) + (L[i] < 60 ? 0.35 : 0);   // 먹이 짙은 곳(머리카락·옷)도 조금 피한다
    row += e; I[(y + 1) * (cw + 1) + x + 1] = I[y * (cw + 1) + x + 1] + row; } }
  return (x0, y0, x1, y1) => {   // 쪽 좌표 네모 → 0~1
    const a = Math.max(0, Math.min(cw, Math.floor((x0 - bb[0]) / C))), b = Math.max(0, Math.min(ch, Math.floor((y0 - bb[1]) / C)));
    const c2 = Math.max(0, Math.min(cw, Math.ceil((x1 - bb[0]) / C))), d2 = Math.max(0, Math.min(ch, Math.ceil((y1 - bb[1]) / C)));
    const n = (c2 - a) * (d2 - b); if (n <= 0) return 1;
    return (I[d2 * (cw + 1) + c2] - I[b * (cw + 1) + c2] - I[d2 * (cw + 1) + a] + I[b * (cw + 1) + a]) / n;
  };
}
const WT_MCTX = (() => { let c; return () => c || (c = document.createElement('canvas').getContext('2d')); })();
function wtItemHalf(it){
  const g = WT_MCTX();
  if (it.k === 'bubble'){ const geo = bubbleGeom(g, it); return [geo.rx, geo.ry]; }
  if (it.k === 'text'){ g.font = `700 ${it.size || 46}px ${WT_TEXT}`; const ls = wrapLines(g, it.text, it.w || 420); return [Math.max(30, ...ls.map(l => g.measureText(l).width)) / 2 + 12, ls.length * (it.size || 46) * 1.35 / 2 + 10]; }
  if (it.k === 'sfx'){ const n = [...String(it.text || '')].length, z = it.size || 120; return it.vert ? [z * 0.6, z * 0.9 * n / 2 + z * 0.2] : [z * 0.95 * n / 2 + z * 0.24, z * 0.62]; }
  return [(it.size || 120) * 0.6, (it.size || 120) * 0.6];
}
function wtAutoLayout(pg, panel){
  const pts = polyPx(pg, panel), bb = polyBox(pts), bw = bb[2] - bb[0], bh = bb[3] - bb[1];
  const mine = (pg.items || []).filter(it => it.auto && !it.fixed && (it.pid ? it.pid === panel.id : inPolyPx(it.x, it.y, pts)));
  if (!mine.length) return;
  const busy = wtBusyMap(pg, panel);
  const placed = (pg.items || []).filter(it => !mine.includes(it) && inPolyPx(it.x, it.y, pts) && !(it.k === 'stk' && it.kind === 'speed')).map(it => { const [hw, hh] = wtItemHalf(it); return [it.x - hw, it.y - hh, it.x + hw, it.y + hh]; });
  const inside = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].every(([x, y]) => inPolyPx(x, y, pts));
  const over = (r) => placed.reduce((a, q) => { const w = Math.min(r[2], q[2]) - Math.max(r[0], q[0]), h = Math.min(r[3], q[3]) - Math.max(r[1], q[1]); return a + (w > 0 && h > 0 ? w * h : 0); }, 0);
  const m = Math.max(16, bw * 0.025);
  // 얼굴이 올 자리 짐작: 흑백 그림의 피부는 선이 적어 '빈 곳'처럼 보이므로 따로 피한다
  const tg = `${panel.tags || ''} ${panel.pose || ''}`, nCh = String(panel.chars || '').split(/[,，、]/).filter(x => x.trim()).length;
  const faces = [];
  if (nCh && !/\b(hands? focus|head out of frame|from behind|back view)\b/i.test(tg)){
    const close = /\b(close-up|face|portrait)\b/i.test(tg), far = /\b(full body|wide shot|from far|aerial)\b/i.test(tg);
    const xs = [[0.5], [0.3, 0.7], [0.2, 0.5, 0.8]][Math.min(2, nCh - 1)];
    for (const fx of xs){ const hwf = close ? 0.32 / Math.min(2, nCh) + 0.08 : far ? 0.07 : 0.14, y0 = close ? 0.12 : far ? 0.12 : 0.1, y1 = close ? 0.9 : far ? 0.3 : 0.5;
      faces.push([bb[0] + bw * (fx - hwf), bb[1] + bh * y0, bb[0] + bw * (fx + hwf), bb[1] + bh * y1]); }
  }
  const faceHit = r => faces.reduce((a, q) => { const w = Math.min(r[2], q[2]) - Math.max(r[0], q[0]), h = Math.min(r[3], q[3]) - Math.max(r[1], q[1]); return a + (w > 0 && h > 0 ? w * h : 0); }, 0) / ((r[2] - r[0]) * (r[3] - r[1]));
  let lastY = bb[1] - 1e9;
  for (const it of mine.sort((a, b) => (a.ord ?? (a.y - bb[1]) / 1e4) - (b.ord ?? (b.y - bb[1]) / 1e4))){
    const role = it.role || (it.k === 'bubble' ? (it.shape === 'box' ? 'narr' : 'say') : it.k === 'text' ? 'mono' : it.k === 'sfx' ? 'sfx' : 'stk');
    const [hw, hh] = wtItemHalf(it);
    if (hw * 2 + m * 2 > bw || hh * 2 + m * 2 > bh){ it.x = bb[0] + bw / 2; it.y = bb[1] + bh / 2; continue; }   // 컷보다 크면 가운데
    const spk = it.who >= 0 && it.nwho ? bb[0] + bw * ([[0.5], [0.3, 0.7], [0.2, 0.5, 0.8]][Math.min(2, it.nwho - 1)][Math.min(it.who, 2)] ?? 0.5) : null;
    const sx = Math.max(8, bw / 14), sy = Math.max(8, bh / 14), cands = [];
    for (let y = bb[1] + m + hh; y <= bb[3] - m - hh; y += sy) for (let x = bb[0] + m + hw; x <= bb[2] - m - hw; x += sx){
      const r = [x - hw, y - hh, x + hw, y + hh]; if (inside(...r)) cands.push({x, y, r, b: busy ? busy(...r) : 0});
    }
    if (!cands.length) continue;
    // 복잡한 정도는 이 컷 안에서 상대값으로 (해칭 많은 흑백 그림은 어디나 복잡해서 절댓값이면 자리 선호가 묻힌다)
    const bmin = Math.min(...cands.map(c => c.b)), bmax = Math.max(...cands.map(c => c.b)), bn = c => busy && bmax - bmin > 1e-3 ? (c.b - bmin) / (bmax - bmin) : 0;
    let best = null;
    for (const c of cands){
      const {x, y, r} = c, fy = (y - bb[1]) / bh, fx = (x - bb[0]) / bw, B = bn(c);
      let sc = B * 2.2 + over(r) / (hw * hh * 4) * 14 + (role === 'sfx' ? 0.6 : 1.8) * faceHit(r);   // 복잡한 곳(얼굴·몸)과 겹침을 피한다
      if (role === 'say'){ sc += fy * 2.6; if (y < lastY + hh * 0.5) sc += 3; sc += spk != null ? Math.abs(x - spk) / bw * 0.7 : 0; sc += Math.max(0, 0.3 - Math.abs(fx - 0.5)) * (busy ? 0.6 : 2); }   // 위쪽, 읽는 순서, 말하는 사람 쪽, 얼굴이 오기 쉬운 한가운데는 덜
      else if (role === 'narr') sc += fy * 3.2 + fx * 1.2;   // 설명 상자: 왼쪽 위
      else if (role === 'mono') sc += (1 - fy) * 1.6 + Math.abs(fx - 0.5) * 0.6;   // 독백 글자: 아래쪽
      else if (role === 'sfx') sc += Math.abs(fy - 0.6) * 0.8 - B * 1.4;   // 효과음: 얼굴만 아니면 동작 근처도 괜찮다 (위 B*2.2 와 합쳐 약하게 피한다)
      else sc += (1 - fy) * 0.8;
      if (!best || sc < best.sc) best = {sc, x, y};
    }
    if (!best) continue;
    const dx = best.x - it.x, dy = best.y - it.y; it.x = best.x; it.y = best.y;
    if (it.tail){
      // 꼬리: 말하는 사람(없으면 아래쪽 가운데)을 향해 풍선 크기만큼만
      const tx0 = spk ?? (bb[0] + bw * 0.5), ty0 = bb[1] + bh * 0.42;   // 말하는 사람의 얼굴·입 언저리
      const ang = Math.atan2(ty0 - it.y, tx0 - it.x), co = Math.cos(ang), si = Math.sin(ang);
      const rEdge = 1 / Math.sqrt((co / hw) ** 2 + (si / hh) ** 2), len = Math.max(40, Math.min(bh * 0.13, Math.hypot(tx0 - it.x, ty0 - it.y) - rEdge));
      it.tail = {x: Math.max(bb[0] + 6, Math.min(bb[2] - 6, it.x + co * (rEdge + len))), y: Math.max(bb[1] + 6, Math.min(bb[3] - 6, it.y + si * (rEdge + len)))};
    }
    placed.push([it.x - hw, it.y - hh, it.x + hw, it.y + hh]);
    if (role === 'say') lastY = it.y;
  }
}
// 쪽 전체 다시 잡기(편집기 '말풍선 자리 다시 잡기' 버튼)
function wtRelayout(pg, force){ for (const pn of pg.panels){ if (force) for (const it of pg.items) if (inPolyPx(it.x, it.y, polyPx(pg, pn)) && !it.fixed) { it.auto = true; it.pid = pn.id; } wtAutoLayout(pg, pn); } }
window.nvWtRelayout = wtRelayout;
$('#wtRelayout') && ($('#wtRelayout').onclick = e => { const pg = wtPage(); if (!pg) return; wtRelayout(pg, e.shiftKey); wtCommit(); wtRender(); toast(e.shiftKey ? '이 쪽의 글·효과를 모두 다시 놓았어요' : '자동으로 놓인 글·효과를 다시 놓았어요 (Shift+누르기: 손으로 옮긴 것까지)'); });
function wtBuildFromScript(sc){
  const pages = [];
  for (const sp of sc.pages || []){
    const specs = (sp.panels || []).slice(0, 4); if (!specs.length) continue;
    const want = {1: '1', 2: '2a', 3: '3a', 4: '4a'}[specs.length];
    const key = WT_LAYOUTS[sp.layout] && WT_LAYOUTS[sp.layout].polys.length === specs.length ? sp.layout : want;
    const pg = wtNewPage(key, 2000); const real = pg.panels;
    pg.setting = String(sp.setting || '').trim() || (pages.at(-1)?.setting || ''); pg.seed = Math.floor(Math.random() * 4e9);   // 장소·빛·옷을 쪽 안 모든 컷에 같이 / 같은 쪽은 씨앗도 이웃하게
    specs.forEach((spec, i) => { const pn = real[i]; pn.setting = pg.setting; pn.scene = spec.scene || ''; pn.tags = spec.tags || ''; pn.pose = spec.pose || ''; pn.fx = !!spec.fx; pn.chars = (spec.chars || []).join(', '); });
    const order = ['speed', 'stk', 'sfx', 'text', 'bubble'];   // 아래에 깔릴 것부터
    const items = []; specs.forEach((spec, i) => items.push(...wtPlace(pg, real[i], spec)));
    items.sort((a, b) => order.indexOf(a.k === 'stk' && a.kind === 'speed' ? 'speed' : a.k) - order.indexOf(b.k === 'stk' && b.kind === 'speed' ? 'speed' : b.k));
    pg.items = items; real.forEach(pn => wtAutoLayout(pg, pn)); pages.push(pg);
  }
  return pages;
}
// AI가 지어낸 새 인물을 인물 사전에 넣어 둔다(다음 화에서도 같은 외형으로)
const wtVoiceDict = () => ($('#wtVoice')?.value || store.get('set.wtVoice', '')).split('\n').map(x => x.trim()).filter(Boolean);
function wtMergeVoice(cast){
  const el = $('#wtVoice'); const cur = wtVoiceDict(); const have = new Set(cur.map(l => l.split(':')[0].trim())); let n = 0;
  for (const c of cast || []){ const name = String(c.name || '').trim(), v = String(c.voice || '').trim(); if (!name || !v || have.has(name)) continue; cur.push(`${name}: ${v}`); have.add(name); n++; }
  if (n){ el.value = cur.join('\n'); store.set('set.wtVoice', el.value); }
  return n;
}
function wtMergeCast(cast){
  const el = $('#naiChars'); const cur = el.value.split('\n').map(x => x.trim()).filter(Boolean);
  const have = new Set(cur.map(l => l.split(':')[0].trim())); let n = 0;
  for (const c of cast || []){
    const name = String(c.name || '').trim(), tags = String(c.tags || '').trim();
    if (!name || !tags || have.has(name)) continue;
    if (wtRating() === 'nsfw' && MINOR_RE.test(name + ' ' + tags)) continue;
    cur.push(`${name}: ${tags}`); have.add(name); n++;
  }
  if (n){ el.value = cur.join('\n'); store.set('set.naiChars', el.value); $('#wtChars').value = el.value; }
  return n;
}
const ADULT_HINT = /(키스|입술|벗|맨살|가슴|허리|숨|신음|몸을|안았|끌어안|침대|달아오|젖|삽입|섞|올라타|밀어 넣|헐떡|애무|젖꼭|사정|절정)/;
// 등급은 성인인데 글이 담백하게만 나오면 알려 준다(모델이 수위를 낮춘 경우)
function wtTameWarn(text){
  if (wtRating() !== 'nsfw' || ADULT_HINT.test(text || '')) return '';
  const p = PROV[provOf($('#wtAI').value === 'default' ? '' : '#wtAI')]?.name || 'AI';
  return ` ⚠ 성인으로 뒀는데 담백하게 나왔어요. ${p}가 수위를 낮춘 거예요 — 설정 탭에서 Ollama(내 컴퓨터) 같은 제한 없는 모델로 바꾸면 그대로 나와요.`;
}
const wtAutoStat = t => { $('#wtAutoStat').textContent = t; };
const wtBlank = () => WT.proj.pages.length === 1 && !WT.proj.pages[0].items.length && !WT.proj.pages[0].panels.some(p => p.img);
// 성인 웹툰은 원하면 내 컴퓨터 AI(Ollama)로: Claude·Gemini 는 성인 대본을 거절하거나 순하게 바꾼다
const wtClient = async sel => (wtRating() === 'nsfw' && store.get('set.naiNsfwOllama', false)) ? {prov: 'ollama'} : client(sel === 'default' ? '' : '#wtAI');
let wtAbort = null;
$('#wtAuto').onclick = () => { if (!WT.proj) return; $('#wtAutoBox').hidden = false; wtAutoStat(''); wtGenSync(); $('#wtSyn').value = WT.proj.synopsis || ''; $('#wtSynBox').hidden = !WT.proj.synopsis; wtSynStat(); };
$('#wtAutoX').onclick = () => { $('#wtAutoBox').hidden = true; };
$('#wtAutoStop').onclick = () => wtAbort?.abort();
$('#wtAutoGo').onclick = async () => {
  const story = ($('#wtSyn').value.trim() && !$('#wtSynBox').hidden) ? $('#wtSyn').value.trim() : $('#wtStory').value.trim();
  if (!story) return toast('줄거리를 적어 주세요');
  if (wtAbort) return;
  const rating = wtRating(), dict = naiCharsDict();
  if (rating === 'nsfw' && !adultGuard(story + '\n' + dict.join('\n'), 'adult')) return;
  const sel = $('#wtAI').value; const c = await wtClient(sel); if (!c) return;
  let n = Math.max(1, Math.min(12, +$('#wtPagesN').value || 4)); const tone = $('#wtTone').selectedOptions[0].text;
  // 줄거리의 장면 수([1장] 같은 줄)가 쪽 수보다 많으면 쪽을 늘린다(예전엔 4쪽에 줄이느라 사건이 빠졌다)
  const scenes = (story.match(/^\s*\[[^\]]+\]/gm) || []).length;
  if (scenes > n){ n = Math.min(12, scenes); $('#wtPagesN').value = n; toast(`줄거리 장면이 ${scenes}개라 ${n}쪽으로 늘렸어요`); }
  wtAbort = new AbortController(); $('#wtAutoGo').disabled = true; $('#wtAutoStop').hidden = false; wtAutoStat('대본 쓰는 중…');
  const cast = $('#wtCast').value.split(/[,，、]/).map(x => x.trim()).filter(Boolean);
  const known = new Set(dict.map(l => l.split(':')[0].trim()));
  const content = [{type: 'text', text: `${wtFrameLine()}쪽 수: ${n}쪽 (사건을 다 담으려면 ±2쪽 괜찮음)\n컷 느낌: ${tone}\n등급: ${rating === 'nsfw' ? `성인(19금). ${wtHeat()}` : '일반(safe). 노출·성적 요소 없이.'}\n나오는 인물: ${cast.length ? cast.join(', ') : '(줄거리에서 알아서 정한다)'}\n그중 사전에 없어 외형을 지어야 하는 이름: ${cast.filter(x => !known.has(x)).join(', ') || '(없음)'}\n인물 사전(이름: 외형 — chars에는 이름만 쓴다):\n${dict.length ? dict.map(l => l.split(':')[0].trim() + ' — ' + l.slice(l.indexOf(':') + 1).trim().slice(0, 60)).join('\n') : '(없음)'}\n\n말투(이 말투대로 대사를 쓴다):\n${wtVoiceDict().length ? wtVoiceDict().join('\n') : '(없음 — cast 에 말투를 지어 넣는다)'}\n\n줄거리:\n${story}`}];
  let res; try{ res = await stream(c, {messages: [{role: 'user', content}], system: SYSTEM_WT(), signal: wtAbort.signal, format: {type: 'json_schema', schema: WT_SCHEMA}}); }
  finally { wtAbort = null; $('#wtAutoGo').disabled = false; $('#wtAutoStop').hidden = true; }
  if (!res.ok){ return wtAutoStat((res.note || '대본을 못 만들었어요').trim()); }
  let sc; try{ sc = parseJSON(res.text); }catch{ return wtAutoStat('대본을 읽지 못했어요. 다시 눌러 주세요.'); }
  const newCast = wtMergeCast(sc.cast); wtMergeVoice(sc.cast);
  // 길게 써 둔 줄거리가 있으면 대본이 만든 짧은 줄거리로 덮지 않는다
  if (sc.synopsis && !$('#wtSyn').value.trim()){ WT.proj.synopsis = String(sc.synopsis).slice(0, 4000); $('#wtSyn').value = WT.proj.synopsis; $('#wtSynBox').hidden = false; wtSynStat(); }
  const added = wtBuildFromScript(sc); if (!added.length) return wtAutoStat('쪽이 비어 있어요. 줄거리를 조금 더 구체적으로 적어 주세요.');
  if (wtBlank()){ WT.proj.pages = added; WT.pi = 0; } else { WT.proj.pages.push(...added); WT.pi = WT.proj.pages.length - added.length; }
  if (sc.title && /^새 웹툰$|^이름 없는/.test($('#wtName').value)) $('#wtName').value = String(sc.title).slice(0, 40);
  WT.sel = null; wtCommit(); wtBuildPages(); wtSideSync(); wtRender();
  const panels = added.reduce((a, p) => a + p.panels.length, 0);
  wtAutoStat(`${added.length}쪽 · ${panels}컷을 만들었어요${newCast ? ` · 새 인물 ${newCast}명(외형·말투)을 사전에 넣었어요` : ''}.` + (wtTameWarn(JSON.stringify(sc.pages)) || ' 말풍선은 눌러서 옮기고 고칠 수 있어요.') + (DESKTOP ? ' 이어서 컷 그림을 만들 수 있어요.' : ' 컷 그림은 장면 노트에서 가져오거나 컴퓨터 프로그램에서 만들 수 있어요.'));
  wtGenSync();
  if (store.get('set.wtAutoDraw', false) && naiToken() && wtTodo().length){ wtAutoStat('대본 끝 · 이어서 컷 그림을 만들어요…'); setTimeout(() => $('#wtGenAll').click(), 400); }   // 한 번에: 대본 → 컷 그림까지
};

/* ---------- 컷 그림 일괄 생성 (프로그램·폰 모두, 노벨AI) ---------- */
function wtTodo(){ const out = []; for (const pg of WT.proj?.pages || []) for (const pn of pg.panels) if (!pn.img && !pn.inset) out.push([pg, pn]); return out; }
function wtGenSync(){ const n = wtTodo().length; const b = $('#wtGenAll'); if (b){ b.disabled = !n; b.textContent = n ? `그림 없는 컷 ${n}개 모두 만들기 (노벨AI)` : '모든 컷에 그림이 있어요'; } }
let wtGenAbort = false;
$('#wtGenStop').onclick = () => { wtGenAbort = true; wtAutoStat('멈추는 중… (그리던 한 컷은 끝나요)'); };
$('#wtGenAll').onclick = async () => {
  if (!naiToken()){ $('#wtAutoBox').hidden = true; $('#wtClose').click(); openTool('nai'); return toast('노벨AI 탭에서 토큰을 먼저 넣어 주세요'); }
  const todo = wtTodo(); if (!todo.length) return;
  if (!wtDict().size && todo.some(([, pn]) => String(pn.chars).trim()) && !confirm('인물 사전이 비어 있어서 인물이 매번 다르게 나와요. 그래도 만들까요?')) return;
  wtGenAbort = false; $('#wtGenAll').disabled = true; $('#wtGenStop').hidden = false; $('#wtAutoGo').disabled = true;
  let done = 0, fail = 0;
  for (const [pg, pn] of todo){
    if (wtGenAbort) break;
    wtAutoStat(`컷 그림 만드는 중 ${done + fail + 1}/${todo.length}…`);
    try{ await wtGenPanel(pg, pn); done++; wtCommit(); wtRender(); }
    catch(e){ fail++; wtAutoStat('멈췄어요: ' + e.message); if (/토큰|생성 수/.test(e.message)) break; }
    if (!wtGenAbort) await new Promise(r => setTimeout(r, 1200));
  }
  $('#wtGenStop').hidden = true; $('#wtAutoGo').disabled = false; wtGenSync();
  wtAutoStat(`끝났어요 · 그림 ${done}컷${fail ? ` · 실패 ${fail}` : ''}${wtGenAbort ? ' · 멈춤' : ''}`); wtBuildPages();
};
// 선택한 컷 하나만 (다시) 뽑기
$('#wtImgGen').onclick = async () => {
  if (!naiToken()){ $('#wtClose').click(); openTool('nai'); return toast('노벨AI 탭에서 토큰을 먼저 넣어 주세요'); }
  const s = WT.sel, pg = wtPage(); if (s?.t !== 'panel') return toast('컷을 먼저 눌러 골라 주세요');
  const b = $('#wtImgGen'); b.disabled = true; const t0 = b.textContent; b.textContent = '만드는 중…';
  try{ await wtGenPanel(pg, pg.panels[s.i]); wtCommit(); wtRender(); wtBuildPages(); }catch(e){ toast(e.message); }
  b.disabled = false; b.textContent = t0;
};

/* ---------- 그림체·인물 사전 칸 ---------- */
function wtStyleSync(){ const k = $('#wtStyle').value; $('#wtStyleIn').hidden = k !== 'custom'; $('#wtMonoRow').hidden = k !== 'dark' && k !== 'spot'; $('#wtFrameRow').hidden = k !== 'dark'; store.set('set.wtStyle', k); }
$('#wtNaiText').checked = store.get('set.wtNaiText', false);
if ($('#wtOllama')){ $('#wtOllama').checked = !!store.get('set.naiNsfwOllama', false); $('#wtOllama').onchange = () => { store.set('set.naiNsfwOllama', $('#wtOllama').checked); if ($('#naiNsfwOllama')) $('#naiNsfwOllama').checked = $('#wtOllama').checked; }; }
if ($('#wtAutoDraw')){ $('#wtAutoDraw').checked = !!store.get('set.wtAutoDraw', false); $('#wtAutoDraw').onchange = () => store.set('set.wtAutoDraw', $('#wtAutoDraw').checked); }
$('#wtNaiText').onchange = () => store.set('set.wtNaiText', $('#wtNaiText').checked);
$('#wtStyle').value = store.get('set.wtStyle', WT_DEFAULT_STYLE); $('#wtMono').value = store.get('set.wtMono', 'cold blue'); $('#wtStyleIn').value = store.get('set.wtStyleIn', ''); wtStyleSync();
$('#wtStyle').onchange = wtStyleSync;
$('#wtMono').onchange = () => store.set('set.wtMono', $('#wtMono').value);
$('#wtFrame').value = store.get('set.wtFrame', 'mirror');
$('#wtFrame').onchange = () => store.set('set.wtFrame', $('#wtFrame').value);
$('#wtStyleIn').oninput = () => { clearTimeout(WT.styT); WT.styT = setTimeout(() => store.set('set.wtStyleIn', $('#wtStyleIn').value), 500); };
$('#wtChars').value = $('#naiChars').value;
$('#wtChars').oninput = () => { $('#naiChars').value = $('#wtChars').value; clearTimeout(WT.chT); WT.chT = setTimeout(() => store.set('set.naiChars', $('#wtChars').value), 500); };
$('#wtVoice').value = store.get('set.wtVoice', '');
$('#wtVoice').oninput = () => { clearTimeout(WT.vcT); WT.vcT = setTimeout(() => store.set('set.wtVoice', $('#wtVoice').value), 500); };
$('#wtAuto').addEventListener('click', () => { $('#wtChars').value = $('#naiChars').value; $('#wtVoice').value = store.get('set.wtVoice', ''); });

$('#wtSynUse').onclick = () => { const v = $('#wtSyn').value.trim(); if (!v) return toast('줄거리가 비어 있어요'); WT.proj.synopsis = v; $('#wtAutoGo').click(); };
$('#wtSyn').oninput = () => { if (WT.proj) WT.proj.synopsis = $('#wtSyn').value; };

/* ---------- 이야기 틀: 많이 팔리는 웹툰·만화의 화 구성 공식을 줄거리·대본 AI 에게 함께 준다 ---------- */
const WT_FRAMES = {
  hook: '1화 공식: 첫 쪽 첫 컷에 이 이야기에서 가장 센 장면(훅)을 먼저 보여 준다 → 두 사람의 관계와 위치를 짧게 → 사건 → 감정이 꺾이는 반전 → 다음 화가 궁금한 장면에서 끊는다(클리프행어). 마지막 컷은 대사 한 줄이나 표정 클로즈업.',
  pair: '2인 관계극: 힘의 차이(갑을·체격·계급)가 분명한 두 사람. 거리 두기 → 도발 → 몸이 닿는 순간 → 위계가 한 번 뒤집히는 컷 → 여운. 둘만 있는 공간(옥상·자취방·차 안·창고)을 쓴다. 쪽마다 둘의 거리가 조금씩 줄어든다.',
  school: '학원·일진물: 계급이 정해진 교실과 복도 → 약자가 표적이 된다 → 예상 밖의 보호나 관심 → 주변의 시선과 소문 → 둘만 아는 비밀로 끝. 교복 대신 대학·직장으로 옮겨도 같은 구조.',
  romcom: '로맨틱 코미디: 오해에서 시작 → 억지로 붙어 있어야 하는 상황 → 과장된 표정과 효과음이 있는 개그 컷 3번 이상 → 갑자기 조용해지는 설렘 한 컷 → 방해로 끊긴다.',
  dark: '집착·피폐: 평범한 일상 → 이상한 흔적 → 확인 → 도망칠 수 없는 구조가 드러남 → 마지막 컷에 상대의 얼굴을 크게. 밝은 컷과 어두운 컷의 대비를 크게.',
  gag: '개그: 쪽마다 4컷 리듬(설정 → 전개 → 비틀기 → 한 방). 마지막 컷은 리액션 표정을 크게, 효과음을 크게.',
  fantasy: '판타지 각성: 약자의 초라한 일상 → 사건(던전·회귀·상태창) → 힘을 처음 쓰는 큰 컷 → 주변의 반응 → 더 큰 위협 예고로 끊는다.',
};
window.nvWtFrameLine = () => wtFrameLine();
const wtFrameLine = () => { const v = $('#wtStoryFrame')?.value; return v && WT_FRAMES[v] ? `이야기 틀(이 구성 순서를 따른다): ${WT_FRAMES[v]}\n` : ''; };
$('#wtStoryFrame') && ($('#wtStoryFrame').value = store.get('set.wtStoryFrame', ''), $('#wtStoryFrame').onchange = () => store.set('set.wtStoryFrame', $('#wtStoryFrame').value));
/* ================= 줄거리 길게 쓰기 ================= */
const WT_SYN_LEN = {
  short: {n: '3~6문장', beats: 0, say: '짧게. 한 장면의 흐름만.'},
  mid:   {n: '10문장 안팎', beats: 5, say: '보통. 들어가는 장면, 사건, 감정이 꺾이는 곳, 끝.'},
  long:  {n: '18~25문장', beats: 10, say: '길게. 장면마다 한 줄씩 적어 컷으로 바로 옮길 수 있게.'},
  arc:   {n: '30문장 이상', beats: 14, say: '아주 길게. 화로 나누고, 화마다 어디서 끊어 다음 화를 보고 싶게 할지까지.'},
};
const WT_SYN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'logline', 'synopsis', 'beats', 'cast'],
  properties: {
    title: {type: 'string', description: '이번 화(또는 이 이야기) 제목'},
    logline: {type: 'string', description: '한 줄 소개. 20~40자'},
    synopsis: {type: 'string', description: '줄거리 본문. 한국어 줄글. 요청한 분량을 채운다'},
    beats: {type: 'array', description: '장면(또는 화) 차례. 비워도 된다', items: {type: 'object', additionalProperties: false, required: ['t', 'c'],
      properties: {t: {type: 'string', description: '장면 이름 또는 N화'}, c: {type: 'string', description: '그 장면에서 벌어지는 일 1~3문장'}}}},
    cast: {type: 'array', description: '사전에 없던 인물만', items: {type: 'object', additionalProperties: false, required: ['name', 'tags', 'voice'],
      properties: {name: {type: 'string'}, tags: {type: 'string'}, voice: {type: 'string'}}}},
  }
};
const SYSTEM_SYN_BASE = `너는 한국 웹툰·웹소설 기획자다. 거칠게 적힌 이야기를 쓸 수 있는 줄거리로 늘린다. 모두 한국어.
- 받은 내용은 바꾸지 않고, 비어 있는 곳만 채운다: 어디서 언제, 둘 사이에 무슨 일이 있었는지, 왜 지금 이 장면인지, 감정이 꺾이는 지점, 끝.
- 장면이 눈에 보이게 쓴다. 설명하지 말고 무엇을 하는지 쓴다. 감정은 이름 붙이지 않고 행동과 사물로 보여 준다.
- 인물은 받은 이름을 쓰고, 새 인물이 필요하면 이름을 지어 cast 에 외형 영어 태그와 한국어 말투를 적는다. 모든 인물은 성인이다.
- beats 는 장면(또는 화) 차례다. 요청한 개수만큼 쓰고, 각 항목은 그 장면에서 실제로 벌어지는 일을 적는다.
- 톤이 따로 정해지지 않았으면 밝고 가벼운 분위기로 흐르지 않게 한다. 빛과 그림자, 침묵과 거리로 감정을 만든다.
{ADULT}
출력은 JSON 하나만.`;
const SYSTEM_SYN = () => SYSTEM_SYN_BASE.replace('{ADULT}', wtAdultRules() + '\n' + WT_NATURAL);
function wtSynText(sc){
  const parts = [];
  if (sc.logline) parts.push(String(sc.logline).trim());
  if (sc.synopsis) parts.push(String(sc.synopsis).trim());
  for (const b of sc.beats || []) if (b?.c) parts.push(`[${String(b.t || '').trim()}] ${String(b.c).trim()}`);
  return parts.filter(Boolean).join('\n\n');
}
function wtSynStat(){ const v = $('#wtSyn').value.trim(); $('#wtSynLenOut').textContent = v ? `${v.replace(/\s/g, '').length}자` : ''; }
let wtSynAbort = null;
function wtSynBusy(on){ $('#wtSynGo').disabled = on; $('#wtSynMore').disabled = on; $('#wtSynSpice').disabled = on; $('#wtAutoGo').disabled = on; $('#wtSynStop').hidden = !on; }
// more: true=이어서 더 쓰기, 'spice'=같은 사건·인물로 덜 딱딱하게(성인이면 더 노골적으로) 다시 쓰기
async function wtSynRun(more){
  const spice = more === 'spice'; if (spice) more = false;
  const seed = (spice ? $('#wtSyn').value : more ? $('#wtSyn').value : ($('#wtSyn').value.trim() || $('#wtStory').value)).trim();
  if (spice && !seed) return toast('먼저 줄거리를 쓰거나 만들어 주세요');
  if (!seed) return toast('줄거리를 한 줄이라도 적어 주세요');
  if (wtSynAbort) return;
  const rating = wtRating(), dict = naiCharsDict();
  if (rating === 'nsfw' && !adultGuard(seed + '\n' + dict.join('\n'), 'adult')) return;
  const sel = $('#wtAI').value; const c = await wtClient(sel); if (!c) return;
  const L = WT_SYN_LEN[$('#wtSynLen').value] || WT_SYN_LEN.mid;
  const cast = $('#wtCast').value.split(/[,，、]/).map(x => x.trim()).filter(Boolean);
  wtSynAbort = new AbortController(); wtSynBusy(true); wtAutoStat(spice ? '줄거리를 맛깔나게 다시 쓰는 중…' : more ? '줄거리를 이어서 쓰는 중…' : '줄거리를 늘리는 중…');
  if (spice) WT.proj.synPrev = $('#wtSyn').value;
  const text = `${wtFrameLine()}분량: ${L.n} — ${L.say}
장면(또는 화) 차례 개수: ${L.beats || '없이'}
등급: ${rating === 'nsfw' ? `성인(19금). ${wtHeat()}` : '일반(safe).'}
나오는 인물: ${cast.length ? cast.join(', ') : '(알아서 정한다)'}
인물 사전: ${dict.length ? dict.map(l => l.split(':')[0].trim()).join(', ') : '(없음)'}
말투: ${wtVoiceDict().join(' / ') || '(없음)'}

${spice ? `아래 줄거리를 같은 사건·인물·순서로 두고 처음부터 다시 쓴다. AI 같은 문장과 설명을 걷어 내고, 사람이 쓴 웹툰처럼 짧고 생생하게.${rating === 'nsfw' ? ' 야한 장면은 더 길고 더 노골적으로, 소리와 몸의 반응을 더 적는다.' : ''}` : more ? '아래 줄거리를 그대로 두고 그 뒤를 이어서 더 쓴다. 이미 쓴 부분은 다시 쓰지 않는다.' : '아래를 바탕으로 늘려 쓴다.'}

${seed}${wtRefBlock(await wtRefText())}`;
  let res; try{ res = await stream(c, {messages: [{role: 'user', content: [{type: 'text', text}]}], system: SYSTEM_SYN(), signal: wtSynAbort.signal, format: {type: 'json_schema', schema: WT_SYN_SCHEMA}}); }
  finally { wtSynAbort = null; wtSynBusy(false); }
  if (!res.ok) return wtAutoStat((res.note || '줄거리를 못 만들었어요').trim());
  let sc; try{ sc = parseJSON(res.text); }catch{ return wtAutoStat('줄거리를 읽지 못했어요. 다시 눌러 주세요.'); }
  const body = wtSynText(sc); if (!body) return wtAutoStat('받은 줄거리가 비어 있어요.');
  $('#wtSyn').value = more ? ($('#wtSyn').value.trim() + '\n\n' + body) : body;
  $('#wtSynBox').hidden = false; WT.proj.synopsis = $('#wtSyn').value; wtSynStat(); wtSaveSoon();
  const n = wtMergeCast(sc.cast); wtMergeVoice(sc.cast);
  if (sc.title && /^새 웹툰$|^이름 없는/.test($('#wtName').value)) $('#wtName').value = String(sc.title).slice(0, 40);
  wtAutoStat(`줄거리를 ${more ? '이어서 ' : ''}썼어요 · ${$('#wtSyn').value.replace(/\s/g, '').length}자${n ? ` · 새 인물 ${n}명` : ''}.` + (wtTameWarn(body) || " 고쳐 쓰고 '이 줄거리로 대본 만들기'를 누르세요."));
}
$('#wtSynGo').onclick = () => wtSynRun(false);
$('#wtSynMore').onclick = () => wtSynRun(true);
$('#wtSynSpice').onclick = () => wtSynRun('spice');
$('#wtSynStop').onclick = () => wtSynAbort?.abort();
$('#wtSyn').addEventListener('input', wtSynStat);
$('#wtSynLen').value = store.get('set.wtSynLen', 'mid');
$('#wtSynLen').onchange = () => store.set('set.wtSynLen', $('#wtSynLen').value);

/* ---------- 등급·수위 칸 (노벨AI 탭과 같은 값을 쓴다) ---------- */
function wtRatingSync(){
  const on = $('#wtRating').value === 'nsfw'; $('#wtHeat').disabled = !on; $('#wtActRow').hidden = !on; $('#wtToneRow').hidden = !on;
  $('#wtRatingHint').textContent = on ? '성인으로 두면 줄거리·대사·컷 지시가 성인 기준으로 나와요. 모든 인물은 성인이어야 해요.' : '일반이면 노출·성적 요소 없이 만들어요.';
  const prov = provOf($('#wtAI').value === 'default' ? '' : '#wtAI');
  const soft = on && (prov === 'claude' || prov === 'gemini');
  $('#wtProvWarn').hidden = !soft;
  $('#wtProvWarn').textContent = soft ? `⚠ 글을 쓰는 AI가 ${PROV[prov].name}이에요. 이 모델들은 성인 장면을 스스로 수위를 낮춰 써요. 그림은 노벨AI라 영향이 없지만, 줄거리·대사를 그대로 받으려면 설정 탭에서 Ollama(내 컴퓨터에서 돌리는 제한 없는 모델)로 바꾸는 게 좋아요.` : '';
  $('#wtProvWarn').style.color = 'var(--danger, #c0392b)';
}
$('#wtRating').value = $('#naiRating').value; $('#wtHeat').value = store.get('set.wtHeat', 'mid'); wtRatingSync();
$('#wtRating').onchange = () => { $('#naiRating').value = $('#wtRating').value; store.set('set.naiRating', $('#naiRating').value); wtRatingSync(); wtModelSync(); };
$('#wtHeat').onchange = () => store.set('set.wtHeat', $('#wtHeat').value);
$('#wtAdultTone').value = store.get('set.wtAdultTone', 'drama'); $('#wtAdultTone').onchange = () => store.set('set.wtAdultTone', $('#wtAdultTone').value);
/* ---------- 문체 참고: 내 서재의 글 작품에서 대사·소리가 많은 대목을 골라 AI 에게 '말투·리듬·수위 표현'만 보여 준다 ---------- */
// 내용·이름·문장은 베끼지 않게 한다. 고른 작품은 이 기기에만 기억한다.
function wtRefFill(){
  const sel = $('#wtRef'); if (!sel) return; const keep = store.get('set.wtRef', '');
  // 글 작품뿐 아니라 웹툰·만화도(말풍선 글자를 읽어 쓴다). 성인 먼저, 같은 종류끼리
  const list = works.filter(w => w.eps.some(e => /^(txt|epub|epubch|txtpart|imgs)$/.test(e.type))).sort((a, b) => (isAdult(b) - isAdult(a)) || a.kind.localeCompare(b.kind) || natural(a.name, b.name)).slice(0, 400);
  sel.innerHTML = '<option value="">없음</option>' + list.map(w => `<option value="${esc(w.key)}">${isAdult(w) ? '[성인] ' : ''}[${KIND_LABEL[w.kind] || ''}] ${esc(w.name)}</option>`).join('');
  sel.value = list.some(w => w.key === keep) ? keep : '';
}
$('#wtRef').onfocus = wtRefFill; $('#wtRef').onchange = () => store.set('set.wtRef', $('#wtRef').value);
setTimeout(wtRefFill, 2500);
const WT_REF_CACHE = new Map();
async function wtRefText(){
  const key = $('#wtRef')?.value || store.get('set.wtRef', ''); if (!key) return '';
  if (WT_REF_CACHE.has(key)) return WT_REF_CACHE.get(key);
  const w = works.find(x => x.key === key); if (!w) return '';
  // 이 기기에 저장해 둔 것(웹툰·만화는 AI 로 말풍선을 읽어야 해서 한 번만)
  const lk = 'nv.wtRefC.' + key; try{ const c = localStorage.getItem(lk); if (c){ WT_REF_CACHE.set(key, c); return c; } }catch{}
  if (!w.eps.some(e => /^(txt|epub|epubch|txtpart)$/.test(e.type))){
    const t = await wtRefFromPages(w).catch(e => { toast('문체 참고: 말풍선을 읽지 못했어요 (' + e.message + ')'); return ''; });
    if (t){ WT_REF_CACHE.set(key, t); try{ localStorage.setItem(lk, t); }catch{} }
    return t;
  }
  let eps = w.eps;
  if (eps.some(e => e.type === 'epub') && !w._expanded){ try{ const out = []; for (const e of eps){ if (e.type !== 'epub'){ out.push(e); continue; } const r = await readEpub(e.file); r.chapters.forEach((c, i) => out.push({type: 'epubch', file: e.file, idx: i})); } eps = out; }catch{} }
  eps = eps.filter(e => /^(txt|epubch|txtpart)$/.test(e.type));
  // 앞·가운데·뒤에서 몇 화를 읽어, 대사·소리·말줄임이 많은 대목 두 군데를 고른다
  const pick = [...new Set([0, Math.floor(eps.length / 3), Math.floor(eps.length * 2 / 3), eps.length - 1])].filter(i => i >= 0 && eps[i]);
  const spans = [];
  for (const i of pick){
    let t = ''; try{ t = await epText(eps[i]); }catch{} if (!t) continue;
    const paras = t.split(/\n+/).map(x => x.trim()).filter(Boolean);
    for (let k = 0; k < paras.length; k += 4){
      const span = paras.slice(k, k + 12).join('\n').slice(0, 700);
      const score = (span.match(/["“”「」『』]/g) || []).length + 2 * (span.match(/[하흐읏앗응아]{2,}|…|♡|!{1,}/g) || []).length;
      spans.push({score, span});
    }
  }
  const lively = spans.filter(x => x.score > 0);   // 대사·소리가 하나도 없는 서술 대목은 말투 참고가 안 된다
  const best = (lively.length ? lively : spans).sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.span);
  const out = best.length ? best.join('\n\n——\n\n') : '';
  WT_REF_CACHE.set(key, out); return out;
}
// 웹툰·만화: 작품 전체에서 4쪽을 골라(30-style-pick.js 의 spWorkFiles) 그림을 볼 수 있는 AI 가 말풍선·나레이션·효과음 글자를 읽는 순서대로 옮겨 적는다
async function wtRefFromPages(w){
  const fs = spWorkFiles(w, 4); if (!fs.length) return '';
  wtAutoStat?.(`문체 참고: '${w.name}' ${fs.length}쪽의 말풍선을 읽는 중…`);
  const imgs = []; for (const f of fs){ try{ imgs.push(await spFileJpeg(f, 1024)); }catch{} }
  if (!imgs.length) return '';
  const sel = $('#wtAI').value; const c = await wtClient(sel); if (!c) return '';
  const r = await stream(c, {system: '너는 만화 글자 받아쓰기 담당이다. 그림 속 말풍선·속마음·나레이션 상자·효과음 글자를 읽는 순서대로 원문 그대로 옮겨 적는다. 번역·요약·설명은 하지 않는다. 한 줄에 말풍선 하나, 효과음은 [효과음] 을 앞에 붙인다. 쪽마다 --- 로 나눈다. 글자가 없는 쪽은 (없음).',
    messages: [{role: 'user', content: [...imgs.map(data => ({type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data}})), {type: 'text', text: '이 쪽들의 글자를 모두 받아써.'}]}]});
  if (!r.ok) throw new Error((r.note || '').trim() || '실패');
  return r.text.trim().slice(0, 1600);
}
const wtRefBlock = ref => ref ? `\n\n문체 참고(아래 글의 말투·문장 길이·리듬·소리 적는 법·수위 표현만 배운다. 내용·인물·이름·문장은 절대 베끼지 않는다):\n<<<\n${ref}\n>>>` : '';
$('#wtAI').addEventListener('change', wtRatingSync);
$('#wtAct').value = store.get('set.wtAct', '');
$('#wtAct').oninput = () => { clearTimeout(WT.actT); WT.actT = setTimeout(() => store.set('set.wtAct', $('#wtAct').value), 500); };
$('#wtAuto').addEventListener('click', () => { $('#wtRating').value = $('#naiRating').value; wtRatingSync(); });

/* ---------- 그림 모델 (노벨AI 탭과 같은 값) ---------- */
function wtModelSync(){
  const m = $('#wtModel').value, nsfw = wtRating() === 'nsfw';
  $('#ngModel').value = m; store.set('set.ngModel', m);
  const bad = nsfw && /curated/i.test(m);
  $('#wtModelHint').textContent = bad ? '⚠ Curated 는 성인 그림을 거의 안 그려요. 성인 웹툰이면 V5 Full 로 두세요.'
    : nsfw ? '성인 컷은 V5 Full 로 나가요. 검열(모자이크) 방지 태그도 함께 들어가요.'
    : '크기·스텝·샘플러는 832×1216 · 28 · k_euler_ancestral 로 고정돼요.';
  $('#wtModelHint').style.color = bad ? 'var(--danger, #c0392b)' : '';
}
$('#wtModel').value = ($('#ngModel').value || NAI_MODEL); if (!$('#wtModel').value) $('#wtModel').value = NAI_MODEL;
$('#wtModel').onchange = wtModelSync;
$('#wtAuto').addEventListener('click', () => { $('#wtModel').value = $('#ngModel').value || NAI_MODEL; wtModelSync(); });
wtModelSync();

/* ---------- 노벨AI 탭도 같은 그림체를 쓴다 ---------- */
// 06-ai-tabs.js 의 naiPack 이 부른다. 그림체를 고르면 그 공식, '직접 쓰기'면 하우스 스타일 칸.
window.naiStyleFor = nsfw => { const P = wtStyleParts(nsfw); const fo = (P.key || '').startsWith('v43') && P.focus ? ', ' + P.focus : P.v5 && P.focusMale ? ', ' + P.focusMale : '';   // v43 B: 얼굴 보호 블록도 노벨AI 탭에 · V5 최종: 남자 얼굴 블록
  return {head: (P.head || $('#naiStyle').value.trim().replace(/,\s*$/, '')) + fo, tail: P.tail, neg: n => wtStyleNeg(n, nsfw), params: P.v5 ? WT_V5_PARAMS : undefined}; };
function naiStyleLabel(){
  const k = wtStyleKey(); const el = $('#naiStyleNow'); if (!el) return;
  el.textContent = k === 'custom' ? '지금 그림체: 아래 하우스 스타일 칸을 그대로 써요' : `지금 그림체: ${WT_STYLE[k].name}` + ((k === 'dark' || k === 'spot') ? ` · ${wtMono()}` : '');
}
$('#naiStyleSel').value = store.get('set.wtStyle', WT_DEFAULT_STYLE);
$('#naiStyleSel').onchange = () => { $('#wtStyle').value = $('#naiStyleSel').value; store.set('set.wtStyle', $('#naiStyleSel').value); wtStyleSync(); naiStyleLabel(); };
$('#wtStyle').addEventListener('change', () => { $('#naiStyleSel').value = $('#wtStyle').value; naiStyleLabel(); });
$('#wtMono').addEventListener('change', naiStyleLabel);
naiStyleLabel();

window.nvWtPrompt = wtPanelPrompt;   // 시험용
window.wtKidsNeg = wtKidsNeg;   // 노벨AI 탭(naiPack)에서도 쓴다
