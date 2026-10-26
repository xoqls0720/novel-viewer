/* ================= 수치 분석 ================= */
function analyze(text){
  const lines = text.split('\n').map(s=>s.trim()).filter(Boolean);
  const chars = text.replace(/\s/g,'').length;
  const paras = text.split(/\n\s*\n/).map(p=>p.replace(/\s/g,'').length).filter(n=>n>0);
  const pl = (paras.length > lines.length/3 ? paras : lines.map(l=>l.replace(/\s/g,'').length)).sort((a,b)=>a-b);
  const median = pl.length ? pl[Math.floor(pl.length/2)] : 0;
  const isDlg = l => /^[“"‘'「『]/.test(l) || /^[^\s:：]{1,12}[:：]\s*["“]/.test(l);
  const dlgChars = lines.filter(isDlg).reduce((s,l)=>s+l.length,0);
  const totChars = lines.reduce((s,l)=>s+l.length,0) || 1;
  const sents = text.split(/(?<=[.!?…])\s+/).map(s=>s.trim().length).filter(n=>n>2&&n<500);
  const sentAvg = sents.length ? Math.round(sents.reduce((a,b)=>a+b,0)/sents.length) : 0;
  const freq = {}; for (const w of (text.match(/[가-힣]{2,}/g) || [])) freq[w] = (freq[w]||0)+1;
  const top = Object.entries(freq).filter(([w,c]) => c >= 3 && !/^(그리고|하지만|그러나|그런데|그래서|있었다|없었다|것이다|했다|하는|있는|그는|그녀는|자신의|그것은|이제|다시|정말|그냥)$/.test(w)).sort((a,b)=>b[1]-a[1]).slice(0,8);
  return {chars, median, dlg: Math.round(dlgChars/totChars*100), sentAvg, lines: lines.length, last: lines.slice(-3), top};
}
const spec = () => ({min:+$('#specMin').value, max:+$('#specMax').value, para:+$('#specPara').value, dmin:+$('#specDlgMin').value, dmax:+$('#specDlgMax').value});
function statHTML(a, withTop=true){
  const s = spec();
  const ok = (c) => c ? '<span class="good">기준 안</span>' : '<span class="bad">기준 밖</span>';
  return `<div class="kv">
    <span>분량(공백 제외)</span><span class="v">${a.chars.toLocaleString()}자</span><span class="s">${ok(a.chars>=s.min&&a.chars<=s.max)}</span>
    <span>문단 중앙값</span><span class="v">${a.median}자</span><span class="s">${ok(a.median<=s.para)}</span>
    <span>대사 비율</span><span class="v">${a.dlg}%</span><span class="s">${ok(a.dlg>=s.dmin&&a.dlg<=s.dmax)}</span>
    <span>문장 평균</span><span class="v">${a.sentAvg}자</span><span class="s"></span>
    <span>읽는 시간</span><span class="v">약 ${Math.max(1, Math.round(a.chars/500))}분</span><span class="s"></span>
  </div>
  ${withTop && a.top.length ? `<h3>자주 나온 말</h3><div class="hint">${a.top.map(([w,c])=>`${esc(w)} ${c}`).join(' · ')}</div>` : ''}
  <h3>마지막 세 줄 (절단)</h3><div class="endlines">${a.last.map(esc).join('<br>')}</div>`;
}
function renderEpStats(){ $('#pane-stat').innerHTML = `<h3>${esc(cur.eps[curEp].name)}</h3>` + statHTML(analyze(curText)); }

let workStatToken = 0;
async function renderWorkStats(){
  const pane = $('#pane-work'); const w = cur;
  const del = w ? `<div class="row"><button id="workDel">이 작품을 기기 저장소에서 지우기</button></div>` : '';
  if (!w || !w.eps.some(isText)){ pane.innerHTML = '<div class="hint">소설 작품을 열면 회차별 수치를 보여 줘요.</div>' + del; bindWorkDel(); return; }
  // 드라이브 작품은 회차를 다 받아야 하니 눌렀을 때만 계산한다
  const remote = w.eps.filter(e => isText(e) && e.file?.remote).length;
  if (remote && !w._statsOk){ pane.innerHTML = `<div class="hint">구글 드라이브에 있는 작품이에요. 회차별 수치를 보려면 ${remote}화를 내려받아요(한 번 받은 화는 기기에 남아요).</div><div class="row"><button class="primary" id="workStatGo">회차 수치 계산하기</button></div>` + del; $('#workStatGo').onclick = () => { w._statsOk = true; renderWorkStats(); }; bindWorkDel(); return; }
  const tok = ++workStatToken; pane.innerHTML = '<div class="hint">계산 중…</div>';
  const rows = [];
  for (let i=0;i<w.eps.length;i++){
    if (tok !== workStatToken) return;
    const e = w.eps[i]; if (!isText(e)) continue;
    const a = analyze(await epText(e)); if (a.chars < 200) continue;
    rows.push({i, name:e.name, ...a});
  }
  if (tok !== workStatToken) return;
  if (!rows.length){ pane.innerHTML = '<div class="hint">본문이 있는 회차가 없어요.</div>' + del; bindWorkDel(); return; }
  const avg = k => Math.round(rows.reduce((s,r)=>s+r[k],0)/rows.length);
  const max = Math.max(...rows.map(r=>r.chars));
  const pts = k => rows.map((r,j)=>`${(j/(Math.max(1,rows.length-1))*300).toFixed(1)},${(58-r[k]/(k==='chars'?max:100)*54).toFixed(1)}`).join(' ');
  pane.innerHTML = `<h3>${esc(w.name)} · ${rows.length}화</h3>
    <div class="kv"><span>평균 분량</span><span class="v">${avg('chars').toLocaleString()}자</span><span></span>
    <span>평균 문단 중앙값</span><span class="v">${avg('median')}자</span><span></span>
    <span>평균 대사 비율</span><span class="v">${avg('dlg')}%</span><span></span>
    <span>전체 분량</span><span class="v">${rows.reduce((s,r)=>s+r.chars,0).toLocaleString()}자</span><span></span></div>
    <h3>회차별 분량(파랑)·대사 비율(주황)</h3><svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none">
      <polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="${pts('chars')}"/>
      <polyline fill="none" stroke="var(--warn)" stroke-width="1" opacity=".7" points="${pts('dlg')}"/></svg>
    <h3>회차표 <span class="hint">· 마우스를 올리면 마지막 줄</span></h3><table class="ep"><tr><th>화</th><th>분량</th><th>문단</th><th>대사</th></tr>
    ${rows.map(r=>`<tr data-i="${r.i}" title="${esc(r.last[r.last.length-1]||'')}"><td>${esc(r.name.slice(0,18))}</td><td>${r.chars.toLocaleString()}</td><td>${r.median}</td><td>${r.dlg}%</td></tr>`).join('')}</table>
    <div class="row"><button id="csv">CSV로 저장</button></div>` + del;
  pane.querySelectorAll('tr[data-i]').forEach(tr => tr.onclick = () => openEp(+tr.dataset.i));
  $('#csv').onclick = () => download(w.name + '_회차분석.csv', '﻿화,분량,문단중앙값,대사%,문장평균,마지막줄\n' + rows.map(r=>[`"${r.name.replace(/"/g,'""')}"`,r.chars,r.median,r.dlg,r.sentAvg,`"${(r.last[r.last.length-1]||'').replace(/"/g,'""')}"`].join(',')).join('\n'), 'text/csv');
  bindWorkDel();
}
function bindWorkDel(){
  const b = $('#workDel'); if (!b || !cur) return;
  b.onclick = async () => { if (!confirm(`'${cur.name}'을 이 기기 저장소에서 지울까요? (메모와 진도는 남아요)`)) return; const paths = cur.paths || []; await idb.tx('readwrite', st => { for (const p of paths) st.delete(p); }); toast(`${paths.length}개 파일을 지웠어요`); showStore(); };
}

