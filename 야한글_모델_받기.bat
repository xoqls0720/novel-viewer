@echo off
title 야한 글 모델 받기 (노벨리스트)
setlocal enabledelayedexpansion
rem 이 파일은 한글이 깨지지 않게 기본 코드(CP949)로 저장되어 있어요.
set "OL_DIR=%LOCALAPPDATA%\Programs\Ollama"
set "OL_EXE=ollama"
where ollama >nul 2>nul
if errorlevel 1 set "OL_EXE=%OL_DIR%\ollama.exe"
if not exist "%OL_EXE%" if "%OL_EXE%"=="%OL_DIR%\ollama.exe" goto noinstall

echo ============================================
echo  야한 글을 그대로 써 주는 모델 받기
echo ============================================
echo.
echo  Claude·Gemini는 성인 장면을 스스로 수위를 낮춰 써요.
echo  이 모델들은 내 컴퓨터에서 돌아서 그런 제한이 없어요.
echo  (그림은 노벨AI라 이것과 상관없어요)
echo.
echo  어느 걸 받을까요?
echo.
echo   [1] 가볍게   qwen3-abliterated:4b-instruct-2507-q8_0   약 4.3GB
echo       그래픽카드 6GB 이상. 빠르고 무난해요.
echo.
echo   [2] 추천     qwen3-abliterated:8b                      약 5.0GB
echo       그래픽카드 8GB. 한국어 글이 가장 자연스러워요.
echo.
echo   [3] 더 좋게  qwen3-abliterated:14b                     약 9.0GB
echo       그래픽카드 12GB 이상. 느리지만 글이 깊어요.
echo.
echo   [4] 아주 좋게 huihui_ai/Qwen3.8-abliterated            약 18GB
echo       메모리 32GB 이상. 많이 느려요.
echo.
echo   [0] 그만두기
echo.
set /p PICK=번호를 누르고 엔터: 

if "%PICK%"=="1" set "MODEL=huihui_ai/qwen3-abliterated:4b-instruct-2507-q8_0"
if "%PICK%"=="2" set "MODEL=huihui_ai/qwen3-abliterated:8b"
if "%PICK%"=="3" set "MODEL=huihui_ai/qwen3-abliterated:14b"
if "%PICK%"=="4" set "MODEL=huihui_ai/Qwen3.8-abliterated"
if "%PICK%"=="0" exit /b 0
if not defined MODEL echo 번호를 잘못 눌렀어요. & pause & exit /b 1

echo.
echo [1/2] Ollama를 켜 둘게요...
setx OLLAMA_ORIGINS "*" >nul
setx OLLAMA_CONTEXT_LENGTH 16384 >nul
set "OLLAMA_ORIGINS=*"
set "OLLAMA_CONTEXT_LENGTH=16384"
if exist "%OL_DIR%\ollama app.exe" start "" "%OL_DIR%\ollama app.exe"
timeout /t 3 >nul

echo.
echo [2/2] %MODEL% 을 받는 중이에요. 처음에는 오래 걸려요(인터넷 속도에 따라 10분~1시간).
echo        창을 닫지 말고 기다려 주세요.
echo.
"%OL_EXE%" pull %MODEL%
if errorlevel 1 goto failed

echo.
echo ============================================
echo  다 받았어요!
echo ============================================
echo.
echo  이제 노벨리스트에서 이렇게 해 주세요.
echo.
echo   1. 설정 탭 - 기본으로 쓸 AI 를 [Ollama] 로
echo   2. Ollama 칸의 모델에 아래를 그대로 붙여 넣기
echo.
echo      %MODEL%
echo.
echo   3. [연결 확인] 누르기
echo   4. 웹툰 - 자동 만들기 - 등급 [성인], 수위 [직접적으로]
echo.
echo  모델 이름을 클립보드에 복사해 둘게요.
echo %MODEL%| clip
echo.
"%OL_EXE%" list
pause
exit /b 0

:failed
echo.
echo 받지 못했어요. 인터넷을 확인하고 다시 해 주세요.
echo 저장 공간이 모자라면 더 작은 번호를 골라 주세요.
pause
exit /b 1

:noinstall
echo Ollama가 설치되어 있지 않아요. 열리는 페이지에서 설치한 뒤 이 파일을 다시 실행해 주세요.
start "" https://ollama.com/download
pause
exit /b 1
