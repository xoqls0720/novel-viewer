/* ================= 웹툰 자동 만들기: 줄거리 → 대본 → 쪽·컷·말풍선 → (컴퓨터) 컷 그림 ================= */
const WT_LAYOUT_KEYS = Object.keys(WT_LAYOUTS);
// 우리 기본 그림체 2종 (인수인계 문서 house_style v15 / 암실 룩 기준, NAI V5)
const WT_STYLE = {
  neon: {
    name: '기본 A · 야수파 + 네온',
    // 공식 순서: ask + mika + 팔레트 + LINES + LUP + UPM + TORN + [FXP] + FOCUS + 인물(자세 1.4~1.5) + HAIR2 + FPM + DEV2 + 꼬리 + QG + no text
    head: '0.4::artist:ask_(askzy) ::, 0.75::artist:mika_pikazo ::, fauvist palette, bold complementary colors, vivid saturated color, thick confident lineart, dramatic rim lighting, 1.3::thin hot pink and electric cyan ribbon lines ::, torn paper border',
    fx: '1.2::paint splatter, dripping paint ::',                                   // 전투·각성 컷에서만
    focus: '1.8::his handsome face is the focal point, drawn with obsessive detail ::',
    tail: 'detailed hair strands, beautiful detailed eyes, painterly, high contrast, cinematic composition, looking at viewer, closed mouth, masterpiece, best quality, very aesthetic, absurdres',
    neg: 'bad face, bad eyes, deformed face, extra fingers, lipstick, makeup, eyeshadow, smile, grin, smirk, teeth, open mouth, katana, glasses, eyewear, 1girl, female, camera, hand on face, hands near face, bright pastel everyday palette',
  },
  dark: {
    name: '기본 B · 암실 룩',
    head: '0.4::artist:ask_(askzy) ::, -1.2::bishounen ::, -1::same face ::, 1.1::low key lighting ::, deep shadows',
    frame: '1.15::seen through {FRAME} ::, framed composition, foreground silhouette',   // 액자 효과가 핵심
    tail: 'extremely handsome man, beautiful detailed eyes, half-lidded eyes, looking at viewer, closed mouth, 1.2::limited palette ::, 1.2::{MONO} monochrome ::, ink black shadows, dust particles, sparkles, film grain, painterly, cinematic composition, storytelling, high contrast, masterpiece, best quality, very aesthetic',
    neg: 'bishounen, child, smile, grin, smirk, teeth, lipstick, makeup, katana, glasses, eyewear, 1girl, female',
    dropNeg: /\bfilm grain\b/gi,   // 암실 룩은 필름 그레인을 살린다
  },
};
const WT_FRAME = {mirror: 'a mirror', photo: 'a wet photograph', tank: 'aquarium glass', shutter: 'a gap in the shutters', fence: 'barbed wire', booth: 'recording booth glass', none: ''};
const WT_MONO = ['cold blue', 'red', 'gold', 'white and grey', 'teal', 'amber', 'magenta', 'dusty orange', 'moonlight blue', 'warm sepia'];
const WT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'synopsis', 'cast', 'pages'],
  properties: {
    title: {type: 'string'},
    synopsis: {type: 'string', description: '네가 채워 넣은 이번 화 줄거리. 한국어 3~6문장. 장소·시간, 무슨 일이 벌어지고, 감정이 어디서 꺾이고, 어떻게 끝나는지'},
    cast: {type: 'array', description: '사전에 없던 인물만. 외형 영어 태그와 한국어 말투를 지어서 채운다', items: {type: 'object', additionalProperties: false, required: ['name', 'tags', 'voice'],
      properties: {name: {type: 'string'}, tags: {type: 'string', description: '예: 1boy, adult, short black hair, grey eyes, black coat'}, voice: {type: 'string', description: '한국어 한 줄. 예: 낮은 반말, 짧고 명령적. 당황하면 말끝이 흐려진다'}}}},
    pages: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['layout', 'panels'],
      properties: {
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
{ADULT}
출력은 JSON 하나만.`;
const SYSTEM_WT = () => SYSTEM_WT_BASE.replace('{ADULT}', wtAdultRules());

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
- 모든 인물은 성인이다. 미성년을 떠올리게 하는 말(학생·교복·어리다·작다 등)은 절대 쓰지 않는다.`;
}
/* ---------- 그림체 ---------- */
const wtStyleKey = () => { const k = $('#wtStyle')?.value || store.get('set.wtStyle', 'neon'); return WT_STYLE[k] ? k : (k === 'custom' ? 'custom' : 'neon'); };
const wtMono = () => $('#wtMono')?.value || store.get('set.wtMono', 'cold blue');
const wtFrame = () => WT_FRAME[$('#wtFrame')?.value || store.get('set.wtFrame', 'mirror')] ?? WT_FRAME.mirror;
// 그림체를 머리·꼬리로 나눠 준다. 웹툰 컷과 노벨AI 탭이 같은 그림체를 쓰게 하는 한 곳.
function wtStyleParts(nsfw){
  const k = wtStyleKey();
  if (k === 'custom'){ const c = ($('#wtStyleIn')?.value || store.get('set.wtStyleIn', '')).trim().replace(/,\s*$/, ''); return {head: c, tail: '', neg: ''}; }
  const st = WT_STYLE[k]; const head = [st.head];
  if (k === 'dark'){ const fr = wtFrame(); if (fr) head.push(st.frame.replace('{FRAME}', fr)); }
  let tail = st.tail.replace('{MONO}', wtMono());
  if (nsfw){ tail = tail.replace(NSFW_DROP_POS, '').replace(/,\s*,/g, ','); head.push(WT_NSFW_TAGS[wtHeatKey()] || WT_NSFW_TAGS.mid); const a = wtActTags(); if (a) head.push(a); }
  return {head: head.filter(Boolean).join(', '), tail, neg: st.neg, focus: st.focus, fx: st.fx, key: k};
}
// 그림체 공식대로 base 를 만든다. 인물 자세(pose)는 1.45 로 올리고, 물감 튐은 전투·각성 컷에만 넣는다.
function wtStyleBase({count, tags, pose, fx, nsfw}){
  const P = wtStyleParts(nsfw); const parts = [P.head];
  if (P.key === 'neon'){ if (fx && P.fx) parts.push(P.fx); if (P.focus) parts.push(P.focus); }
  parts.push(count, tags);
  if (pose) parts.push(`1.45::${pose} ::`);
  parts.push(P.tail, 'no text');
  return parts.filter(Boolean).join(', ').replace(/,\s*,/g, ',');
}
function wtStyleTags(){   // 미리 보기·시험용: 지금 그림체의 앞 태그
  const k = wtStyleKey();
  if (k === 'custom') return ($('#wtStyleIn')?.value || store.get('set.wtStyleIn', '')).trim().replace(/,\s*$/, '');
  return WT_STYLE[k].head;
}
function wtStyleNeg(neg, nsfwArg){
  const k = wtStyleKey(); const st = WT_STYLE[k]; const nsfw = nsfwArg ?? (wtRating() === 'nsfw');
  let out = (st ? [neg, st.neg].filter(Boolean).join(', ') : neg).split(',').map(x => x.trim()).filter(Boolean);
  if (st?.dropNeg) out = out.filter(x => !st.dropNeg.test(x));
  if (nsfw) out = out.filter(x => !NSFW_DROP_NEG.test(x));   // 성인 컷에서 벌린 입·표정을 막지 않는다
  if (nsfw) out.push(...NSFW_NEG_ADD.split(',').map(x => x.trim()));
  return [...new Set(out)].join(', ');
}
/* ---------- 컷 → 노벨AI 프롬프트 ---------- */
function wtDict(){ const m = new Map(); for (const l of naiCharsDict()){ const i = l.indexOf(':'); if (i > 0) m.set(l.slice(0, i).trim(), l.slice(i + 1).trim()); } return m; }
function wtPanelPrompt(panel){
  const rating = wtRating(), dict = wtDict();
  const names = String(panel.chars || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  const found = names.filter(n => dict.has(n)), n = found.length;
  const count = n === 0 ? 'no humans' : n === 1 ? (/1girl/.test(dict.get(found[0])) ? '1girl' : '1boy') : `${n}boys`;
  const tags = (panel.tags || '').trim() || 'upper body, looking at viewer';
  const base = wtStyleBase({count: names.length ? (n ? count : '') : 'no humans', tags, pose: (panel.pose || '').trim(), fx: !!panel.fx, nsfw: rating === 'nsfw'});
  let neg = [$('#naiNeg').value.trim(), 'speech bubble, text, english text, korean text, subtitle, panel border'].filter(Boolean).join(', ');
  neg = wtStyleNeg(neg);
  if (rating === 'nsfw') neg = neg.split(',').map(s => s.trim()).filter(s => s && s !== 'nsfw').join(', '); else if (!/\bnsfw\b/.test(neg)) neg = 'nsfw, ' + neg;
  const cols = n === 1 ? [2] : n === 2 ? [1, 3] : n === 3 ? [0, 2, 4] : [0, 1, 3, 4, 2, 2];
  const chars = found.slice(0, 6).map((name, i) => ({name, prompt: (rating === 'nsfw' && !/\badult\b/.test(dict.get(name)) ? 'adult, ' : '') + dict.get(name), negative: '', position: `${cols[i]},2`}));
  return {base, neg, chars, size: '', notes: '', rating};
}
function wtSizeKey(pg, panel){ const bb = polyBox(polyPx(pg, panel)), r = (bb[2] - bb[0]) / (bb[3] - bb[1]); return r > 1.3 ? 'landscape' : r < 0.78 ? 'portrait' : 'square'; }
const wtMinorBlock = p => wtRating() === 'nsfw' && MINOR_RE.test([p.base, ...p.chars.map(c => c.prompt)].join(' '));
async function wtGenPanel(pg, panel){
  const p = wtPanelPrompt(panel);
  if (wtMinorBlock(p)) throw new Error('미성년을 떠올리게 하는 태그가 있어서 건너뛰었어요');
  const blob = await naiGenBlob(p, wtSizeKey(pg, panel));
  const id = await wtPutImage(blob); panel.img = id; panel.view = {ox: 0, oy: 0, s: 1}; return id;
}

/* ---------- 대본 → 쪽 ---------- */
function wtPlace(pg, panel, spec){
  const bb = polyBox(polyPx(pg, panel)), bw = bb[2] - bb[0], bh = bb[3] - bb[1], sc = Math.max(0.55, Math.min(1.15, bw / 1100));
  const items = []; const mk = o => { o.id = uid(); items.push(o); return o; };
  const left = bb[0] + bw * 0.28, right = bb[0] + bw * 0.72;
  if (spec.stickers?.includes('speed')) mk({k: 'stk', kind: 'speed', x: bb[0] + bw * 0.5, y: bb[1] + bh * 0.5, size: Math.min(bw, bh) * 0.5, rot: 0});
  let bi = 0;
  for (const b of (spec.bubbles || []).slice(0, 3)){
    const text = String(b.text || '').trim(); if (!text) continue;
    const y = bb[1] + bh * (0.15 + 0.2 * bi), x = bi % 2 === 0 ? right : left;
    if (b.type === 'narr'){ mk({k: 'bubble', shape: 'box', x: bb[0] + bw * 0.3, y: bb[1] + bh * 0.1 + bi * 90, size: Math.round(38 * sc), w: Math.round(480 * sc), text, line: 'thin', dash: true, tail: null}); }
    else if (b.type === 'text'){ mk({k: 'text', x: bb[0] + bw * 0.5, y: bb[1] + bh * 0.86 - bi * 70, size: Math.round(52 * sc), w: Math.round(bw * 0.7), text, color: '#ffffff', rot: 0}); }
    else {
      const shape = ['speech', 'round', 'thought', 'shout', 'whisper'].includes(b.type) ? b.type : 'speech';
      mk({k: 'bubble', shape, x, y, size: Math.round(38 * sc), w: Math.round(310 * sc), line: 'thin', text, tail: shape === 'shout' ? null : {x: x + (bi % 2 ? 30 : -30), y: y + bh * 0.2}}); bi++;
    }
  }
  (spec.sfx || []).slice(0, 2).forEach((s, i) => { const t = String(s.text || '').trim(); if (t) mk({k: 'sfx', x: bb[0] + bw * (i ? 0.2 : 0.8), y: bb[1] + bh * (i ? 0.78 : 0.62), size: Math.round(Math.min(bw, bh) * 0.2), text: t, grad: (hash(t) % 4), rot: i ? 10 : -12, vert: !!s.vert, font: 'Black Han Sans'}); });
  const stk = (spec.stickers || []).filter(k => k !== 'speed'); stk.forEach((k, i) => mk({k: 'stk', kind: k, x: bb[0] + bw * (0.86 - i * 0.12), y: bb[1] + bh * (k === 'heart' ? 0.5 : 0.1 + i * 0.1), size: Math.round(Math.min(bw, bh) * 0.15), rot: i * 8 - 4}));
  return items;
}
function wtBuildFromScript(sc){
  const pages = [];
  for (const sp of sc.pages || []){
    const specs = (sp.panels || []).slice(0, 4); if (!specs.length) continue;
    const want = {1: '1', 2: '2a', 3: '3a', 4: '4a'}[specs.length];
    const key = WT_LAYOUTS[sp.layout] && WT_LAYOUTS[sp.layout].polys.length === specs.length ? sp.layout : want;
    const pg = wtNewPage(key, 2000); const real = pg.panels;
    specs.forEach((spec, i) => { const pn = real[i]; pn.scene = spec.scene || ''; pn.tags = spec.tags || ''; pn.pose = spec.pose || ''; pn.fx = !!spec.fx; pn.chars = (spec.chars || []).join(', '); });
    const order = ['speed', 'stk', 'sfx', 'text', 'bubble'];   // 아래에 깔릴 것부터
    const items = []; specs.forEach((spec, i) => items.push(...wtPlace(pg, real[i], spec)));
    items.sort((a, b) => order.indexOf(a.k === 'stk' && a.kind === 'speed' ? 'speed' : a.k) - order.indexOf(b.k === 'stk' && b.kind === 'speed' ? 'speed' : b.k));
    pg.items = items; pages.push(pg);
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
  const sel = $('#wtAI').value; const c = await client(sel === 'default' ? '' : '#wtAI'); if (!c) return;
  const n = Math.max(1, Math.min(12, +$('#wtPagesN').value || 4)), tone = $('#wtTone').selectedOptions[0].text;
  wtAbort = new AbortController(); $('#wtAutoGo').disabled = true; $('#wtAutoStop').hidden = false; wtAutoStat('대본 쓰는 중…');
  const cast = $('#wtCast').value.split(/[,，、]/).map(x => x.trim()).filter(Boolean);
  const known = new Set(dict.map(l => l.split(':')[0].trim()));
  const content = [{type: 'text', text: `쪽 수: ${n}쪽 (±1쪽 괜찮음)\n컷 느낌: ${tone}\n등급: ${rating === 'nsfw' ? `성인(19금). ${wtHeat()}` : '일반(safe). 노출·성적 요소 없이.'}\n나오는 인물: ${cast.length ? cast.join(', ') : '(줄거리에서 알아서 정한다)'}\n그중 사전에 없어 외형을 지어야 하는 이름: ${cast.filter(x => !known.has(x)).join(', ') || '(없음)'}\n인물 사전(이름: 외형 — chars에는 이름만 쓴다):\n${dict.length ? dict.map(l => l.split(':')[0].trim() + ' — ' + l.slice(l.indexOf(':') + 1).trim().slice(0, 60)).join('\n') : '(없음)'}\n\n말투(이 말투대로 대사를 쓴다):\n${wtVoiceDict().length ? wtVoiceDict().join('\n') : '(없음 — cast 에 말투를 지어 넣는다)'}\n\n줄거리:\n${story}`}];
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
};

/* ---------- 컷 그림 일괄 생성(컴퓨터 프로그램) ---------- */
function wtTodo(){ const out = []; for (const pg of WT.proj?.pages || []) for (const pn of pg.panels) if (!pn.img && !pn.inset) out.push([pg, pn]); return out; }
function wtGenSync(){ const n = wtTodo().length; const b = $('#wtGenAll'); if (b){ b.disabled = !DESKTOP || !n; b.textContent = n ? `그림 없는 컷 ${n}개 모두 만들기 (노벨AI)` : '모든 컷에 그림이 있어요'; } }
let wtGenAbort = false;
$('#wtGenStop').onclick = () => { wtGenAbort = true; wtAutoStat('멈추는 중… (그리던 한 컷은 끝나요)'); };
$('#wtGenAll').onclick = async () => {
  if (!DESKTOP) return toast('윈도우 프로그램에서만 돼요');
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
  if (!DESKTOP) return toast('윈도우 프로그램에서만 돼요');
  if (!naiToken()){ $('#wtClose').click(); openTool('nai'); return toast('노벨AI 탭에서 토큰을 먼저 넣어 주세요'); }
  const s = WT.sel, pg = wtPage(); if (s?.t !== 'panel') return toast('컷을 먼저 눌러 골라 주세요');
  const b = $('#wtImgGen'); b.disabled = true; const t0 = b.textContent; b.textContent = '만드는 중…';
  try{ await wtGenPanel(pg, pg.panels[s.i]); wtCommit(); wtRender(); wtBuildPages(); }catch(e){ toast(e.message); }
  b.disabled = false; b.textContent = t0;
};

/* ---------- 그림체·인물 사전 칸 ---------- */
function wtStyleSync(){ const k = $('#wtStyle').value; $('#wtStyleIn').hidden = k !== 'custom'; $('#wtMonoRow').hidden = k !== 'dark'; $('#wtFrameRow').hidden = k !== 'dark'; store.set('set.wtStyle', k); }
$('#wtStyle').value = store.get('set.wtStyle', 'neon'); $('#wtMono').value = store.get('set.wtMono', 'cold blue'); $('#wtStyleIn').value = store.get('set.wtStyleIn', ''); wtStyleSync();
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
- 밝고 가벼운 분위기로 흐르지 않게 한다. 빛과 그림자, 침묵과 거리로 감정을 만든다.
{ADULT}
출력은 JSON 하나만.`;
const SYSTEM_SYN = () => SYSTEM_SYN_BASE.replace('{ADULT}', wtAdultRules());
function wtSynText(sc){
  const parts = [];
  if (sc.logline) parts.push(String(sc.logline).trim());
  if (sc.synopsis) parts.push(String(sc.synopsis).trim());
  for (const b of sc.beats || []) if (b?.c) parts.push(`[${String(b.t || '').trim()}] ${String(b.c).trim()}`);
  return parts.filter(Boolean).join('\n\n');
}
function wtSynStat(){ const v = $('#wtSyn').value.trim(); $('#wtSynLenOut').textContent = v ? `${v.replace(/\s/g, '').length}자` : ''; }
let wtSynAbort = null;
function wtSynBusy(on){ $('#wtSynGo').disabled = on; $('#wtSynMore').disabled = on; $('#wtAutoGo').disabled = on; $('#wtSynStop').hidden = !on; }
async function wtSynRun(more){
  const seed = (more ? $('#wtSyn').value : ($('#wtSyn').value.trim() || $('#wtStory').value)).trim();
  if (!seed) return toast('줄거리를 한 줄이라도 적어 주세요');
  if (wtSynAbort) return;
  const rating = wtRating(), dict = naiCharsDict();
  if (rating === 'nsfw' && !adultGuard(seed + '\n' + dict.join('\n'), 'adult')) return;
  const sel = $('#wtAI').value; const c = await client(sel === 'default' ? '' : '#wtAI'); if (!c) return;
  const L = WT_SYN_LEN[$('#wtSynLen').value] || WT_SYN_LEN.mid;
  const cast = $('#wtCast').value.split(/[,，、]/).map(x => x.trim()).filter(Boolean);
  wtSynAbort = new AbortController(); wtSynBusy(true); wtAutoStat(more ? '줄거리를 이어서 쓰는 중…' : '줄거리를 늘리는 중…');
  const text = `분량: ${L.n} — ${L.say}
장면(또는 화) 차례 개수: ${L.beats || '없이'}
등급: ${rating === 'nsfw' ? `성인(19금). ${wtHeat()}` : '일반(safe).'}
나오는 인물: ${cast.length ? cast.join(', ') : '(알아서 정한다)'}
인물 사전: ${dict.length ? dict.map(l => l.split(':')[0].trim()).join(', ') : '(없음)'}
말투: ${wtVoiceDict().join(' / ') || '(없음)'}

${more ? '아래 줄거리를 그대로 두고 그 뒤를 이어서 더 쓴다. 이미 쓴 부분은 다시 쓰지 않는다.' : '아래를 바탕으로 늘려 쓴다.'}

${seed}`;
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
$('#wtSynStop').onclick = () => wtSynAbort?.abort();
$('#wtSyn').addEventListener('input', wtSynStat);
$('#wtSynLen').value = store.get('set.wtSynLen', 'mid');
$('#wtSynLen').onchange = () => store.set('set.wtSynLen', $('#wtSynLen').value);

/* ---------- 등급·수위 칸 (노벨AI 탭과 같은 값을 쓴다) ---------- */
function wtRatingSync(){
  const on = $('#wtRating').value === 'nsfw'; $('#wtHeat').disabled = !on; $('#wtActRow').hidden = !on;
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
window.naiStyleFor = nsfw => { const P = wtStyleParts(nsfw); return {head: P.head || $('#naiStyle').value.trim().replace(/,\s*$/, ''), tail: P.tail, neg: n => wtStyleNeg(n, nsfw)}; };
function naiStyleLabel(){
  const k = wtStyleKey(); const el = $('#naiStyleNow'); if (!el) return;
  el.textContent = k === 'custom' ? '지금 그림체: 아래 하우스 스타일 칸을 그대로 써요' : `지금 그림체: ${WT_STYLE[k].name}` + (k === 'dark' ? ` · ${wtMono()}` : '');
}
$('#naiStyleSel').value = store.get('set.wtStyle', 'neon');
$('#naiStyleSel').onchange = () => { $('#wtStyle').value = $('#naiStyleSel').value; store.set('set.wtStyle', $('#naiStyleSel').value); wtStyleSync(); naiStyleLabel(); };
$('#wtStyle').addEventListener('change', () => { $('#naiStyleSel').value = $('#wtStyle').value; naiStyleLabel(); });
$('#wtMono').addEventListener('change', naiStyleLabel);
naiStyleLabel();
