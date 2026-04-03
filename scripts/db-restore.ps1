param(
  [Parameter(Mandatory = $true)]
  [string]$DumpFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpFile)) {
  throw "Dump file not found: $DumpFile"
}

Write-Host "[db-restore] Restoring from $DumpFile"

Get-Content $DumpFile -Raw | docker exec -i math-db psql -U mathuser -d mathdb

if ($LASTEXITCODE -ne 0) {
  throw "psql restore failed with exit code $LASTEXITCODE"
}

Write-Host "[db-restore] Restore complete"
