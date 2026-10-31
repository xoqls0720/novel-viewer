#!/usr/bin/env python3
"""src/ 를 하나의 index.html 로 묶는다. (앱은 파일 하나로 배포해야 오프라인·설치가 단순하다)
쓰는 법: python3 build.py   → index.html 갱신
"""
import pathlib, sys
ROOT = pathlib.Path(__file__).parent; SRC = ROOT / 'src'
read = lambda p: (SRC / p).read_text(encoding='utf-8')
css = ''.join(read(f'css/{n}') for n in ['app.css', 'studio.css', 'webtoon.css', 'shell.css', 'media.css'])
js = ''.join(p.read_text(encoding='utf-8') for p in sorted((SRC / 'js').glob('*.js')))
html = read('head.html').replace('{{CSS}}\n', css) + read('body.html').replace('{{STUDIO}}\n', read('studio.html')).replace('{{WEBTOON}}\n', read('webtoon.html')) + '<script type="module">\n' + js + '</script>\n</body>\n</html>\n'
out = ROOT / 'index.html'; out.write_text(html, encoding='utf-8', newline='\n')   # 윈도우에서도 LF 로 (CRLF 면 시험·git 비교가 깨진다)
print(f'index.html {len(html):,} bytes · js {js.count(chr(10)):,} lines')
