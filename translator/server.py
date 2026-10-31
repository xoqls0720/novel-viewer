# 노벨리스트 번역 엔진 — 내 컴퓨터(GPU)에서 돌아가는 무료 번역기.  python server.py  (127.0.0.1:8790)
#
# 만화·웹툰 한 쪽:  글자 찾기(comic-text-detector) → 원문 읽기(일본어 manga-ocr, 영어·중국어 RapidOCR)
#                  → 한 쪽을 통째로, 앞 쪽 번역을 문맥으로 한국어 번역(Ollama) → 원문 지우기(바탕 칠하기 / LaMa)
#                  → 말풍선 안에 한국어 넣기(맑은 고딕 굵게, 크기·줄바꿈 자동)
# 영상:            음성 인식(faster-whisper large-v3-turbo) → 문맥을 이어 가며 한국어 자막(Ollama) → .ko.vtt
#
# 참고한 것: columncat/AI-Manga-Translator-with-GUI(5단계 흐름), ucx0204/CarrotMangaTranslator(문맥·용어 일관성),
#           izure1/manga-trans(한 번에 덮어 보여 주기), heelee912/NANOBArnANgA(자연스러운 식자 목표)
import os, sys, io, json, time, base64, hashlib, threading, traceback, re, gc, uuid, math
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request

HOME = os.environ.get('NOVELIST_TR_HOME') or os.path.join(os.path.expanduser('~'), 'NovelistTranslator')   # install.py 와 같은 곳
MODELS = os.path.join(HOME, 'models'); CACHE = os.path.join(HOME, 'cache')
PAGES = os.path.join(HOME, 'pages')   # 번역해 둔 쪽 (쪽 열쇠의 sha1.json). Novelist 가 엔진 없이도 바로 읽는다
os.environ.setdefault('HF_HOME', os.path.join(MODELS, 'hf'))
os.environ.setdefault('LAMA_MODEL', os.path.join(MODELS, 'big-lama.pt'))
PORT = int(os.environ.get('NV_TR_PORT', '8790'))
OLLAMA = os.environ.get('NV_OLLAMA', 'http://127.0.0.1:11434').rstrip('/')
VERSION = 12   # 결과 캐시 열쇠에 들어간다(그리는 법을 바꾸면 올린다)

# CUDA 라이브러리(cuDNN·cuBLAS)는 torch 가 함께 깐 nvidia 패키지 안에 있다 → faster-whisper(CTranslate2)도 찾게 한다
if os.name == 'nt':
    import site
    for sp in site.getsitepackages():
        nv = os.path.join(sp, 'nvidia')
        if os.path.isdir(nv):
            for d in os.listdir(nv):
                b = os.path.join(nv, d, 'bin')
                if os.path.isdir(b):
                    try: os.add_dll_directory(b)
                    except Exception: pass
                    os.environ['PATH'] = b + os.pathsep + os.environ['PATH']
sys.path.insert(0, os.path.join(HOME, 'vendor', 'ctd'))
# comic-text-detector 는 학습용 기록 도구(wandb)를 불러오기만 하고 추론에는 쓰지 않는다 → 빈 모듈로 채운다
import types
for _name in ('wandb',):
    sys.modules.setdefault(_name, types.ModuleType(_name))

import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

GPU = threading.Lock()          # GPU 일은 한 번에 하나
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def device():
    try:
        import torch; return 'cuda' if torch.cuda.is_available() else 'cpu'
    except Exception: return 'cpu'
def free_gpu():
    gc.collect()
    try:
        import torch; torch.cuda.empty_cache()
    except Exception: pass

# ---------------------------------------------------------------- 모델 (처음 쓸 때 불러온다)
_m = {}
def ctd():
    if 'ctd' not in _m:
        from inference import TextDetector
        _m['ctd'] = TextDetector(model_path=os.path.join(MODELS, 'comictextdetector.pt'), input_size=1024, device=device(), act='leaky')
    return _m['ctd']
def mocr():
    if 'mocr' not in _m:
        from manga_ocr import MangaOcr
        _m['mocr'] = MangaOcr(force_cpu=device() != 'cuda')
    return _m['mocr']
def rapid():
    if 'rapid' not in _m:
        from rapidocr_onnxruntime import RapidOCR
        _m['rapid'] = RapidOCR()
    return _m['rapid']
def lama():
    if 'lama' not in _m:
        from simple_lama_inpainting import SimpleLama
        _m['lama'] = SimpleLama(device=device())
    return _m['lama']

# ---------------------------------------------------------------- Ollama
def ollama_models():
    with urllib.request.urlopen(OLLAMA + '/api/tags', timeout=5) as r:
        return [m['name'] for m in json.load(r).get('models', [])]
def pick_model(want='', adult=False):
    names = ollama_models()
    if want and want in names: return want
    # 글 모델 가운데 큰 것(번역이 자연스럽다). 그림 모델·임베딩은 뺀다
    text = [n for n in names if not re.search(r'vl|vision|llava|embed|moondream', n, re.I)]
    if not text: raise RuntimeError('Ollama 에 번역에 쓸 글 모델이 없어요 (예: ollama pull exaone3.5:7.8b)')
    def size(n):
        m = re.search(r'(\d+(?:\.\d+)?)b', n, re.I); return float(m.group(1)) if m else 0
    # 성인 작품: 거절하지 않는(검열을 뺀) 모델 먼저. 그 밖: 한국어가 자연스러운 EXAONE(LG) 먼저
    # 대사 줄 맞추기 시험(2026-10-30): qwen3 는 줄마다 1:1 로 옮기고, EXAONE 는 여러 줄을 한 줄에 섞어 넣었다 → qwen3 먼저
    first = r'qwen3|abliterat|uncensor|dolphin' if adult else r'qwen3|qwen2\.5'
    text.sort(key=lambda n: (0 if re.search(first, n, re.I) else 1, -size(n) if size(n) <= 14 else 0, n))   # 8GB 그래픽카드에 맞게 14b 이하 중 큰 것
    return text[0]
def model_for(want, adult, prov):
    # 바깥 AI 를 골랐으면 Ollama 가 꺼져 있어도 번역한다(대신 거절·한도 때 받아 줄 곳이 없다)
    if prov and (prov.get('id') or 'local') != 'local':
        try: return pick_model(want, adult)
        except Exception: return ''
    return pick_model(want, adult)
OLLAMA_DEADLINE = 180   # 한 번 묻는 데 쓰는 최대 초 (넘으면 끊는다)
def ollama_json(model, system, user, schema=None, ctx=8192, budget=None):
    """흘려 받다가 글자 수(num_predict)·시간 한도를 넘으면 끊는다. 연결을 끊으면 Ollama 도 만들기를 멈춘다.
    (예전엔 한도 없이 기다려서, JSON 을 끝맺지 못한 모델이 10분씩 그래픽카드를 붙잡아 뒤 번역이 모두 시간 초과가 났다)"""
    body = {'model': model, 'stream': True, 'think': False, 'keep_alive': '15m',
            'options': {'temperature': 0.3, 'top_p': 0.9, 'num_ctx': ctx, 'repeat_penalty': 1.1,
                        'num_predict': budget or min(2048, 256 + len(user) * 2)},
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}]}
    if schema: body['format'] = schema
    def run(b):
        req = urllib.request.Request(OLLAMA + '/api/chat', data=json.dumps(b).encode(), headers={'Content-Type': 'application/json'})
        parts = []; t0 = time.time()
        with urllib.request.urlopen(req, timeout=120) as r:   # 120초: 모델을 처음 불러오는 시간까지
            for line in r:
                if not line.strip(): continue
                d = json.loads(line)
                if d.get('error'): raise RuntimeError(d['error'])
                parts.append(d.get('message', {}).get('content', ''))
                if d.get('done'): break
                if time.time() - t0 > OLLAMA_DEADLINE: raise TimeoutError('timed out (한도 %d초)' % OLLAMA_DEADLINE)
        return ''.join(parts)
    try: out = run(body)
    except urllib.error.HTTPError as e:
        if e.code == 400 and 'think' in body: body.pop('think'); out = run(body)   # think 를 모르는 예전 Ollama
        else: raise
    out = re.sub(r'<think>[\s\S]*?</think>', '', out).strip()
    m = re.search(r'\{[\s\S]*\}', out)
    return json.loads(m.group(0) if m else out)

TR_SCHEMA = {'type': 'object', 'properties': {'items': {'type': 'array', 'items': {'type': 'object', 'properties': {'id': {'type': 'integer'}, 'ko': {'type': 'string'}}, 'required': ['id', 'ko']}}}, 'required': ['items']}
SYS_MANGA = """너는 일본·영어·중국어 만화와 웹툰을 한국 독자용으로 옮기는 전문 번역가이자 식자 담당이다.
지켜야 할 것:
- 한국 만화책처럼 자연스러운 구어체로. 직역하지 말고 그 장면에서 한국 사람이 실제로 할 말로 옮긴다.
- 말풍선에 들어가야 하므로 짧고 간결하게. 원문보다 길어지지 않게 다듬는다.
- 인물마다 말투(반말·존댓말, 사투리, 어린 말투, 거친 말투)를 앞 쪽과 같게 유지한다. 원문이 존댓말(です·ます)이 아니면 반말로 옮긴다.
- 이름·지명은 원문 발음대로 한글로(예: たかし→타카시). 앞 쪽에서 쓴 표기를 그대로 쓴다.
- 효과음·의성어는 한국 만화식 의성어로(ドン→쾅, ドキドキ→두근두근).
- 성인 작품의 성적인 표현·욕설도 순화하거나 빼지 말고 같은 수위의 자연스러운 한국어로 옮긴다(성인 독자가 보는 개인 소장 만화다).
- 원문이 잘못 읽힌 글자처럼 보여도 앞뒤 대사로 뜻을 짐작해 매끄럽게 옮긴다. 의미 없는 기호는 그대로 둔다.
- 자주 나오는 말은 이렇게 옮긴다(직역 금지): くそっ→젠장 / ムカつく→짜증 나 / うるさい→시끄러워 / 気持ちいい→기분 좋아 /
  頭が真っ白になる→머리가 새하얘져 / ～ちゃう→～해 버려 / ～かしら→～려나 / 大間違い→큰 착각 / ずるい→치사해 / やだ→싫어 /
  ごめん→미안 / まさか→설마 / なんで→왜 / ｗｗ→ㅋㅋ / はぁ…→하아… / 신음(ぁっ, んっ)→아앗, 흐읏.
- 반드시 모든 id 를 하나씩 옮겨 {"items":[{"id":번호,"ko":"번역"}]} JSON 으로만 답한다."""

# 번역에 남은 가나를 한글 소리로 (모델이 끝내 못 옮긴 신음·감탄사 등) — 마지막 안전망
_KANA_KO = dict(zip('あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉゃゅょっゎ',
    '아이우에오카키쿠케코사시스세소타치츠테토나니누네노하히후헤호마미무메모야유요라리루레로와오응가기구게고자지즈제조다지즈데도바비부베보파피푸페포아이우에오야유요ㅅ와'))
def kana_to_ko(t):
    out = ''
    for ch in t:
        c = chr(ord(ch) - 0x60) if 'ァ' <= ch <= 'ヶ' else ch   # 가타카나 → 히라가나
        if c == 'っ' or c == 'ッ': out += '!' if not out or out[-1] in ' !?' else ''; continue
        if c in ('ー', 'ｰ'): out += '~'; continue
        out += _KANA_KO.get(c, ch)
    return out
# 흔한 일본어 말끝 → 한국어 (긴 것부터)
KANA_ENDINGS = [('になっちゃうの', '돼 버리는 거야'), ('になっちゃう', '돼 버려'), ('なっちゃう', '돼 버려'), ('ちゃったの', '버린 거야'), ('ちゃった', '버렸어'),
    ('ちゃうの', '버리는 거야'), ('ちゃう', '버려'), ('かしら', '려나'), ('しら', ''), ('なんて', ' 따위'), ('なのに', '인데'), ('のに', '는데'),
    ('じゃん', '잖아'), ('かな', '까'), ('だよ', '야'), ('だね', '네'), ('でしょ', '잖아'), ('くなる', '해져'), ('てる', '고 있어'),
    ('の？', '거야?'), ('の?', '거야?'), ('よ！', '!'), ('よ!', '!'), ('ね', ''), ('よ', ''), ('わ', '')]
def tidy_ko(t, src=''):
    """한국어 문장부호·말맛 다듬기: 전각 → 반각, 점점점 → …, ｗｗ → ㅋㅋ, 장음 ー → ~"""
    t = t.replace('．．．', '…').replace('...', '…').replace('・・・', '…').replace('．．', '…')
    t = re.sub(r'[ｗw]{2,}$', 'ㅋㅋ', t); t = re.sub(r'[ｗw]{2,}(?=\s)', 'ㅋㅋ', t)
    t = ''.join({'！': '!', '？': '?', '，': ',', '．': '.', '（': '(', '）': ')', '～': '~', '〜': '~', '　': ' '}.get(c, c) for c in t)
    t = re.sub(r'(?<=[가-힣])ー|ー(?=[가-힣])', '~', t)
    t = re.sub(r'([!?])\1{2,}', r'\1\1', t)
    if KANA.search(t):
        # 모델이 끝내 남긴 일본어 말끝은 흔한 것부터 한국어 말끝으로, 나머지만 소리대로
        for a, b2 in KANA_ENDINGS: t = t.replace(a, b2)
        t = KANA.sub(lambda m: kana_to_ko(m.group(0)), t)
    t = re.sub('[🀀-🫿✀-➿️]', '', t)   # 그림 문자(이모지)는 글꼴에 없어 뺀다
    return re.sub(r'\s{2,}', ' ', t).strip()
def bad_ko(ko, src):
    """다시 옮겨야 하는 번역: 가나가 남았거나, 원문을 그대로 돌려줬거나, 영어가 많이 남았거나, JSON 조각이 섞였거나"""
    if KANA.search(ko) or re.search(r'[{}\[\]]|",|":', ko): return True
    if re.search(r'[Ѐ-ӿ؀-ۿ฀-๿]', ko): return True   # 러시아·아랍·태국 글자가 섞여 나온 줄 (예: '후нь')
    if re.search(r'[一-鿿]', ko): return True   # 한자가 남은 줄
    if re.search(r'[A-Za-z一-鿿぀-ヿ]{3,}', src) and nfkc(ko) == nfkc(src): return True
    lat, han = len(LATIN.findall(nfkc(ko))), len(HANGUL.findall(ko))
    if lat > 3 and lat > 0.3 * (lat + han):
        # 원문에도 있는 고유명사(로마자 이름)만 남은 경우는 괜찮다
        rest = re.sub('|'.join(map(re.escape, re.findall(r'[A-Za-z]{2,}', nfkc(src)))) or r'(?!)', '', nfkc(ko), flags=re.I)
        if len(LATIN.findall(rest)) > 3: return True
    return False

# ---------------------------------------------------------------- 번역 AI 고르기
# 화면(노벨리스트)이 {'id': 공급자, 'key': 키, 'model': 모델, 'base': 주소(직접 입력), 'region': 지역} 을 보낸다.
# 'local' 이거나 비어 있으면 내 컴퓨터 Ollama. 다른 공급자가 거절·한도 초과·오류를 내면 그 묶음은 내 컴퓨터로 다시 옮긴다.
OPENAI_LIKE = {   # OpenAI 와 같은 모양(/chat/completions)으로 받는 곳 — 대부분 무료 사용량이 있다
    'groq': 'https://api.groq.com/openai/v1',
    'openrouter': 'https://openrouter.ai/api/v1',
    'cerebras': 'https://api.cerebras.ai/v1',
    'mistral': 'https://api.mistral.ai/v1',
    'github': 'https://models.github.ai/inference',
}
class Refused(Exception): pass        # 공급자가 내용 때문에 거절
class Limited(Exception): pass        # 사용량 한도(429)

def _http_json(url, body=None, headers=None, timeout=180, method=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method or ('POST' if body is not None else 'GET'), headers={'Content-Type': 'application/json', 'User-Agent': 'Novelist/1.1 (+https://xoqls0720.github.io/novel-viewer/)', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read()[:400].decode('utf-8', 'replace')
        if e.code == 429: raise Limited(detail)
        raise RuntimeError(f'{e.code} {detail}')

def _json_from_text(t):
    t = re.sub(r'<think>[\s\S]*?</think>', '', t or '').strip()
    m = re.search(r'\{[\s\S]*\}', t)
    return json.loads(m.group(0) if m else t)

def _pick(names, prefer):
    names = [n for n in names if not re.search(r'embed|whisper|tts|guard|vision|audio|image|moderation|rerank|ocr', n, re.I)]
    for p in prefer:
        for n in names:
            if re.search(p, n, re.I): return n
    return names[0] if names else ''

def list_models(prov):
    """공급자에서 쓸 수 있는 모델 이름들 (화면의 고르기 칸을 채운다)"""
    pid = (prov or {}).get('id') or 'local'; key = (prov or {}).get('key', '')
    if pid == 'local': return ollama_models()
    if pid == 'gemini':
        d = _http_json('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', headers={'x-goog-api-key': key})
        return [m['name'].split('/', 1)[1] for m in d.get('models', []) if 'generateContent' in (m.get('supportedGenerationMethods') or [])]
    if pid == 'claude':
        import anthropic
        return [m.id for m in anthropic.Anthropic(api_key=key).models.list(limit=100)]
    if pid in ('deepl', 'microsoft'): return []
    base = (prov.get('base') or OPENAI_LIKE.get(pid, '')).rstrip('/')
    if pid == 'github':
        d = _http_json('https://models.github.ai/catalog/models', headers={'Authorization': f'Bearer {key}', 'Accept': 'application/vnd.github+json'})
        return [m.get('id') for m in d if isinstance(m, dict) and m.get('id')]
    d = _http_json(base + '/models', headers={'Authorization': f'Bearer {key}'})
    ids = [m.get('id') for m in d.get('data', d if isinstance(d, list) else []) if isinstance(m, dict)]
    if pid == 'openrouter': ids = [i for i in ids if i.endswith(':free')] or ids   # OpenRouter 는 무료 모델(:free)만 먼저
    return ids

PREFER = {   # 모델을 고르지 않았을 때: 한국어·일본어 번역이 자연스러운 쪽부터
    'gemini': [r'flash(?!.*lite)', r'pro', r''],
    'claude': [r'^claude-opus-5-5$', r'opus', r''],
    'groq': [r'kimi', r'qwen', r'llama-3\.3-70b', r'llama.*70b', r'gpt-oss-120b', r''],
    'openrouter': [r'deepseek.*(v3|chat).*:free', r'qwen.*:free', r'llama.*70b.*:free', r':free'],
    'cerebras': [r'qwen.*235b', r'llama-3\.3-70b', r'qwen', r'llama', r''],
    'mistral': [r'mistral-large', r'mistral-medium', r'mistral-small', r''],
    'github': [r'gpt-4o(?!-mini)', r'deepseek', r'llama.*70b', r''],
}
def model_of(prov):
    if prov.get('model'): return prov['model']
    cache = _m.setdefault('models', {})
    k = (prov['id'], prov.get('key', '')[-6:], prov.get('base', ''))
    if k not in cache: cache[k] = _pick(list_models(prov), PREFER.get(prov['id'], [r'']))
    return cache[k]

def provider_json(prov, system, user, schema):
    """공급자 한 번 부르기 → JSON. 거절이면 Refused, 한도면 Limited"""
    pid = prov['id']; key = prov.get('key', '')
    if not key and pid not in ('custom',): raise RuntimeError(f'{pid} 키가 없어요')
    if pid == 'claude':
        import anthropic
        client = anthropic.Anthropic(api_key=key, max_retries=2)
        strict = {'type': 'object', 'additionalProperties': False, 'required': ['items'], 'properties': {'items': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False, 'required': ['id', 'ko'], 'properties': {'id': {'type': 'integer'}, 'ko': {'type': 'string'}}}}}}
        try:
            r = client.beta.messages.create(model=model_of(prov), max_tokens=16000, system=system,
                messages=[{'role': 'user', 'content': user}], output_config={'format': {'type': 'json_schema', 'schema': strict}},
                betas=['server-side-fallback-2026-07-01'], fallbacks='default')
        except anthropic.RateLimitError as e: raise Limited(str(e))
        if r.stop_reason == 'refusal': raise Refused(getattr(r.stop_details, 'category', '') or 'refusal')
        return _json_from_text(''.join(b.text for b in r.content if b.type == 'text'))
    if pid == 'gemini':
        body = {'systemInstruction': {'parts': [{'text': system}]}, 'contents': [{'role': 'user', 'parts': [{'text': user}]}],
                'generationConfig': {'responseMimeType': 'application/json', 'temperature': 0.3},
                'safetySettings': [{'category': c, 'threshold': 'BLOCK_NONE'} for c in ('HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT')]}
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_of(prov)}:generateContent'
        def plain(b):   # 지시문을 대사 앞에 붙이고 JSON 모드를 뺀다
            b = dict(b); b.pop('systemInstruction', None); b['generationConfig'] = {'temperature': 0.3}
            b['contents'] = [{'role': 'user', 'parts': [{'text': system + '\n\n' + user}]}]; return b
        if re.search(r'gemma', model_of(prov) or '', re.I): body = plain(body)
        try: d = _http_json(url, body, {'x-goog-api-key': key})
        except RuntimeError as e:
            if not re.search(r'Developer instruction|JSON mode|response_mime_type|responseMimeType', str(e), re.I): raise
            d = _http_json(url, plain(body), {'x-goog-api-key': key})
        if d.get('promptFeedback', {}).get('blockReason'): raise Refused(d['promptFeedback']['blockReason'])
        cand = (d.get('candidates') or [{}])[0]
        if cand.get('finishReason') in ('SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'): raise Refused(cand['finishReason'])
        return _json_from_text(''.join(p.get('text', '') for p in cand.get('content', {}).get('parts', [])))
    base = (prov.get('base') or OPENAI_LIKE.get(pid, '')).rstrip('/')
    if not base: raise RuntimeError('주소를 넣어 주세요')
    body = {'model': model_of(prov), 'temperature': 0.3, 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}], 'response_format': {'type': 'json_object'}}
    hdr = {'Authorization': f'Bearer {key}'} if key else {}
    if pid == 'openrouter': hdr.update({'HTTP-Referer': 'https://xoqls0720.github.io/novel-viewer/', 'X-Title': 'Novelist'})
    try: d = _http_json(base + '/chat/completions', body, hdr)
    except RuntimeError as e:
        if not str(e).startswith('400'): raise
        body.pop('response_format'); d = _http_json(base + '/chat/completions', body, hdr)   # json 모드를 모르는 모델
    ch = (d.get('choices') or [{}])[0]
    if ch.get('finish_reason') == 'content_filter': raise Refused('content_filter')
    return _json_from_text((ch.get('message') or {}).get('content', ''))

def mt_translate(prov, texts, lang, context=''):
    """번역 전용 엔진(DeepL·Microsoft): 줄 목록 → 번역 목록"""
    key = prov.get('key', '')
    if prov['id'] == 'deepl':
        url = 'https://api-free.deepl.com/v2/translate' if key.endswith(':fx') else 'https://api.deepl.com/v2/translate'
        body = {'text': texts, 'target_lang': 'KO'}
        if lang in ('ja', 'en', 'zh'): body['source_lang'] = lang.upper()
        if context: body['context'] = context[-2000:]
        d = _http_json(url, body, {'Authorization': f'DeepL-Auth-Key {key}'})
        return [t['text'] for t in d.get('translations', [])]
    if prov['id'] == 'microsoft':
        q = 'api-version=3.0&to=ko' + (f'&from={ {"zh": "zh-Hans"}.get(lang, lang)}' if lang in ('ja', 'en', 'zh') else '')
        hdr = {'Ocp-Apim-Subscription-Key': key}
        if prov.get('region'): hdr['Ocp-Apim-Subscription-Region'] = prov['region']
        d = _http_json('https://api.cognitive.microsofttranslator.com/translate?' + q, [{'Text': t} for t in texts], hdr)
        return [x['translations'][0]['text'] for x in d]
    raise RuntimeError('모르는 번역 엔진')

def _llm_once(prov, model, system, user):
    """공급자(없거나 local 이면 Ollama)로 한 번 → JSON"""
    if not prov or prov.get('id') in (None, '', 'local'): return ollama_json(model, system, user, TR_SCHEMA)
    return provider_json(prov, system, user, TR_SCHEMA)

def translate_lines(lines, context, model, lang, prov=None, used=None):
    """lines: [(id, 원문)] 읽는 순서. context: 앞 쪽 [(원문, 번역)]. prov: 고른 번역 AI (없으면 내 컴퓨터)
    used: 실제로 옮긴 곳을 적어 돌려줄 목록(화면 표시용)"""
    if not lines: return {}
    used = used if used is not None else []
    prov = prov if prov and prov.get('id') not in (None, '', 'local') else None
    src = {'ja': '일본어', 'en': '영어', 'zh': '중국어'}.get(lang, '외국어')
    ctx = ''.join(f'- {a} → {b}\n' for a, b in context[-16:])
    user = (f'[앞 쪽에서 옮긴 대사 — 말투·이름 표기를 이어 쓸 것]\n{ctx}\n' if ctx else '') + \
           f'[이번 쪽 {src} 대사 — 읽는 순서. 대사마다 한국어로]\n' + '\n'.join(f'{i}. {t}' for i, t in lines)
    out = {}
    if prov and prov['id'] in ('deepl', 'microsoft'):
        try:
            ko = mt_translate(prov, [t for _, t in lines], lang, ' '.join(b for _, b in context[-8:]))
            out = {i: k for (i, _), k in zip(lines, ko) if k}; used.append(prov['id'])
        except Exception as e:
            log(prov['id'], '실패 → 내 컴퓨터로', e); prov = None
    else:
        for attempt in range(2):
            p = prov
            try:
                data = _llm_once(p, model, SYS_MANGA, user)
                for it in data.get('items', []):
                    if isinstance(it, dict) and str(it.get('ko', '')).strip(): out[int(it['id'])] = str(it['ko']).strip()
                used.append(p['id'] if p else 'local')
                if len(out) >= len(lines) * 0.8: break
            except (Refused, Limited) as e:
                log((p or {}).get('id'), '거절·한도 → 내 컴퓨터로', e); prov = None; used.append(f"{(p or {}).get('id')}→local")
            except Exception as e:
                log('번역 다시 시도', (p or {}).get('id', 'local'), e)
                if p and attempt == 0: prov = None   # 공급자 오류면 두 번째는 내 컴퓨터로
    # 빠졌거나 덜 옮겨진 줄(가나가 남음·원문 그대로)은 앞뒤 대사를 붙여 한 줄씩 다시 (고른 AI → 안 되면 내 컴퓨터)
    srcmap = dict(lines); ids = [i for i, _ in lines]
    for i, t in lines:
        k0 = ids.index(i); pj = ids[k0 - 1] if k0 else None
        # 원문이 다른데 앞 줄 번역을 그대로(또는 앞머리에) 베꼈으면 그 줄은 다시 옮긴다
        copied = pj is not None and pj in out and i in out and srcmap[pj] != t and len(out[pj]) >= 2 and out[i].startswith(out[pj])
        if i in out and not bad_ko(out[i], t) and not copied: continue
        k = ids.index(i); near = ' / '.join(srcmap[j] for j in ids[max(0, k - 2):k + 3] if j != i)
        fix = (f'아래 대사 하나를 자연스러운 한국어로만 옮겨라. 일본어 가나·한자·영어를 결과에 남기지 마라. '
               f'신음·감탄사는 "아앗", "흐읏", "하아…" 처럼, 웃음 "ｗｗ" 는 "ㅋㅋ", 이름은 한글 소리로.\n'
               f'[앞뒤 대사(참고)] {near}\n[옮길 대사]\n{i}. {t}')
        for p in ([prov] if prov and prov['id'] not in ('deepl', 'microsoft') else []) + [None, None]:
            try:
                d = _llm_once(p, model, SYS_MANGA, fix)
                ko = str(d['items'][0]['ko']).strip()
                if ko and not bad_ko(ko, t) and not (copied and ko.startswith(out[pj])): out[i] = ko; break
                out.setdefault(i, ko or t)
            except Exception: out.setdefault(i, t)
    res = {i: tidy_ko(out.get(i, t), t) for i, t in lines}
    # 작은 모델이 앞 줄 번역을 다음 줄 앞에 되풀이할 때가 있다(예: '잠깐 기다려!' → '잠깐 기다려! 괜찮아.'): 앞 줄과 겹친 머리를 뗀다
    prev = None
    for i, t in lines:
        k = res[i]
        if prev and len(prev) >= 2 and k != prev and k.startswith(prev):
            rest = k[len(prev):].lstrip(' ,.!?…~')
            if rest: res[i] = rest
        prev = res[i]
    return res

# ---------------------------------------------------------------- 만화 한 쪽
KANA = re.compile(r'[\u3040-\u30ff]'); HANGUL = re.compile(r'[\uac00-\ud7a3]'); LATIN = re.compile(r'[A-Za-z]'); CJK = re.compile(r'[\u4e00-\u9fff]')
def detect_blocks(bgr, conf=0.4):
    """긴 웹툰 그림은 위에서부터 겹쳐 잘라 찾고 합친다. 반환: (글자 마스크, [블록])"""
    from utils.textmask import REFINEMASK_INPAINT
    det = ctd(); det.conf_thresh = conf
    h, w = bgr.shape[:2]
    tile = max(int(w * 1.6), 900); over = int(tile * 0.18)
    mask = np.zeros((h, w), np.uint8); blocks = []
    y = 0
    while True:
        y1 = min(h, y + tile)
        part = bgr[y:y1]
        m, mref, blks = det(part, refine_mode=REFINEMASK_INPAINT, keep_undetected_mask=True)
        mm = mref if mref is not None else m
        if mm.ndim == 3: mm = mm[..., 0]
        if mm.shape[:2] != part.shape[:2]: mm = cv2.resize(mm, (part.shape[1], part.shape[0]), interpolation=cv2.INTER_NEAREST)
        mask[y:y1] = np.maximum(mask[y:y1], mm)
        for b in blks:
            x0, y0, x1, yy1 = [int(v) for v in b.xyxy]
            blocks.append({'x0': x0, 'y0': y0 + y, 'x1': x1, 'y1': yy1 + y, 'vertical': bool(b.vertical), 'fs': float(getattr(b, 'font_size', 0) or 0),
                           'lines': [[[int(px), int(py) + y] for px, py in ln] for ln in (b.lines or [])]})
        if y1 >= h: break
        y = y1 - over
    # 겹친 띠에서 두 번 찾은 블록은 하나로
    blocks.sort(key=lambda b: (b['x1'] - b['x0']) * (b['y1'] - b['y0']), reverse=True)
    kept = []
    for b in blocks:
        dup = False
        for k in kept:
            ix = max(0, min(b['x1'], k['x1']) - max(b['x0'], k['x0'])); iy = max(0, min(b['y1'], k['y1']) - max(b['y0'], k['y0']))
            if ix * iy > 0.6 * (b['x1'] - b['x0']) * (b['y1'] - b['y0']): dup = True; break
        if not dup and (b['x1'] - b['x0']) >= 8 and (b['y1'] - b['y0']) >= 8: kept.append(b)
    mask = (mask > 0).astype(np.uint8) * 255
    grow_blocks(mask, kept)
    return mask, kept

def grow_blocks(mask, blocks):
    """블록 상자가 글자 줄의 끝(세로 글의 위·아래 등)을 놓치는 일이 있어, 상자에 닿는 글자 덩어리까지 넓힌다.
    (그래야 그 글자까지 읽고 지운다) 한 번에 너무 커지지 않게 원래 크기의 1.6 배까지만."""
    if not blocks: return
    joined = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)
    for b in blocks:
        bw, bh = b['x1'] - b['x0'], b['y1'] - b['y0']
        ids = np.unique(lab[b['y0']:b['y1'], b['x0']:b['x1']]); ids = ids[ids > 0]
        x0, y0, x1, y1 = b['x0'], b['y0'], b['x1'], b['y1']
        for i in ids:
            x, y, w, h, area = (int(v) for v in stats[i])
            if area < 12 or w > bw * 2.5 + 40 or h > bh * 2.5 + 40: continue   # 그림 선까지 이어진 큰 덩어리는 빼고
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x + w), max(y1, y + h)
        cx0, cy0 = b['x0'] - int(bw * 0.3), b['y0'] - int(bh * 0.3); cx1, cy1 = b['x1'] + int(bw * 0.3), b['y1'] + int(bh * 0.3)
        b['x0'], b['y0'], b['x1'], b['y1'] = max(x0, cx0, 0), max(y0, cy0, 0), min(x1, cx1, mask.shape[1]), min(y1, cy1, mask.shape[0])
    # 넓히다가 많이 겹친 블록(같은 대사를 둘로 나눠 찾았던 것)은 하나로 합친다 — 같은 대사를 두 번 옮겨 겹쳐 그리지 않게
    area = lambda b: max(1, (b['x1'] - b['x0']) * (b['y1'] - b['y0']))
    merged = True
    while merged:
        merged = False
        for i in range(len(blocks)):
            for j in range(i + 1, len(blocks)):
                a, c = blocks[i], blocks[j]
                ix = max(0, min(a['x1'], c['x1']) - max(a['x0'], c['x0'])); iy = max(0, min(a['y1'], c['y1']) - max(a['y0'], c['y0']))
                if ix * iy > 0.4 * min(area(a), area(c)):
                    big = a if area(a) >= area(c) else c
                    a.update(x0=min(a['x0'], c['x0']), y0=min(a['y0'], c['y0']), x1=max(a['x1'], c['x1']), y1=max(a['y1'], c['y1']),
                             vertical=big['vertical'], fs=max(a.get('fs') or 0, c.get('fs') or 0), lines=a['lines'] + c['lines'])
                    blocks.pop(j); merged = True; break
            if merged: break

import unicodedata
def nfkc(t): return unicodedata.normalize('NFKC', t or '').strip()
def rapid_text(crop, lang):
    res, _ = rapid()(crop)
    if not res: return ''
    res.sort(key=lambda r: (min(p[1] for p in r[0]), min(p[0] for p in r[0])))
    return ('' if lang == 'zh' else ' ').join(r[1] for r in res if r[2] > 0.5).strip()
def ocr_block(rgb, b, lang):
    """블록 글자 읽기. 일본어 쪽이라도 이 말풍선이 영어면(manga-ocr 가 전각 로마자만 내면) 영어 읽기로 다시 읽는다."""
    pad = 4
    x0, y0, x1, y1 = max(0, b['x0'] - pad), max(0, b['y0'] - pad), min(rgb.shape[1], b['x1'] + pad), min(rgb.shape[0], b['y1'] + pad)
    crop = rgb[y0:y1, x0:x1]
    if lang == 'ja':
        t = (mocr()(Image.fromarray(crop)) or '').strip()
        n = nfkc(t)
        if not KANA.search(n) and not CJK.search(n) and len(LATIN.findall(n)) >= 2:
            e = rapid_text(crop, 'en')
            if e: b['lang'] = 'en'; return nfkc(e)
        return t   # 일본어는 NFKC 를 하지 않는다(ｰ·〜 같은 표기를 지킨다)
    return nfkc(rapid_text(crop, lang))

def guess_lang(rgb, blocks):
    """앞 블록 몇 개를 읽어 언어를 정한다: 가나가 있으면 일본어, 로마자면 영어, 한자만이면 중국어, 한글이면 번역 안 함"""
    sample = sorted(blocks, key=lambda b: -(b['x1'] - b['x0']) * (b['y1'] - b['y0']))[:4]
    ja = ' '.join(ocr_block(rgb, b, 'ja') for b in sample)
    if len(KANA.findall(ja)) >= 2: return 'ja'
    ro = ' '.join(ocr_block(rgb, b, 'en') for b in sample)
    hg, lt, cj = len(HANGUL.findall(ro)), len(LATIN.findall(ro)), len(CJK.findall(ro))
    if hg >= 4 and hg >= 0.6 * (hg + lt + cj): return 'ko'   # 대부분이 한글일 때만
    if len(LATIN.findall(ro)) >= max(4, len(CJK.findall(ro))): return 'en'
    if len(CJK.findall(ro)) >= 2: return 'zh'
    return 'ja' if CJK.search(ja) else 'en'

def reading_order(blocks, rtl):
    """한 줄(가로 띠)씩 묶고, 띠 안에서는 일본 만화면 오른쪽부터"""
    rows = []
    for b in sorted(blocks, key=lambda b: b['y0']):
        cy = (b['y0'] + b['y1']) / 2
        for r in rows:
            if r['y0'] - 10 <= cy <= r['y1'] + 10:
                r['items'].append(b); r['y0'] = min(r['y0'], b['y0']); r['y1'] = max(r['y1'], b['y1']); break
        else: rows.append({'y0': b['y0'], 'y1': b['y1'], 'items': [b]})
    out = []
    for r in rows: out += sorted(r['items'], key=lambda b: -b['x1'] if rtl else b['x0'])
    return out

def clean_region(img, mask, b):
    """블록 자리의 원문을 지운다. 둘레가 고른 색(흰 말풍선 등)이면 그 색으로 칠하고, 그림 위 글자면 LaMa 로 지운다."""
    h, w = img.shape[:2]
    m = 28
    x0, y0, x1, y1 = max(0, b['x0'] - m), max(0, b['y0'] - m), min(w, b['x1'] + m), min(h, b['y1'] + m)
    reg = img[y0:y1, x0:x1]; rm = mask[y0:y1, x0:x1].copy()
    # 블록 밖의 마스크는 건드리지 않는다
    inner = np.zeros_like(rm); inner[b['y0'] - y0:b['y1'] - y0, b['x0'] - x0:b['x1'] - x0] = 255
    rm = cv2.bitwise_and(rm, inner)
    if rm.sum() == 0: rm = inner.copy()
    rm = cv2.dilate(rm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    ring = cv2.dilate(rm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) & ~rm
    px = reg[ring > 0]
    if len(px) and px.std(axis=0).mean() < 14:
        reg[rm > 0] = np.median(px, axis=0).astype(np.uint8)          # 고른 바탕: 그 색으로
    else:
        out = np.asarray(lama()(Image.fromarray(reg), Image.fromarray(rm)).convert('RGB'))
        out = cv2.resize(out, (reg.shape[1], reg.shape[0])) if out.shape[:2] != reg.shape[:2] else out
        reg[rm > 0] = out[rm > 0]
    img[y0:y1, x0:x1] = reg

FONT_PATHS = [r'C:\Windows\Fonts\malgunbd.ttf', r'C:\Windows\Fonts\malgun.ttf', '/System/Library/Fonts/AppleSDGothicNeo.ttc']
FONT = next((p for p in FONT_PATHS if os.path.exists(p)), None)
_fonts = {}
def font(sz):
    if sz not in _fonts: _fonts[sz] = ImageFont.truetype(FONT, sz) if FONT else ImageFont.load_default()
    return _fonts[sz]

def bubble_of(img, b):
    """블록을 둘러싼 밝은 말풍선 안쪽을 찾는다 → (창 기준 마스크, 창 왼쪽 위 x, y, 바탕색) 또는 None.
    말풍선 테두리(어두운 선)를 벽으로 두껍게 만든 뒤 가운데에서 채워 나가서, 얇은 틈으로 바깥에 새지 않게 한다."""
    h, w = img.shape[:2]
    bw, bh = b['x1'] - b['x0'], b['y1'] - b['y0']
    span = max(bw, bh)
    wx0, wy0 = max(0, b['x0'] - span), max(0, b['y0'] - int(span * 0.7))
    wx1, wy1 = min(w, b['x1'] + span), min(h, b['y1'] + int(span * 0.7))
    win = img[wy0:wy1, wx0:wx1]
    gray = cv2.cvtColor(win, cv2.COLOR_RGB2GRAY)
    core = gray[b['y0'] - wy0:b['y1'] - wy0, b['x0'] - wx0:b['x1'] - wx0]
    if core.size == 0: return None
    bg = float(np.median(core))
    if bg < 175: return None                                     # 밝은 말풍선이 아니다(그림 위 글자)
    walls = (gray < bg - 55).astype(np.uint8) * 255
    walls = cv2.dilate(walls, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    free = cv2.bitwise_not(walls)
    # 가운데에서 채운다(가운데가 벽이면 가까운 빈 곳에서)
    cy, cx = (b['y0'] + b['y1']) // 2 - wy0, (b['x0'] + b['x1']) // 2 - wx0
    if free[cy, cx] == 0:
        ys, xs = np.nonzero(free[max(0, cy - bh // 2):cy + bh // 2, max(0, cx - bw // 2):cx + bw // 2])
        if not len(xs): return None
        cy, cx = ys[len(ys) // 2] + max(0, cy - bh // 2), xs[len(xs) // 2] + max(0, cx - bw // 2)
    ff = np.zeros((free.shape[0] + 2, free.shape[1] + 2), np.uint8)
    cv2.floodFill(free, ff, (int(cx), int(cy)), 128, 0, 0, 4 | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    reg = ff[1:-1, 1:-1]
    ys, xs = np.nonzero(reg)
    if not len(xs): return None
    if xs.min() == 0 or ys.min() == 0 or xs.max() >= reg.shape[1] - 1 or ys.max() >= reg.shape[0] - 1: return None   # 창 밖으로 샜다
    if not (0.5 * bw * bh <= len(xs) <= 14 * bw * bh): return None
    reg = cv2.dilate(reg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))   # 벽을 두껍게 한 만큼 되돌린다
    return reg, wx0, wy0, bg

def inner_rect(reg):
    """말풍선 마스크 안에 들어가는 가장 큰 직사각형 근처: 바운딩 박스를 가운데로 줄여 가며 98% 이상 안에 들 때까지"""
    ys, xs = np.nonzero(reg)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    mx, my = xs.mean(), ys.mean()
    for s in np.arange(0.95, 0.35, -0.03):
        hw, hh = (x1 - x0) * s / 2, (y1 - y0) * s / 2
        rx0, ry0, rx1, ry1 = int(mx - hw), int(my - hh), int(mx + hw), int(my + hh)
        if rx0 < 0 or ry0 < 0 or rx1 >= reg.shape[1] or ry1 >= reg.shape[0]: continue
        sub = reg[ry0:ry1, rx0:rx1]
        if sub.size and (sub > 0).mean() >= 0.985: return rx0, ry0, rx1, ry1
    return None

def wipe_bubble(img, bub):
    """말풍선 안에 남은 글자 조각(마스크가 놓친 줄 등)을 바탕색으로 지운다"""
    reg, wx0, wy0, bg = bub
    inner = cv2.erode(reg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    win = img[wy0:wy0 + reg.shape[0], wx0:wx0 + reg.shape[1]]
    lum = win.mean(axis=2)
    ring = inner > 0
    if not ring.any(): return
    base = np.median(win[ring & (np.abs(lum - bg) < 25)], axis=0) if (ring & (np.abs(lum - bg) < 25)).any() else np.array([bg, bg, bg])
    dirty = ring & (np.abs(lum - bg) > 30)
    dirty = cv2.dilate(dirty.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))).astype(bool) & ring
    win[dirty] = base.astype(np.uint8)

def text_area(img, b, bub):
    """한국어를 넣을 자리. 말풍선이면 그 안의 직사각형, 아니면(그림 위 글자) 원래 자리 근처를 알맞게 넓힌 곳."""
    h, w = img.shape[:2]
    bw, bh = b['x1'] - b['x0'], b['y1'] - b['y0']
    if bub:
        r = inner_rect(bub[0])
        if r:
            ax0, ay0, ax1, ay1 = r[0] + bub[1], r[1] + bub[2], r[2] + bub[1], r[3] + bub[2]
            pad = max(2, int(min(ax1 - ax0, ay1 - ay0) * 0.04))
            return [ax0 + pad, ay0 + pad, ax1 - pad, ay1 - pad], True
    if b['vertical']:
        # 세로 글자 자리(좁고 긺) → 가로 한국어가 들어가게: 너비는 높이의 0.9 까지 넓히되 원래보다 너무 크지 않게
        fs = b.get('fs') or bw
        # 한 줄에 한글 5자 이상은 들어가게 (짧은 세로 글자 자리에서 한 글자씩 세로로 쌓이지 않게)
        nw = int(max(min(max(bw, bh * 0.9), max(bw * 3.2, bh * 0.6)), fs * 5)); cx = (b['x0'] + b['x1']) // 2
        return [max(0, cx - nw // 2), b['y0'], min(w, cx + nw // 2), b['y1']], False
    ex = int(bw * 0.06); return [max(0, b['x0'] - ex), b['y0'], min(w, b['x1'] + ex), b['y1']], False

NO_START = set('!?.,…~)]}」』"\'♡♥ㅋ”’、。！？')   # 줄 머리에 오면 어색한 글자(앞 줄 끝에 붙인다)
def wrap(draw, text, f, maxw):
    """띄어쓰기로 먼저 나누고, 한 낱말이 너무 길면 글자 단위로. 문장부호·♡ 는 줄 머리에 오지 않게 앞 줄에 붙인다."""
    lines = []
    for para in text.split('\n'):
        words = para.split(' '); cur = ''
        for wd in words:
            t = (cur + ' ' + wd).strip()
            if draw.textlength(t, font=f) <= maxw or not cur and draw.textlength(wd, font=f) <= maxw: cur = t; continue
            if cur: lines.append(cur)
            cur = ''
            for ch in wd:
                if draw.textlength(cur + ch, font=f) <= maxw or (ch in NO_START and cur): cur += ch
                else:
                    if cur: lines.append(cur)
                    cur = ch
        lines.append(cur)
    out = []
    for l in lines:
        if not l: continue
        while out and l and l[0] in NO_START: out[-1] += l[0]; l = l[1:].lstrip()
        if l: out.append(l)
    return out or ['']

def draw_text(pil, area, text, color, stroke_color, ref_size):
    draw = ImageDraw.Draw(pil)
    x0, y0, x1, y1 = area; aw, ah = max(10, x1 - x0), max(10, y1 - y0)
    # 원래 글자 크기보다 너무 커지지 않게 (한글은 같은 크기에서 조금 더 커 보여 1.1 배까지)
    hi = int(min(ah, max(14, ref_size * 1.1) if ref_size else 64, 90)); lo = 9; best = None
    while lo <= hi:
        sz = (lo + hi) // 2; f = font(sz)
        lines = wrap(draw, text, f, aw); lh = int(sz * 1.18)
        tw = max(draw.textlength(l, font=f) for l in lines); th = lh * len(lines)
        if tw <= aw and th <= ah: best = (sz, lines, lh); lo = sz + 1
        else: hi = sz - 1
    if not best:
        f = font(9); best = (9, wrap(draw, text, f, aw), 11)
    sz, lines, lh = best; f = font(sz)
    total = lh * len(lines); y = y0 + (ah - total) / 2
    sw = max(1, sz // 9) if stroke_color else 0
    for l in lines:
        tw = draw.textlength(l, font=f); x = x0 + (aw - tw) / 2
        draw.text((x, y), l, font=f, fill=color, stroke_width=sw, stroke_fill=stroke_color)
        y += lh

def text_colors(orig, mask, b):
    """원래 글자색(어두우면 검정, 밝으면 흰색)과 바탕을 보고 글자·테두리 색을 정한다"""
    reg = orig[b['y0']:b['y1'], b['x0']:b['x1']]; rm = mask[b['y0']:b['y1'], b['x0']:b['x1']] > 0
    if reg.size == 0: return (20, 20, 20), (255, 255, 255)
    lum = reg.mean(axis=2)
    # 바탕: 글자 밖의 가운데 값. 바탕이 어두우면 흰 글자(검은 테두리), 밝으면 검은 글자(흰 테두리).
    # 그 사이(중간 밝기)는 글자 안쪽 밝은 부분(75%)과 바탕을 비교한다 — 흰 글자에 검은 테두리를 두른 원문도 맞게
    bg = float(np.median(lum[~rm])) if (~rm).any() else float(lum.max())
    if bg < 110: return (255, 255, 255), (20, 20, 20)
    if bg > 175: return (20, 20, 20), (255, 255, 255)
    fg = float(np.percentile(lum[rm], 75)) if rm.any() else float(lum.min())
    return ((20, 20, 20), (255, 255, 255)) if fg <= bg else ((255, 255, 255), (20, 20, 20))

def translate_page(img_bytes, opts):
    t0 = time.time()
    pv = opts.get('provider') or {}
    key = hashlib.sha1(img_bytes + json.dumps({**{k: opts.get(k) for k in ('lang', 'model', 'dir')}, 'p': [pv.get('id'), pv.get('model'), pv.get('base')]}, sort_keys=True).encode() + str(VERSION).encode()).hexdigest()
    cdir = os.path.join(CACHE, 'pages'); os.makedirs(cdir, exist_ok=True)
    cj = os.path.join(cdir, key + '.json')
    force = bool(opts.get('force'))   # 처음부터 다시: 저장해 둔 결과를 쓰지 않는다
    if os.path.exists(cj) and not force:
        with open(cj, encoding='utf-8') as f: c = json.load(f)
        if not c.get('note'): return c   # 예전에 저장된 '글자를 찾지 못했어요' 같은 실패는 다시 해 본다
    pil = Image.open(io.BytesIO(img_bytes)).convert('RGB'); rgb = np.array(pil)
    with GPU:
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        mask, blocks = detect_blocks(bgr)
        if not blocks: mask, blocks = detect_blocks(bgr, conf=0.25)   # 못 찾으면 더 민감하게 한 번 더 (작은 글씨·옅은 글씨)
        if not blocks:
            return {'lang': '', 'blocks': [], 'image': None, 'note': '글자를 찾지 못했어요'}   # 실패는 저장하지 않는다
        lang = opts.get('lang') or 'auto'
        if lang == 'auto': lang = guess_lang(rgb, blocks)
        if lang == 'ko':
            return {'lang': 'ko', 'blocks': [], 'image': None, 'note': '이미 한국어예요'}
        rtl = opts.get('dir') == 'rtl' or (opts.get('dir') in (None, '', 'auto') and lang == 'ja')
        blocks = reading_order(blocks, rtl)
        for i, b in enumerate(blocks): b['id'] = i + 1; b['src'] = ocr_block(rgb, b, lang)
    blocks = [b for b in blocks if re.search(r'[\w\u3040-\u30ff\u4e00-\u9fff]', b['src'])]
    model = model_for(opts.get('model', ''), bool(opts.get('adult')), opts.get('provider')); used = []
    ko = translate_lines([(b['id'], b['src']) for b in blocks], opts.get('context') or [], model, lang, opts.get('provider'), used)
    with GPU:
        out = rgb.copy()
        colors = {b['id']: text_colors(rgb, mask, b) for b in blocks}
        for b in blocks: clean_region(out, mask, b)
        # 말풍선을 찾아 남은 글자 조각까지 지운 뒤 그린다
        bubs = {}
        for b in blocks:
            try: bubs[b['id']] = bubble_of(out, b)
            except Exception: bubs[b['id']] = None
            if bubs[b['id']]: wipe_bubble(out, bubs[b['id']])
        canvas = Image.fromarray(out)
        for b in blocks:
            b['ko'] = ko.get(b['id'], b['src'])
            area, bubble = text_area(out, b, bubs[b['id']])
            if not bubble:
                # 그림 위 글자 자리는 옆 블록의 원래 자리와 겹치지 않게 그 사이 가운데에서 자른다
                for o in blocks:
                    if o is b or o['y1'] < area[1] or o['y0'] > area[3]: continue
                    if o['x0'] >= b['x1'] and area[2] > o['x0']: area[2] = max(b['x1'], (b['x1'] + o['x0']) // 2)
                    if o['x1'] <= b['x0'] and area[0] < o['x1']: area[0] = min(b['x0'], (b['x0'] + o['x1']) // 2)
            fill, stroke = colors[b['id']]
            draw_text(canvas, area, b['ko'], fill, None if bubble else stroke, b.get('fs') or (b['x1'] - b['x0'] if b['vertical'] else b['y1'] - b['y0']))
        free_gpu()
    buf = io.BytesIO(); canvas.save(buf, 'JPEG', quality=92)
    res = {'lang': lang, 'model': model, 'by': sorted(set(used)), 'ms': int((time.time() - t0) * 1000),
           'blocks': [{'x': b['x0'], 'y': b['y0'], 'w': b['x1'] - b['x0'], 'h': b['y1'] - b['y0'], 'src': b['src'], 'ko': b['ko']} for b in blocks],
           'image': base64.b64encode(buf.getvalue()).decode()}
    # 덜 옮겨진 대사(원문이 남거나 가나가 섞인 줄)를 센다. 셋 중 하나 넘게 남았으면 저장하지 않는다 → 다음에 다시 해 본다
    res['left'] = sum(1 for b in blocks if bad_ko(b['ko'], b['src']))
    if res['left'] <= len(blocks) * 0.3:
        with open(cj, 'w', encoding='utf-8') as f: json.dump(res, f, ensure_ascii=False)
    return res

# ---------------------------------------------------------------- 영상
JOBS = {}
SYS_SUB = SYS_MANGA.replace('만화와 웹툰을', '영상(애니메이션·드라마) 자막을').replace('말풍선에 들어가야 하므로', '자막으로 읽기 쉽게').replace('효과음·의성어는 한국 만화식 의성어로(ドン→쾅, ドキドキ→두근두근).', '신음·감탄사는 한국어 감탄사로 자연스럽게.')
def vtt_time(s):
    h = int(s // 3600); m = int(s % 3600 // 60); x = s - h * 3600 - m * 60
    return f'{h:02d}:{m:02d}:{x:06.3f}'
def video_job(job_id, path, model_want, prov=None, adult=False):
    J = JOBS[job_id]
    try:
        st = os.stat(path)
        pv = prov or {}
        key = hashlib.sha1(f"{path}|{st.st_size}|{int(st.st_mtime)}|{VERSION}|{pv.get('id')}|{pv.get('model')}".encode()).hexdigest()
        cv = os.path.join(CACHE, 'video', key + '.vtt'); os.makedirs(os.path.dirname(cv), exist_ok=True)
        if os.path.exists(cv):
            J.update(state='done', progress=1, vtt=open(cv, encoding='utf-8').read(), msg='저장해 둔 자막'); return
        J.update(msg='음성 듣는 중…')
        with GPU:
            from faster_whisper import WhisperModel
            dev = device()
            wm = WhisperModel('large-v3-turbo', device=dev, compute_type='float16' if dev == 'cuda' else 'int8', download_root=os.path.join(MODELS, 'hf', 'whisper'))
            segs, info = wm.transcribe(path, vad_filter=True, beam_size=5, condition_on_previous_text=True)
            dur = info.duration or 1; items = []
            for s in segs:
                if J.get('cancel'): raise RuntimeError('멈췄어요')
                t = s.text.strip()
                if t: items.append({'a': s.start, 'b': s.end, 't': t})
                J.update(progress=min(0.7, 0.7 * s.end / dur), msg=f'음성 듣는 중… {vtt_time(s.end)[:8]} / {vtt_time(dur)[:8]}')
            lang = info.language
            del wm; free_gpu()
        if not items: raise RuntimeError('말소리를 찾지 못했어요')
        if lang != 'ko':
            model = model_for(model_want, adult, prov); ctx = []
            for i in range(0, len(items), 25):
                if J.get('cancel'): raise RuntimeError('멈췄어요')
                batch = items[i:i + 25]
                ko = translate_lines([(k + 1, it['t']) for k, it in enumerate(batch)], ctx, model, {'ja': 'ja', 'en': 'en', 'zh': 'zh'}.get(lang, lang), prov)
                for k, it in enumerate(batch): it['ko'] = ko.get(k + 1, it['t'])
                ctx += [(it['t'], it['ko']) for it in batch]
                J.update(progress=0.7 + 0.3 * min(1, (i + 25) / len(items)), msg=f'한국어로 옮기는 중… {min(i + 25, len(items))}/{len(items)}줄')
        vtt = 'WEBVTT\n\n' + '\n\n'.join(f"{vtt_time(it['a'])} --> {vtt_time(it['b'])}\n{it.get('ko', it['t'])}" for it in items) + '\n'
        with open(cv, 'w', encoding='utf-8') as f: f.write(vtt)
        # 영상 옆에도 둔다(다른 기기·다른 플레이어에서도 보이게): 이름.ko.vtt
        try:
            side = os.path.splitext(path)[0] + '.ko.vtt'
            if not os.path.exists(side):
                with open(side, 'w', encoding='utf-8') as f: f.write(vtt)
        except Exception: pass
        J.update(state='done', progress=1, vtt=vtt, msg=f'자막 {len(items)}줄 ({lang} → 한국어)')
    except Exception as e:
        log('영상 번역 실패', traceback.format_exc()); free_gpu()
        J.update(state='error', msg=str(e))

# ---------------------------------------------------------------- HTTP
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(b)))
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', 'Content-Type'); self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self._send(204, {})
    def _body(self):
        n = int(self.headers.get('Content-Length') or 0); return json.loads(self.rfile.read(n) or b'{}')
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == '/health':
            ok_ol = True
            try: ollama_models()
            except Exception: ok_ol = False
            return self._send(200, {'ok': True, 'device': device(), 'ollama': ok_ol, 'version': VERSION})
        if u.path == '/job':
            J = JOBS.get((q.get('id') or [''])[0])
            return self._send(200, J) if J else self._send(404, {'error': '없는 작업'})
        self._send(404, {'error': 'not found'})
    def do_POST(self):
        u = urlparse(self.path)
        try:
            if u.path == '/page':
                d = self._body(); img = base64.b64decode(d.get('image') or '')
                if not img: return self._send(400, {'error': '그림이 없어요'})
                res = translate_page(img, d)
                # 번역한 쪽을 쪽 열쇠(작품|회차|그림 이름)로 저장해 둔다: 다음에 열 때·다른 기기(폰)에서 다시 옮기지 않는다
                if d.get('key') and res.get('image') and res.get('left', 0) <= len(res.get('blocks') or []) * 0.3:
                    try:
                        os.makedirs(PAGES, exist_ok=True)
                        f = os.path.join(PAGES, hashlib.sha1(str(d['key']).encode('utf-8')).hexdigest() + '.json')
                        with open(f + '.part', 'w', encoding='utf-8') as fp: json.dump({**res, 'key': d['key'], 't': int(time.time() * 1000)}, fp, ensure_ascii=False)
                        os.replace(f + '.part', f)
                    except Exception as e: log('쪽 저장 실패', e)
                return self._send(200, res)
            if u.path == '/video':
                d = self._body(); p = d.get('path') or ''
                if not os.path.isfile(p) or not re.search(r'\.(mp4|m4v|mkv|webm|mov|avi|ts|wmv|flv|mp3|m4a|wav)$', p, re.I): return self._send(400, {'error': '영상 파일을 찾지 못했어요'})
                for jid, J in JOBS.items():
                    if J.get('path') == p and J['state'] == 'running': return self._send(200, {'id': jid})
                jid = uuid.uuid4().hex[:10]
                JOBS[jid] = {'id': jid, 'path': p, 'state': 'running', 'progress': 0, 'msg': '준비 중…'}
                threading.Thread(target=video_job, args=(jid, p, d.get('model', ''), d.get('provider'), bool(d.get('adult'))), daemon=True).start()
                return self._send(200, {'id': jid})
            if u.path == '/models':
                d = self._body()
                try: return self._send(200, {'models': list_models(d.get('provider') or {})})
                except Exception as e: return self._send(200, {'models': [], 'error': str(e)[:300]})
            if u.path == '/subs':
                d = self._body(); vtt = d.get('vtt') or ''
                cues = [b.split('\n') for b in re.split(r'\n\s*\n', vtt.replace('\r', '')) if '-->' in b]
                items = []
                for c in cues:
                    ti = next(k for k, x in enumerate(c) if '-->' in x)
                    t = re.sub(r'<[^>]+>', '', ' '.join(c[ti + 1:])).strip()
                    if t: items.append({'time': c[ti].strip(), 't': t})
                if not items: return self._send(400, {'error': '자막에 글자가 없어요'})
                model = model_for(d.get('model', ''), bool(d.get('adult')), d.get('provider')); ctx = []; used = []
                for i in range(0, len(items), 25):
                    batch = items[i:i + 25]
                    ko = translate_lines([(k + 1, it['t']) for k, it in enumerate(batch)], ctx, model, d.get('lang') or 'auto', d.get('provider'), used)
                    for k, it in enumerate(batch): it['ko'] = ko.get(k + 1, it['t'])
                    ctx += [(it['t'], it['ko']) for it in batch]
                out = 'WEBVTT\n\n' + '\n\n'.join(f"{it['time']}\n{it['ko']}" for it in items) + '\n'
                return self._send(200, {'vtt': out, 'lines': len(items), 'by': sorted(set(used))})
            if u.path == '/forget':
                d = self._body(); keys = set(d.get('keys') or []); prefix = d.get('prefix') or ''; n = 0
                if os.path.isdir(PAGES):
                    for k in keys:
                        f = os.path.join(PAGES, hashlib.sha1(str(k).encode('utf-8')).hexdigest() + '.json')
                        if os.path.exists(f): os.remove(f); n += 1
                    if prefix:
                        for name in os.listdir(PAGES):
                            f = os.path.join(PAGES, name)
                            try:
                                with open(f, encoding='utf-8') as fp: k = json.load(fp).get('key', '')
                                if str(k).startswith(prefix): os.remove(f); n += 1
                            except Exception: pass
                return self._send(200, {'ok': True, 'removed': n})
            if u.path == '/cancel':
                J = JOBS.get(self._body().get('id', ''));
                if J: J['cancel'] = True
                return self._send(200, {'ok': True})
            if u.path == '/quit':
                self._send(200, {'ok': True}); threading.Thread(target=lambda: (time.sleep(0.3), os._exit(0)), daemon=True).start(); return
            self._send(404, {'error': 'not found'})
        except urllib.error.URLError as e:
            self._send(503, {'error': 'ollama', 'detail': str(e)})
        except Exception as e:
            log(traceback.format_exc()); self._send(500, {'error': str(e)})

if __name__ == '__main__':
    os.makedirs(CACHE, exist_ok=True)
    log(f'노벨리스트 번역 엔진 http://127.0.0.1:{PORT}  ({device()})')
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
