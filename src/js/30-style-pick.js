/* ================= 보고 있는 웹툰·만화의 그림체로 노벨AI 그리기 ================= */
// 읽는 화면에 보이는 그림 한 장을 고른 AI(노벨AI 탭의 'AI')에게 보여 주고, 내용(인물·장면·옷)은 빼고 그림체만 노벨AI 태그로 받는다.
// 받은 태그는 하우스 스타일 칸에 넣고 그림체를 '직접 쓰기'로 바꾼다 → 노벨AI 탭·웹툰 만들기가 그 그림체로 그린다. 바꾸기 전 칸은 되돌릴 수 있게 남겨 둔다.
const SP_SYS = `너는 노벨AI(NAI Diffusion V4.5) 프롬프트 전문가다. 그림을 보고 "그림체"만 영어 Danbooru 태그로 적는다.
- 넣는 것: 화풍(korean webtoon style, manga style, anime coloring, semi realistic 등), 선(thick lineart, thin lineart, no lineart), 채색(cel shading, flat color, soft shading, painterly), 명암·빛(rim light, dramatic lighting, soft lighting), 색감(muted colors, pastel colors, high contrast, monochrome, screentone), 질감·매체(film grain, watercolor, digital painting), 눈·얼굴 그리는 법(sharp eyes, detailed eyes) 같은 그림체 태그.
- 넣지 않는 것: 인물 수·성별·머리색·옷·자세·배경·장면·사물·말풍선·글자 등 그림의 내용. 작가 이름도 넣지 않는다.
- 그림을 여러 장 받으면 같은 작품의 여러 쪽이다. 한 장에만 있는 빛·색(밤 장면, 회상 흑백 등)은 빼고, 모든 장에 공통된 그림체만 적는다.
- 12~24개를 쉼표로 이어 한 줄로만 출력한다. 다른 말은 하지 않는다.`;
function spVisibleImg(){
  const imgs = [...document.querySelectorAll('#reader img')].filter(i => i.complete && i.naturalWidth > 80);
  if (!imgs.length) return null;
  const mid = innerHeight / 2, d = i => { const r = i.getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight ? 1e9 : Math.abs((r.top + r.bottom) / 2 - mid); };
  return imgs.sort((a, b) => d(a) - d(b))[0];
}
async function spJpeg(im, max = 1024){
  const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
  try{ c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85).split(',')[1]; }
  catch{   // 다른 주소의 그림이라 캔버스가 막히면 받아서 다시 그린다
    const bm = await createImageBitmap(await (await fetch(im.src)).blob());
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); bm.close?.(); return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
}
// AI 가 내용 태그(인물 수·머리·옷·자세·배경 등)를 섞어 내도 그림체 태그만 남긴다
const SP_CONTENT = /^(\d+\+?\s*)?(boys?|girls?|others?)$|^(solo|duo|couple|multiple \w+)$|\b(hair|hairstyle|ponytail|bangs|shirt|dress|uniform|skirt|pants|jacket|coat|suit|hat|glasses|background|holding|standing|sitting|looking|smile|smiling|blush|crying|nude|naked|breasts?|penis|pussy|sex|kiss|bed|room|street|sky|tree|window|sword|weapon|speech bubble|text|logo|signature)\b|^(red|blue|green|yellow|purple|pink|black|white|brown|grey|gray|golden|silver|orange|aqua) (eyes|skin)$/;
const spClean = t => [...new Set(String(t).split('\n').find(l => l.includes(','))?.split(',').map(x => x.trim().replace(/^["'`]+|["'`.]+$/g, '').toLowerCase()).filter(x => x && x.length < 40 && /^[a-z0-9 ()_:.'-]+$/.test(x) && !SP_CONTENT.test(x)) || [])].slice(0, 26).join(', ');
// 작품 전체에서 고르게: 앞·가운데·뒤 회차에 걸쳐 n장. 회차 첫 장(표지·제목 쪽)은 피하고 가운데 쪽을 쓴다
function spWorkFiles(w, n = 6){
  const eps = (w?.eps || []).filter(e => e.type === 'imgs' && e.files?.length);
  if (!eps.length) return [];
  const out = [], per = Math.max(1, Math.ceil(n / eps.length)), k = Math.min(n, eps.length * per);
  const epIdx = Array.from({length: Math.min(eps.length, k)}, (_, i) => Math.round(i * (eps.length - 1) / Math.max(1, Math.min(eps.length, k) - 1)));
  for (const ei of [...new Set(epIdx)]){
    const fs = eps[ei].files; const usable = fs.length > 2 ? fs.slice(1) : fs;
    for (let j = 0; j < per && out.length < n; j++) out.push(usable[Math.min(usable.length - 1, Math.floor((j + 1) * usable.length / (per + 1)))]);
  }
  return [...new Set(out)].slice(0, n);
}
async function spFileJpeg(f, max = 768){
  const b = f.thumbUrl ? await (await fetch(f.thumbUrl)).blob() : f.isLazy ? await f.blob() : f;
  const bm = await createImageBitmap(b); const s = Math.min(1, max / Math.max(bm.width, bm.height));
  const c = document.createElement('canvas'); c.width = Math.round(bm.width * s); c.height = Math.round(bm.height * s);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); bm.close?.(); return c.toDataURL('image/jpeg', 0.82).split(',')[1];
}
// whole: true 면 작품 전체에서 여러 장을 골라 공통 그림체를, 아니면 지금 보이는 한 장
async function spPick(btn, whole = false){
  let datas = [];
  const st = $('#spStat');
  if (whole){
    if (!cur) return toast('그림체를 가져올 웹툰·만화를 먼저 열어 주세요');
    const fs = spWorkFiles(cur);
    if (!fs.length) return toast('이 작품에서 그림을 찾지 못했어요 (그림 폴더로 된 웹툰·만화만 돼요)');
    st.textContent = `작품 전체에서 ${fs.length}장을 고르는 중…`; btn.disabled = true;
    for (const f of fs){ try{ datas.push(await spFileJpeg(f)); }catch{} }
    btn.disabled = false;
    if (!datas.length) return void (st.textContent = '그림을 읽지 못했어요');
  } else {
    const im = spVisibleImg();
    if (!im) return toast('웹툰·만화를 열어 그림이 보이는 곳에서 눌러 주세요');
    datas = [await spJpeg(im)];
  }
  const c = await client('#naiProv'); if (!c) return;
  btn.disabled = true; st.textContent = datas.length > 1 ? `${datas.length}장을 보고 공통 그림체를 읽는 중…` : '그림체를 읽는 중…';
  try{
    const ask = datas.length > 1 ? `같은 작품의 여러 쪽 ${datas.length}장이다. 모든 장에 공통된 그림체 태그만.` : '이 그림의 그림체 태그만.';
    const r = await stream(c, {system: SP_SYS, messages: [{role: 'user', content: [...datas.map(data => ({type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data}})), {type: 'text', text: ask}]}]});
    const tags = r.ok ? spClean(r.text) : '';
    if (!tags){ st.textContent = '그림체를 읽지 못했어요' + (r.note ? ' ' + r.note.trim() : ' (그림을 볼 수 있는 AI 인지 확인해 주세요 — Claude·Gemini, 또는 Ollama 는 qwen2.5vl 같은 그림 모델)'); return; }
    if (!confirm(`'${cur?.name || '이 작품'}' 그림체로 노벨AI 하우스 스타일을 바꿀까요?\n\n${tags}`)){ st.textContent = '바꾸지 않았어요: ' + tags; return; }
    store.set('set.naiStyle.prev', $('#naiStyle').value);
    $('#naiStyle').value = 'masterpiece, best quality, very aesthetic, ' + tags; store.set('set.naiStyle', $('#naiStyle').value);
    $('#naiStyleSel').value = 'custom'; $('#naiStyleSel').dispatchEvent(new Event('change'));
    const picks = store.get('naiStylePicks', []).filter(p => p.tags !== tags); picks.unshift({name: cur?.name || '', tags, t: Date.now()}); store.set('naiStylePicks', picks.slice(0, 10));
    st.textContent = `'${cur?.name || ''}' 그림체로 바꿨어요. 노벨AI 탭·웹툰 만들기가 이 그림체로 그려요.`; $('#spUndo').hidden = false;
    toast('그림체를 가져왔어요');
  }catch(e){ st.textContent = '그림체를 읽지 못했어요: ' + e.message; }
  finally{ btn.disabled = false; }
}
if ($('#naiStyleNow') && !$('#spPick')){
  const box = document.createElement('div'); box.className = 'row tight';
  box.innerHTML = '<button id="spWhole" title="지금 연 작품의 앞·가운데·뒤 회차에서 그림을 골라, 모든 장에 공통된 그림체를 노벨AI 태그로 가져와요">작품 전체에서 그림체 가져오기</button><button id="spPick" title="읽는 화면에 보이는 그림의 그림체(내용 말고)를 AI 가 노벨AI 태그로 옮겨 하우스 스타일에 넣어요">지금 보는 그림만</button><button id="spUndo" hidden>되돌리기</button><span class="hint" id="spStat"></span>';
  $('#naiStyleNow').after(box);
  $('#spPick').onclick = e => spPick(e.currentTarget);
  $('#spWhole').onclick = e => spPick(e.currentTarget, true);
  $('#spUndo').onclick = () => { const p = store.get('set.naiStyle.prev', null); if (p === null) return; $('#naiStyle').value = p; store.set('set.naiStyle', p); $('#spUndo').hidden = true; $('#spStat').textContent = '하우스 스타일을 되돌렸어요'; };
}
window.nvStylePick = {clean: spClean, files: w => spWorkFiles(w)};   // 시험용
