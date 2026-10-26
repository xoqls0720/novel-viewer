/* ================= 쓰면서 느는 장치 ================= */

/* ---------- 1. 고친 이유 · 4. 기억할 것 ---------- */
const WHY_TAIL = `\n\n본문을 다 쓴 뒤 맨 끝에 '===이유===' 한 줄을 쓰고, 그 아래에 왜 이렇게 썼는지(고쳤다면 무엇을 왜 바꿨는지) 2~4개를 '• [분류] 짧은 설명' 형식으로 적어. 분류는 리듬·중복·정보 순서·시점·보여주기·대사·긴장·맞춤법·호흡 중에서 고른다. 설명은 다음에 작가가 혼자서도 쓸 수 있게 원리로 적는다.`;
const MEMO_TAIL = `\n\n맨 끝에 '===기억===' 한 줄을 쓰고, 그 아래에 이 작가가 다음 화를 쓸 때 기억할 것 한 줄만 적어.`;
const WHY_KINDS = ['continue','polish','dialog','hook','custom'];
function stSplitOut(){
  const full = $('#stOut').textContent; const note = (full.match(/\n\n\[[^\]]*\]$/) || [''])[0]; const raw = note ? full.slice(0, -note.length) : full;
  const [body0, memo] = raw.split(/\n*={2,}\s*기억\s*={2,}\n*/); const [body, why] = body0.split(/\n*={2,}\s*이유\s*={2,}\n*/);
  ST.outBody = body.trim(); $('#stOut').textContent = ST.outBody + note;
  const box = $('#stLearn'); box.innerHTML = '';
  if (ST.orig && ST.outBody && ST.orig.trim() !== ST.outBody){
    const d = diffHTML(ST.orig, ST.outBody);
    box.insertAdjacentHTML('beforeend', `<div class="st-lh">무엇이 바뀌었나 <span class="ins">+${d.add}</span> <span class="del">−${d.del}</span></div><div class="st-diff mini">${d.html}</div>`);
  }
  const reasons = (why || '').split('\n').map(s => s.replace(/^[\s•\-*·]+/, '').trim()).filter(Boolean);
  if (reasons.length){
    box.insertAdjacentHTML('beforeend', '<div class="st-lh">왜 이렇게 썼나</div>');
    for (const r of reasons){
      const m = r.match(/^\[([^\]]+)\]\s*(.*)$/); const d = document.createElement('div'); d.className = 'st-why';
      d.innerHTML = `${m ? `<span class="tag">${esc(m[1])}</span>` : ''}<span class="tx"></span><button title="내 퇴고 노트에 쌓기">+ 노트</button>`;
      d.querySelector('.tx').textContent = m ? m[2] : r;
      d.querySelector('button').onclick = ev => { stCraftNote(m ? `[${m[1]}] ${m[2]}` : r); ev.target.disabled = true; ev.target.textContent = '쌓음'; };
      box.append(d);
    }
  }
  if (memo?.trim()){
    const line = memo.trim().split('\n')[0];
    const d = document.createElement('div'); d.className = 'st-memo'; d.innerHTML = '<b>다음 화에 기억할 것</b><div class="tx"></div><button class="primary">내 퇴고 노트에 쌓기</button>';
    d.querySelector('.tx').textContent = line; d.querySelector('button').onclick = ev => { stCraftNote(line); ev.target.disabled = true; ev.target.textContent = '쌓았어요'; };
    box.append(d);
  }
}
// 설정집 '작법' 카드 '내 퇴고 노트'에 한 줄씩 쌓는다(이것이 내 작법서가 된다)
function stCraftNote(line){
  const l = stBible(); let c = l.find(b => b.kind === '작법' && b.title === '내 퇴고 노트');
  if (!c){ c = {id: uid(), kind: '작법', title: '내 퇴고 노트', body: '', img: '', t: Date.now()}; l.unshift(c); }
  const d = new Date(); c.body = `- ${line} (${d.getMonth() + 1}/${d.getDate()}${$('#stTitle').value ? ', ' + $('#stTitle').value : ''})\n` + (c.body || ''); c.t = Date.now();
  stSetBible(l); toast('설정집 → 작법 → 내 퇴고 노트에 쌓았어요');
}

/* ---------- 2. 내 글 버릇 거울 ---------- */
const ADVERBS = ['정말','너무','매우','아주','조금','천천히','갑자기','순간','그냥','다시','이미','결국','마치','살짝','꽤','몹시','문득','잠시','가만히','슬쩍','도저히','전혀','분명히','확실히','완전히','엄청','굉장히','점점','계속','그대로'];
const HABITS = {
  end:  {name: '같은 어미 연속', tip: '같은 어미가 줄줄이 이어지면(-었다가 네 번 넘게, 그 밖의 어미는 세 번 넘게) 리듬이 늘어져요. 짧은 문장, 명사로 끝나는 문장, 대사를 끼워 리듬을 바꿔 보세요.'},
  rep:  {name: '반복되는 말', tip: '같은 말이 가까이에서 되풀이되면 읽는 눈이 걸려요. 지시어로 받거나, 아예 빼도 뜻이 통하는지 보세요.'},
  adv:  {name: '부사', tip: '정말·너무·갑자기 같은 부사는 장면의 힘을 대신 말해 버려요. 부사를 빼고 동작이나 결과로 보여 줄 수 있는지 보세요.'},
  conj: {name: '접속사로 시작', tip: '그리고·하지만·그런데로 여는 문장이 많으면 설명조가 돼요. 문장 순서만으로 이어지는지 보세요.'},
  pron: {name: '그는·그녀는으로 시작', tip: '주어로 문장을 여는 습관이 이어지면 단조로워요. 동작이나 감각, 사물로 먼저 열어 보세요.'},
  kot:  {name: '~것이다·것 같았다', tip: '"것이다", "것 같았다"는 거리를 둬서 긴장을 낮춰요. 단정하거나 감각으로 바꿀 수 있는지 보세요.'},
  long: {name: '아주 긴 문장', tip: '90자가 넘는 문장은 휴대폰 한 화면에서 숨이 차요. 동작마다 끊어 보세요.'},
};
function sentencesOf(text){ const out = []; const re = /[^.!?…\n]+[.!?…]+["”’'」』]?/g; let m; while ((m = re.exec(text))) { const s = m[0]; const lead = s.length - s.trimStart().length; out.push({s: s.trim(), at: m.index + lead}); } return out; }
function habits(text){
  const res = {}; const add = (id, s, e) => { (res[id] ||= {n: 0, ranges: []}); res[id].n++; if (res[id].ranges.length < 300) res[id].ranges.push([s, e]); };
  const sents = sentencesOf(text);
  // 어미 연속
  let run = [];
  // 어미 묶음: '-섰다·-었다·-랐다'처럼 받침 ㅆ + 다는 모두 과거형 '-었다'로 본다
  const endOf = s => { if (/^[“"‘'「『]/.test(s)) return null; const t = s.replace(/[.!?…"”’'」』\s]+$/, ''); const m = t.match(/([가-힣])([가-힣])$/); if (!m) return null; if (m[2] === '다'){ const c = m[1].charCodeAt(0) - 0xAC00; if (c >= 0 && c % 28 === 20) return '-었다'; } return m[1] + m[2]; };
  const flush = () => { if (run.length >= (endOf(run[0]?.s || '') === '-었다' ? 4 : 3)){ add('end', run[0].at, run.at(-1).at + run.at(-1).s.length); } run = []; };
  for (const x of sents){ const e = endOf(x.s); if (e && run.length && endOf(run[0].s) === e) run.push(x); else { flush(); if (e) run = [x]; } } flush();
  // 반복되는 말(이름은 뺀다)
  const names = new Set(stBible().filter(b => b.kind === '인물').map(b => (b.title || '').trim()).filter(Boolean));
  const freq = new Map(); const wre = /[가-힣]{2,}/g; let m;
  const STOP = /^(그리고|하지만|그러나|그런데|그래서|있었다|없었다|것이다|했다|하는|있는|그는|그녀는|그가|그녀가|자신의|이제|다시|정말|그냥|그것|이것|저것|하고|하며|했던|있던|없는|않았다|않는|같은|같았다)$/;
  while ((m = wre.exec(text))){ const w = m[0].replace(/(은|는|이|가|을|를|에|의|도|로|와|과|에게|에서|으로|처럼|까지|부터|만)$/, ''); if (w.length < 2 || /다$/.test(w) || STOP.test(w) || names.has(w)) continue; (freq.get(w) || freq.set(w, []).get(w)).push(m.index); }
  const limit = Math.max(4, stCount(text) / 700);
  const reps = [...freq].filter(([, a]) => a.length >= limit).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  for (const [w, a] of reps){ add('rep', a[0], a[0] + w.length); res.rep.ranges.pop(); for (const i of a) res.rep.ranges.push([i, i + w.length]); }
  if (res.rep) res.rep.words = reps.map(([w, a]) => `${w} ${a.length}`);
  // 부사
  const advRe = new RegExp(`(^|[^가-힣])(${ADVERBS.join('|')})(?=[^가-힣]|$)`, 'g'); while ((m = advRe.exec(text))) add('adv', m.index + m[1].length, m.index + m[0].length);
  for (const x of sents){
    if (/^(그리고|하지만|그런데|그러나|그래서|그러자|그때|게다가)(?=[\s,]|$)/.test(x.s)) add('conj', x.at, x.at + x.s.match(/^\S+/)[0].length);
    if (/^(그는|그녀는|그가|그녀가)\s/.test(x.s)) add('pron', x.at, x.at + 3);
    if (x.s.replace(/\s/g, '').length > 90) add('long', x.at, x.at + x.s.length);
  }
  const kre = /것이다|것이었다|것 같았다|것 같다|것만 같았다/g; while ((m = kre.exec(text))) add('kot', m.index, m.index + m[0].length);
  const k = Math.max(1, stCount(text) / 1000);
  for (const id of Object.keys(HABITS)){ res[id] ||= {n: 0, ranges: []}; res[id].per = +(res[id].n / k).toFixed(1); }
  return res;
}
let mirrorOn = null;
function stRenderMirror(){
  const box = $('#stMirror'); if (!box) return; const text = $('#stText').value;
  if (stCount(text) < 200){ box.innerHTML = '<div class="hint">200자 넘게 쓰면 내 글 버릇이 보여요.</div>'; return; }
  const h = habits(text); const p = stProj(); const ref = p?.ref ? store.get('st.refstat.' + p.ref, null) : null;
  const trend = stHabitTrend();
  box.innerHTML = `<div class="hint" style="margin-bottom:8px">지금 화에서 눈에 띄는 버릇이에요. 숫자는 1,000자마다 나온 횟수${ref ? `, 옆은 참고 작품 <b>${esc(ref.name)}</b>` : ''}. '표시'를 누르면 원고에 칠해져요.</div>`;
  for (const id of Object.keys(HABITS)){
    const x = h[id]; const r = ref?.habits?.[id];
    const worse = r !== undefined ? x.per > r * 1.5 + 0.3 : x.per >= ({end: 1, rep: 1, adv: 6, conj: 2, pron: 2, kot: 1, long: 1})[id];
    const d = document.createElement('div'); d.className = 'st-hb' + (worse ? ' warn' : '');
    d.innerHTML = `<div class="hh"><b class="term" data-term="${HABITS[id].name}">${HABITS[id].name}</b><span class="v">${x.per}</span>${r !== undefined ? `<span class="r">참고 ${r}</span>` : ''}${trend[id] ? trend[id] : ''}<button>${mirrorOn === id ? '끄기' : '표시'}</button></div><div class="tp"></div>${x.words ? `<div class="ws">${x.words.map(esc).join(' · ')}</div>` : ''}`;
    d.querySelector('.tp').textContent = HABITS[id].tip;
    d.querySelector('button').onclick = () => { mirrorOn = mirrorOn === id ? null : id; ST.marks = mirrorOn ? h[id].ranges.map(([s, e]) => [s, e, 'hb']) : []; stHlRender(); stRenderMirror(); if (mirrorOn && h[id].ranges[0]){ const ta = $('#stText'); ta.setSelectionRange(h[id].ranges[0][0], h[id].ranges[0][0]); stScrollToCaret(); } };
    box.append(d);
  }
}
// 회차가 쌓이면 버릇이 줄어드는지: 회차 순서대로 1,000자당 횟수를 작은 선으로
function stHabitTrend(){
  const eps = stEps().filter(e => (e.chars || 0) > 500).slice(-40); if (eps.length < 3) return {};
  const key = ST.pid + ':' + eps.map(e => e.id + e.chars).join(','); if (stHabitTrend.k === key) return stHabitTrend.v;
  const rows = eps.map(e => habits(stEpText(e.id)));
  const out = {};
  for (const id of Object.keys(HABITS)){
    const v = rows.map(r => r[id].per); const max = Math.max(...v, 0.1);
    const pts = v.map((y, i) => `${(i / (v.length - 1) * 60).toFixed(1)},${(16 - y / max * 14).toFixed(1)}`).join(' ');
    const first = v.slice(0, Math.ceil(v.length / 2)), last = v.slice(Math.floor(v.length / 2)); const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
    const dir = avg(last) < avg(first) * 0.85 ? 'down' : avg(last) > avg(first) * 1.15 ? 'up' : '';
    out[id] = `<svg class="spark ${dir}" viewBox="0 0 60 18" title="최근 ${v.length}화"><polyline points="${pts}"/></svg>`;
  }
  stHabitTrend.k = key; stHabitTrend.v = out; return out;
}
$('[data-itab=mirror]').addEventListener('click', () => setTimeout(stRenderMirror, 0));
$('#stText').addEventListener('input', () => { if (!$('[data-ipane=mirror]').hidden){ clearTimeout(stRenderMirror._t); stRenderMirror._t = setTimeout(() => { if (mirrorOn){ const h = habits($('#stText').value); ST.marks = h[mirrorOn].ranges.map(([s, e]) => [s, e, 'hb']); stHlRender(); } stRenderMirror(); }, 900); } });
// 원고 위 칠하기: 메모(노랑)와 버릇(주황 밑줄)을 함께
function stHlRender(){
  const hl = $('#stHl'), ta = $('#stText'); if (!hl || $('#studio').hidden) return;
  const text = ta.value;
  if (text.length > 400000){ hl.innerHTML = ''; return; }   // 아주 긴 글에서는 겹칠판을 쉬게 한다
  const rs = [];
  for (const c of stCmts()){ const i = stFindQuote(text, c); if (i >= 0) rs.push([i, i + c.q.length, 'cm', c.id]); }
  for (const [s, e, cls] of ST.marks || []) if (e <= text.length) rs.push([s, e, cls]);
  rs.sort((a, b) => a[0] - b[0]);
  let out = '', p = 0;
  for (const [s, e, cls, id] of rs){ if (s < p) continue; out += esc(text.slice(p, s)) + `<mark class="${cls}"${id ? ` data-id="${id}"` : ''}>${esc(text.slice(s, e))}</mark>`; p = e; }
  hl.innerHTML = out + esc(text.slice(p)) + '\n ';
  hl.style.top = ta.offsetTop + 'px'; hl.style.left = ta.offsetLeft + 'px'; hl.style.width = ta.clientWidth + 'px';
}

/* ---------- 3. 내가 고치는 패턴(판 기록끼리 비교) ---------- */
function editPairStats(a, b){
  const A = a.split('\n'), B = b.split('\n'); const ops = lcsOps(A, B); if (!ops) return null;
  const del = [], ins = []; const words = t => t.split(/\s+/).map(w => w.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(Boolean);
  for (let k = 0; k < ops.length;){
    if (ops[k][0] === '='){ k++; continue; }
    const ds = [], is = []; while (k < ops.length && ops[k][0] !== '='){ (ops[k][0] === '-' ? ds : is).push(ops[k][1]); k++; }
    const wa = words(ds.join(' ')), wb = words(is.join(' ')); const w = lcsOps(wa, wb);
    if (!w){ del.push(...wa); ins.push(...wb); continue; }
    for (const [o, x] of w){ if (o === '-') del.push(x); else if (o === '+') ins.push(x); }
  }
  return {del, ins};
}
async function stRevisionStats(){
  const strip = w => w.replace(/(은|는|이|가|을|를|에|의|도|로|와|과|에게|에서|으로|처럼|까지|부터|만|다|었다|았다|였다)$/, '') || w;
  const D = new Map(), I = new Map(); let pairs = 0, split = 0, sentBefore = 0, sentAfter = 0;
  for (const e of stEps()){
    const snaps = (await stGetSnaps(`${ST.pid}/${e.id}`)).slice().reverse(); const seq = [...snaps.map(s => s.text), stEpText(e.id)];
    for (let i = 1; i < seq.length; i++){
      const a = seq[i - 1], b = seq[i]; if (a === b || a.length > 20000 || b.length > 20000) continue;
      const st = editPairStats(a, b); if (!st) continue;
      const addN = st.ins.join('').length, delN = st.del.join('').length;
      if (!delN || addN > 600 && addN > delN * 3) continue;   // 새로 이어 쓴 것(또는 AI가 넣은 것)은 퇴고가 아니다
      pairs++;
      for (const w of st.del){ const k = strip(w); if (k.length >= 2) D.set(k, (D.get(k) || 0) + 1); }
      for (const w of st.ins){ const k = strip(w); if (k.length >= 2) I.set(k, (I.get(k) || 0) + 1); }
      const pa = a.split(/\n\s*\n|\n/).filter(s => s.trim()).length, pb = b.split(/\n\s*\n|\n/).filter(s => s.trim()).length; if (pb > pa) split++;
      sentBefore += analyze(a).sentAvg; sentAfter += analyze(b).sentAvg;
    }
  }
  const top = (m, n) => [...m].filter(([w, c]) => c >= 2 && !(I.get(w) >= c && m === D)).sort((x, y) => y[1] - x[1]).slice(0, n);
  return {pairs, del: top(D, 8), ins: top(I, 8), split, sb: pairs ? Math.round(sentBefore / pairs) : 0, sa: pairs ? Math.round(sentAfter / pairs) : 0};
}
async function stRenderRevision(){
  const box = $('#stRevBox'); if (!box) return; box.innerHTML = '<div class="hint">판 기록을 살펴보는 중…</div>';
  const r = await stRevisionStats();
  if (r.pairs < 2){ box.innerHTML = '<div class="hint">퇴고한 판이 더 쌓이면(Ctrl+S로 판을 남기고 고치기를 몇 번 하면) 내가 고칠 때 무엇을 하는지 보여요.</div>'; return; }
  box.innerHTML = `<div class="hint" style="margin-bottom:8px">판 기록 ${r.pairs}번의 퇴고를 비교했어요. 새로 이어 쓴 부분과 AI가 넣은 큰 덩어리는 빼고 셌어요.</div>
    <div class="st-rev"><div><small>자주 지우는 말</small>${r.del.map(([w, c]) => `<span class="chip del">${esc(w)} <b>${c}</b></span>`).join('') || '<span class="hint">—</span>'}</div>
    <div><small>자주 넣는 말</small>${r.ins.map(([w, c]) => `<span class="chip ins">${esc(w)} <b>${c}</b></span>`).join('') || '<span class="hint">—</span>'}</div>
    <div><small>고치면서 생기는 일</small><span class="chip">문단 쪼갬 <b>${r.split}</b>번</span><span class="chip">문장 평균 <b>${r.sb}</b>자 → <b>${r.sa}</b>자</span></div></div>
    <div class="row"><button class="primary" id="stMakeCheck">내 퇴고 체크리스트 만들기</button><span class="hint grow">설정집 '작법'에 카드로 만들어요. AI도 함께 봐요.</span></div>`;
  $('#stMakeCheck').onclick = () => {
    const h = habits($('#stText').value); const lines = [];
    for (const [w, c] of r.del.slice(0, 5)) lines.push(`□ '${w}'를 또 쓰지 않았나 (퇴고 때 ${c}번 지운 말)`);
    if (r.split > 1) lines.push('□ 한 문단에 동작이 둘 넘게 들어가 있지 않나 (고칠 때 문단을 자주 쪼갬)');
    if (r.sa < r.sb) lines.push(`□ 문장이 길지 않나 (고치면 평균 ${r.sb}자 → ${r.sa}자로 줄어듦)`);
    for (const id of Object.keys(HABITS)) if (h[id].per >= 2) lines.push(`□ ${HABITS[id].name}: ${HABITS[id].tip.split('.')[0]}.`);
    const l = stBible(); const old = l.find(b => b.kind === '작법' && b.title === '내 퇴고 체크리스트');
    const body = lines.join('\n') + `\n\n(${new Date().toLocaleDateString('ko-KR')} 판 기록 ${r.pairs}번에서 뽑음)`;
    if (old){ old.body = body; old.t = Date.now(); } else l.unshift({id: uid(), kind: '작법', title: '내 퇴고 체크리스트', body, img: '', t: Date.now()});
    stSetBible(l); toast('설정집 → 작법 → 내 퇴고 체크리스트를 만들었어요');
  };
}

/* ---------- 5. 참고 작품과 나란히 ---------- */
async function stRefStat(w){
  const eps = w.eps.filter(isText).slice(0, 30); let n = 0; const acc = {chars: 0, median: 0, dlg: 0, sentAvg: 0}; const hb = {};
  for (const e of eps){ const t = await epText(e); if (stCount(t) < 1000) continue; const a = analyze(t); for (const k in acc) acc[k] += a[k]; const h = habits(t); for (const id in HABITS) hb[id] = (hb[id] || 0) + h[id].per; n++; }
  if (!n) return null;
  const r = {name: w.name, n, habits: {}}; for (const k in acc) r[k] = Math.round(acc[k] / n); for (const id in HABITS) r.habits[id] = +(hb[id] / n).toFixed(1);
  store.set('st.refstat.' + w.key, r); return r;
}
function stRenderRefSel(){
  const sel = $('#stRefWork'); if (!sel) return; const p = stProj(); const novels = works.filter(w => w.kind === 'novel');
  sel.innerHTML = `<option value="">고르지 않음</option>` + novels.map(w => `<option value="${esc(w.key)}">${esc(w.name)}</option>`).join('');
  if (p?.ref && !novels.some(w => w.key === p.ref)){ const r = store.get('st.refstat.' + p.ref, null); if (r) sel.insertAdjacentHTML('beforeend', `<option value="${esc(p.ref)}">${esc(r.name)} (저장된 수치)</option>`); }
  sel.value = p?.ref || '';
  $('#stRefHint').textContent = novels.length ? '앞 30화의 평균을 재서 원고 아래 막대·통계·버릇 거울에 나란히 보여 줘요.' : '자료실에 소설을 넣어 두면 고를 수 있어요.';
}
$('#stRefWork').onchange = async () => {
  const p = stProj(); p.ref = $('#stRefWork').value; stSaveProj(p);
  const w = works.find(x => x.key === p.ref);
  if (w){ toast(`${w.name} 수치를 재는 중…`); if (!w._expanded && w.eps.some(e => e.type === 'epub')){ /* epub은 자료실에서 한 번 열어야 장으로 나뉜다 */ } await splitWorkTxt(w); const r = await stRefStat(w); toast(r ? `${w.name} 앞 ${r.n}화 평균을 기준으로 삼았어요` : '잴 수 있는 회차가 없어요(자료실에서 한 번 열어 주세요)'); }
  stMeter();
};

/* ---------- 6. 말에 손을 대면 짧은 설명 ---------- */
const TERMS = {
  '갈고리': '첫 세 문단 안에 독자를 붙잡는 장치. 위기, 이상한 상황, 센 대사, 궁금한 정보로 시작해요.',
  '절단': '회차 마지막 줄. 다음 화를 누르게 만드는 끊는 자리예요. 새 인물의 등장, 위기 직전, 주인공의 선언, 반전 정보가 흔해요.',
  '보상': '한 화 안에서 독자가 받는 기쁨. 사이다(통쾌함), 설렘, 성장, 반전 같은 것. 매 화 하나는 있어야 해요.',
  '사이다': '답답함을 한 번에 풀어 주는 통쾌한 장면. 앞에서 쌓은 답답함이 클수록 시원해요.',
  '떡밥': '나중에 풀릴 궁금증을 미리 던져 둔 것. 던진 것은 언젠가 회수해야 믿음이 생겨요.',
  '비축분': '써 두었지만 아직 올리지 않은 회차. 연재가 밀리지 않게 하는 여유분이에요.',
  '로그라인': '작품을 한 문장으로 말한 것. 누가, 무엇을 원하고, 무엇이 막는지가 들어가요.',
  '대사 비율': '전체 글 중 대사가 차지하는 비율. 상업 웹소설은 대략 30~45%가 많아요.',
  '대사': '전체 글 중 대사가 차지하는 비율. 상업 웹소설은 대략 30~45%가 많아요.',
  '문단 길이': '문단 하나의 글자 수(가운데값). 휴대폰에서 끊어 읽기 좋은 길이를 보는 수치예요.',
  '문단': '문단 하나의 글자 수(가운데값). 휴대폰에서 끊어 읽기 좋은 길이를 보는 수치예요.',
  '원고지': '200자 원고지로 센 매수(대략). 공모전·출판 분량을 말할 때 써요.',
  '분량': '공백을 뺀 글자 수. 연재처마다 기준(공백 포함·제외)이 다르니 확인이 필요해요.',
  '스프린트': '정한 시간 동안 고치지 않고 몰아서 쓰는 방법. 퇴고는 나중에.',
  ...Object.fromEntries(Object.values(HABITS).map(h => [h.name, h.tip])),
};
function termExample(term){
  const key = term.replace(/ 비율| 길이/, '');
  const hit = allHighlights().find(n => (n.note || '').includes(key)); return hit ? `예) ${hit.work}: 「${hit.text.slice(0, 60)}${hit.text.length > 60 ? '…' : ''}」` : '';
}
function bindTerms(root = document){
  root.querySelectorAll('.term:not([data-b])').forEach(el => {
    el.dataset.b = 1;
    const show = () => { const t = el.dataset.term || el.textContent.trim(); const def = TERMS[t]; if (!def) return; const pop = $('#termPop'); const ex = termExample(t); pop.innerHTML = `<b>${esc(t)}</b><div>${esc(def)}</div>${ex ? `<div class="ex">${esc(ex)}</div>` : ''}`; pop.hidden = false; const r = el.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px'; pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight ? r.top - pop.offsetHeight - 8 : r.bottom + 8) + 'px'; };
    el.addEventListener('mouseenter', show); el.addEventListener('mouseleave', () => $('#termPop').hidden = true);
    el.addEventListener('click', ev => { if (isTouch()){ ev.stopPropagation(); $('#termPop').hidden ? show() : ($('#termPop').hidden = true); } });
  });
}
document.addEventListener('click', e => { if (!e.target.closest('.term, #termPop')) $('#termPop').hidden = true; });
// 원고 아래 막대의 말들에도 설명을 붙인다
bindTerms($('#studio'));

// 통계 화면 아래: 참고 작품과 나란히, 내가 고치는 패턴
function stStatsExtra(){ const p = stProj(); const eps = stEps().filter(e => e.chars > 200);
  const mine = (() => { if (!eps.length) return null; const acc = {chars: 0, median: 0, dlg: 0, sentAvg: 0}; for (const e of eps.slice(-30)){ const a = analyze(stEpText(e.id)); for (const k in acc) acc[k] += a[k]; } const n = Math.min(30, eps.length); for (const k in acc) acc[k] = Math.round(acc[k] / n); return acc; })();
  const r = p?.ref ? store.get('st.refstat.' + p.ref, null) : null;
  const v = $('#stStatsView');
  if (mine) v.insertAdjacentHTML('beforeend', `<div class="st-sec"><h3>내 글과 참고 작품 (최근 30화 평균)</h3>${r ? `<table class="st-tbl"><tr><th></th><th>내 작품</th><th>${esc(r.name)}</th><th>차이를 보는 법</th></tr>
      <tr><td><span class="term" data-term="분량">분량</span></td><td class="n">${mine.chars.toLocaleString()}자</td><td class="n">${r.chars.toLocaleString()}자</td><td class="hint">유료 연재는 한 화 분량이 들쭉날쭉하면 결제 만족도가 떨어져요.</td></tr>
      <tr><td><span class="term" data-term="대사 비율">대사 비율</span></td><td class="n">${mine.dlg}%</td><td class="n">${r.dlg}%</td><td class="hint">대사가 적으면 설명이 길어지고, 많으면 장면이 가벼워져요.</td></tr>
      <tr><td><span class="term" data-term="문단 길이">문단 길이</span></td><td class="n">${mine.median}자</td><td class="n">${r.median}자</td><td class="hint">휴대폰 한 화면에 문단 서너 개가 보이는 게 보통이에요.</td></tr>
      <tr><td>문장 평균</td><td class="n">${mine.sentAvg}자</td><td class="n">${r.sentAvg}자</td><td class="hint">문장이 짧을수록 빠르게 읽혀요. 감정이 큰 장면은 일부러 늘이기도 해요.</td></tr></table>` : '<div class="hint">작품 정보에서 참고 작품을 고르면 나란히 보여요.</div>'}</div>`);
  v.insertAdjacentHTML('beforeend', '<div class="st-sec"><h3>내가 고치는 패턴</h3><div id="stRevBox"></div></div>');
  stRenderRevision(); bindTerms(v);
}
