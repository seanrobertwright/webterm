@echo off
REM WebTerm tmux shim for Windows (CMD)
REM Intercepts tmux commands from child processes (e.g. Claude Code) and
REM translates them into HTTP API calls to the WebTerm backend.
REM
REM Delegates to the PowerShell shim for proper JSON handling.

setlocal enabledelayedexpansion

REM Check if PowerShell is available (it always is on Windows 10+)
where pwsh >nul 2>&1 && (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0tmux.ps1" %*
    exit /b !errorlevel!
)

where powershell >nul 2>&1 && (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tmux.ps1" %*
    exit /b !errorlevel!
)

REM Fallback: direct curl-based implementation
if "%WEBTERM_PORT%"=="" set "WEBTERM_PORT=9174"
set "WEBTERM_BASE=http://localhost:%WEBTERM_PORT%/api/v1"

if "%~1"=="" (
    echo webterm tmux shim - use 'tmux ^<command^>' to control WebTerm >&2
    echo Supported commands: split-window, new-window, list-panes, display-message, >&2
    echo   select-pane, send-keys, kill-pane, kill-session, has-session, new-session, >&2
    echo   resize-pane, list-sessions >&2
    exit /b 0
)

set "COMMAND=%~1"
shift

REM Collect remaining args
set "ARGS="
:argloop
if "%~1"=="" goto :endargloop
if defined ARGS (
    set "ARGS=!ARGS! %~1"
) else (
    set "ARGS=%~1"
)
shift
goto :argloop
:endargloop

REM Handle has-session specially when no args (env check only)
if "%COMMAND%"=="has-session" if not defined ARGS goto :hassession_noargs
if "%COMMAND%"=="has" if not defined ARGS goto :hassession_noargs

REM Handle list-panes specially (GET endpoint)
if "%COMMAND%"=="list-panes" goto :listpanes
if "%COMMAND%"=="lsp" goto :listpanes

REM All other commands go through the REST API
goto :sendcommand

:hassession_noargs
if defined TMUX (
    exit /b 0
) else (
    exit /b 1
)

:listpanes
set "SESSION_PARAM="
if defined WEBTERM_SESSION_ID set "SESSION_PARAM=sessionId=%WEBTERM_SESSION_ID%"
for /f "usebackq delims=" %%i in (`curl -s -X GET "%WEBTERM_BASE%/panes?%SESSION_PARAM%" 2^>nul`) do (
    echo %%i
)
exit /b 0

:sendcommand
if defined ARGS (
    set "FULL_CMD=%COMMAND% !ARGS!"
) else (
    set "FULL_CMD=%COMMAND%"
)

REM Build JSON body using PowerShell for safe escaping
set "SESSION_ID=%WEBTERM_SESSION_ID%"
set "PANE_ID=%WEBTERM_PANE_ID%"

REM Use a temp file for the JSON body to avoid escaping issues
set "TMPBODY=%TEMP%\webterm-shim-%RANDOM%.json"

REM Try to use PowerShell for proper JSON encoding
powershell -NoProfile -Command "@{command='!FULL_CMD!';sessionId='!SESSION_ID!';paneId='!PANE_ID!'} | ConvertTo-Json -Compress | Set-Content -NoNewline '!TMPBODY!'" 2>nul
if %errorlevel% equ 0 (
    for /f "usebackq delims=" %%i in (`curl -s -X POST -H "Content-Type: application/json" -d @"!TMPBODY!" "%WEBTERM_BASE%/command" 2^>nul`) do (
        set "RESPONSE=%%i"
    )
    del "!TMPBODY!" 2>nul
) else (
    REM Fallback: manual JSON construction
    set "JSON_CMD=!FULL_CMD:\=\\!"
    set "JSON_CMD=!JSON_CMD:"=\"!"
    set "BODY={\"command\":\"!JSON_CMD!\",\"sessionId\":\"!SESSION_ID!\",\"paneId\":\"!PANE_ID!\"}"
    for /f "usebackq delims=" %%i in (`curl -s -X POST -H "Content-Type: application/json" -d "!BODY!" "%WEBTERM_BASE%/command" 2^>nul`) do (
        set "RESPONSE=%%i"
    )
)

if not defined RESPONSE (
    echo webterm: failed to connect to WebTerm backend at %WEBTERM_BASE% >&2
    exit /b 1
)

REM Parse response using PowerShell for reliable JSON handling
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$r = '!RESPONSE!' | ConvertFrom-Json; if ($r.success) { if ($r.output) { Write-Output $r.output }; exit 0 } else { $m = if ($r.output) { $r.output } elseif ($r.error) { $r.error } else { 'command failed' }; Write-Error \"webterm: $m\"; exit 1 }" 2^>nul`) do (
    echo %%i
    exit /b 0
)

REM Fallback: basic response check
echo !RESPONSE! | findstr /C:"\"success\":true" >nul 2>&1
if %errorlevel% equ 0 (
    exit /b 0
) else (
    echo webterm: command failed >&2
    echo !RESPONSE! >&2
    exit /b 1
)
