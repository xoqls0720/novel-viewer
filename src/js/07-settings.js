/* ================= 설정·이벤트 ================= */
const SETTINGS = ['indent','dimLv','model','effort','fs','lh','pgap','col','rfont','align','autoNext','ttsRate','wcol','spread','rtl','fit','coverSingle','splitWide','crop','keepLocal','specMin','specMax','specPara','specDlgMin','specDlgMax','voice','wKind','wRating','wStyle','wLen','wRef','wNotes','naiRating','naiUse','provider','gemModel','olUrl','olModel','grModel','aiProv','wProv','naiProv','stProv'];
$('#keepLocal').checked = isTouch() || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
for (const id of SETTINGS){
  const el = $('#'+id); const v = store.get('set.'+id, null);
  if (v !== null){ if (el.type === 'checkbox') el.checked = v; else { el.value = v; if (el.tagName === 'SELECT' && el.value === '') el.selectedIndex = 0; } }
  el.addEventListener('change', () => {
    store.set('set.'+id, el.type === 'checkbox' ? el.checked : el.value); applyView(); aiHint();
    if (curText && ['specMin','specMax','specPara','specDlgMin','specDlgMax'].includes(id)) renderEpStats();
    if (['spread','rtl','fit','coverSingle','splitWide','crop'].includes(id) && cur && !isText(cur.eps[curEp])) openEp(curEp, {f: getFrac()});
    if (['col','fs','lh','pgap','rfont','align','indent'].includes(id) && $('#reader.paged')) setFrac(getFrac());
  });
}
const OUTS = {dimLv: v => v + '%', warmLv: v => v + '%', weight: v => v, ls: v => (+v).toFixed(2), lh: v => (+v).toFixed(2), pgap: v => (+v).toFixed(1), margin: v => v + 'px', col: v => v + 'px', wcol: v => v + 'px', ttsRate: v => (+v).toFixed(1) + '배'};
function applyView2(){
  const s = document.documentElement.style;
  s.setProperty('--fw', $('#weight').value); s.setProperty('--ls', $('#ls').value + 'em'); s.setProperty('--mx', $('#margin').value + 'px'); s.setProperty('--wgap', $('#gap').value);
  $('#warm').style.opacity = (+$('#warmLv').value / 100).toFixed(2);
  for (const [id, f] of Object.entries(OUTS)){ const o = $('#'+id+'Out'); if (o) o.textContent = f($('#'+id).value); }
}
let epRev = false;   // 회차 목록 순서 뒤집기
// 슬라이더의 채워진 부분(--pct)을 값에 맞춘다
function rangeFill(el){ const min = +el.min || 0, max = +el.max || 100; const v = Math.min(max, Math.max(min, +el.value || 0)); el.style.setProperty('--pct', (max > min ? (v - min) / (max - min) * 100 : 0) + '%'); }
document.addEventListener('input', e => { if (e.target.matches?.('input[type=range]')) rangeFill(e.target); }, true);
function applyView(){
  const s = document.documentElement.style;
  s.setProperty('--fs', $('#fs').value+'px'); s.setProperty('--lh', $('#lh').value); s.setProperty('--pgap', $('#pgap').value+'em');
  s.setProperty('--col', $('#col').value+'px'); s.setProperty('--rfont', $('#rfont').value); s.setProperty('--align', $('#align').value);
  s.setProperty('--wcol', $('#wcol').value+'px'); s.setProperty('--indent', $('#indent').value);
  $('#fsOut').textContent = $('#fs').value; $('#dim').style.opacity = (+$('#dimLv').value/100).toFixed(2);
  $$('input[type=range]').forEach(rangeFill);
  applyView2();
}
function aiHint(){
  for (const id of Object.keys(PROV)){ const el = $('#st-'+id); if (!el) continue; const P = PROV[id]; el.textContent = P.key ? (store.get(P.key,'') ? '키 저장됨' : '키 없음') : (store.get('olOk', false) ? '연결됨' : '확인 전'); el.className = 'kst ' + ((P.key ? store.get(P.key,'') : store.get('olOk', false)) ? 'ok' : ''); }
  $$('.keyHint').forEach(el => {
    const sel = el.closest('.row')?.querySelector('.provSel'); const prov = provOf(sel ? '#'+sel.id : null), P = PROV[prov];
    const ready = !P.key || store.get(P.key, '');
    const extra = prov === 'claude' ? ` · 생각 깊이 ${$('#effort').selectedOptions[0]?.text || ''}` : '';
    el.textContent = ready ? `${P.name} · ${P.model()}${extra}` : `설정 탭에 ${P.name} API 키를 넣으면 쓸 수 있어요.`;
  });
}
function keySaved(id){ const el = $('#'+id); if (el) el.placeholder = store.get(id,'') ? '저장됨 (바꾸려면 새로 입력)' : ({apiKey:'sk-ant-...', gemKey:'AIza...', grKey:'gsk_...'})[id]; }
function saveKey(id){ const v = $('#'+id).value.trim(); if (!v) return; store.set(id, v); $('#'+id).value=''; keySaved(id); aiHint(); toast('API 키를 저장했어요'); }
function delKey(id){ store.set(id, ''); keySaved(id); aiHint(); toast('API 키를 지웠어요'); }
$('#keySave').onclick = () => saveKey('apiKey');
$('#keyDel').onclick = () => delKey('apiKey');
$$('[data-ksave]').forEach(b => b.onclick = () => saveKey(b.dataset.ksave));
$$('[data-kdel]').forEach(b => b.onclick = () => delKey(b.dataset.kdel));
KEY_IDS.forEach(keySaved);
// 기본으로 고른 AI의 칸만 펼쳐 둔다
function provReveal(){ $$('details.prov').forEach(d => { d.open = d.dataset.prov === provOf(); }); }
provReveal(); $('#provider').addEventListener('change', provReveal);
$('#olTest').onclick = async () => {
  try{
    const r = await fetch(olBase() + '/api/tags'); if (!r.ok) throw new Error(r.status);
    const ms = (await r.json()).models || [];
    $('#olList').innerHTML = ms.map(m => `<option value="${esc(m.name)}">`).join('');
    store.set('olOk', true); aiHint();
    if (!ms.length) return toast('Ollama는 켜져 있는데 받은 모델이 없어요. ollama pull gemma3:12b 를 먼저 해 주세요');
    if (!ms.some(m => m.name === $('#olModel').value.trim())){ $('#olModel').value = ms[0].name; store.set('set.olModel', ms[0].name); aiHint(); }
    toast(`Ollama 연결됨 · 모델 ${ms.length}개`);
  }catch{ store.set('olOk', false); aiHint(); toast('Ollama에 연결하지 못했어요. Ollama_켜기.bat을 실행했는지 확인해 주세요'); }
};
$('#spentReset').onclick = () => { store.set('spent', {in:0,out:0,cache:0,n:0}); showSpent(); };
$('#storeClear').onclick = async () => { if (!confirm('이 기기에 저장한 작품 파일을 모두 지울까요? (메모·진도·설정은 남아요)')) return; await idb.clear(); showStore(); toast('지웠어요'); };
$('#bkOut').onclick = () => {
  const data = {}; for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if (k.startsWith('nv.') && !/^nv\.(apiKey|gemKey|grKey|gd\.secret)$/.test(k)) data[k] = localStorage.getItem(k); }
  download('Novelist_백업.json', JSON.stringify(data), 'application/json');
};
$('#bkIn').onclick = () => $('#bkFile').click();
$('#bkFile').onchange = async e => { try{ const d = JSON.parse(await e.target.files[0].text()); for (const [k,v] of Object.entries(d)) if (k.startsWith('nv.') && !/^nv\.(apiKey|gemKey|grKey|gd\.secret)$/.test(k)) localStorage.setItem(k, v); toast('가져왔어요. 새로 고침하면 반영돼요'); }catch{ toast('백업 파일을 읽지 못했어요'); } e.target.value = ''; };

function openTool(tab){
  const a = $('#app');
  if (isMobile()) a.classList.add('show-tool'); else a.classList.remove('hide-tool');
  $$('.tabs button[data-tab]').forEach(x=>x.classList.toggle('on', x.dataset.tab===tab)); $$('.pane').forEach(p=>p.classList.toggle('on', p.id==='pane-'+tab));
  if (tab === 'notes'){ renderNotes(); renderScraps(); renderBm(); renderIdeas(); } if (tab === 'set') showStore();
}
$('#btnFolder').onclick = () => $('#pickFolder').click();
$('#btnFiles').onclick = () => $('#pickFiles').click();
$('#pickFolder').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#pickFiles').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#libSearch').oninput = renderLib;
$('#libSort').onchange = () => { store.set('set.libSort', $('#libSort').value); renderLib(); };
$('#libSort').value = store.get('set.libSort', 'name');
const drop = $('#drop');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = async e => {
  e.preventDefault(); drop.classList.remove('over');
  const entries = [...e.dataTransfer.items].map(it => it.webkitGetAsEntry?.()).filter(Boolean);   // 첫 await 전에 모두 꺼내 둔다
  const out = [];
  async function walk(entry, path){
    if (entry.isFile) await new Promise(res => entry.file(f => { f._rel = path + f.name; out.push(f); res(); }, res));
    else if (entry.isDirectory){
      const rd = entry.createReader(); let batch;
      do { batch = await new Promise(res => rd.readEntries(res, () => res([]))); for (const en of batch) await walk(en, path + entry.name + '/'); } while (batch.length);
    }
  }
  for (const en of entries) await walk(en, '');
  addFiles(out);
};
$('#epSel').onchange = e => openEp(+e.target.value);
$('#prev').onclick = () => cur && curEp > 0 && openEp(curEp-1);
$('#next').onclick = () => cur && curEp < cur.eps.length-1 && openEp(curEp+1);
$('#mode').onchange = () => { if (!cur) return; if (cur.kind === 'novel') store.set('set.pagedDefault', $('#mode').value === 'paged'); openEp(curEp, {f: getFrac()}); };
$('#tgSide').onclick = () => { const a=$('#app'); if (isMobile()) a.classList.toggle('show-side'); else a.classList.toggle('hide-side'); };
$('#sideClose').onclick = () => $('#app').classList.remove('show-side');
$('#tgTool').onclick = () => { const a=$('#app'); if (isMobile()) a.classList.toggle('show-tool'); else a.classList.toggle('hide-tool'); };
$('#toolClose').onclick = () => $('#app').classList.remove('show-tool');
function setTheme(t, save = true){ document.documentElement.dataset.theme = t; if (save) store.set('theme', t); $$('#themeSw button').forEach(b => b.classList.toggle('on', b.dataset.theme === t)); }
$$('#themeSw button').forEach(b => b.onclick = () => setTheme(b.dataset.theme));
$$('.tabs button[data-tab]').forEach(b => b.onclick = () => openTool(b.dataset.tab));

setTheme(store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), false);
applyView(); aiHint(); showSpent();

let anTimer;
let lastY = 0;
$('#reader').addEventListener('scroll', () => {
  updateProgress(); savePos();
  const y = $('#reader').scrollTop, dy = y - lastY; lastY = y;
  if (!scrubbing && Date.now() > hideBlock && cur && Math.abs(dy) > 18 && !$('.sheet.open')) $('#app').classList.toggle('immersive', dy > 0 && y > 80);   // 내리면 숨기고 올리면 보이기
  clearTimeout(anTimer);
  const r = $('#reader');
  if ($('#autoNext').value === 'auto' && !$('#btnTTS').classList.contains('on') && cur && !$('#reader.paged') && !$('#reader .manga')
      && r.scrollTop > 0 && r.scrollTop + r.clientHeight >= r.scrollHeight - 2 && curEp < cur.eps.length-1)
    anTimer = setTimeout(() => { if (r.scrollTop + r.clientHeight >= r.scrollHeight - 2) openEp(curEp+1); }, 1200);
});
document.addEventListener('keydown', e => {
  if ($('#sketch').classList.contains('open')){ if (e.key === 'Escape') $('#sketch').classList.remove('open'); else if ((e.ctrlKey || e.metaKey) && e.key === 'z'){ e.preventDefault(); $('#skUndo').click(); } return; }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const rtl = $('#rtl').value === '1';
  if (e.key === '[') $('#prev').click();
  else if (e.key === ']') $('#next').click();
  else if ($('#reader .manga') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); mangaStep((e.key === 'ArrowLeft') === rtl ? 1 : -1); }
  else if ($('#reader.paged') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); pageTurn(e.key === 'ArrowRight' || e.key === 'PageDown' ? 1 : -1); }
  else if (e.key === 't' || e.key === 'T') $('#btnTTS').click();
  else if (e.key === 'a' || e.key === 'A') $('#tgTool').click();
  else if (e.key === '/') { e.preventDefault(); openTool('find'); $('#findQ').focus(); }
  else if (e.key === 'f' || e.key === 'F') $('#app').classList.toggle('immersive');
  else if (e.key === 'Escape') { $('#selbar').style.display = 'none'; closeSheets(); $('#app').classList.remove('immersive'); }
});
addEventListener('resize', () => { if ($('#reader.paged')) setFrac(getFrac()); });


/* ================= 회차 목록·보기 설정·아래 막대 ================= */
function closeSheets(){ const open = $$('.sheet.open'); open.forEach(x => x.classList.remove('open')); $('#btnQuick').classList.remove('on'); return open.length > 0; }
function renderEpList(){
  const list = $('#epList'); list.innerHTML = ''; if (!cur) return;
  const q = $('#epFind').value.trim(); const read = new Set(store.get('read.'+cur.key, []));
  const frag = document.createDocumentFragment();
  cur.eps.forEach((e, i) => {
    if (q && !e.name.includes(q)) return;
    const d = document.createElement('div'); d.className = 'it' + (i === curEp ? ' cur' : '') + (read.has(i) ? ' read' : '');
    d.innerHTML = `<span class="no">${i+1}</span><span class="nm"></span>`; d.querySelector('.nm').textContent = e.label || e.name;
    d.onclick = () => { closeSheets(); openEp(i); };
    frag.append(d);
  });
  list.append(frag);
  if (epRev) [...list.children].reverse().forEach(c => list.append(c));
  list.querySelector('.cur')?.scrollIntoView({block:'center'});
  epSplitBtn();
}
$('#epBtn').onclick = () => { if (!cur) { isMobile() ? $('#app').classList.add('show-side') : $('#app').classList.remove('hide-side'); return; } const open = $('#epDrawer').classList.contains('open'); closeSheets(); if (!open){ $('#epDrawer').classList.add('open'); $('#epFind').value = ''; renderEpList(); } };
$('#epClose').onclick = closeSheets;
$('#epFind').oninput = () => renderEpList();
$('#btnQuick').onclick = () => { const open = $('#quick').classList.contains('open'); closeSheets(); if (!open){ $('#quick').classList.add('open'); $('#btnQuick').classList.add('on'); } };
$('#fsDown').onclick = () => { $('#fs').value = Math.max(12, +$('#fs').value - 1); $('#fs').dispatchEvent(new Event('change')); };
$('#fsUp').onclick = () => { $('#fs').value = Math.min(34, +$('#fs').value + 1); $('#fs').dispatchEvent(new Event('change')); };
for (const id of ['lh','pgap','col','wcol','dimLv']) $('#'+id).addEventListener('input', () => { applyView(); if ($('#reader.paged')) setFrac(getFrac()); });
$('#wFolder').onclick = () => $('#pickFolder').click();
$('#wFiles').onclick = () => $('#pickFiles').click();
$('#scrub').addEventListener('input', () => {
  if (!cur) return; scrubbing = true; quiet(); const f = +$('#scrub').value / 1000;
  if ($('#reader .manga')){ $('#pageInd').textContent = `${Math.min(curImgs.length, Math.floor(f * curImgs.length) + 1)} / ${curImgs.length}`; }
  else { setFrac(f); $('#pageInd').textContent = `${Math.round(f*100)}%`; }
});
$('#scrub').addEventListener('change', async () => {
  const f = +$('#scrub').value / 1000;
  if ($('#reader .manga')){ mangaPos = await snapSpread(Math.min(curImgs.length-1, Math.floor(f * curImgs.length))); await renderManga(); }
  quiet(); scrubbing = false; updateProgress(); savePos();
});
let swallowClick = 0;
document.addEventListener('pointerdown', e => { if ($('.sheet.open') && !e.target.closest('.sheet, #epBtn, #btnQuick, #btnLink')){ closeSheets(); swallowClick = Date.now(); } }, true);
document.addEventListener('click', e => { if (Date.now() - swallowClick < 600 && !e.target.closest('.sheet')){ e.stopPropagation(); e.preventDefault(); swallowClick = 0; } }, true);


