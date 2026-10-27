/* ================= 웹툰 자동 만들기: 줄거리 → 대본 → 쪽·컷·말풍선 → (컴퓨터) 컷 그림 ================= */
const WT_LAYOUT_KEYS = Object.keys(WT_LAYOUTS);
const WT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'pages'],
  properties: {
    title: {type: 'string'},
    pages: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['layout', 'panels'],
      properties: {
        layout: {type: 'string', description: '틀 키: ' + WT_LAYOUT_KEYS.join(', ')},
        panels: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['scene', 'tags', 'chars', 'bubbles', 'sfx', 'stickers'],
          properties: {
            scene: {type: 'string', description: '이 컷에서 일어나는 일(한국어 한 줄)'},
            tags: {type: 'string', description: '그림용 영어 태그: 구도·카메라·표정·배경·조명·소품. 인물 외형은 쓰지 않는다'},
            chars: {type: 'array', items: {type: 'string'}, description: '인물 사전에 있는 이름만'},
            bubbles: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['type', 'text'],
              properties: {type: {type: 'string', enum: ['speech', 'thought', 'shout', 'whisper', 'narr', 'text']}, text: {type: 'string'}, who: {type: 'string'}}}},
            sfx: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['text', 'vert'], properties: {text: {type: 'string'}, vert: {type: 'boolean'}}}},
            stickers: {type: 'array', items: {type: 'string', enum: ['sweat', 'burst', 'heart', 'speed']}},
          }}},
      }}},
  }
};
const SYSTEM_WT = `너는 한국 웹툰 콘티 작가다. 줄거리를 쪽·컷 대본으로 바꾼다. 모든 글은 한국어, 그림 태그(tags)만 영어.
틀(layout) 키: 1=한 컷, 2a=위아래 반반, 2b=위 작은 컷+아래 큰 컷, 2c=위 큰 컷+아래 작은 컷, 2d=사선 가로 둘, 2e=사선 세로 둘, 3a=세 칸, 3b=위 큰 컷+아래 둘, 3c=왼쪽 길게+오른쪽 둘, 3d=사선 세 칸, 4a=네 칸.
- 한 쪽은 1~4컷. 컷 수는 틀과 맞춘다(1→1컷, 2*→2컷, 3*→3컷, 4a→4컷). 장면 전환·감정 고조에는 큰 컷, 반응에는 작은 컷을 쓴다.
- 첫 쪽은 상황을 한 번에 보여 주는 큰 컷으로 시작하고, 마지막 쪽은 다음이 궁금해지는 여운으로 끝낸다.
- 컷마다 scene(무슨 일), tags(구도·표정·배경·조명 영어 태그, 예: "upper body, from side, looking down, snow, castle gate, night, soft rim light"), chars(인물 사전의 이름만), bubbles, sfx, stickers.
- bubbles: type은 speech(보통 대사), thought(속마음 구름), shout(외침), whisper(속삭임), narr(설명 상자: 시간·장소 전환에만), text(그림 위 외곽선 독백). 한 말풍선은 22자 안쪽, 한 컷에 말풍선 최대 3개. 대사는 말하듯 짧게, 설명하지 않는다. 감정은 이름 붙이지 않고 행동과 사물로 보여 준다.
- sfx: 효과음 2~4글자(예: 두근, 쿵, 스윽, 쮸웁). 꼭 필요한 컷에만. 긴 소리는 vert=true.
- stickers: sweat(당황), burst(충격), heart(설렘), speed(집중선)를 감정이 튀는 컷에만 쓴다.
- 인물 사전에 없는 인물은 만들지 않는다(없으면 chars를 비우고 대사로만 다룬다). 모든 인물은 성인이다.
출력은 JSON 하나만.`;

/* ---------- 컷 → 노벨AI 프롬프트 ---------- */
function wtDict(){ const m = new Map(); for (const l of naiCharsDict()){ const i = l.indexOf(':'); if (i > 0) m.set(l.slice(0, i).trim(), l.slice(i + 1).trim()); } return m; }
function wtPanelPrompt(panel){
  const rating = $('#naiRating').value, dict = wtDict();
  const names = String(panel.chars || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
  const style = $('#naiStyle').value.trim().replace(/,\s*$/, '');
  const found = names.filter(n => dict.has(n)), n = found.length;
  const count = n === 0 ? 'no humans' : n === 1 ? (/1girl/.test(dict.get(found[0])) ? '1girl' : '1boy') : `${n}boys`;
  const tags = (panel.tags || '').trim() || 'upper body, looking at viewer';
  const base = [style, rating === 'nsfw' ? 'nsfw' : '', names.length ? (n ? count : '') : 'no humans', tags, 'no text'].filter(Boolean).join(', ');
  let neg = [$('#naiNeg').value.trim(), 'speech bubble, text, english text, korean text, subtitle, panel border'].filter(Boolean).join(', ');
  if (rating === 'nsfw') neg = neg.split(',').map(s => s.trim()).filter(s => s && s !== 'nsfw').join(', '); else if (!/\bnsfw\b/.test(neg)) neg = 'nsfw, ' + neg;
  const cols = n === 1 ? [2] : n === 2 ? [1, 3] : n === 3 ? [0, 2, 4] : [0, 1, 3, 4, 2, 2];
  const chars = found.slice(0, 6).map((name, i) => ({name, prompt: (rating === 'nsfw' && !/\badult\b/.test(dict.get(name)) ? 'adult, ' : '') + dict.get(name), negative: '', position: `${cols[i]},2`}));
  return {base, neg, chars, size: '', notes: '', rating};
}
function wtSizeKey(pg, panel){ const bb = polyBox(polyPx(pg, panel)), r = (bb[2] - bb[0]) / (bb[3] - bb[1]); return r > 1.3 ? 'landscape' : r < 0.78 ? 'portrait' : 'square'; }
const wtMinorBlock = p => $('#naiRating').value === 'nsfw' && MINOR_RE.test([p.base, ...p.chars.map(c => c.prompt)].join(' '));
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
    if (b.type === 'narr'){ mk({k: 'bubble', shape: 'box', x: bb[0] + bw * 0.3, y: bb[1] + bh * 0.1 + bi * 90, size: Math.round(40 * sc), w: Math.round(520 * sc), text, tail: null}); }
    else if (b.type === 'text'){ mk({k: 'text', x: bb[0] + bw * 0.5, y: bb[1] + bh * 0.86 - bi * 70, size: Math.round(52 * sc), w: Math.round(bw * 0.7), text, color: '#ffffff', rot: 0}); }
    else {
      const shape = ['speech', 'thought', 'shout', 'whisper'].includes(b.type) ? b.type : 'speech';
      mk({k: 'bubble', shape, x, y, size: Math.round(42 * sc), w: Math.round(340 * sc), text, tail: shape === 'shout' ? null : {x: x + (bi % 2 ? 30 : -30), y: y + bh * 0.2}}); bi++;
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
    specs.forEach((spec, i) => { const pn = real[i]; pn.scene = spec.scene || ''; pn.tags = spec.tags || ''; pn.chars = (spec.chars || []).join(', '); });
    const order = ['speed', 'stk', 'sfx', 'text', 'bubble'];   // 아래에 깔릴 것부터
    const items = []; specs.forEach((spec, i) => items.push(...wtPlace(pg, real[i], spec)));
    items.sort((a, b) => order.indexOf(a.k === 'stk' && a.kind === 'speed' ? 'speed' : a.k) - order.indexOf(b.k === 'stk' && b.kind === 'speed' ? 'speed' : b.k));
    pg.items = items; pages.push(pg);
  }
  return pages;
}
const wtAutoStat = t => { $('#wtAutoStat').textContent = t; };
const wtBlank = () => WT.proj.pages.length === 1 && !WT.proj.pages[0].items.length && !WT.proj.pages[0].panels.some(p => p.img);
let wtAbort = null;
$('#wtAuto').onclick = () => { if (!WT.proj) return; $('#wtAutoBox').hidden = false; wtAutoStat(''); wtGenSync(); };
$('#wtAutoX').onclick = () => { $('#wtAutoBox').hidden = true; };
$('#wtAutoStop').onclick = () => wtAbort?.abort();
$('#wtAutoGo').onclick = async () => {
  const story = $('#wtStory').value.trim(); if (!story) return toast('줄거리를 적어 주세요');
  if (wtAbort) return;
  const rating = $('#naiRating').value, dict = naiCharsDict();
  if (rating === 'nsfw' && !adultGuard(story + '\n' + dict.join('\n'), 'adult')) return;
  const sel = $('#wtAI').value; const c = await client(sel === 'default' ? '' : '#wtAI'); if (!c) return;
  const n = Math.max(1, Math.min(12, +$('#wtPagesN').value || 4)), tone = $('#wtTone').selectedOptions[0].text;
  wtAbort = new AbortController(); $('#wtAutoGo').disabled = true; $('#wtAutoStop').hidden = false; wtAutoStat('대본 쓰는 중…');
  const content = [{type: 'text', text: `쪽 수: ${n}쪽 (±1쪽 괜찮음)\n컷 느낌: ${tone}\n등급: ${rating === 'nsfw' ? '성인(nsfw). 성인 플랫폼용이고 모든 인물은 성인이다. 장면에 필요하면 노출·성적 요소도 태그로 쓴다.' : '일반(safe). 노출·성적 요소 없이.'}\n인물 사전(이름: 외형 — chars에는 이름만 쓴다):\n${dict.length ? dict.map(l => l.split(':')[0].trim() + ' — ' + l.slice(l.indexOf(':') + 1).trim().slice(0, 60)).join('\n') : '(없음)'}\n\n줄거리:\n${story}`}];
  let res; try{ res = await stream(c, {messages: [{role: 'user', content}], system: SYSTEM_WT, signal: wtAbort.signal, format: {type: 'json_schema', schema: WT_SCHEMA}}); }
  finally { wtAbort = null; $('#wtAutoGo').disabled = false; $('#wtAutoStop').hidden = true; }
  if (!res.ok){ return wtAutoStat((res.note || '대본을 못 만들었어요').trim()); }
  let sc; try{ sc = parseJSON(res.text); }catch{ return wtAutoStat('대본을 읽지 못했어요. 다시 눌러 주세요.'); }
  const added = wtBuildFromScript(sc); if (!added.length) return wtAutoStat('쪽이 비어 있어요. 줄거리를 조금 더 구체적으로 적어 주세요.');
  if (wtBlank()){ WT.proj.pages = added; WT.pi = 0; } else { WT.proj.pages.push(...added); WT.pi = WT.proj.pages.length - added.length; }
  if (sc.title && /^새 웹툰$|^이름 없는/.test($('#wtName').value)) $('#wtName').value = String(sc.title).slice(0, 40);
  WT.sel = null; wtCommit(); wtBuildPages(); wtSideSync(); wtRender();
  const panels = added.reduce((a, p) => a + p.panels.length, 0);
  wtAutoStat(`${added.length}쪽 · ${panels}컷을 만들었어요. 말풍선 위치와 글은 눌러서 고치면 돼요.` + (DESKTOP ? ' 이어서 컷 그림을 만들 수 있어요.' : ' 컷 그림은 장면 노트에서 가져오거나 컴퓨터 프로그램에서 만들 수 있어요.'));
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
