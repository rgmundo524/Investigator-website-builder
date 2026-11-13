@echo off
setlocal
title Investigator Website Builder
pushd "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
node "scripts\start-builder.mjs"
set "BUILDER_EXIT=%errorlevel%"
popd
if not "%BUILDER_EXIT%"=="0" pause
exit /b %BUILDER_EXIT%

:missing_node
echo Install Node.js 24 for Windows, including npm, from https://nodejs.org/en/download/
echo Then close this window and double-click Start Builder.cmd again.
pause
exit /b 1
