param(
  [Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$PatchLoopPort,
  [Parameter(Mandatory = $true)][string[]]$AllowedEmail
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  throw 'cloudflared is not installed. Install it using https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ and rerun this script.'
}
if (-not $AllowedEmail -or $AllowedEmail.Count -eq 0) { throw 'Pass at least one specific email address that may view the demo.' }
foreach ($email in $AllowedEmail) {
  if ($email -notmatch '^(?:[^@\s]+@[^@\s]+|\*@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})$') { throw "Invalid allowed email or domain: $email" }
}
try {
  $appHealth = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$PatchLoopPort/api/health" -TimeoutSec 3
  if ($appHealth.StatusCode -ne 200) { throw 'Unexpected status' }
} catch { throw "PatchLoop is not responding at 127.0.0.1:$PatchLoopPort. Start demo-kit/start-demo.ps1 first." }

$tag = [guid]::NewGuid().ToString('N')
$proxyPortProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$proxyPortProbe.Start()
$proxyPort = $proxyPortProbe.LocalEndpoint.Port
$proxyPortProbe.Stop()
$stdout = Join-Path $env:TEMP "patchloop-viewer-$tag.out.log"
$stderr = Join-Path $env:TEMP "patchloop-viewer-$tag.err.log"
$env:PATCHLOOP_VIEWER_PORT = [string]$proxyPort
$env:PATCHLOOP_VIEWER_UPSTREAM_PORT = [string]$PatchLoopPort
$node = (Get-Command node -ErrorAction Stop).Source
$proxyScript = Join-Path $PSScriptRoot 'viewer-proxy.mjs'
$proxy = Start-Process -FilePath $node -ArgumentList @($proxyScript) -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
      $check = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$proxyPort/__viewer_health" -TimeoutSec 1
      if ($check.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 200 }
  }
  if (-not $ready) { throw 'The read-only proxy did not start. Check the local Node installation.' }

  $tunnelArgs = @('tunnel', '--url', "http://127.0.0.1:$proxyPort")
  foreach ($email in $AllowedEmail) { $tunnelArgs += @('--allowed-mail', $email) }
  Write-Host 'Starting a temporary, email-PIN-protected, read-only demo URL.'
  Write-Host 'Keep this terminal open while judges use the URL. Stop with Ctrl+C.'
  & $cloudflared.Source @tunnelArgs
} finally {
  if ($proxy -and -not $proxy.HasExited) { Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
