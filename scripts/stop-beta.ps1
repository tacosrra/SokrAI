Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common-beta.ps1')

Require-Command -Name 'docker'
Test-DockerAccess

if (-not (Test-Path -LiteralPath $script:BetaEnvFile)) {
  Fail "$([System.IO.Path]::GetFileName($script:BetaEnvFile)) does not exist yet. Nothing to stop."
}

Write-Step 'Stopping isolated beta stack'
Invoke-DockerCompose stop

@"

SokrAI beta was stopped.

- Data was kept in Docker volumes for the project: $script:ComposeProjectName
- Start it again with: powershell -ExecutionPolicy Bypass -File .\scripts\start-beta.ps1

"@ | Write-Host
