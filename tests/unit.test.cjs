const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const src = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
function grab(name){ const i = src.indexOf((name.startsWith('const') ? '' : 'function ') + name.replace(/^const /,'')); const start = src.lastIndexOf('\n', i) + 1; let j = src.indexOf('{', i), depth = 0; for (; j < src.length; j++){ if (src[j] === '{') depth++; else if (src[j] === '}'){ depth--; if (!depth) break; } } return src.slice(start, j + 1); }
const asyncGrab = n => 'async ' + grab(n).replace(/^async /, '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const stCount = t => (t || '').replace(/\s/g, '').length;
eval(grab('mergeOrdered')); eval(grab('lcsOps')); eval(grab('diffHTML'));
const reSrc = src.match(/const EP_HEAD_RE = (.*);\n/)[1]; const EP_HEAD_RE = eval(reSrc); eval(grab('splitCombined'));
// mergeOrdered
const A = [{id:'a',t:1},{id:'b',t:5,title:'B-new'},{id:'c',t:1}];            // 컴퓨터: b 고침
const B = [{id:'a',t:1},{id:'b',t:2},{id:'x',t:3},{id:'c',t:1},{id:'y',t:4}]; // 아이폰: x, y 새로 만듦
console.log('merge:', mergeOrdered(A, B, new Set()).map(x => x.id + (x.title ? '*' : '')).join(','), '| with dead c:', mergeOrdered(A, B, new Set(['c'])).map(x=>x.id).join(','));
// split
let big = '작품 소개 '.repeat(100) + '\n\n'; for (let i = 1; i <= 6; i++) big += `\n제${i}화 어떤 제목\n\n` + `본문 ${i} `.repeat(300) + '\n“3화는 안 돼.”\n';
const parts = splitCombined(big); console.log('split:', parts.map(p => p.title + ':' + stCount(p.text)).join(' | '));
console.log('no split plain:', splitCombined('그냥 글\n1\n2\n3\n'.repeat(3)));
let b2 = ''; for (let i = 1; i <= 5; i++) b2 += `<${i}화>\n` + '글 '.repeat(200) + '\n'; console.log('split <n화>:', splitCombined(b2)?.length);
let b3 = ''; for (let i = 1; i <= 4; i++) b3 += `#${i}\n` + '글 '.repeat(200) + '\n'; console.log('split #n:', splitCombined(b3)?.length);
// diff
const d = diffHTML('첫 문단이다.\n\n둘째 문단은 그대로.\n\n셋째', '첫 문단이었다.\n\n둘째 문단은 그대로.\n\n셋째\n\n넷째 새 문단'); console.log('diff:', d.add, d.del, d.html.includes('<ins>'), d.html.includes('<del>'), d.html.includes('class="a"'));
// gdSyncTexts with mocks
(async () => {
  const TXT = {cache: new Map(), dirty: new Set()}; const idb = {tx: async () => {}}; const toast = m => console.log('  toast:', m);
  const txtReady = async () => {}, txtFlushNow = async () => { TXT.dirty.clear(); }, stFlush = () => {};
  const drive = new Map(); const files = new Map();
  const gdGet = async (f, n) => drive.has(n) ? new Blob([drive.get(n)]) : null;
  const gdPut = async (f, n, blob) => { drive.set(n, await blob.text()); files.set(n, {}); };
  const gdDel = async (f, n) => { drive.delete(n); files.delete(n); };
  eval(asyncGrab('gdSyncTexts').replace(/^async async/, 'async'));
  // 기기 A에 처음 원고 → 올림
  TXT.cache.set('p/e1', {k:'p/e1', text:'A의 원고', t:100, syncedT:0});
  let r = await gdSyncTexts(files, {}, new Set()); console.log('first up:', r.up, drive.get('txt-p_e1.txt'));
  let idx = r.index;
  // 다른 기기(B)에서 고쳐 올렸다고 치고(t=200), A도 그사이 고침(t=150) → 겹침
  drive.set('txt-p_e1.txt', 'B가 고친 원고'); idx = {...idx, 'p/e1': 200};
  TXT.cache.get('p/e1').text = 'A가 또 고친 원고'; TXT.cache.get('p/e1').t = 150;
  r = await gdSyncTexts(files, idx, new Set()); const l = TXT.cache.get('p/e1');
  console.log('conflict:', r.conflict, '| main:', l.text, '| other:', l.other, '| drive:', drive.get('txt-p_e1.txt'));
  // 원격만 바뀜 → 받음
  drive.set('txt-p_e1.txt', 'B 최신'); r = await gdSyncTexts(files, {'p/e1': 300}, new Set()); console.log('down:', r.down, TXT.cache.get('p/e1').text);
  // 지움 → 양쪽에서 사라짐
  r = await gdSyncTexts(files, {'p/e1': 300}, new Set(['p/e1'])); console.log('deleted:', TXT.cache.has('p/e1'), drive.has('txt-p_e1.txt'));
})();
