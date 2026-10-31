# 노벨리스트 번역 엔진 설치 (처음 한 번). 보통 파이썬으로 실행한다:  python install.py
#   %USERPROFILE%\NovelistTranslator\ 아래에
#     venv\        GPU(CUDA) 파이썬 환경: torch, manga-ocr, LaMa(글자 지우기), faster-whisper(영상 음성), RapidOCR(영어·중국어)
#     vendor\ctd   comic-text-detector (말풍선·글자 찾기, GPL-3.0)
#     models\      내려받은 모델 (글자 찾기 가중치, 허깅페이스 캐시)
# 진행은 "STEP n/N 설명" 줄로 찍는다(노벨리스트가 읽어 보여 준다). 이미 된 단계는 건너뛰어서 다시 실행해도 된다.
import os, sys, subprocess, urllib.request, zipfile, shutil, io, json

# AppData 밖(사용자 폴더 바로 아래)에 둔다: 스토어 앱(MSIX) 안에서 실행하면 AppData 에 새로 만든 폴더가
# 그 앱만 보는 곳으로 옮겨져 노벨리스트가 못 찾는 일이 있어서. NOVELIST_TR_HOME 으로 바꿀 수 있다.
HOME = os.environ.get('NOVELIST_TR_HOME') or os.path.join(os.path.expanduser('~'), 'NovelistTranslator')
VENV = os.path.join(HOME, 'venv')
PY = os.path.join(VENV, 'Scripts', 'python.exe') if os.name == 'nt' else os.path.join(VENV, 'bin', 'python')
VENDOR = os.path.join(HOME, 'vendor')
MODELS = os.path.join(HOME, 'models')
CTD_ZIP = 'https://github.com/dmMaze/comic-text-detector/archive/refs/heads/master.zip'
CTD_WEIGHTS = 'https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/comictextdetector.pt'
TORCH_INDEX = 'https://download.pytorch.org/whl/cu126'
PKGS = ['numpy<2', 'opencv-python<4.11', 'Pillow', 'manga-ocr==0.1.14', 'transformers>=4.36,<5', 'simple-lama-inpainting',
        'faster-whisper>=1.1', 'av>=12,<14', 'anthropic', 'rapidocr_onnxruntime', 'pyclipper', 'shapely', 'requests', 'tqdm', 'torchsummary', 'fugashi', 'unidic-lite']
STEPS = 7

def step(n, msg):
    print(f'STEP {n}/{STEPS} {msg}', flush=True)

def run(args):
    print('> ' + ' '.join(args), flush=True)
    p = subprocess.run(args)
    if p.returncode:
        raise SystemExit(f'실패했어요: {" ".join(args[:4])} … (코드 {p.returncode})')

def pip(*args):
    run([PY, '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location', *args])

def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    tmp = dest + '.part'
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, 'wb') as f:
        total = int(r.headers.get('Content-Length') or 0); got = 0
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b); got += len(b)
            if total: print(f'  {got * 100 // total}%  ({got >> 20}MB / {total >> 20}MB)', flush=True)
    os.replace(tmp, dest)

def main():
    os.makedirs(HOME, exist_ok=True); os.makedirs(MODELS, exist_ok=True); os.makedirs(VENDOR, exist_ok=True)
    step(1, '파이썬 환경 만들기')
    if not os.path.exists(PY):
        run([sys.executable, '-m', 'venv', VENV])
    run([PY, '-m', 'pip', 'install', '--disable-pip-version-check', '-q', '--upgrade', 'pip', 'wheel'])
    step(2, 'GPU 계산 도구(torch, 약 2.5GB) 받기')
    have_torch = subprocess.run([PY, '-c', 'import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)']).returncode == 0
    if not have_torch:
        pip('torch', 'torchvision', '--index-url', TORCH_INDEX)
    step(3, '글자 읽기·지우기·음성 인식 도구 받기')
    pip(*PKGS)
    step(4, '말풍선 찾기 도구(comic-text-detector) 받기')
    ctd = os.path.join(VENDOR, 'ctd')
    if not os.path.exists(os.path.join(ctd, 'inference.py')):
        data = urllib.request.urlopen(CTD_ZIP, timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            z.extractall(VENDOR)
        src = os.path.join(VENDOR, 'comic-text-detector-master')
        if os.path.exists(ctd): shutil.rmtree(ctd)
        os.replace(src, ctd)
    step(5, '말풍선 찾기 모델 받기 (약 75MB)')
    fetch(CTD_WEIGHTS, os.path.join(MODELS, 'comictextdetector.pt'))
    step(6, '글자 읽기·글자 지우기·음성 인식 모델 받기 (약 2.5GB, 처음 한 번)')
    env = dict(os.environ, HF_HOME=os.path.join(MODELS, 'hf'), LAMA_MODEL=os.path.join(MODELS, 'big-lama.pt'))
    warm = r'''
import os
from manga_ocr import MangaOcr; MangaOcr(force_cpu=True)
import urllib.request
p = os.environ["LAMA_MODEL"]
if not os.path.exists(p):
    urllib.request.urlretrieve("https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt", p)
from faster_whisper import WhisperModel; WhisperModel("large-v3-turbo", device="cpu", compute_type="int8", download_root=os.path.join(os.environ["HF_HOME"], "whisper"))
from rapidocr_onnxruntime import RapidOCR; RapidOCR()
print("models ok")
'''
    p = subprocess.run([PY, '-c', warm], env=env)
    if p.returncode: raise SystemExit('모델을 받지 못했어요. 인터넷 연결을 확인하고 다시 실행해 주세요.')
    step(7, 'GPU 확인')
    subprocess.run([PY, '-c', 'import torch; print("GPU:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "없음(느린 CPU로 동작)")'])
    with open(os.path.join(HOME, 'installed.json'), 'w', encoding='utf-8') as f:
        json.dump({'ok': True, 'version': 1}, f)
    print('DONE', flush=True)

if __name__ == '__main__':
    main()
