:; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(dirname "$0")/setup-bun.ps1" --run "$@";; *) exec bash "$(dirname "$0")/setup-bun.sh" --run "$@";; esac
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-bun.ps1" --run %*
exit /b %errorlevel%
