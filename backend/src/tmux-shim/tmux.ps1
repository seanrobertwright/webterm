# WebTerm tmux shim for PowerShell
# Intercepts tmux commands from child processes (e.g. Claude Code) and
# translates them into HTTP API calls to the WebTerm backend.

$ErrorActionPreference = 'Stop'

$Port = if ($env:WEBTERM_PORT) { $env:WEBTERM_PORT } else { '9174' }
$Base = "http://localhost:${Port}/api/v1"

function Build-CommandString {
    param([string[]]$Parts)

    $result = @()
    foreach ($part in $Parts) {
        if ($part -match '[\s"''\\]') {
            # Escape backslashes and double-quotes, then wrap in quotes
            $escaped = $part -replace '\\', '\\' -replace '"', '\"'
            $result += "`"$escaped`""
        } else {
            $result += $part
        }
    }
    return $result -join ' '
}

function Send-WebtermCommand {
    param([string]$Cmd)

    $body = @{
        command   = $Cmd
        sessionId = $env:WEBTERM_SESSION_ID
        paneId    = $env:WEBTERM_PANE_ID
    } | ConvertTo-Json -Compress

    # Debug logging
    $logPath = Join-Path $env:TEMP 'webterm-shim.log'
    "$(Get-Date -Format 'HH:mm:ss') CMD='$Cmd' SID='$($env:WEBTERM_SESSION_ID)' PID='$($env:WEBTERM_PANE_ID)' BODY=$body" | Out-File -Append -FilePath $logPath

    try {
        $resp = Invoke-RestMethod -Uri "${Base}/command" -Method POST `
            -ContentType 'application/json' -Body $body -ErrorAction Stop
    }
    catch {
        "$(Get-Date -Format 'HH:mm:ss') ERROR: $_" | Out-File -Append -FilePath $logPath
        Write-Error "webterm: failed to connect to WebTerm backend at ${Base}"
        exit 1
    }

    "$(Get-Date -Format 'HH:mm:ss') RESP: success=$($resp.success) output='$($resp.output)'" | Out-File -Append -FilePath $logPath

    if ($resp.success) {
        if ($resp.output) { Write-Output $resp.output }
        exit 0
    }
    else {
        $msg = if ($resp.output) { $resp.output } elseif ($resp.error) { $resp.error } else { 'command failed' }
        Write-Error "webterm: $msg"
        exit 1
    }
}

function Get-WebtermPanes {
    $sid = $env:WEBTERM_SESSION_ID
    try {
        $resp = Invoke-RestMethod -Uri "${Base}/panes?sessionId=${sid}" -Method GET -ErrorAction Stop
    }
    catch {
        Write-Error "webterm: failed to connect to WebTerm backend"
        exit 1
    }
    $resp | ConvertTo-Json -Depth 5
}

# Parse command
if ($args.Count -eq 0) {
    Write-Host "webterm tmux shim - use 'tmux <command>' to control WebTerm" -ForegroundColor Yellow
    Write-Host "Supported commands: split-window, new-window, list-panes, display-message,"
    Write-Host "  select-pane, send-keys, kill-pane, kill-session, has-session, new-session,"
    Write-Host "  resize-pane, list-sessions"
    exit 0
}

$Command = $args[0]
$RestArgs = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }

switch ($Command) {
    { $_ -in 'has-session', 'has' } {
        if ($RestArgs.Count -eq 0) {
            # No args: just check if we're in a session
            if ($env:TMUX) { exit 0 } else { exit 1 }
        }
        # Pass through with flags for proper session lookup
        $fullCmd = Build-CommandString -Parts (@('has-session') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'list-panes', 'lsp' } {
        Get-WebtermPanes
    }
    { $_ -in 'send-keys', 'send' } {
        $fullCmd = Build-CommandString -Parts (@('send-keys') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'split-window', 'splitw' } {
        $fullCmd = Build-CommandString -Parts (@('split-window') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'new-window', 'neww' } {
        $fullCmd = Build-CommandString -Parts (@('new-window') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'new-session', 'new' } {
        $fullCmd = Build-CommandString -Parts (@('new-session') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'kill-pane', 'killp' } {
        $fullCmd = Build-CommandString -Parts (@('kill-pane') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    'kill-session' {
        $fullCmd = Build-CommandString -Parts (@('kill-session') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'display-message', 'display' } {
        $fullCmd = Build-CommandString -Parts (@('display-message') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'select-pane', 'selectp' } {
        $fullCmd = Build-CommandString -Parts (@('select-pane') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'resize-pane', 'resizep' } {
        $fullCmd = Build-CommandString -Parts (@('resize-pane') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    { $_ -in 'list-sessions', 'ls' } {
        Send-WebtermCommand -Cmd 'list-sessions'
    }
    { $_ -in 'select-layout', 'selectl' } {
        $fullCmd = Build-CommandString -Parts (@('select-layout') + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
    default {
        $fullCmd = Build-CommandString -Parts (@($Command) + $RestArgs)
        Send-WebtermCommand -Cmd $fullCmd
    }
}
