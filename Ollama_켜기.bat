@echo off
chcp 65001 >nul
title Ollama 켜기 (노벨 뷰어용)
rem 뷰어(브라우저)가 Ollama에 붙을 수 있게 허용한 뒤 Ollama를 켭니다.
where ollama >/dev/null 2>nul
if errorlevel 1 (
  echo Ollama가 설치되어 있지 않아요. https://ollama.com/download 에서 설치한 뒤 다시 실행해 주세요.
  start "" https://ollama.com/download
  pause
  exit /b
)
taskkill /f /im "ollama app.exe" >/dev/null 2>nul
taskkill /f /im ollama.exe >/dev/null 2>nul
setx OLLAMA_ORIGINS "*" >nul
set OLLAMA_ORIGINS=*
echo.
echo 받은 모델:
ollama list
echo.
echo 모델이 없으면 다른 창에서 이렇게 받아 주세요:
echo   ollama pull gemma3:12b     (글+그림, 그래픽카드 8GB 이상)
echo   ollama pull gemma3:4b      (가벼움)
echo   ollama pull qwen3:14b      (한국어 글쓰기)
echo.
echo 이 창을 닫으면 Ollama도 꺼져요. 뷰어 설정 탭에서 [연결 확인]을 눌러 주세요.
ollama serve
