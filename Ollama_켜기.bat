@echo off
title Ollama 켜기 (노벨 뷰어용)
setlocal
rem 이 파일은 한국어 윈도우 기본 글자(CP949)로 저장되어 있어요.
set "OL_DIR=%LOCALAPPDATA%\Programs\Ollama"
set "OL_APP=%OL_DIR%\ollama app.exe"
set "OL_EXE=ollama"
where ollama >nul 2>nul
if errorlevel 1 set "OL_EXE=%OL_DIR%\ollama.exe"
if not exist "%OL_APP%" if "%OL_EXE%"=="%OL_DIR%\ollama.exe" goto noinstall

echo [1/3] 뷰어가 Ollama에 붙을 수 있게 설정을 저장해요...
setx OLLAMA_ORIGINS "*" >nul
setx OLLAMA_CONTEXT_LENGTH 16384 >nul
set "OLLAMA_ORIGINS=*"
set "OLLAMA_CONTEXT_LENGTH=16384"

echo [2/3] 켜져 있던 Ollama를 껐다가 다시 켜요...
taskkill /f /im "ollama app.exe" >nul 2>nul
taskkill /f /im ollama.exe >nul 2>nul
timeout /t 2 /nobreak >nul
if exist "%OL_APP%" goto startapp
start "Ollama" /min "%OL_EXE%" serve
goto wait
:startapp
start "" "%OL_APP%"

:wait
echo [3/3] 켜지기를 기다려요...
for /l %%i in (1,1,30) do (
  curl -s http://127.0.0.1:11434/api/version >nul 2>nul && goto ok
  timeout /t 1 /nobreak >nul
)
echo.
echo Ollama가 30초 안에 켜지지 않았어요.
echo 작업 표시줄 오른쪽 아래에 라마 아이콘이 있는지 보고, 컴퓨터를 다시 켠 뒤 이 파일을 한 번 더 실행해 주세요.
pause
exit /b 1

:ok
echo.
echo Ollama가 켜졌어요. 작업 표시줄 오른쪽 아래 라마 아이콘으로 떠 있어서 이 창은 닫아도 돼요.
echo.
echo 받은 모델:
"%OL_EXE%" list
echo.
echo 모델이 없거나 더 받고 싶으면 명령 창에서:
echo   ollama pull qwen3:8b       (한국어 글쓰기와 분석, 그래픽카드 8GB에 맞음)
echo   ollama pull gemma3:4b      (빠름, 그림도 봄)
echo   ollama pull gemma3:12b     (더 똑똑하지만 8GB에서는 느림)
echo.
echo 이제 뷰어 설정 탭에서 [연결 확인]을 눌러 주세요.
pause
exit /b 0

:noinstall
echo Ollama가 설치되어 있지 않아요. 열리는 페이지에서 설치한 뒤 이 파일을 다시 실행해 주세요.
start "" https://ollama.com/download
pause
exit /b 1
