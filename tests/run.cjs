// 시험 전부 돌리기: node tests/run.cjs   (먼저 python3 build.py 로 index.html 을 만든다)
// 각 시험의 출력에서 반드시 나와야 하는 줄을 확인한다. 하나라도 빠지면 실패.
const {execFileSync, spawnSync} = require('child_process'); const fs = require('fs'); const path = require('path');
const D = __dirname;
if (!fs.existsSync(path.join(D, 'data'))) execFileSync('python3', [path.join(D, 'make_data.py')], {stdio: 'inherit'});
fs.mkdirSync(path.join(D, 'out'), {recursive: true});
const EXPECT = {
  unit: [/merge: a,b\*,x,c,y \| with dead c: a,b,x,y/, /split: 처음:\d+ \| 제1화/, /no split plain: null/, /split <n화>: 5/, /split #n: 4/, /diff: \d+ \d+ true true true/, /conflict: 1 \| main: B가 고친 원고 \| other: A가 또 고친 원고/, /down: 1 B 최신/, /deleted: false false/],
  reader: [/epTitle: 1화/, /eplist: 4/, /after pick: 3화/, /theme: black fs: 20px/, /chat: 3 reqs; last msgs: user:text\*\+text \| assistant:str \| user:text/, /mark: \[ 'g:/, /scraps: 1 \| notes: 1/, /pdf: download/, /procreate: download/, /manga pageInd: 3 \/ 99/, /ERRORS: \[\]/],
  ai: [/coach shown: true/, /bm on: true/, /paged ind: \d+ \/ \d+쪽/, /weight out\/var: 550 550/, /after reset weight: 400/, /status: 키 없음 \/ 키 저장됨 \/ 키 저장됨 \/ 연결됨/, /gemini chat: \[ '제미나이 답' \]/, /gemini follow-up roles: user,model,user/, /groq: 그록 답 Bearer gsk_test/, /ollama write: 올라마 답/, /additionalProperties: false \| out fields: 4/, /nai groq fields: 4/, /bm list: 1/, /backup has keys: \[\]/, /ERRORS: none/],
  studio: [/find count: 2곳/, /replaced: 2/, /binder part: \[ '1부 깨어남' \]/, /sys has syn: true \| bible sent: true/, /inserted: true/, /syn: 청명이 거지에게/, /cards: 4/, /after drag order: \[ '4화', '1화 검을 뽑다', '2화', '3화' \]/, /outline rows: 6/, /meta: 천하제일검이/, /snaps: 1/, /auto studio: true/, /to library: true/, /ERRORS: none/],
  safety: [/migrated text: 예전에 쓴 원고다.*ls removed: true/, /2MB persisted: true/, /insert: true \| undo: true/, /spell items: 2/, /spell fixed: 예전에 쓴 원고다\. 안 돼 없는 말\./, /comment marks: \[ '예전에 쓴 ' \] \| list: 1/, /diff view: true .*\+6자/, /export count: 내보낼 글: 공백 포함 \d+자/, /ref items: 1/, /craft sent: true \| not in bible: true/, /import split eps: 9/, /reader split eps: 8 \| btn: 합본 나누기 끄기/, /after off: 1/, /ERRORS: none/],
  scale: [/eps: 301/, /after reload eps: 301/, /끝300/, /끝150/, /sample: 청운이/, /errs \[\]/],
  drive: [/scope asked: .*drive\.appdata .*drive\.readonly/, /root folders: \[ '공유 문서함', '노벨', '웹툰' \]/, /sources: \[ '노벨' \] \| status: 파일 2개/, /works: \[ '화산귀환' \]/, /ep text: true \| media hits: 1/, /offline works: \[ '화산귀환' \]/, /offline ep text: true/, /ERRORS: none/],
  extras: [/title: Novelist \| brand: Novelist/, /mobile css@1024: true/, /side open: true/, /tool open@1024: true/, /idea: \[ '검은 태양 아래에서만 피는 꽃' \]/, /free canvas: true 1240x1754/, /craft saved: \[ '작법:/, /ref ideas: \[ '검은 태양/, /inserted: true/, /docx zip: true \| has document: true/, /ERRORS: none/],
  split: [/filter chips: \[ '전체 3', '#장면 1', '#대사 1' \]/, /filtered: \[ '너는 왜 웃어 #대사' \]/, /split: true \| pane w>250: true \| text w>300: true/, /rp work: hwasan · 소설 \| paras: true/, /rp next: 0 → 1/, /rp idea saved: true \| from: hwasan · 2화/, /closed: true/, /hwpx zip: true \| mimetype first: true/, /hwpx text: true/, /ERRORS: none/],
  libsync: [/A status: 작품 4개가 클라우드에 있어요/, /cloud files: library\.json true \| LW 4 \| LF 9/, /no empty uploads: true/, /index works: \[ '만화\/deathnote', '소설\/hwasan', '소설\/oldman', '웹툰\/misaeng' \]/, /A rows: \[ '올림', '올림', '올림', '올림' \]/, /re-run uploads nothing new: true/, /B works: \[ 'deathnote', 'hwasan', 'misaeng', 'oldman' \]/, /B novel text: true \| downloads: [12]/, /B webtoon imgs: 6/, /B offline works: \[ 'deathnote', 'hwasan', 'misaeng', 'oldman' \]/, /after delete: \[ '소설\/hwasan', '소설\/oldman', '웹툰\/misaeng' \]/, /ERRORS: none/],
  sketch: [/paper: 1754x1240 \| pixel grid: true/, /pen seen: true \| finger draws: false/, /pinch zoom: true/, /fit reset: true/, /saved strokes after 2-finger undo: 1 \| pressure stroke: true \| p varied: true/, /goodnotes pdf: %PDF/, /procreate psd: 8BPS/, /procreate png: PNG/, /open mode copied image: image\/png \| toast: true/, /open fallback to share: true/, /imported size: 60x90/, /close asks when changed: true/, /scraps after import: 3/, /other-app files imported: 3 /, /psd rle colors: true true 120x80/, /ERRORS: none/],
  learn: [/out body: "다듬은 문장이다\. 그는 웃었다\." \| reasons: \[ '리듬', '중복' \] \| diff: true/, /memo: 절단은/, /craft note card: \[ '내 퇴고 노트/, /mirror: 같은 어미 연속=\d+/, /marks hb: \d+/, /compare rows: 5/, /자주 지우는 말갑자기/, /meter ref: true/, /term pop: true/, /ERRORS: none/],
};
const only = process.argv.slice(2); let fail = 0;
for (const [name, pats] of Object.entries(EXPECT)){
  if (only.length && !only.includes(name)) continue;
  const t0 = Date.now(); const r = spawnSync('node', [path.join(D, name + '.test.cjs')], {encoding: 'utf8', timeout: 300000});
  const out = (r.stdout || '') + (r.stderr || ''); fs.writeFileSync(path.join(D, 'out', name + '.log'), out);
  const miss = pats.filter(p => !p.test(out));
  if (miss.length || r.status !== 0){ fail++; console.log(`✗ ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`); miss.forEach(p => console.log('   없음:', p)); if (r.status) console.log('   종료 코드', r.status, '— tests/out/' + name + '.log'); }
  else console.log(`✓ ${name} (${((Date.now() - t0) / 1000).toFixed(0)}s, ${pats.length}개 확인)`);
}
process.exit(fail ? 1 : 0);
