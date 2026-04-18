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

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host "Starting Detrix with Docker Compose ..."
Invoke-Compose @("up", "--build")
