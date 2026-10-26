/* ================= 되돌리기(Ctrl+Z)가 살아 있는 원고 고치기 ================= */
// 브라우저의 입력 명령으로 넣으면 Ctrl+Z 기록에 남는다. 안 되는 브라우저는 그냥 바꾼다.
function taReplace(s, e, text){
  const ta = $('#stText'); ST.quiet = true; ta.focus({preventScroll: true}); ta.setSelectionRange(s, e);
  let ok = false; try{ ok = document.execCommand('insertText', false, text); }catch{}
  if (!ok || ta.value.slice(s, s + text.length) !== text){ ta.setRangeText(text, s, e, 'end'); ta.dispatchEvent(new Event('input')); }
}
// 사파리처럼 글 칸이 저절로 늘지 않는 브라우저
const AUTO_GROW = !(window.CSS && CSS.supports('field-sizing', 'content'));
function stGrow(){ if (!AUTO_GROW) return; const ta = $('#stText'); ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
$('#stText').addEventListener('input', () => { stGrow(); clearTimeout(stHlRender._t); stHlRender._t = setTimeout(stHlRender, 150); });
addEventListener('resize', () => { if (!$('#studio').hidden){ stGrow(); stHlRender(); } });

/* ================= 원고 메모(문장에 다는 메모) ================= */
function stCmts(){ return stEp()?.comments || []; }
function stFindQuote(text, c){
  if (!c.q) return -1; let best = -1, bd = Infinity, i = text.indexOf(c.q);
  while (i >= 0){ const d = Math.abs(i - (c.at || 0)); if (d < bd){ bd = d; best = i; } i = text.indexOf(c.q, i + 1); }
  return best;
}
function stRenderCmts(){
  const box = $('#stCmts'); if (!box) return; const list = stCmts(); const text = $('#stText').value;
  box.innerHTML = list.length ? '' : '<div class="hint">원고에서 문장을 고르고 위쪽 말풍선 단추(Ctrl+Shift+M)를 누르면 메모를 달 수 있어요.</div>';
  for (const c of list){
    const d = document.createElement('div'); d.className = 'st-cmt' + (stFindQuote(text, c) < 0 ? ' lost' : '');
    d.innerHTML = `<div class="q"></div><div class="n"></div><div class="row tight"><button data-a="go">가기</button><button data-a="edit">고치기</button><button data-a="del">지우기</button>${stFindQuote(text, c) < 0 ? '<span class="hint">원문이 바뀌었어요</span>' : ''}</div>`;
    d.querySelector('.q').textContent = c.q.length > 80 ? c.q.slice(0, 80) + '…' : c.q; d.querySelector('.n').textContent = c.n;
    d.querySelector('[data-a=go]').onclick = () => { const i = stFindQuote($('#stText').value, c); if (i < 0) return toast('원문이 바뀌어서 찾지 못했어요'); stSetView('write'); const ta = $('#stText'); ta.focus({preventScroll: true}); ta.setSelectionRange(i, i + c.q.length); stScrollToCaret(); $('#studio').classList.remove('minsp'); };
    d.querySelector('[data-a=edit]').onclick = () => { const v = prompt('메모', c.n); if (v === null) return; stSaveCmts(stCmts().map(x => x.id === c.id ? {...x, n: v, t: Date.now()} : x)); };
    d.querySelector('[data-a=del]').onclick = () => stSaveCmts(stCmts().filter(x => x.id !== c.id));
    box.append(d);
  }
}
function stSaveCmts(list){ stPatchEp({comments: list}); stRenderCmts(); stHlRender(); }
function stAddCmt(){
  const ta = $('#stText'); const s = ta.selectionStart, e = ta.selectionEnd;
  if (e <= s) return toast('메모를 달 문장을 원고에서 먼저 골라 주세요');
  const q = ta.value.slice(s, Math.min(e, s + 300)); const n = prompt(`「${q.slice(0, 40)}${q.length > 40 ? '…' : ''}」에 남길 메모`); if (!n) return;
  stSaveCmts([...stCmts(), {id: uid(), q, at: s, n, t: Date.now()}]); toast('메모를 달았어요 · 회차 정보에서 모아 봐요');
}
$('#stCmtBtn').onclick = stAddCmt;
document.addEventListener('keydown', e => { if (!$('#studio').hidden && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'm' || e.key === 'M')){ e.preventDefault(); stAddCmt(); } });

/* ================= 연재용 내보내기 ================= */
const EXP_FMT = {
  mobile: t => t.split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.trim()).join('\n\n'),
  book: t => t.split('\n').map(s => s.trim()).filter(Boolean).map(s => '　' + s).join('\n'),
  raw: t => t,
};
function stExport(text, title){
  let t = EXP_FMT[$('#stExpFmt').value](text.trim());
  if ($('#stExpDots').checked) t = t.replace(/\.{3,}/g, '…').replace(/…{2,}/g, '……');
  if ($('#stExpQuote').checked) t = t.replace(/"([^"\n]*)"/g, '“$1”').replace(/(^|[\s(])'([^'\n]*)'/g, '$1‘$2’');
  if ($('#stExpTitle').checked && title) t = title + ($('#stExpFmt').value === 'book' ? '\n\n' : '\n\n\n') + t;
  return t;
}
function stExpCount(){
  const t = stExport($('#stText').value, $('#stTitle').value);
  $('#stExpCount').textContent = `내보낼 글: 공백 포함 ${t.length.toLocaleString()}자 · 공백 제외 ${stCount(t).toLocaleString()}자`;
}
for (const id of ['stExpFmt','stExpDots','stExpQuote','stExpTitle']){ const el = $('#'+id); const v = store.get('set.' + id, null); if (v !== null){ if (el.type === 'checkbox') el.checked = v; else el.value = v; } el.addEventListener('change', () => { store.set('set.' + id, el.type === 'checkbox' ? el.checked : el.value); stExpCount(); }); }
$('#stCopyEp').onclick = () => { stFlush(); copy(stExport($('#stText').value, $('#stTitle').value)); };
$('#stExpEp').onclick = () => { stFlush(); download(`${safeName(stProj()?.name || '작품')}_${safeName($('#stTitle').value || '회차')}.txt`, stExport($('#stText').value, $('#stTitle').value), 'text/plain'); };
$('#stExpRange').onclick = () => {
  stFlush(); const list = stEps(); const v = prompt(`몇 화부터 몇 화까지? (1~${list.length}, 예: 1-25)`, `1-${list.length}`); if (!v) return;
  const m = v.match(/(\d+)\s*[-~]\s*(\d+)/) || [0, v, v]; const a = Math.max(1, +m[1]), b = Math.min(list.length, +m[2]); if (!(a <= b)) return toast('범위를 다시 적어 주세요');
  const out = list.slice(a - 1, b).map(e => stExport(stEpText(e.id), e.title)).join('\n\n\n\n');
  download(`${safeName(stProj().name)}_${a}-${b}화.txt`, out, 'text/plain');
};
$('#stExpAll').onclick = () => { stFlush(); const p = stProj(); download(`${safeName(p.name)}_전체.txt`, stEps().map(e => stExport(stEpText(e.id), e.title)).join('\n\n\n\n'), 'text/plain'); };
$('[data-itab=info]').addEventListener('click', () => setTimeout(stExpCount, 0));

/* ================= 판 비교 ================= */
function lcsOps(a, b){
  const n = a.length, m = b.length; if (n * m > 2.5e6) return null;
  const dp = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m){ if (a[i] === b[j]){ ops.push(['=', a[i]]); i++; j++; } else if (dp[i+1][j] >= dp[i][j+1]) ops.push(['-', a[i++]]); else ops.push(['+', b[j++]]); }
  while (i < n) ops.push(['-', a[i++]]); while (j < m) ops.push(['+', b[j++]]);
  return ops;
}
function diffHTML(oldT, newT){
  const A = oldT.split('\n'), B = newT.split('\n'); const ops = lcsOps(A, B) || [...A.map(x => ['-', x]), ...B.map(x => ['+', x])];
  let html = '', add = 0, del = 0; const P = s => s.trim() ? s : '&nbsp;';
  for (let k = 0; k < ops.length;){
    if (ops[k][0] === '='){ html += `<p>${P(esc(ops[k][1]))}</p>`; k++; continue; }
    const dels = [], ins = []; while (k < ops.length && ops[k][0] !== '='){ (ops[k][0] === '-' ? dels : ins).push(ops[k][1]); k++; }
    const pairs = Math.min(dels.length, ins.length);
    for (let x = 0; x < pairs; x++){
      const wa = dels[x].split(/(\s+)/), wb = ins[x].split(/(\s+)/); const w = lcsOps(wa, wb);
      if (!w){ html += `<p class="d">${esc(dels[x])}</p><p class="a">${esc(ins[x])}</p>`; del += stCount(dels[x]); add += stCount(ins[x]); continue; }
      html += '<p>' + w.map(([o, s]) => { if (o === '-'){ del += stCount(s); return s.trim() ? `<del>${esc(s)}</del>` : esc(s); } if (o === '+'){ add += stCount(s); return s.trim() ? `<ins>${esc(s)}</ins>` : esc(s); } return esc(s); }).join('') + '</p>';
    }
    for (const s of dels.slice(pairs)) if (s.trim()){ html += `<p class="d">${esc(s)}</p>`; del += stCount(s); }
    for (const s of ins.slice(pairs)) if (s.trim()){ html += `<p class="a">${esc(s)}</p>`; add += stCount(s); }
  }
  return {html, add, del};
}
let stDiffSnap = null;
function stShowDiff(snap){
  stFlush(); stDiffSnap = snap; const r = diffHTML(snap.text, $('#stText').value);
  $('#stDiffHead').innerHTML = `<b>${new Date(snap.t).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit'})} 판</b> → <b>지금</b> · <span class="ins">+${r.add.toLocaleString()}자</span> <span class="del">−${r.del.toLocaleString()}자</span>`;
  $('#stDiffBody').innerHTML = r.html; stSetView('diff'); $('#stViewTitle').textContent = `판 비교 · ${$('#stTitle').value}`; $('#studio').classList.remove('minsp');
}
$('#stDiffBack').onclick = () => stSetView('write');
$('#stDiffRestore').onclick = async () => { if (!stDiffSnap || !confirm('이 판으로 되돌릴까요? 지금 글은 판 기록에 남아요.')) return; await stSnap(false); stSetView('write'); taReplace(0, $('#stText').value.length, stDiffSnap.text); stSaveText(); stMeter(); toast('되돌렸어요 (Ctrl+Z로 다시 돌아올 수도 있어요)'); };

/* ================= 맞춤법·띄어쓰기 ================= */
const SPELL_SCHEMA = {type:'object', additionalProperties:false, required:['items'], properties:{items:{type:'array', items:{type:'object', additionalProperties:false, required:['wrong','right','why'], properties:{wrong:{type:'string', description:'원문에 있는 그대로의 틀린 부분(앞뒤 한두 어절 포함)'}, right:{type:'string', description:'고친 형태'}, why:{type:'string', description:'짧은 이유(맞춤법/띄어쓰기/문법/오타)'}}}}}};
const SYSTEM_SPELL = `너는 한국어 웹소설 교정자다. 국립국어원 표준 맞춤법과 띄어쓰기 기준으로 확실한 오류만 찾는다.
- 대사 속 말투, 사투리, 의성어·의태어, 일부러 늘인 말(“으아아아”), 작가가 만든 고유명사는 고치지 않는다.
- 문체나 표현을 바꾸지 않는다. 틀린 것만.
- wrong은 원문에 있는 글자 그대로(띄어쓰기 포함) 옮기고, 같은 오류가 여러 번 나오면 한 번만 적는다.
- 오류가 없으면 items를 빈 배열로.`;
let stSpellAbort = null;
async function stSpell(){
  if (stSpellAbort) return stSpellAbort.abort();
  stFlush(); const sel = stSelText(); const text = sel || $('#stText').value; if (!text.trim()) return toast('원고가 비어 있어요');
  const c = await client('#stProv'); if (!c) return;
  const chunks = []; let buf = '';
  for (const para of text.split('\n')){ if (buf.length + para.length > 2200 && buf){ chunks.push(buf); buf = ''; } buf += para + '\n'; }
  if (buf.trim()) chunks.push(buf);
  const box = $('#stSpell'); box.hidden = false; const items = [];
  stSpellAbort = new AbortController(); $('#stSpellBtn').textContent = '검사 멈추기';
  for (let k = 0; k < chunks.length; k++){
    box.innerHTML = `<div class="hint">검사 중 ${k + 1} / ${chunks.length}…</div>`;
    const res = await stream(c, {system: SYSTEM_SPELL, signal: stSpellAbort.signal, format: {type:'json_schema', schema: SPELL_SCHEMA}, messages: [{role:'user', content: `<text>\n${chunks[k]}\n</text>\n\n위 글의 맞춤법·띄어쓰기 오류를 찾아 줘.`}]});
    if (!res.ok){ box.innerHTML = `<div class="hint">${esc((res.note || '검사하지 못했어요').trim())}</div>`; break; }
    try{ for (const it of parseJSON(res.text).items || []) if (it.wrong && it.wrong !== it.right && chunks[k].includes(it.wrong) && !items.some(x => x.wrong === it.wrong)) items.push(it); }catch{}
  }
  stSpellAbort = null; $('#stSpellBtn').textContent = '맞춤법·띄어쓰기 검사';
  stRenderSpell(items);
}
function stRenderSpell(items){
  const box = $('#stSpell');
  const live = items.filter(it => !it.done);
  box.innerHTML = `<div class="row tight"><b class="grow">${live.length ? `고칠 곳 ${live.length}개` : '고칠 곳이 없어요'}</b>${live.length ? '<button id="stSpellAll">모두 고치기</button>' : ''}<button id="stSpellExt" title="원고를 복사하고 부산대 검사기를 열어요">부산대 검사기</button></div>`;
  for (const it of items){
    const d = document.createElement('div'); d.className = 'st-sp' + (it.done ? ' done' : '');
    d.innerHTML = `<div><s></s> → <b></b></div><small></small><div class="row tight">${it.done ? '<span class="hint">고쳤어요</span>' : '<button data-a="fix">고치기</button><button data-a="go">찾기</button><button data-a="skip">넘기기</button>'}</div>`;
    d.querySelector('s').textContent = it.wrong; d.querySelector('b').textContent = it.right; d.querySelector('small').textContent = it.why;
    d.querySelector('[data-a=fix]')?.addEventListener('click', () => { if (stSpellFix(it)) stRenderSpell(items); });
    d.querySelector('[data-a=go]')?.addEventListener('click', () => { const i = $('#stText').value.indexOf(it.wrong); if (i < 0) return toast('원고에서 찾지 못했어요'); stSetView('write'); $('#stText').focus({preventScroll: true}); $('#stText').setSelectionRange(i, i + it.wrong.length); stScrollToCaret(); });
    d.querySelector('[data-a=skip]')?.addEventListener('click', () => { it.done = true; stRenderSpell(items); });
    box.append(d);
  }
  $('#stSpellAll')?.addEventListener('click', async () => { await stSnap(false); let n = 0; for (const it of items) if (!it.done && stSpellFix(it, true)) n++; stSaveText(); stMeter(); stRenderSpell(items); toast(`${n}곳을 고쳤어요 (Ctrl+Z로 하나씩 되돌릴 수 있어요)`); });
  $('#stSpellExt').onclick = () => { copy(stSelText() || $('#stText').value); window.open('https://nara-speller.co.kr/speller/', '_blank', 'noopener'); };
}
function stSpellFix(it, quiet){
  const ta = $('#stText'); const i = ta.value.indexOf(it.wrong); if (i < 0){ it.done = true; if (!quiet) toast('원고에서 찾지 못했어요(이미 고쳤을 수 있어요)'); return false; }
  taReplace(i, i + it.wrong.length, it.right); it.done = true; if (!quiet){ stSaveText(); stMeter(); } return true;
}
$('#stSpellBtn').onclick = stSpell;

/* ================= 참고: 읽으며 표시한 문장 → 집필 ================= */
const HL_NAME = {y:'좋은 문장', g:'구조·기술', p:'대사'};
let stRefColor = '';
function allHighlights(){
  const out = [];
  for (let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i); if (!k.startsWith('nv.notes.')) continue;
    let list = []; try{ list = JSON.parse(localStorage.getItem(k)) || []; }catch{}
    const wk = k.slice('nv.notes.'.length); const name = works.find(w => w.key === wk)?.name || wk.split('/').pop();
    for (const n of list) out.push({...n, work: name});
  }
  return out.sort((a, b) => (b.t || 0) - (a.t || 0));
}
function stRenderRef(){
  const box = $('#stRefList'); const q = $('#stRefQ').value.trim();
  const all = allHighlights().filter(n => (!stRefColor || n.color === stRefColor) && (!q || (n.text + (n.note || '') + n.work).includes(q)));
  $('#stRefChips').innerHTML = [['', '전체'], ['y', '좋은 문장'], ['g', '구조·기술'], ['p', '대사']].map(([c, l]) => `<button data-c="${c}" class="${c === stRefColor ? 'on' : ''}">${l}</button>`).join('');
  $$('#stRefChips button').forEach(b => b.onclick = () => { stRefColor = b.dataset.c; stRenderRef(); });
  box.innerHTML = all.length ? '' : '<div class="hint">자료실(뷰어)에서 읽다가 형광펜을 칠한 문장이 여기 모여요. 노랑=좋은 문장, 초록=구조·기술, 분홍=대사.</div>';
  for (const n of all.slice(0, 200)){
    const d = document.createElement('div'); d.className = 'st-ref hl-' + n.color;
    d.innerHTML = `<div class="w"></div><div class="q"></div>${n.note ? '<div class="n"></div>' : ''}<div class="row tight"><button data-a="ai">AI로 이 기법 쓰기</button><button data-a="cp">복사</button></div>`;
    d.querySelector('.w').textContent = `${n.work} · ${n.epName || ''} · ${HL_NAME[n.color] || ''}`;
    d.querySelector('.q').textContent = n.text.length > 220 ? n.text.slice(0, 220) + '…' : n.text;
    if (n.note) d.querySelector('.n').textContent = n.note;
    d.querySelector('[data-a=cp]').onclick = () => copy(n.text);
    d.querySelector('[data-a=ai]').onclick = () => {
      const where = stSelText() ? '내가 원고에서 고른 부분' : '이 화의 마지막 장면';
      $('#stAsk').value = `아래는 내가 ${n.work}에서 '${HL_NAME[n.color] || '참고'}'로 표시한 문장이야.\n「${n.text.slice(0, 600)}」${n.note ? `\n내 메모: ${n.note}` : ''}\n\n이 문장이 쓰는 기법을 한 줄로 짚고, 그 기법을 ${where}에 적용해서 고쳐 써 줘. 내용을 베끼지 말고 기법만 가져와.`;
      stInspTab('ai'); $('#stAsk').focus();
    };
    box.append(d);
  }
}
$('#stRefQ').addEventListener('input', () => { clearTimeout(stRenderRef._t); stRenderRef._t = setTimeout(stRenderRef, 200); });
$('[data-itab=ref]').addEventListener('click', () => setTimeout(stRenderRef, 0));

// 작법 노트: 설정집의 '작법' 카드(분석 보고서 .md 가져오기)
function stCraftText(){
  const cs = stBible().filter(b => b.kind === '작법' && (b.body || '').trim()); if (!cs.length) return '';
  return '<craft_notes>\n' + cs.map(b => `## ${b.title}\n${b.body}`).join('\n\n').slice(0, 7000) + '\n</craft_notes>\n위는 내가 다른 작품을 분석해 정리한 작법 노트다. 해당되는 기법이 있으면 따른다.';
}
async function stImportMd(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.md,.txt,text/markdown,text/plain'; inp.multiple = true;
  inp.onchange = async () => {
    const l = stBible(); let n = 0;
    for (const f of inp.files){ const t = await decodeText(f); const title = (t.match(/^#\s+(.+)$/m)?.[1] || f.name.replace(/\.(md|txt)$/i, '')).trim(); l.unshift({id: uid(), kind: '작법', title, body: t.slice(0, 12000), img: '', t: Date.now()}); n++; }
    stSetBible(l); stBibleFilter = '작법'; stRenderBible(); toast(`작법 카드 ${n}장을 만들었어요. AI 도우미에서 '작법 노트 참고'를 켜면 함께 보내요`);
  };
  inp.click();
}

/* ================= 합본 txt 화 나누기 ================= */
const EP_HEAD_RE = /^\s*[<\[【〈《(〔]?\s*(?:제\s*)?(\d{1,4})\s*(?:화|회|장|편|話)\s*[>\]】〉》)〕]?(?:\s*[.:·\-–—]?\s*.{0,40})?$|^\s*(?:#{1,3}\s*|EP\.?\s*|episode\s*|chapter\s*|ch\.?\s*)(\d{1,4})\b.{0,40}$|^\s*[<\[【]?\s*(프롤로그|에필로그|외전(?:\s*\d{1,3})?|작가의\s*말|후기)\s*[>\]】]?\s*$/i;
function splitCombined(text){
  const lines = text.split(/\r?\n/); const heads = [];
  lines.forEach((l, i) => { const s = l.trim(); if (s && s.length <= 60 && !/^[“"‘'「『]/.test(s) && EP_HEAD_RE.test(s)) heads.push(i); });
  if (heads.length < 3) return null;
  const nums = heads.map(i => lines[i].match(/(\d{1,4})/)).filter(Boolean).map(m => +m[1]);
  let inc = 0; for (let k = 1; k < nums.length; k++) if (nums[k] > nums[k-1]) inc++;
  if (nums.length >= 3 && inc < (nums.length - 1) * 0.6) return null;
  let parts = []; const pre = lines.slice(0, heads[0]).join('\n').trim();
  if (stCount(pre) > 300) parts.push({title: '처음', text: pre});
  heads.forEach((h, k) => parts.push({title: lines[h].trim().replace(/^#+\s*/, ''), text: lines.slice(h + 1, heads[k+1] ?? lines.length).join('\n').trim()}));
  // 본문 속 숫자 줄을 화로 잘못 본 짧은 조각은 앞 화에 붙인다
  const avg = parts.reduce((s, p) => s + stCount(p.text), 0) / parts.length;
  const merged = [];
  for (const p of parts){ if (merged.length && stCount(p.text) < Math.min(200, avg * 0.05)) merged.at(-1).text += `\n\n${p.title}\n${p.text}`; else merged.push(p); }
  return merged.length >= 3 ? merged : null;
}
const SPLIT_CACHE = new Map();
async function txtParts(file){
  if (SPLIT_CACHE.has(file)) return SPLIT_CACHE.get(file);
  const parts = splitCombined(await decodeText(file)); SPLIT_CACHE.set(file, parts);
  if (SPLIT_CACHE.size > 3) SPLIT_CACHE.delete(SPLIT_CACHE.keys().next().value);
  return parts;
}
async function splitWorkTxt(w){
  if (w._split !== undefined) return; w._split = false; w._origEps = w.eps;
  if (w.kind !== 'novel' || store.get('nosplit.' + w.key, false)) return;
  const out = []; let did = 0;
  for (const ep of w.eps){
    if (ep.type !== 'txt' || ep.file.size < 30000){ out.push(ep); continue; }
    const parts = await txtParts(ep.file); if (!parts){ out.push(ep); continue; }
    const many = w.eps.length > 1; did++;
    parts.forEach((p, i) => out.push({name: (many ? ep.name + ' · ' : '') + p.title, type: 'txtpart', file: ep.file, idx: i}));
  }
  if (did){ w.eps = out; w._split = true; toast(`합본 txt를 ${out.length}화로 나눴어요 (회차 목록에서 끌 수 있어요)`); }
}
function epSplitBtn(){ const b = $('#epSplit'); if (!b || !cur) return; const can = cur._split || store.get('nosplit.' + cur.key, false); b.hidden = !can; b.textContent = cur._split ? '합본 나누기 끄기' : '합본 화 나누기'; }
$('#epSplit').onclick = async () => { if (!cur) return; const off = !!cur._split; store.set('nosplit.' + cur.key, off); cur.eps = cur._origEps || cur.eps; cur._split = undefined; closeSheets(); await openWork(cur); toast(off ? '나누지 않고 한 파일로 볼게요' : '다시 화별로 나눴어요'); };

// 집필실 가져오기: 합본이면 나눌지 묻는다
$('#stImportFile').onchange = async e => {
  const fs = [...e.target.files].sort((a, b) => natural(a.name, b.name)); e.target.value = ''; if (!fs.length) return;
  stFlush(); let last = null; const list = stEps(); const part = stEp()?.part || ''; let count = 0;
  const addEp = (title, t) => { const ep = {id: uid(), title, status: 'draft', chars: stCount(t), syn: '', note: '', part, cast: [], t: Date.now()}; list.push(ep); txtSet(ST.pid, ep.id, t); last = ep.id; count++; };
  for (const f of fs){
    const t = await decodeText(f); const parts = t.length > 8000 ? splitCombined(t) : null;
    if (parts && confirm(`'${f.name}'에서 ${parts.length}화를 찾았어요. 화별로 나눠 가져올까요?\n(처음: ${parts[0].title} … 끝: ${parts.at(-1).title})`)) parts.forEach(p => addEp(p.title, p.text));
    else addEp(f.name.replace(/\.txt$/i, ''), t);
  }
  stSetEps(list); stOpenEp(last); stRenderStats(); stSetView('write'); toast(`${count}개 회차를 가져왔어요`);
};

/* ================= 자동 백업 ================= */
const BK = {dir: null, need: false, dirty: false, timer: null};
async function bkLoad(){ try{ BK.dir = (await idb.tx('readonly', s => s.get('__bkdir'), 'snaps'))?.handle || null; }catch{} bkStatus(); }
function bkStatus(){
  const el = $('#stBkStat'); if (!el) return; const last = store.get('st.bk.last', 0);
  if (!('showDirectoryPicker' in window)){ el.textContent = '이 기기(아이폰 등)는 폴더 자동 백업을 지원하지 않아요. 구글 드라이브 동기화를 켜면 원고가 드라이브에 저절로 올라가요.'; $('#stBkDir').hidden = true; return; }
  el.textContent = BK.dir ? `백업 폴더: ${BK.dir.name}${last ? ` · 마지막 ${new Date(last).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit'})}` : ''}${BK.need ? ' · 권한이 필요해요(화면을 한 번 누르면 물어봐요)' : ''}` : '아직 폴더를 정하지 않았어요. 정하면 10분마다, 그리고 집필실을 닫을 때 작품별 백업 파일을 그 폴더에 저장해요(날마다 한 파일).';
}
$('#stBkDir').onclick = async () => {
  try{ const h = await window.showDirectoryPicker({id: 'novel-backup', mode: 'readwrite'}); BK.dir = h; BK.need = false; await idb.tx('readwrite', s => s.put({id: '__bkdir', handle: h, list: []}), 'snaps'); BK.dirty = true; await bkRun(); toast('백업 폴더를 정했어요'); }
  catch(e){ if (e.name !== 'AbortError') toast('폴더를 정하지 못했어요'); }
};
async function bkRun(){
  if (!BK.dir || !BK.dirty) return;
  try{
    if ((await BK.dir.queryPermission({mode: 'readwrite'})) !== 'granted'){ BK.need = true; bkStatus(); return; }
    stFlush(); await txtFlushNow();
    for (const p of stProjects()){
      const data = {kind: 'novel-viewer-project', saved: new Date().toISOString(), project: p, eps: stEps(p.id).map(e => ({...e, text: txtGet(p.id, e.id)})), bible: stBible(p.id)};
      const fh = await BK.dir.getFileHandle(`${safeName(p.name)}_${today()}.json`, {create: true}); const w = await fh.createWritable(); await w.write(JSON.stringify(data)); await w.close();
    }
    BK.dirty = false; store.set('st.bk.last', Date.now()); bkStatus();
  }catch(e){ console.warn('backup', e); }
}
document.addEventListener('pointerdown', async () => { if (BK.need && BK.dir && !$('#studio').hidden){ BK.need = false; try{ if ((await BK.dir.requestPermission({mode: 'readwrite'})) === 'granted'){ bkRun(); } else BK.need = true; }catch{ BK.need = true; } bkStatus(); } }, true);
$('#stText').addEventListener('input', () => { BK.dirty = true; });
setInterval(() => { if (!$('#studio').hidden) bkRun(); }, 10 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bkRun(); });
$('#stExpBackup').addEventListener('click', () => store.set('st.bk.manual', Date.now()));
// 백업이 오래되면 왼쪽 카드에 알린다
bkLoad();

/* ================= 아이폰 키보드 ================= */
// 키보드가 올라오면 집필실 높이를 보이는 영역에 맞추고 아래 막대를 숨긴다
function stVV(){
  const vv = window.visualViewport; const s = $('#studio'); if (!vv || s.hidden) return;
  const kb = innerHeight - vv.height > 120 && document.activeElement?.matches('textarea, input');
  s.classList.toggle('kb', kb);
  if (kb){ s.style.height = vv.height + 'px'; s.style.top = vv.offsetTop + 'px'; s.style.bottom = 'auto'; } else { s.style.height = s.style.top = s.style.bottom = ''; }
  if (kb && document.activeElement === $('#stText')) requestAnimationFrame(() => { const wrap = $('#stEdWrap'), ta = $('#stText'); const y = ta.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop + caretY(ta); if (y < wrap.scrollTop || y > wrap.scrollTop + wrap.clientHeight - 60) wrap.scrollTop = y - wrap.clientHeight * 0.45; });
}
window.visualViewport?.addEventListener('resize', stVV);
window.visualViewport?.addEventListener('scroll', stVV);
document.addEventListener('focusout', () => setTimeout(stVV, 50));

/* ================= 보기 바꿀 때 ================= */
// 작법 카드 가져오기 단추를 설정집 위에 붙인다

