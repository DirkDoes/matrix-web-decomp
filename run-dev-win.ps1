$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is not installed or not on PATH."
}

$useDockerComposePlugin = $true
try {
  docker compose version | Out-Null
} catch {
  $useDockerComposePlugin = $false
}

if ($useDockerComposePlugin) {
  $Compose = @("docker", "compose")
} elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
  $Compose = @("docker-compose")
} else {
  Write-Error "Docker Compose is not available."
}

function Invoke-Compose {
  param(
    [string[]]$Arguments
  )

  if ($Compose.Length -gt 1) {
    & $Compose[0] @($Compose[1..($Compose.Length - 1)]) @Arguments
  } else {
    & $Compose[0] @Arguments
  }
}

if (-not (Test-Path ".env") -and (Test-Path "template.env")) {
  Copy-Item "template.env" ".env"
  Write-Host "Created .env from template.env"
}

Write-Host "Starting database container..."
Invoke-Compose @("up", "-d", "db")

Write-Host "Preparing database..."
Invoke-Compose @("run", "--rm", "web", "bundle", "exec", "rails", "db:prepare")

Write-Host "Starting app on http://localhost:3000 ..."
Invoke-Compose @("up", "--build", "web")
