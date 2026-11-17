$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$template = Join-Path $projectRoot 'demo-template'
$tag = [guid]::NewGuid().ToString('N')
$target = Join-Path $env:TEMP "patchloop-demo-target-$tag"
$state = Join-Path $env:TEMP "patchloop-demo-state-$tag"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()

New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -Path (Join-Path $template '*') -Destination $target -Recurse

$serverFile = Join-Path $target 'server.mjs'
$serverText = [System.IO.File]::ReadAllText($serverFile)
$anchor = "    task.archived = action === 'archive';"
if (-not $serverText.Contains($anchor)) { throw 'Demo fixture anchor was not found; no regression was inserted.' }
$seeded = $anchor + [Environment]::NewLine + "    if (action === 'restore') task.completed = false;"
$serverText = $serverText.Replace($anchor, $seeded)
[System.IO.File]::WriteAllText($serverFile, $serverText, [System.Text.UTF8Encoding]::new($false))

& git -C $target init -b main | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the disposable demo target.' }
& git -C $target add --all
if ($LASTEXITCODE -ne 0) { throw 'Could not stage the disposable demo target.' }
& git -C $target -c user.name='PatchLoop Demo Fixture' -c user.email='demo-fixture@patchloop.invalid' commit -m 'Seed restore regression for live demo' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not commit the disposable demo target.' }

$env:PATCHLOOP_TARGET_REPO = $target
$env:PATCHLOOP_DATA_DIR = $state
$env:PATCHLOOP_HOST = '127.0.0.1'
$env:PATCHLOOP_PORT = [string]$port

Write-Host "Disposable regression target: $target"
Write-Host 'Expected bug: restore makes a completed task active but incomplete.'
Write-Host "Open http://127.0.0.1:$port and confirm local preflight before recording."
Write-Host 'Press Ctrl+C in this terminal after the recording.'
node (Join-Path $projectRoot 'server.mjs')
