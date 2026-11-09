/* ---------- 태그로 바로 만들기 (2026-11-09) ----------
   '장면 → 프롬프트'는 AI(Claude·Gemini)가 성인 장면을 거절하거나 순하게 바꿔서 수위 컷이 잘 안 나왔다.
   그래서 태빈이 직접 쓴 노벨AI 태그를 AI 없이 그대로 받아, 고른 그림체·인물 사전·네거티브·등급으로 감싸 준다.
   막는 것은 그대로: 성인 등급이면 adultGuard·MINOR_RE 로 미성년 표현을 막는다. */
function naiTagsParse(text){
  const segs = String(text || '').split('|').map(x => x.trim()).filter(Boolean);
  if (!segs.length) return null;
  const dict = naiCharsDict(), map = new Map(dict.map(l => { const k = l.indexOf(':'); return [l.slice(0, k).trim(), l.slice(k + 1).trim()]; }));
  const pos = ['B3', 'D3', 'C2', 'C4'];
  const chars = segs.slice(1).map((seg, i) => {
    const m = seg.match(/^([^,:]+?)\s*[,:]\s*(.*)$/s); let name = `인물 ${i + 1}`, prompt = seg;
    if (m && map.has(m[1].trim())){ name = m[1].trim(); prompt = [map.get(name), m[2]].filter(Boolean).join(', '); }
    else if (map.has(seg)){ name = seg; prompt = map.get(seg); }
    return {name, prompt, negative: '', position: pos[i] || 'C3'};
  });
  return {base_prompt: segs[0], characters: chars, negative: '', size: '', notes: '태그로 바로 만듦'};
}
function naiTagsBuild(){
  const t = $('#naiTags').value.trim(); if (!t) { toast('태그를 적어 주세요'); return null; }
  if (/\b(nsfw|explicit|uncensored)\b/i.test(t) && $('#naiRating').value !== 'nsfw'){ $('#naiRating').value = 'nsfw'; $('#naiRating').dispatchEvent(new Event('change')); toast('성인 태그가 있어서 등급을 성인으로 바꿨어요'); }
  const res = naiTagsParse(t); if (!res) return null;
  const nsfw = $('#naiRating').value === 'nsfw';
  if (nsfw && !adultGuard(t + '\n' + naiCharsDict().join('\n'), 'adult')) return null;
  const p = naiPack(res);
  if (nsfw && MINOR_RE.test([p.base, ...p.chars.map(x => x.prompt)].join(' '))){ toast('미성년을 떠올리게 하는 태그가 있어서 만들지 않았어요'); return null; }
  renderNai(p); const h = store.get('naiHist', []); h.unshift({t: Date.now(), desc: '태그: ' + t.slice(0, 60), p}); store.set('naiHist', h.slice(0, 30)); renderNaiHist();
  return p;
}
(function(){
  const box = $('#naiTagBox'); if (!box) return;
  $('#naiTags').value = store.get('set.naiTags', ''); $('#naiTags').oninput = () => { clearTimeout(naiTagsBuild._t); naiTagsBuild._t = setTimeout(() => store.set('set.naiTags', $('#naiTags').value), 500); };
  $('#naiTagGo').onclick = () => { if (naiTagsBuild()) toast('프롬프트를 만들었어요. 아래 \'그림 만들기\'로 바로 그려요'); };
  $('#naiTagDraw').onclick = () => { if (!naiTagsBuild()) return; $('#ngList').value = ''; $('#ngGo').click(); };   // 장면 칸이 비면 방금 만든 프롬프트로 그린다
  $('#naiTagChars').onclick = () => {
    const names = naiCharsDict().slice(0, 2).map(l => l.split(':')[0].trim()).filter(Boolean); if (!names.length) return toast('인물 사전이 비어 있어요');
    const t = $('#naiTags').value.trim(), segs = t ? t.split('|').map(x => x.trim()) : ['']; segs.length = 1;
    $('#naiTags').value = [segs[0], ...names].join(' | '); store.set('set.naiTags', $('#naiTags').value);
  };
  const snips = () => store.get('set.naiSnips', {});
  const fill = () => { const s = snips(); $('#naiSnip').innerHTML = '<option value="">저장해 둔 태그 묶음…</option>' + Object.keys(s).map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join(''); };
  fill();
  // 이름은 칸에 적는다(윈도우 프로그램은 prompt 창을 못 띄운다)
  $('#naiSnipSave').onclick = () => { const t = $('#naiTags').value.trim(); if (!t) return toast('저장할 태그가 없어요'); const name = ($('#naiSnipName').value.trim() || t.slice(0, 20)); $('#naiSnipName').value = ''; const s = snips(); s[name.trim()] = t; store.set('set.naiSnips', s); fill(); $('#naiSnip').value = name.trim(); toast('저장했어요'); };
  $('#naiSnipAdd').onclick = () => { const k = $('#naiSnip').value; const t = snips()[k]; if (!t) return toast('넣을 묶음을 골라 주세요'); const cur = $('#naiTags').value.trim(); if (!cur) $('#naiTags').value = t; else { const a = cur.split('|'), b = t.split('|'); a[0] = [a[0].trim(), b[0].trim()].filter(Boolean).join(', '); for (let i = 1; i < b.length; i++) a[i] = [a[i]?.trim(), b[i].trim()].filter(Boolean).join(', '); $('#naiTags').value = a.map(x => x.trim()).join(' | '); } store.set('set.naiTags', $('#naiTags').value); };
  $('#naiSnipDel').onclick = () => { const k = $('#naiSnip').value; if (!k) return; const s = snips(); delete s[k]; store.set('set.naiSnips', s); fill(); };
  $('#naiNsfwOllama').checked = !!store.get('set.naiNsfwOllama', false); $('#naiNsfwOllama').onchange = () => store.set('set.naiNsfwOllama', $('#naiNsfwOllama').checked);
})();
window.nvNaiTags = {parse: naiTagsParse, build: naiTagsBuild};   // 시험용
