@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "phone.html" (
  echo [错误] 没找到 phone.html
  echo 请先在本目录执行：node build.mjs
  pause
  exit /b 1
)

rem 开机同步：没在跑就把 GPT-SoVITS 拉起来（配置见 gptsovits-launch.ini）
call "%~dp0同步启动GPT-SoVITS.bat"
if errorlevel 3 (
  echo 已按配置停下，先把 GPT-SoVITS 的问题处理好，再双击一次启动器。
  exit /b 1
)

echo 正在用默认浏览器打开小手机……
start "" "%~dp0phone.html"
exit /b 0
