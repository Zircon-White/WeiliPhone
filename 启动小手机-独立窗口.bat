@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "phone.html" (
  echo [错误] 没找到 phone.html，请先执行：node build.mjs
  pause
  exit /b 1
)

rem 开机同步：没在跑就把 GPT-SoVITS 拉起来（配置见 gptsovits-launch.ini）
call "%~dp0同步启动GPT-SoVITS.bat"
if errorlevel 3 (
  echo 已按配置停下，先把 GPT-SoVITS 的问题处理好，再双击一次启动器。
  exit /b 1
)

set "EDGE="
for %%P in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
  if not defined EDGE if exist "%%~P" set "EDGE=%%~P"
)

if not defined EDGE (
  echo 没找到 Edge/Chrome，改用默认浏览器打开。
  start "" "%~dp0phone.html"
  exit /b 0
)

echo 以独立窗口（应用模式）启动小手机…
start "" "%EDGE%" --app="file:///%~dp0phone.html" --window-size=440,900
exit /b 0
