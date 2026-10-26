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
