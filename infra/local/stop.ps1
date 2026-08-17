# Stop the native Postgres cluster / Redis / MinIO started by start.ps1.
# Does not touch the Windows PostgreSQL 18 service on 5432.
$ErrorActionPreference = "Continue"

$PgBin = "C:\Program Files\PostgreSQL\18\bin"
$PgData = Join-Path $env:LOCALAPPDATA "framekit\data\pg"

function Stop-Port([int]$Port, [string]$Name) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) {
    Write-Output "[local-infra] $Name not listening on $Port"
    return
  }
  $pids = $conns.OwningProcess | Sort-Object -Unique
  foreach ($procId in $pids) {
    if ($procId -and $procId -ne 0) {
      Write-Output "[local-infra] Stopping $Name pid $procId (port $Port)"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

if (Test-Path (Join-Path $PgData "PG_VERSION")) {
  Write-Output "[local-infra] Stopping Postgres cluster 5434..."
  & (Join-Path $PgBin "pg_ctl.exe") -D $PgData stop -m fast
}

Stop-Port 6379 "Redis"
Stop-Port 9000 "MinIO"
Stop-Port 9001 "MinIO console"
Write-Output "[local-infra] Native infra stopped. Windows Postgres on 5432 is still running."
