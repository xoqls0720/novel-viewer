# 노벨 뷰어 고치는 법

앱은 `index.html` 파일 하나로 배포해요(설치·오프라인이 단순해서). 고칠 때는 `src/` 를 고치고 묶어요.

```
src/head.html        <head> (CSS 자리 {{CSS}})
src/body.html        읽기 화면 마크업 (집필실 자리 {{STUDIO}})
src/studio.html      집필실 마크업
src/css/app.css      읽기 화면·도구 스타일
src/css/studio.css   집필실 스타일
src/js/01-core.js         저장소(localStorage·IndexedDB), 공통 도구
src/js/02-library.js      서재: 폴더·zip·epub 읽기, 작품 카드
src/js/03-reader.js       열기·소설·웹툰·만화 보기, 형광펜·메모, 검색, 읽어 주기
src/js/04-analysis.js     회차 수치 분석
src/js/05-ai.js           AI 연결(Claude·Gemini·Ollama·Groq), 대화 상자
src/js/06-ai-tabs.js      AI 분석·글쓰기·그림 프롬프트 탭
src/js/07-settings.js     설정, 보기 설정, 회차 목록, 단축키
src/js/08-scenes.js       장면 노트(필기), 다른 앱으로 보내기(굿노트·프로크리에이트·PDF)
src/js/09-sync.js         구글 드라이브 동기화(목록 합치기·원고 파일 동기화)
src/js/10-reader-extras.js 책갈피·쪽 번호·화면 켜 두기·안내·작가 보기
src/js/11-texts.js        집필실 원고 저장소(IndexedDB 'texts')
src/js/12-studio.js       집필실 본체(작품·회차·원고·카드·개요·설정집·통계·AI 도우미)
src/js/13-studio-tools.js 되돌리기, 원고 메모, 내보내기, 판 비교, 맞춤법, 참고, 합본 나누기, 자동 백업, 아이폰 키보드
src/js/14-studio-learn.js 쓰면서 느는 장치(고친 이유·기억할 것·거울·퇴고 패턴·참고 작품·말 설명)
src/js/22-reader-more.js  폰 화면 보기·내 글꼴·방향키·읽기 과녁·필사 모드·첫 화면 이어 읽기
src/js/23-onedrive.js     OneDrive 로그인(PKCE)·앱 전용 폴더 맞추기·OneDrive 작품 폴더 연결
src/js/24-shell.js        새 틀: 왼쪽(폰은 아래) 메뉴 다섯 칸(홈·읽기·쓰기·웹툰·설정), 홈(이어 쓰기·이어 읽기), 서재 판
src/css/shell.css         새 틀의 색·간격 (맨 뒤에 붙어 앞 스타일을 덮는다)
src/js/26-media.js        영상 회차(디스크에서 흘려 보기·자막·이어 보기), 만화 세로/펼침 단추(V, 종류마다 기억), 무료 번역(내 컴퓨터 Ollama: 그림 모델로 말풍선, 글 모델로 자막), 받은 작품 자동 반영, 성인 칸 숨기기
src/css/media.css         영상·번역 칸 스타일
```

JS 파일은 번호 순서대로 이어 붙여 `<script type="module">` 하나가 돼요. 그래서 한 파일의 함수를 다른 파일에서 그냥 부를 수 있어요. 다만 시작할 때 바로 실행되는 코드가 뒤 파일의 `const`/`let` 을 건드리면 오류가 나니, 그런 값은 앞 파일에 두세요.

## 묶기와 시험

```bash
python3 build.py          # src → index.html
node tests/run.cjs        # 시험 전부 (처음엔 tests/data 에 가짜 작품을 만들어요)
node tests/run.cjs studio # 하나만
```

시험은 Playwright(크로미움)로 실제 화면을 눌러 보고, AI 서버는 가짜 응답으로 바꿔 둬요. 실제 키·아이폰·구글 로그인은 시험에 없어요.

## 올리기

`main` 에 올리면 GitHub Pages 가 https://xoqls0720.github.io/novel-viewer/ 로 내보내요. 올리기 전에 `sw.js` 의 `CACHE` 이름을 바꿔야 설치한 앱이 새 판을 받아요.

## 윈도우 프로그램(desktop/)

Electron 껍데기예요. 웹 앱을 `app://novel/` 주소로 띄우고, 구글 로그인(기본 브라우저 + 127.0.0.1:53682)과 자동 업데이트를 맡아요.

```bash
python3 build.py && cd desktop && npm ci
npm start            # 이 컴퓨터에서 실행
npm run dist         # 윈도우 설치 파일 → desktop/dist/ (리눅스에서는 wine, wine32 필요)
```

`v1.2.3` 같은 태그를 올리면 `.github/workflows/desktop.yml`이 윈도우에서 설치 파일을 만들어 GitHub 릴리스에 올리고, 설치된 프로그램은 거기서 새 판을 받아요(공개 다운로드가 생기니 올릴지 먼저 정하세요).

## 구글 드라이브 동기화 (09-sync.js)

- 클라이언트 ID(웹 애플리케이션, 비밀 아님)는 `GD_CLIENT_ID` 상수에 둔다. 설정 → 기기끼리 맞추기 → 고급의 칸(`gd.client`)에 넣으면 그걸 먼저 쓴다.
- 처음: 홈·서재 위 띠나 설정의 **구글로 시작하기** 한 번. 연결하면 `gd.linked` 가 켜지고, 그다음부터 켤 때(3초 뒤)·앱으로 돌아올 때(1분 넘게 지났으면)·고칠 때(15초 조용하면)·떠날 때 저절로 맞춘다.
- 웹: 토큰은 이 기기 `gd.tok` 에 둔다(맞추기·백업 제외). 로그인 창은 누름 안에서만 열리니, 끝난 토큰은 바로 받지 않고 다음 누름(`pointerup`) 때 `prompt: ''` 로 조용히 받고 이어서 맞춘다.
- 윈도우 프로그램: main.js 가 기본 브라우저 + `http://127.0.0.1:53682/` 로 받는다. 다시 쓰는 토큰(`gd.bin`)과 클라이언트 보안 비밀번호(`gd-secret.bin`)는 userData 에 윈도우 암호화로 이 PC에만 둔다. 예전 판이 화면 저장소에 둔 `gd.secret` 은 켤 때 옮기고 지운다. 비밀번호가 없으면 로그인 전에 `nosecret` → 화면이 고급 칸을 열어 한 번만 받는다.
- 구글 클라우드 콘솔(같은 클라이언트): 승인된 JavaScript 원본 `https://xoqls0720.github.io`, 승인된 리디렉션 URI `http://127.0.0.1:53682/`.
- 시험: `node tests/run.cjs gstart`

## OneDrive

`sync.backend` 가 `od` 이면 09-sync.js 의 `gdList/gdPut/gdGet/gdDel` 이 23-onedrive.js 의 같은 모양 함수로 넘어가요(합치는 규칙은 하나). 맞추기 파일은 OneDrive `앱/Novelist`(approot)에만 쓰고, 작품 폴더는 `Files.Read` 로 읽기만 해요.

처음 한 번 Azure 앱 등록이 필요해요(개인 Microsoft 계정만). 인증 → 단일 페이지 애플리케이션 `https://xoqls0720.github.io/novel-viewer/`, 모바일 및 데스크톱 `http://localhost`, API 권한 `Files.Read`·`Files.ReadWrite.AppFolder`·`offline_access`. 받은 클라이언트 ID(비밀 아님)를 23-onedrive.js 의 `OD_CLIENT_ID` 에 넣으면 기기마다 넣지 않아도 돼요.

웹(아이패드)의 다시 쓰는 토큰은 마이크로소프트 정책상 하루짜리라, 만료되면 켤 때(작품을 열기 전) 한 번 조용히 로그인 페이지를 다녀와요. 윈도우 프로그램은 기본 브라우저 + `http://localhost:53683` 으로 받고 토큰은 윈도우 암호화로 보관해요.

## 새 틀

앱은 홈부터 열려요(쓰거나 읽던 게 없으면 서재부터). 옆 서재 칸은 쓰지 않고, 서재는 읽는 화면 위에 덮는 한 판이에요. 책을 열면 판이 걷혀요. 시험에서는 `nvGo('lib')`·`nvGo('home')` 으로 판을 바꿀 수 있어요. 집필실을 켤 때부터 보이게 하려면 작품 정보의 '앱을 열면 홈 대신 집필실부터 보여 주기'를 켜요.

sketch 시험은 가짜 PSD를 만들려고 파이썬 `pillow`·`psd-tools` 가 필요해요(`pip install pillow psd-tools`).

## 같은 와이파이로 보여 주기 (폰·아이패드)

윈도우 프로그램이 `desktop/lan-server.js` 로 작은 서버(8787)를 **처음부터 켜 둔다**(설정에서 끌 수 있음, `userData/lan.json`). 설정에 QR(`qrcode` 패키지)과 `http://IP:8787/t/<열쇠>/` 주소가 뜨고, 폰·아이패드는 그 주소만 열면 폴더 연결 없이 서재를 본다(열쇠 틀리면 403). 손님 쪽 코드는 `src/js/25-lan.js`. 윈도우 방화벽이 처음에 물어보면 '허용'.

- `lan/scan`, `lan/file?p=`(Range — 영상 넘기기, 큰 EPUB·zip 은 필요한 구간만), `lan/info`. 경로 이름은 윈도우 프로그램과 같게 `성인` 아래 폴더는 `성인/만화` 처럼.
- `tr/…` → PC 번역 엔진(8790). 꺼져 있으면 Ollama 와 엔진을 켠다. 영상은 폰이 `lan:<rel>` 을 보내면 PC 경로로 바꾼다.
- `moa/…`, `toki/…` → 모아받기(47616)·토끼 다운로더(47615). 꺼져 있으면 `node server.cjs --no-open` 으로 켠다. Origin 을 떼고 HTML 안의 `/api/` 를 상대 주소로 바꿔 넘긴다. 다운로더 폴더는 `lan.json` 의 `dlDir` 또는 작품 폴더 위쪽의 `다운로더`.
- 서비스 워커는 `/t/<열쇠>/(lan|tr|moa|toki)` 와 Range 요청을 캐시하지 않는다.
- 열쇠는 128비트. PC 가 인터넷 주소를 바로 쓰면 바깥에서도 닿으니, 열쇠를 20번 틀린 곳은 10분 막는다. QR 은 공유기 안 주소 → 인터넷 주소 → VPN(WARP 등) 순서로 고른다. Tailscale(100.64/10) 주소는 따로 "밖에서 볼 때" QR.
- 어디서나 열기(설정의 체크, 기본 꺼짐): main.js 가 cloudflared 빠른 터널을 연다(설치된 것 → 없으면 userData/bin 에 공식 릴리스를 받음). 끊기면 다시 열고, 5분마다 바깥 주소로 확인. 주소는 PC 를 켤 때마다 바뀌어서 화면이 동기화 설정 `pcRemote` 에 적고, 웹 버전(다른 기기)은 서재 위에 **PC 서재 열기** 단추를 둔다. 터널 손님은 `cf-connecting-ip` 로 구분하고, 다운로더 화면의 EventSource 는 묻기 방식(`?__poll=1&cid=&since=`)으로 바꿔 넘긴다. 시험: `NOVELIST_CF_BIN`·`NOVELIST_CF_PRE`(가짜 터널), `NOVELIST_LAN_PORT`.
- 다운로더 폴더 잇기: 토끼 설정의 saveDir(기본 다운로더 폴더 옆) 아래 만화·웹툰·노벨·영상·갤러리·성인 중 있는 것을 켤 때마다 연결(`lib-dl-folders`·`lib-dl-link`), 저장 폴더를 지켜보다 새 종류 폴더가 생기면 바로 잇는다(`lib-dl-new`).
- 시험: `node tests/run.cjs lan`

## 성인 폴더 · 영상 · 번역 (26-media.js)

- 서재: 경로에 `성인` 폴더가 있으면(또는 연결한 폴더가 `성인` 안의 `만화`·`영상`이면) `성인 만화`·`성인 영상` 칸에 **작가 폴더 = 작품**, 그 아래 폴더 = 회차로 모은다. 모아받기가 `성인\만화\작가 1 제목\`, pawchive 는 `성인\만화\크리에이터 (번호)\글번호 제목\` 으로 저장한다. 표지가 없으면 첫 그림을 보여 준다(`w.cover` 는 건드리지 않는다: 클라우드 동기화가 쓴다).
- 영상(mp4·webm·mkv·mov·m4v)은 회차 하나씩. 윈도우 프로그램은 `app://novel/__disk/` 가 Range 요청을 받아 큰 영상도 앞뒤로 넘길 수 있다. 같은 이름으로 시작하는 srt·vtt 자막을 붙인다.
- 번역: `/api/chat`(Ollama). 그림은 `set.visionModel`(기본 `qwen2.5vl:7b`, 없으면 화면에서 받기), 자막은 설치된 글 모델(`set.trTextModel` 또는 첫 글 모델). 결과는 `tr.*`·`trsub.*` 로 저장해 다시 쓴다.
- 자동 반영: main.js 가 연결한 폴더를 `fs.watch(recursive)` 로 지켜보다 6초 조용하면 `lib-changed` 를 보내고, 화면은 그 폴더만 다시 읽는다.
- 시험: `node tests/run.cjs media`

## 번역 엔진 (translator/)

윈도우 프로그램 전용. 내 컴퓨터 GPU 로 돌아가는 무료 번역기라 그림·영상이 밖으로 나가지 않는다.

- `translator/install.py` — 보통 파이썬(3.10~3.12)으로 실행. `%USERPROFILE%\NovelistTranslator\`(AppData 밖: 스토어 앱 안에서 실행해도 같은 곳) 에 venv(torch CUDA 12.6, manga-ocr, simple-lama-inpainting, faster-whisper, RapidOCR, av<14), comic-text-detector(vendor/ctd, GPL-3.0), 모델(models/)을 받는다. 약 5GB. 다시 실행하면 된 단계는 건너뛴다.
- `translator/server.py` — `127.0.0.1:8790`. `POST /page {image(base64), lang, model, context}` → 번역해 그린 그림(base64 JPEG)과 대사 목록. `POST /video {path}` → 작업 번호, `GET /job?id=` 로 진행·결과(VTT). 결과는 `cache/` 에 남고, 영상 자막은 영상 옆 `이름.ko.vtt` 로도 저장한다.
  - 만화 한 쪽: 글자 찾기(긴 웹툰은 겹쳐 잘라서) → 블록을 글자 덩어리까지 넓히고 겹친 블록 합치기 → 원문 읽기(일본어 manga-ocr, 영어·중국어 RapidOCR, 말풍선마다 언어 판별) → 읽는 순서(일본어는 오른쪽부터) → 한 쪽 통째로 + 앞 쪽 문맥 번역(Ollama JSON, 가나·영어가 남은 줄은 앞뒤 대사와 다시) → 원문 지우기(고른 바탕은 그 색, 그림 위는 LaMa) → 말풍선 찾기(테두리를 벽으로 두껍게 해 채우기) → 남은 글자 조각 지우기 → 말풍선 안 직사각형에 맑은 고딕 굵게(크기·줄바꿈 자동, 문장부호 줄머리 금지).
  - 영상: faster-whisper large-v3-turbo(GPU) → 25줄씩 문맥을 이어 번역.
  - 그리는 법을 바꾸면 `VERSION` 을 올린다(캐시 열쇠).
- 번역 AI 고르기: 화면이 `provider: {id, key, model, base, region}` 를 같이 보낸다. `local`(Ollama) 외에 gemini·groq·openrouter·cerebras·mistral·github(OpenAI 형식), claude(anthropic SDK), deepl·microsoft(기계 번역), custom(OpenAI 형식 주소). 거절·한도·오류면 그 쪽은 Ollama 가 옮기고 결과의 `by` 에 적는다. 성인 작품은 `set.trAdultCloud` 를 켜지 않으면 늘 `local`. 키는 `tr.key.*`·`gemKey`·`grKey`·`apiKey` 에 기기에만(백업·동기화 제외). `POST /models {provider}` 로 모델 목록, `POST /subs {vtt, provider}` 로 자막 파일 번역.
- desktop/main.js 의 `tr-status`·`tr-install`·`tr-start` 가 설치·켜기를 맡고, 화면(26-media.js)은 8790 으로 바로 요청한다. 설치 파일에는 `extraResources` 로 `resources/translator/*.py` 가 들어간다.

## 큰 EPUB · 웹툰 화 나누기

- 내 컴퓨터 폴더의 EPUB 은 `RangeZip`(02-library.js)이 `app://novel/__disk/` 에 구간(Range) 요청을 보내 필요한 부분만 읽는다. 수 GB 웹툰 EPUB(JSZip 으로는 2GB 넘으면 못 읽던 것)도 바로 열린다. 구글 드라이브·OneDrive·끌어다 놓은 파일은 예전처럼 JSZip.
- 웹툰 EPUB 은 목차(nav.xhtml·toc.ncx)대로 `epubpart` 회차로 나눈다. 만화 권 EPUB 은 권 그대로.

## 서재 종류 칸 · 성인 작품

- 서재 위 칸: 전체 · 소설 · 웹툰 · 만화 · 영상 · 성인. '전체'에는 성인 작품이 없고, 프로그램을 켤 때마다 '전체'로 돌아간다. 홈의 '이어 읽기'와 서재의 '읽던 책'에도 성인 작품은 나오지 않는다(성인 칸 안에서만). 성인 작품을 읽다 홈·서재로 나오면 뒤의 읽는 화면을 가린다(`#app.hide-adult`).
- 성인 폴더 밖에 있어도 이름으로 성인으로 본다(`ADULT_NAME`, 02-library.js): pawchive·fanbox·pixiv 같은 후원 사이트 폴더, 성인 애니 제작사, 동인지 쪽수 표기 `(37P)+PDF`, 커플링 `_가x나_`. 열쇠(읽던 자리)는 그대로이고 칸·묶음 이름만 '성인 …'. 못 알아본 작품은 카드를 오른쪽 클릭(길게 누르기)해 성인 칸으로 보내거나 되돌린다(`adultMark`, 기기끼리 맞춰짐). 성인인지 볼 때는 늘 `isAdult(w)`.
