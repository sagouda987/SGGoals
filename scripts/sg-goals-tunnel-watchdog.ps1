$ErrorActionPreference = 'Continue'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tunnelExe = Join-Path $projectRoot '.codex\tools\tunnel-client\v0.0.14\tunnel-client.exe'
$tunnelConfig = Join-Path $projectRoot '.codex\tunnel-profiles\sg-goals.yaml'
$logPath = Join-Path $projectRoot '.codex\sg-goals-tunnel-watchdog.log'

while ($true) {
  try {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Starting SG Goals MCP tunnel."
    & $tunnelExe run --config $tunnelConfig --mcp.stdio-send-initialized-notification *>> $logPath
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Tunnel exited with code $LASTEXITCODE; restarting in 5 seconds."
  } catch {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) Tunnel launch failed: $($_.Exception.Message); restarting in 5 seconds."
  }
  Start-Sleep -Seconds 5
}
