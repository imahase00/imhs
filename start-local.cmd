@echo off
chcp 65001 >nul
setlocal EnableExtensions
title IMHS ローカルサーバー

rem ===== 設定 =====
rem ポートを変えるとブラウザ上は別サイト扱いになり、セーブも別になります。
set "PORT=8765"
set "DOCS=%~dp0docs"
set "URL=http://127.0.0.1:%PORT%/"

if not exist "%DOCS%\index.html" (
  echo [IMHS] docs\index.html が見つかりません。
  echo        start-local.cmd は IMHS フォルダの直下に置いて実行してください。
  pause
  exit /b 1
)

rem ===== ポートの使用状況（他のプロセスは終了しません） =====
netstat -ano -p tcp | findstr /R /C:":%PORT% .*LISTENING" >nul
if %errorlevel%==0 (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 '%URL%asset-manifest.json'; if ($r.Content -match '\"app\": *\"imhs\"') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    echo [IMHS] すでに IMHS のサーバーが動いています。ブラウザで開きます。
    start "" "%URL%"
    exit /b 0
  )
  echo.
  echo [IMHS] ポート %PORT% は別のアプリが使用中です。
  echo        そのアプリを終了してから、もう一度 start-local.cmd を実行してください。
  echo        使用中のプロセスは次のコマンドで確認できます:  netstat -ano ^| findstr :%PORT%
  echo        ※ start-local.cmd 内の PORT を変更することもできますが、セーブは別扱いになります。
  echo.
  pause
  exit /b 1
)

rem ===== 軽量サーバーの検出 =====
set "PY="
py -3 -c "import http.server" >nul 2>&1 && set "PY=py -3"
if not defined PY (
  python -c "import http.server" >nul 2>&1 && set "PY=python"
)
if defined PY goto run_python

where node >nul 2>&1
if %errorlevel%==0 goto run_node

echo.
echo [IMHS] ローカル配信に使える Python または Node.js が見つかりませんでした。
echo        次のどちらかをインストールしてから、もう一度実行してください（無料）。
echo          1. Python   : https://www.python.org/downloads/ （インストール時に「Add python.exe to PATH」にチェック）
echo                        または PowerShell で  winget install Python.Python.3.12
echo          2. Node.js  : https://nodejs.org/ （LTS 版）
echo.
pause
exit /b 1

:run_python
echo [IMHS] Python で配信します: %URL%
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process '%URL%'"
%PY% "%~dp0tools\serve.py" %PORT% "%DOCS%"
goto end

:run_node
echo [IMHS] Node.js で配信します: %URL%
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 1200; Start-Process '%URL%'"
node "%~dp0tools\serve.mjs" %PORT% "%DOCS%"

:end
echo.
echo [IMHS] サーバーを停止しました。
pause
