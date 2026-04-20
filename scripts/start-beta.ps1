Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common-beta.ps1')

Test-DockerAccess

if (-not (Test-Path -LiteralPath $script:BetaEnvFile)) {
  Fail "$([System.IO.Path]::GetFileName($script:BetaEnvFile)) does not exist yet. Run .\scripts\bootstrap-beta.ps1 first."
}

Write-Step 'Starting isolated beta stack'
Invoke-DockerCompose up -d postgres ollama api n8n web
Wait-For -Label 'postgres' -MaxAttempts 60 -Check ${function:Test-PostgresReady}
Wait-For -Label 'ollama' -MaxAttempts 60 -Check ${function:Test-OllamaReady}
Wait-For -Label 'api' -MaxAttempts 60 -Check ${function:Test-ApiReady}
Wait-For -Label 'n8n' -MaxAttempts 60 -Check ${function:Test-N8nReady}
Wait-For -Label 'web' -MaxAttempts 60 -Check ${function:Test-WebReady}
Show-BetaEndpoints
Open-WebUi
