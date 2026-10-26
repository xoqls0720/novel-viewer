#!/usr/bin/env python3
"""시험용 가짜 작품을 만든다(저작권 있는 글·그림은 쓰지 않는다). tests/data/ 에 생긴다."""
import os, zlib, struct, zipfile, random, pathlib
D = pathlib.Path(__file__).parent / 'data'
random.seed(7)
def png(w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw, 9)) + ch(b'IEND', b'')
NARR = ['청명은 고개를 들었다.', '바람이 불었다.', '문이 천천히 열렸다.', '그는 검을 쥐었다.', '먼지가 햇빛 속에서 떠다녔다.', '아무도 대답하지 않았다.', '발소리가 멀어졌다.', '하늘이 낮게 내려앉아 있었다.']
DLG = ['“거기 서라.”', '“싫은데?”', '“…….”', '“이게 무슨 짓이냐.”', '“사형, 늦었습니다.”', '“다시 말해 봐.”']
def episode(n, paras=110):
    out = []
    for i in range(paras):
        if i == 3: out.append('“…….”'); continue
        out.append(random.choice(DLG) if random.random() < 0.35 else ' '.join(random.choice(NARR) for _ in range(random.randint(1, 4))))
    return '\n\n'.join(out)
def w(p, data):
    p = D / p; p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data if isinstance(data, bytes) else data.encode('utf-8'))
def epub(path, chapters, imgs=None):
    p = D / path; p.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(p, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        items, spine = [], []
        for i, (title, body) in enumerate(chapters):
            name = f'c{i}.xhtml'; items.append(f'<item id="c{i}" href="{name}" media-type="application/xhtml+xml"/>'); spine.append(f'<itemref idref="c{i}"/>')
            z.writestr('OEBPS/' + name, f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>{title}</title></head><body><h1>{title}</h1>{body}</body></html>')
        for i, data in enumerate(imgs or []):
            z.writestr(f'OEBPS/p{i:03}.png', data); items.append(f'<item id="i{i}" href="p{i:03}.png" media-type="image/png"/>')
        z.writestr('OEBPS/content.opf', f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>t</dc:title></metadata><manifest>{"".join(items)}</manifest><spine>{"".join(spine)}</spine></package>')
# 소설 hwasan: 회차 txt 4개 + 표지
for i in range(1, 5): w(f'vt2/novel/hwasan/{i:04} ep.txt', episode(i))
w('vt2/novel/hwasan/cover.png', png(60, 90, (150, 40, 40)))
# 소설 oldman: epub 한 권(장 3개)
epub('vt2/novel/oldman/book.epub', [(f'{i}장', ''.join(f'<p>{p}</p>' for p in episode(i, 40).split('\n\n'))) for i in range(1, 4)])
# 만화 deathnote: 그림 99장 epub (세로 쪽)
pages = [png(80, 120, (200 - i, 200 - i, 200 - i)) for i in range(99)]
epub('vt2/manga/deathnote/vol01.epub', [(f'p{i}', f'<img src="p{i:03}.png"/>') for i in range(99)], pages)
# 웹툰 misaeng: 회차 폴더 2개, 긴 세로 그림
for e in (1, 2):
    for k in range(1, 7): w(f'vt2/webtoon/misaeng/{e:04} ep/{k:03}.png', png(72, 1400, (230, 230 - k * 10, 220)))
# 합본·가져오기용
comb = '작품 소개입니다. ' * 60 + '\n\n' + ''.join(f'\n{i}화\n\n' + '청명이 걸었다. ' * 400 + '\n' for i in range(1, 8))
w('imp/combined.txt', comb); w('vt3a/novel/hapbon/hapbon.txt', comb)
w('imp/big300.txt', ''.join(f'\n{i}화\n\n' + '청명이 걸었다 ' * 786 + f'\n끝{i}\n' for i in range(1, 301)))
w('imp/ep_cp949.txt', '“거기 서라.”\n\n청명이 돌아섰다. 바람이 불었다.\n\n“싫은데?”'.encode('cp949'))
w('imp/report.md', '# 화산귀환 절단 분석\n\n- 마지막 줄은 새 인물의 목소리로 끊는다.\n')
print('data ->', D)
