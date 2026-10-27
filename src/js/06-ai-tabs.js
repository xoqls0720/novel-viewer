/* ================= Claude 분석 탭 ================= */
const SYSTEM_ANALYST = `너는 상업 웹소설·웹툰·만화·캐릭터톡 작가를 돕는 편집자다. 사용자는 돈을 버는 작가가 되려는 대학생이고, 캐릭터톡을 만들어 운영하고 있어 대사와 캐릭터의 목소리가 강점이다.
분석은 감상이 아니라 "독자가 다음 화 결제를 누르는 이유"를 역설계하는 관점으로 한다.
답은 한국어로, 짧은 소제목과 목록으로 정리하고, 본문을 인용할 때는 원문 그대로 짧게 인용한다. 냉정하고 정확하게 쓰되, 근거가 없는 추측은 추측이라고 밝힌다.`;
const PROMPTS = {
  cut: '이 회차의 (1) 첫 세 문단이 독자를 붙잡는 방식 (2) 마지막 장면의 절단 유형(새 인물·소리의 등장 / 위기 직전 / 주인공 선언 / 사건 예고 / 주변인 반응 / 기타)과 효과 (3) 이 화 안의 사이다 또는 보상 지점 (4) 이 화를 따라 쓸 때 가져갈 기술 2개를 분석해 줘.',
  beats: '이 회차를 장면(비트) 단위로 쪼개 줘. 각 장면마다: 장소/등장인물/목적/갈등/전환점/대략의 분량 비율. 마지막에 이 화의 긴장 곡선을 한 줄로 요약해 줘.',
  cast: '이 회차에 나오는 인물마다: 이름, 역할(주인공/반응 담당/라이벌/조력자 등), 말투의 특징과 대표 대사 1개, 주인공과의 관계를 표로 정리해 줘.',
  voice: '이 회차의 주요 인물별 말투를 분석해 줘: 어미, 자주 쓰는 단어, 문장 길이, 존댓말/반말, 감정이 올라갈 때의 변화. 마지막에 각 인물의 말투를 흉내 낸 새 대사 예시를 2개씩 써 줘(캐릭터톡 설정에 바로 쓸 수 있게).',
  adapt: '이 회차를 세로 스크롤 웹툰 콘티로 바꿔 줘. 컷 번호마다 [컷 크기: 대/중/소/여백] 화면 묘사 / 대사·내레이션 / 효과음 을 적고, 원문에서 잘라낸 부분과 그 이유를 마지막에 정리해 줘. 한 화는 휴대폰 화면 50~60장 분량을 기준으로 해.',
  structure: '위 작품의 앞부분 여러 화를 보고, 회차마다 한 줄 요약, 그 화의 보상(사이다)과 절단 방식을 표로 정리하고, 새 인물·세력이 들어오는 시점, 무료분(대개 1~25화) 안에서 독자를 붙잡는 큰 흐름을 설계도처럼 정리해 줘.',
  formula: '위 작품의 앞부분 여러 화를 보고, 이 작품을 처음 쓰는 작가가 그대로 따라 쓸 수 있는 "공식"을 뽑아 줘: 1화 공식, 회차 분량과 호흡, 대사 비율과 말투 설계, 절단 패턴, 인물 투입 간격, 피해야 할 점. 각 항목마다 원문 근거를 짧게 인용해 줘.',
  pages: '이 만화/웹툰 페이지들의 연출을 분석해 줘: 칸(컷) 크기와 배치, 시선 흐름, 여백, 의성어, 대사 밀도, 이 장면이 독자에게 주는 감정, 웹툰(세로 스크롤)이나 웹소설 문장으로 옮길 때의 방법.',
};
const LABEL = {cut:'절단·훅 분석', beats:'장면 쪼개기', cast:'인물 노트', voice:'말투 분석', adapt:'웹툰 콘티로', structure:'구조 설계도', formula:'따라 쓸 공식', pages:'이 쪽 연출 분석'};
async function contextBlocks(kind){
  if (!cur) return null;
  if (kind === 'pages' || (kind === 'free' && !curText && curImgs.length)){
    const imgs = await pageImagesContent();
    return imgs?.length ? {key: 'img:'+cur.key+':'+curEp, blocks: imgs, fresh: kind === 'pages'} : null;
  }
  if (kind === 'structure' || kind === 'formula'){
    const n = +$('#aiN').value; let body = ''; let k = 0;
    for (const e of cur.eps){
      if (k >= n) break; if (!isText(e)) continue;
      const t = await epText(e); if (t.replace(/\s/g,'').length < 200) continue;
      body += `<episode name="${esc(e.name)}">\n${t}\n</episode>\n\n`; k++;
    }
    if (!k) return null;
    return {key:'multi:'+cur.key+':'+n, fresh:true, blocks:[{type:'text', text:`작품: ${cur.name} (앞에서부터 ${k}화)\n\n${body}`, cache_control:{type:'ephemeral'}}]};
  }
  if (!curText) return null;
  return {key:'ep:'+cur.key+':'+curEp, blocks:[{type:'text', text:`작품: ${cur.name}\n회차: ${cur.eps[curEp].name}\n\n<episode>\n${curText}\n</episode>`, cache_control:{type:'ephemeral'}}]};
}
async function pageImagesContent(){
  if (!curImgs.length) return null;
  let picks = [];
  if ($('#reader .manga')) picks = Array.from({length: mangaShown}, (_,k)=>mangaPos+k).filter(i=>i<curImgs.length);
  else {
    const imgs = $$('#reader .webtoon img'); const r = $('#reader').getBoundingClientRect();
    imgs.forEach((im,i)=>{ const b = im.getBoundingClientRect(); if (b.bottom > r.top - 200 && b.top < r.bottom + 200) picks.push(i); });
    picks = picks.slice(0, 6);
  }
  const blocks = [];
  for (const i of picks) blocks.push(await toImageBlock(await blobOf(curImgs[i])));
  return blocks;
}
async function toImageBlock(blob){
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width*scale); cv.height = Math.round(bmp.height*scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
  return {type:'image', source:{type:'base64', media_type:'image/jpeg', data: cv.toDataURL('image/jpeg', 0.85).split(',')[1]}};
}
const chats = {};
chats.ai = makeChat('#chat', '#aiAsk', () => SYSTEM_ANALYST, '#aiProv');
async function aiAsk(kind, question, display){
  let ctx = null;
  if (cur){ ctx = await contextBlocks(kind); if (!ctx && kind !== 'free') return toast(kind === 'pages' ? '웹툰·만화 화면에서 쓸 수 있어요' : '소설 회차에서 쓸 수 있어요'); }
  if (kind === 'free' && chats.ai.turns.some(t => t.status === 'ok')) ctx = ctx ? {...ctx, followup: true} : null;
  chats.ai.ask({question, display, ctx});
}
$$('[data-ai]').forEach(b => b.onclick = () => { if (!cur) return toast('작품을 먼저 열어 주세요'); const k = b.dataset.ai; aiAsk(k, PROMPTS[k], `[${LABEL[k]}]`); });
$('#aiAsk').onclick = () => { const q = $('#aiQ').value.trim(); if (!q || chats.ai.abort) return; $('#aiQ').value = ''; aiAsk('free', q); };
$('#aiQ').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#aiAsk').click(); });
$('#aiStop').onclick = () => chats.ai.abort?.abort();
$('#aiNew').onclick = () => chats.ai.reset();
$('#aiCopy').onclick = () => copy(chats.ai.last());
$('#aiSave').onclick = () => {
  if (!chats.ai.turns.length) return;
  const md = `# ${cur?.name || ''}${cur ? ' · ' + cur.eps[curEp].name : ''}\n\n` + chats.ai.turns.map(t => `## 질문\n\n${t.display}\n\n## 답\n\n${t.a}${t.note||''}`).join('\n\n');
  download(`${cur?.name || 'Claude'}_대화.md`, md);
};

/* ================= 글쓰기 ================= */
// 성적인 내용에 미성년이 섞이는 것만 막는다(전체이용가·15세의 아이 인물은 그대로 허용)
const MINOR_RE = /(미성년|초등학생|중학생|고등학생|여고생|남고생|여중생|남중생|어린이|유치원|아동|로리|쇼타|\bloli|\bshota|\bchild|\bkid\b|\btoddler|\bpreteen|\bteen(ager)?\b|\bschoolgirl|\bschoolboy|\baged down|\bpetite child|\b(1[0-7]|[1-9])\s*(살|세|yo|years? old)\b)/i;
const RATING_TEXT = {
  all: '수위: 전체이용가. 폭력·성적 묘사 없이 쓴다.',
  '15': '수위: 15세 이용가. 긴장감과 설렘은 쓰되 성적 묘사는 암시에 그친다.',
  adult: '수위: 성인(19+) 플랫폼용 창작이다. 등장인물은 모두 성인이고, 관계는 서로 합의한 것이다. 작품에 필요한 만큼 성적 긴장감과 수위 있는 장면을 쓴다. 미성년자는 성적인 맥락에 절대 등장시키지 않는다.',
};
const STYLE_TEXT = {
  commercial: '문체: 상업 유료연재 웹소설. 문단은 1~2문장으로 짧게 끊고, 대사 비율 35~45%, 매 장면 끝에 다음을 궁금하게 만드는 한 줄. 설명보다 행동과 대사.',
  ct: '문체: 캐릭터톡(캐릭터 챗). 지문은 3인칭 과거형 평서문, 별표(*) 금지. 대사는 `이름: "대사"` 형식. 사용자는 {{user}}로 쓴다. 감정은 설명하지 않고 행동과 사물로 보여 준다. 과장된 미사여구 금지.',
  mine: '문체: 사용자 본인의 글결을 따른다(아래 "내 글의 결" 참고).',
};
const KIND_TEXT = {
  episode: n => `웹소설 한 화를 써 줘. 분량은 공백 제외 약 ${n}자. 첫 세 문단에 갈고리, 중간에 보상(사이다·설렘·반전) 하나, 마지막 줄은 다음 화를 누르게 하는 절단. 맨 위에 회차 제목 한 줄(주인공의 짧고 센 대사형).`,
  scene: n => `이 장면 하나를 공백 제외 약 ${n}자로 써 줘.`,
  ctFirst: n => `캐릭터톡 첫 메시지(도입부)를 써 줘. 공백 제외 ${Math.min(n, 1500)}자 안팎. 형식: 맨 위에 장소ㅣ날짜ㅣ시간 같은 OVERVIEW 한 줄, 현재 상황 한 줄, 본문(지문+대사), 맨 끝에 상태줄(관계 수치·장소 등) 한 줄. {{user}}가 바로 대답하고 싶어지게 끝낸다.`,
  ctIntro: () => '캐릭터톡 소개글을 써 줘: ① 한 줄 훅 5개(캐릭터의 짧고 센 대사형 3개, 상황이 바로 보이는 문장형 2개) ② 소개글 본문(대괄호 제목 한 줄 + 대표 대사 3~4줄 + 관계·상황 설명, 1000~1300자) ③ 추천 태그 10개 ④ 표지 문구 한 줄.',
  ctSheet: () => '캐릭터 설정 시트를 만들어 줘: 이름, 나이, 외형(머리·눈·체격·옷·특징), 성격(겉/속), 말투(어미·호칭·말버릇·예시 대사 5개), {{user}}와의 관계와 단계별 변화, 숨긴 과거, 좋아하는 것/싫어하는 것, 금기(절대 하지 않는 것). 마지막에 노벨AI용 외형 태그 한 줄(영어, 콤마 구분).',
  ctPack: () => '캐릭터톡 운영 패키지를 만들어 줘: ① 키워드북 12개(키워드 3~5개 + 내용 300자 이내, 숨은 진실은 단서별로 쪼개고 드러나는 조건 명시) ② 명령어 8개(!속마음, !상태, !회상 등, 각각 설명 30자 + 출력 형식까지 구체적인 실행 내용) ③ 예시 대화 5개({{user}} 80자 이내, 캐릭터 응답 긴 것 400자·짧은 것 150자) ④ 관계 레벨 7단계(단계별로 캐릭터가 {{user}}를 대하는 방식 200자 이내) ⑤ 엔딩 3~5종 이름과 조건.',
  plot: n => `기획안과 회차 플롯을 짜 줘: 로그라인 한 줄, 주인공의 결핍·치트키·목표, 주요 인물 4~6명(역할·말투 한 줄), 1~25화 회차별 한 줄 플롯(각 화의 보상과 절단 표시), 30~50화마다 새 세력·라이벌이 들어오는 장기 구조, 제목 후보 5개.`,
  essay: n => `에세이(내 글)를 공백 제외 약 ${n}자로 써 줘. 장면이나 감정에서 시작해 생각을 전개하고, 여운으로 맺는다.`,
  rewrite: () => '아래 글을 고쳐 써 줘. 내용과 사건은 그대로 두고 문장·호흡·대사만 다듬는다. 고친 글 뒤에 무엇을 왜 바꿨는지 3~5줄로 정리.',
};
const SYSTEM_WRITER = () => `너는 사용자의 공동 작가다. 사용자는 상업 웹소설·캐릭터톡 작가다.
사용자가 대충 적은 메모를 바탕으로, 바로 올릴 수 있는 완성된 글을 쓴다. 메모에 없는 이름·설정이 필요하면 작품 분위기에 맞게 만들되, 메모에 있는 사실은 바꾸지 않는다.
결과물만 쓴다. 앞뒤 인사나 설명은 붙이지 않는다(고쳐 쓰기에서 변경 요약을 요청받은 경우는 예외).
판타지 무기는 서양식 장검·창·방패·활·단검을 쓴다.`;
chats.write = makeChat('#wChat', '#wGo, #wAsk', SYSTEM_WRITER, '#wProv');
function writerExtra(){
  const r = $('#wRating').value;
  return [RATING_TEXT[r], STYLE_TEXT[$('#wStyle').value], '사용자 문체의 결(참고): ' + $('#voice').value].join('\n');
}
async function writerCtx(){
  const blocks = []; let key = 'w';
  if ($('#wRef').checked && curText){ blocks.push({type:'text', text:`<style_reference work="${esc(cur.name)}">\n${curText.slice(0, 6000)}\n</style_reference>\n위 글은 문체(문단 길이·호흡·대사 비율) 참고용이다. 내용은 가져오지 않는다.`}); key += ':ref:'+cur.key+':'+curEp; }
  if ($('#wNotes').checked){ const md = notesMarkdown('all'); if (md.trim()) { blocks.push({type:'text', text:`<my_highlights>\n${md.slice(0, 8000)}\n</my_highlights>\n위는 내가 다른 작품에서 좋다고 표시한 문장들이다. 이런 기술을 참고해서 쓴다.`}); key += ':notes'; } }
  if (blocks.length) blocks[blocks.length-1].cache_control = {type:'ephemeral'};
  return blocks.length ? {key, blocks, fresh:true} : null;
}
function adultGuard(text, rating){
  if (rating === 'adult' && MINOR_RE.test(text)){ toast('성인 수위에서는 미성년을 떠올리게 하는 표현을 쓸 수 없어요. 인물을 성인으로 바꾸거나 수위를 낮춰 주세요.'); return false; }
  return true;
}
$('#wGo').onclick = async () => {
  const memo = $('#wIn').value.trim(); if (!memo) return toast('대충이라도 내용을 적어 주세요');
  const rating = $('#wRating').value; if (!adultGuard(memo, rating)) return;
  const kind = $('#wKind').value; const n = +$('#wLen').value || 4500;
  const label = $('#wKind').selectedOptions[0].text;
  chats.write.reset();
  chats.write.ask({question: `${KIND_TEXT[kind](n)}\n\n<memo>\n${memo}\n</memo>`, display: `[${label} · ${$('#wRating').selectedOptions[0].text}]\n${memo}`, ctx: await writerCtx(), extraSystem: writerExtra()});
};
$('#wAsk').onclick = () => {
  const q = $('#wQ').value.trim(); if (!q) return;
  if (!chats.write.turns.some(t => t.status === 'ok')) return toast('먼저 "써 줘"로 글을 만들어 주세요');
  if (!adultGuard(q, $('#wRating').value)) return;
  $('#wQ').value = ''; chats.write.ask({question: q, extraSystem: writerExtra()});
};
$('#wQ').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#wAsk').click(); });
$('#wStop').onclick = () => chats.write.abort?.abort();
$('#wNew').onclick = () => chats.write.reset();
$('#wCopy').onclick = () => copy(chats.write.last());
$('#wToStudio').onclick = async () => { const t = chats.write.last(); if (!t) return toast('먼저 글을 받아 주세요'); await stOpen(); stAddEp(); taReplace(0, 0, t); stSaveText(); stMeter(); toast('집필실 새 회차로 옮겼어요'); };
$('#wSave').onclick = () => { const t = chats.write.last(); if (t) download(`글_${new Date().toISOString().slice(0,10)}.txt`, t, 'text/plain'); };
$('#wIn').value = store.get('wIn', '');
$('#wIn').addEventListener('input', () => { clearTimeout(window._wi); window._wi = setTimeout(()=>store.set('wIn', $('#wIn').value), 500); });

/* ================= 노벨AI 그림 프롬프트 ================= */
const NAI_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['base_prompt', 'characters', 'negative', 'size', 'notes'],
  properties: {
    base_prompt: {type: 'string', description: '장면 전체 태그(인원수 태그, 구도, 배경, 조명, 분위기, 효과)'},
    characters: {type: 'array', items: {type: 'object', additionalProperties: false, required: ['name', 'prompt', 'negative', 'position'],
      properties: {name: {type:'string'}, prompt: {type:'string'}, negative: {type:'string'}, position: {type:'string', description:'A1~E5 격자 위치, 모르면 C3'}}}},
    negative: {type: 'string'},
    size: {type: 'string', description: '예: 832x1216'},
    notes: {type: 'string', description: '한국어로 짧게: 구도 의도, 바꿔 볼 만한 태그'},
  }
};
const SYSTEM_NAI = `너는 NovelAI Diffusion V4.5·V5 프롬프트 전문가다. 사용자가 한국어로 말한 장면을 NovelAI 입력으로 바꾼다.
- 태그는 영어 소문자, 콤마로 구분한 Danbooru 태그 위주로 쓴다. 필요한 곳만 짧은 영어 구절을 섞는다.
- base_prompt: 맨 앞에 인원수 태그(예: 2boys, 1girl), 그다음 구도·카메라(예: cowboy shot, from below, dutch angle), 배경·장소, 조명, 분위기, 효과 순서. 인물 외형은 넣지 않는다.
- characters: 등장인물마다 하나. prompt는 인물 사전에 있으면 그 외형 태그를 그대로 앞에 두고, 장면 속 표정·포즈·행동·옷 상태를 덧붙인다. 행동 상호작용은 source#/target#/mutual# 접두어를 쓸 수 있다. position은 화면 위치(A1~E5).
- 강조가 필요하면 1.2::tag :: 형식(V4 이상)을 아껴 쓴다.
- {{user}}처럼 얼굴을 정하지 않는 인물은 얼굴이 드러나지 않게(faceless, from behind, cropped head 등) 처리한다.
- 판타지 무기는 서양식 장검(longsword) 등을 쓰고 katana는 쓰지 않는다.
- 하우스 스타일 태그는 내가 앞에 붙이므로 화풍·화가 태그는 넣지 않는다.
- size는 용도에 맞게: 표지·상황·프로필은 832x1216, 가로 배경은 1216x832.`;
const naiState = {abort: null};
function naiCharsDict(){ return $('#naiChars').value.split('\n').map(l => l.trim()).filter(Boolean); }
function naiPack(res){
  const rating = $('#naiRating').value, nsfw = rating === 'nsfw';
  const S = window.naiStyleFor ? window.naiStyleFor(nsfw) : {head: $('#naiStyle').value.trim().replace(/,\s*$/, ''), tail: '', neg: n => n};
  const base = [S.head, nsfw && !/\bnsfw\b/.test(S.head) ? 'nsfw' : '', res.base_prompt, S.tail, 'no text'].filter(Boolean).join(', ');
  let neg = S.neg([$('#naiNeg').value.trim(), res.negative].filter(Boolean).join(', '));
  if (nsfw) neg = neg.split(',').map(s=>s.trim()).filter(s => s && s !== 'nsfw').join(', ');
  else if (!/\bnsfw\b/.test(neg)) neg = 'nsfw, ' + neg;
  const chars = res.characters.map(c => ({...c, prompt: rating === 'nsfw' && !/\badult\b/.test(c.prompt) ? 'adult, ' + c.prompt : c.prompt}));
  return {base, neg, chars, size: res.size, notes: res.notes, rating};
}
function fieldHTML(title, text){ return `<div class="field"><div class="fh"><span>${esc(title)}</span><button data-copy>복사</button></div><div class="fv">${esc(text)}</div></div>`; }
function renderNai(p, el = $('#naiOut')){
  if (el.id === 'naiOut') naiState.last = p;
  const oneLine = [p.base, ...p.chars.map(c => c.prompt)].join(' | ');
  el.innerHTML = fieldHTML('기본 프롬프트 (Base Prompt)', p.base)
    + p.chars.map((c,i) => fieldHTML(`캐릭터 ${i+1} · ${c.name} · 위치 ${c.position}`, c.prompt) + (c.negative ? fieldHTML(`캐릭터 ${i+1} 네거티브`, c.negative) : '')).join('')
    + fieldHTML('네거티브 (Undesired Content)', p.neg)
    + fieldHTML('한 줄로 (캐릭터 칸이 없는 곳용, | 로 구분)', oneLine)
    + `<div class="hint">크기 ${esc(p.size || '')} · ${p.rating === 'nsfw' ? '성인(nsfw)' : '일반'}${p.notes ? ' · ' + esc(p.notes) : ''}</div>`;
  el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.closest('.field').querySelector('.fv').textContent));
}
function renderNaiHist(){
  const list = $('#naiHist'); const h = store.get('naiHist', []); list.innerHTML = '';
  if (!h.length){ list.innerHTML = '<div class="hint" style="padding:8px">아직 없어요</div>'; return; }
  for (const it of h){
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<div class="e">${new Date(it.t).toLocaleString('ko-KR')}</div><div class="q">${esc(it.desc.slice(0, 80))}</div>`;
    d.onclick = () => { $('#naiIn').value = it.desc; renderNai(it.p); $('#pane-nai').scrollTop = 0; $('#naiOut').scrollIntoView({block:'start'}); };
    list.append(d);
  }
}
$('#naiGo').onclick = async () => {
  const desc = $('#naiIn').value.trim(); if (!desc) return toast('어떤 그림인지 적어 주세요');
  if (naiState.abort) return toast('만드는 중이에요');
  const rating = $('#naiRating').value;
  const dict = naiCharsDict();
  if (rating === 'nsfw' && !adultGuard(desc + '\n' + dict.join('\n'), 'adult')) return;
  const c = await client('#naiProv'); if (!c) return;
  const content = [];
  if ($('#naiImg').checked){ const imgs = await pageImagesContent(); if (imgs?.length) content.push(imgs[0], {type:'text', text:'위 그림은 구도·분위기 참고용이다. 그림 속 인물을 그대로 베끼지 말고 인물 사전의 외형을 따른다.'}); }
  content.push({type:'text', text:
`용도: ${$('#naiUse').selectedOptions[0].text}
등급: ${rating === 'nsfw' ? '성인(nsfw). 성인 플랫폼용이고 모든 인물은 성인이다. 노출·성적 요소가 장면에 필요하면 태그로 쓴다. 각 인물 prompt에 adult를 넣는다.' : '일반(safe). 노출·성적 요소 없이.'}
인물 사전:
${dict.length ? dict.join('\n') : '(없음 — 장면 설명에서 외형을 정해 태그로 쓴다)'}

장면:
${desc}`});
  const out = $('#naiOut'); out.innerHTML = '<div class="hint">만드는 중…</div>';
  naiState.abort = new AbortController(); $('#pane-nai').classList.add('busy');
  const res = await stream(c, {messages:[{role:'user', content}], system: SYSTEM_NAI, signal: naiState.abort.signal, format: {type:'json_schema', schema: NAI_SCHEMA}});
  naiState.abort = null; $('#pane-nai').classList.remove('busy');
  if (!res.ok){ out.innerHTML = `<div class="hint">${esc((res.note || '실패했어요').trim())}</div>`; return; }
  let data; try{ data = parseJSON(res.text); }catch{ out.innerHTML = `<div class="hint">결과를 읽지 못했어요. 다시 눌러 주세요.</div><div class="field"><div class="fv">${esc(res.text)}</div></div>`; return; }
  const p = naiPack(data);
  if (rating === 'nsfw' && MINOR_RE.test([p.base, ...p.chars.map(c=>c.prompt)].join(' '))){ out.innerHTML = '<div class="hint">결과에 미성년을 떠올리게 하는 태그가 섞여 있어서 보여 주지 않았어요. 설명을 고쳐 다시 만들어 주세요.</div>'; return; }
  renderNai(p);
  const h = store.get('naiHist', []); h.unshift({t: Date.now(), desc, p}); store.set('naiHist', h.slice(0, 30)); renderNaiHist();
};
$('#naiStop').onclick = () => naiState.abort?.abort();
for (const id of ['naiChars','naiStyle','naiNeg']){ const el = $('#'+id); const v = store.get('set.'+id, null); if (v !== null) el.value = v; el.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(() => store.set('set.'+id, el.value), 400); }); }
renderNaiHist();



// 분석 답을 집필실 설정집의 '작법' 카드로 — AI가 이 작품에서 배운 것을 내 집필에 계속 쓰게 한다
$('#aiCraft').onclick = () => {
  const t = chats.ai.last(); if (!t) return toast('저장할 답이 아직 없어요');
  const ps = store.get('st.projects', []); if (!ps.length) return toast('집필실에서 작품을 먼저 하나 만들어 주세요');
  const pid = (store.get('st.cur', null)?.pid && ps.some(p => p.id === store.get('st.cur', null).pid)) ? store.get('st.cur', null).pid : ps[0].id;
  const key = 'st.bible.' + pid; const l = store.get(key, []) || [];
  const title = (cur ? cur.name + ' · ' : '') + (chats.ai.turns.at(-1)?.display || '분석').replace(/^\[|\]$/g, '').slice(0, 30);
  l.unshift({id: uid(), kind: '작법', title, body: t.slice(0, 12000), img: '', t: Date.now()});
  store.set(key, l);
  toast(`'${ps.find(p => p.id === pid).name}' 설정집 → 작법 카드로 저장했어요. 집필실 AI가 함께 봐요`);
};
