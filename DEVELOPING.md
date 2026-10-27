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
src/js/22-reader-more.js  자동 스크롤·폰 화면 보기·내 글꼴·방향키·첫 화면 이어 읽기·아이패드 가로 배치
src/js/23-onedrive.js     OneDrive 로그인(PKCE)·앱 전용 폴더 맞추기·OneDrive 작품 폴더 연결
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

## OneDrive

`sync.backend` 가 `od` 이면 09-sync.js 의 `gdList/gdPut/gdGet/gdDel` 이 23-onedrive.js 의 같은 모양 함수로 넘어가요(합치는 규칙은 하나). 맞추기 파일은 OneDrive `앱/Novelist`(approot)에만 쓰고, 작품 폴더는 `Files.Read` 로 읽기만 해요.

처음 한 번 Azure 앱 등록이 필요해요(개인 Microsoft 계정만). 인증 → 단일 페이지 애플리케이션 `https://xoqls0720.github.io/novel-viewer/`, 모바일 및 데스크톱 `http://localhost`, API 권한 `Files.Read`·`Files.ReadWrite.AppFolder`·`offline_access`. 받은 클라이언트 ID(비밀 아님)를 23-onedrive.js 의 `OD_CLIENT_ID` 에 넣으면 기기마다 넣지 않아도 돼요.

웹(아이패드)의 다시 쓰는 토큰은 마이크로소프트 정책상 하루짜리라, 만료되면 켤 때(작품을 열기 전) 한 번 조용히 로그인 페이지를 다녀와요. 윈도우 프로그램은 기본 브라우저 + `http://localhost:53683` 으로 받고 토큰은 윈도우 암호화로 보관해요.
