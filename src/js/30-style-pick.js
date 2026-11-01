/* ================= 보고 있는 웹툰·만화의 그림체로 노벨AI 그리기 ================= */
// 읽는 화면에 보이는 그림 한 장을 고른 AI(노벨AI 탭의 'AI')에게 보여 주고, 내용(인물·장면·옷)은 빼고 그림체만 노벨AI 태그로 받는다.
// 받은 태그는 하우스 스타일 칸에 넣고 그림체를 '직접 쓰기'로 바꾼다 → 노벨AI 탭·웹툰 만들기가 그 그림체로 그린다. 바꾸기 전 칸은 되돌릴 수 있게 남겨 둔다.
const SP_SYS = `너는 노벨AI(NAI Diffusion V4.5) 프롬프트 전문가다. 그림을 보고 "그림체"만 영어 Danbooru 태그로 적는다.
- 넣는 것: 화풍(korean webtoon style, manga style, anime coloring, semi realistic 등), 선(thick lineart, thin lineart, no lineart), 채색(cel shading, flat color, soft shading, painterly), 명암·빛(rim light, dramatic lighting, soft lighting), 색감(muted colors, pastel colors, high contrast, monochrome, screentone), 질감·매체(film grain, watercolor, digital painting), 눈·얼굴 그리는 법(sharp eyes, detailed eyes) 같은 그림체 태그.
- 넣지 않는 것: 인물 수·성별·머리색·옷·자세·배경·장면·사물·말풍선·글자 등 그림의 내용. 작가 이름도 넣지 않는다.
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
async function spPick(btn){
  const im = spVisibleImg();
  if (!im) return toast('웹툰·만화를 열어 그림이 보이는 곳에서 눌러 주세요');
  const c = await client('#naiProv'); if (!c) return;
  const st = $('#spStat'); btn.disabled = true; st.textContent = '그림체를 읽는 중…';
  try{
    const data = await spJpeg(im);
    const r = await stream(c, {system: SP_SYS, messages: [{role: 'user', content: [{type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data}}, {type: 'text', text: '이 그림의 그림체 태그만.'}]}]});
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
  box.innerHTML = '<button id="spPick" title="읽는 화면에 보이는 그림의 그림체(내용 말고)를 AI 가 노벨AI 태그로 옮겨 하우스 스타일에 넣어요">지금 보는 그림체 가져오기</button><button id="spUndo" hidden>되돌리기</button><span class="hint" id="spStat"></span>';
  $('#naiStyleNow').after(box);
  $('#spPick').onclick = e => spPick(e.currentTarget);
  $('#spUndo').onclick = () => { const p = store.get('set.naiStyle.prev', null); if (p === null) return; $('#naiStyle').value = p; store.set('set.naiStyle', p); $('#spUndo').hidden = true; $('#spStat').textContent = '하우스 스타일을 되돌렸어요'; };
}
window.nvStylePick = {clean: spClean};   // 시험용
