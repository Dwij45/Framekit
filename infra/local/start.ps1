# Native Windows stand-ins for Compose: Postgres + Redis + MinIO.
# Data lives in %LOCALAPPDATA%\framekit (not OneDrive) so Postgres files are not synced.
$ErrorActionPreference = "Stop"

$PgBin = "C:\Program Files\PostgreSQL\18\bin"
if (-not (Test-Path (Join-Path $PgBin "pg_ctl.exe"))) {
  throw "PostgreSQL 18 binaries not found at $PgBin. Install Postgres or restore Docker later."
}

$Root = Join-Path $env:LOCALAPPDATA "framekit"
$Bin = Join-Path $Root "bin"
$PgData = Join-Path $Root "data\pg"
$MinioData = Join-Path $Root "data\minio"
$RedisData = Join-Path $Root "data\redis"
New-Item -ItemType Directory -Force -Path $Bin, $MinioData, $RedisData | Out-Null

$env:Path = "$PgBin;" + $env:Path

function Test-Port([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect("127.0.0.1", $Port)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Wait-Port([int]$Port, [int]$Seconds = 30) {
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Port $Port) { return }
    Start-Sleep -Seconds 1
  }
  throw "Port $Port did not open in ${Seconds}s"
}

function Get-RedisServer {
  return Get-ChildItem $Bin -Recurse -Filter "redis-server.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}

$redisExe = Get-RedisServer
if (-not $redisExe) {
  Write-Output "[local-infra] Downloading Redis 7.4.10 (Windows portable)..."
  $zip = Join-Path $Bin "redis.zip"
  curl.exe -L --fail --retry 3 -o $zip "https://github.com/redis-windows/redis-windows/releases/download/7.4.10/Redis-7.4.10-Windows-x64-msys2.zip"
  Expand-Archive -Path $zip -DestinationPath (Join-Path $Bin "redis") -Force
  Remove-Item $zip -Force
  $redisExe = Get-RedisServer
  if (-not $redisExe) { throw "redis-server.exe missing after extract" }
}

$minioExe = Join-Path $Bin "minio.exe"
if (-not (Test-Path $minioExe)) {
  Write-Output "[local-infra] Downloading MinIO server (Windows portable)..."
  curl.exe -L --fail --retry 3 -o $minioExe "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
}

if (-not (Test-Path (Join-Path $PgData "PG_VERSION"))) {
  Write-Output "[local-infra] Creating private Postgres cluster on 5434 (your 5432 service is untouched)..."
  New-Item -ItemType Directory -Force -Path $PgData | Out-Null
  & (Join-Path $PgBin "initdb.exe") -D $PgData -U framekit --auth=trust --encoding=UTF8 --no-locale --no-sync
  if ($LASTEXITCODE -ne 0) {
    Write-Output "[local-infra] initdb --no-locale failed, retrying with locale=C..."
    Remove-Item -Recurse -Force $PgData
    New-Item -ItemType Directory -Force -Path $PgData | Out-Null
    & (Join-Path $PgBin "initdb.exe") -D $PgData -U framekit --auth=trust --encoding=UTF8 --locale=C --no-sync
  }
  if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
}

if (Test-Port 5434) {
  Write-Output "[local-infra] Postgres already on 5434"
} else {
  Write-Output "[local-infra] Starting Postgres 5434..."
  $log = Join-Path $PgData "pg.log"
  & (Join-Path $PgBin "pg_ctl.exe") -D $PgData -l $log -o "-p 5434 -h 127.0.0.1" start
  if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed" }
  Wait-Port 5434
}

$raw = & (Join-Path $PgBin "psql.exe") -h 127.0.0.1 -p 5434 -U framekit -d postgres -w -tAc "SELECT 1 FROM pg_database WHERE datname='framekit'" 2>&1
$exists = ($raw | Out-String).Trim()
if ($exists -notmatch "1") {
  Write-Output "[local-infra] Creating database framekit..."
  & (Join-Path $PgBin "createdb.exe") -h 127.0.0.1 -p 5434 -U framekit framekit
  if ($LASTEXITCODE -ne 0) { throw "createdb failed" }
}

if (Test-Port 6379) {
  Write-Output "[local-infra] Redis already on 6379"
} else {
  Write-Output "[local-infra] Starting Redis 6379..."
  $redisDir = Split-Path $redisExe
  Start-Process -FilePath $redisExe -WorkingDirectory $redisDir -ArgumentList @(
    "--port", "6379",
    "--bind", "127.0.0.1",
    "--protected-mode", "yes",
    "--appendonly", "no"
  ) -WindowStyle Hidden
  Wait-Port 6379
}

if (Test-Port 9000) {
  Write-Output "[local-infra] MinIO already on 9000"
} else {
  Write-Output "[local-infra] Starting MinIO 9000..."
  $minioEnv = @{
    MINIO_ROOT_USER = "framekit"
    MINIO_ROOT_PASSWORD = "framekitsecret"
    MINIO_API_CORS_ALLOW_ORIGIN = "*"
  }
  foreach ($k in $minioEnv.Keys) { Set-Item -Path "Env:$k" -Value $minioEnv[$k] }
  Start-Process -FilePath $minioExe -WorkingDirectory $Bin -ArgumentList @(
    "server", $MinioData,
    "--address", "127.0.0.1:9000",
    "--console-address", "127.0.0.1:9001"
  ) -WindowStyle Hidden
  Wait-Port 9000 45
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

Write-Output "[local-infra] Ensuring MinIO bucket..."
Push-Location $repo
try {
  npx --yes tsx infra/local/ensure-bucket.ts
  if ($LASTEXITCODE -ne 0) { throw "ensure-bucket failed" }
  Write-Output "[local-infra] Applying Prisma migrations..."
  npm run migrate:deploy -w @framekit/db
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed" }
  npx --yes tsx infra/local/seed-demo.ts
  if ($LASTEXITCODE -ne 0) { throw "seed-demo failed" }
} finally {
  Pop-Location
}

Write-Output ""
Write-Output "[local-infra] Ready (no Docker):"
Write-Output "  Postgres  127.0.0.1:5434  db=framekit  (your existing 5432 is untouched)"
Write-Output "  Redis     127.0.0.1:6379"
Write-Output "  MinIO     127.0.0.1:9000  console 127.0.0.1:9001"
Write-Output "  Data      $Root"
Write-Output "Then: npm run dev   and   npm run dev:worker"
Write-Output "Stop: npm run infra:local:stop"
Write-Output "Later Docker: npm run infra:up  and set DATABASE_URL back to port 5433"
