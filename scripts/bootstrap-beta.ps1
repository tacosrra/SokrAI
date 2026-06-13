Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'common-beta.ps1')

Test-DockerAccess
Ensure-BetaEnvFile

Write-Step 'Building beta images'
Invoke-DockerCompose build api web

Write-Step 'Starting beta stack'
Invoke-DockerCompose up -d postgres ollama api n8n web

Write-Step 'Waiting for PostgreSQL'
Wait-For -Label 'postgres' -MaxAttempts 60 -Check ${function:Test-PostgresReady}

Write-Step 'Waiting for Ollama'
Wait-For -Label 'ollama' -MaxAttempts 60 -Check ${function:Test-OllamaReady}

Write-Step 'Waiting for API'
Wait-For -Label 'api' -MaxAttempts 60 -Check ${function:Test-ApiReady}

Write-Step 'Waiting for n8n'
Wait-For -Label 'n8n' -MaxAttempts 60 -Check ${function:Test-N8nReady}

Write-Step 'Waiting for Web UI'
Wait-For -Label 'web' -MaxAttempts 60 -Check ${function:Test-WebReady}

Invoke-OllamaModelPull
Invoke-DatabaseMigrations
Invoke-WorkflowBootstrap

Write-Step 'Running final health checks'
Wait-For -Label 'api' -MaxAttempts 10 -Check ${function:Test-ApiReady}
Wait-For -Label 'n8n' -MaxAttempts 10 -Check ${function:Test-N8nReady}
Wait-For -Label 'web' -MaxAttempts 10 -Check ${function:Test-WebReady}

Show-BetaEndpoints
Open-WebUi
