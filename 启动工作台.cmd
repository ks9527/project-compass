@echo off
cd /d "%~dp0"
node --disable-warning=ExperimentalWarning server.mjs
pause
