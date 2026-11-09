@echo off
title 노벨리스트 새 판 설치
setlocal
rem 이 파일은 한글이 보이도록 기본 글자(CP949)로 저장되어 있어요.
set "NV=D:\novel\novel-viewer"
set "LOG=%NV%\설치_기록.txt"
cd /d "%NV%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 없어요. nodejs.org 에서 LTS 를 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
echo [1/3] 켜져 있는 노벨리스트를 닫아요...
taskkill /f /im Novelist.exe >nul 2>nul
timeout /t 2 /nobreak >nul
cd desktop
echo ===== %date% %time% ===== > "%LOG%"
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "VER=%%v"
del /q "dist\Novelist-Setup-%VER%.exe" >nul 2>nul
echo [2/3] 설치 파일을 만들어요. 몇 분 걸려요...
call npm run dist >> "%LOG%" 2>&1
call :find
if defined SETUP goto install
echo     깃허브 내려받기가 막혀서 다른 내려받기 서버로 다시 해요...
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
call npm run dist >> "%LOG%" 2>&1
call :find
if defined SETUP goto install
goto direct

:install
echo [3/3] 설치를 시작해요: %SETUP%
start "" "%SETUP%"
echo 설치 창에서 다음을 누르면 끝나요. 작품·설정은 그대로 남아요.
pause
exit /b 0

:find
set "SETUP="
for /f "delims=" %%f in ('dir /b /o:d "dist\Novelist-Setup-%VER%.exe" 2^>nul') do set "SETUP=dist\%%f"
exit /b 0

:direct
echo.
echo 설치 파일 만들기가 실패해서, 새 판을 바로 켜요. (오류는 설치_기록.txt 에 남겨 뒀어요)
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
call node prepare.js >> "%LOG%" 2>&1
if not exist node_modules\electron\dist\electron.exe (
  echo 처음 한 번만 실행 도구를 받아요...
  call node node_modules\electron\install.js >> "%LOG%" 2>&1
)
if not exist node_modules\electron\dist\electron.exe (
  echo 새 판을 켜지 못했어요. Claude 에게 "기록 봐 줘" 라고 말해 주세요.
  pause
  exit /b 1
)
start "" "%NV%\desktop\node_modules\electron\dist\electron.exe" "%NV%\desktop"
exit /b 0
