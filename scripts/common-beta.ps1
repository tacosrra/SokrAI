Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:BetaEnvFile = if ($env:SOKRAI_BETA_ENV_FILE) { $env:SOKRAI_BETA_ENV_FILE } else { Join-Path $script:RepoRoot '.env.beta' }
$script:ComposeProjectName = if ($env:SOKRAI_BETA_PROJECT_NAME) { $env:SOKRAI_BETA_PROJECT_NAME } else { 'sokrai-beta' }
$script:WorkflowMarkerFile = '/home/node/.n8n/.sokrai_workflows_bootstrapped_v2'
$script:BetaWorkflowFiles = @(
  'proposal_start_v1.json',
  'proposal_reply_v1.json',
  'agent_problem_definition_v1.json',
  'solution_start_v1.json',
  'solution_reply_v1.json',
  'agent_solution_definition_v1.json',
  'data_ai_privacy_start_v1.json',
  'data_ai_privacy_reply_v1.json',
  'agent_data_ai_privacy_gap_v1.json',
  'medical_device_triage_start_v1.json',
  'medical_device_triage_reply_v1.json',
  'agent_medical_device_triage_v1.json',
  'resources_pilot_viability_start_v1.json',
  'resources_pilot_viability_reply_v1.json',
  'agent_resources_pilot_viability_v1.json'
)
$script:DockerInstallUrl = 'https://docs.docker.com/desktop/setup/install/windows-install/'
$script:WebUiUrl = 'http://localhost:3000'
$script:ComposeBaseArgs = @(
  '--env-file', $script:BetaEnvFile,
  '-p', $script:ComposeProjectName,
  '-f', (Join-Path $script:RepoRoot 'docker-compose.yml'),
  '-f', (Join-Path $script:RepoRoot 'docker-compose.beta.yml')
)

function Write-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Message
  )

  Write-Host ""
  Write-Host "[$script:ComposeProjectName] $Message"
}

function Fail {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Message
  )

  throw "[$script:ComposeProjectName] $Message"
}

function Require-Command {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name
  )

  if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
    Fail "Missing required command: $Name"
  }
}

function Open-Url {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Url
  )

  try {
    Start-Process $Url | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Open-WebUi {
  Write-Step 'Opening SokrAI in the browser'

  if (-not (Open-Url -Url $script:WebUiUrl)) {
    Write-Host "[$script:ComposeProjectName] Open this URL manually: $script:WebUiUrl"
  }
}

function Test-DockerDesktopInstalled {
  return (Test-Path -LiteralPath 'C:\Program Files\Docker\Docker\Docker Desktop.exe')
}

function Start-DockerDesktop {
  if (Get-Command -Name 'docker' -ErrorAction SilentlyContinue) {
    & docker desktop version 1>$null 2>$null

    if ($LASTEXITCODE -eq 0) {
      Write-Step 'Starting Docker Desktop'
      & docker desktop start 1>$null 2>$null
      return $true
    }
  }

  if (Test-DockerDesktopInstalled) {
    Write-Step 'Starting Docker Desktop'
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' | Out-Null
    return $true
  }

  return $false
}

function Ensure-DockerAvailable {
  if (Get-Command -Name 'docker' -ErrorAction SilentlyContinue) {
    return
  }

  [void](Open-Url -Url $script:DockerInstallUrl)
  Fail 'Docker CLI was not found. Install Docker Desktop and reopen PowerShell before retrying.'
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string[]] $Lines
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  $content = [string]::Join([Environment]::NewLine, $Lines)
  [System.IO.File]::WriteAllText($Path, "$content$([Environment]::NewLine)", $encoding)
}

function New-BetaSecret {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }

  return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Read-EnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $Key
  )

  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match ("^{0}=(.*)$" -f [regex]::Escape($Key))) {
      return $Matches[1]
    }
  }

  return $null
}

function Set-EnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path,
    [Parameter(Mandatory = $true)]
    [string] $Key,
    [Parameter(Mandatory = $true)]
    [string] $Value
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $updated = $false

  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match ("^{0}=" -f [regex]::Escape($Key))) {
      $lines.Add("$Key=$Value")
      $updated = $true
    } else {
      $lines.Add($line)
    }
  }

  if (-not $updated) {
    $lines.Add("$Key=$Value")
  }

  Write-Utf8NoBomFile -Path $Path -Lines $lines.ToArray()
}

function Ensure-BetaEnvFile {
  if (-not (Test-Path -LiteralPath $script:BetaEnvFile)) {
    Write-Step "Creating $([System.IO.Path]::GetFileName($script:BetaEnvFile)) from .env.example"
    Copy-Item -LiteralPath (Join-Path $script:RepoRoot '.env.example') -Destination $script:BetaEnvFile
  }

  if ((Read-EnvValue -Path $script:BetaEnvFile -Key 'INTERNAL_SHARED_SECRET') -eq 'replace-with-a-random-32-char-secret') {
    Set-EnvValue -Path $script:BetaEnvFile -Key 'INTERNAL_SHARED_SECRET' -Value (New-BetaSecret)
  }

  if ((Read-EnvValue -Path $script:BetaEnvFile -Key 'N8N_ENCRYPTION_KEY') -eq 'replace-with-a-random-32-char-secret') {
    Set-EnvValue -Path $script:BetaEnvFile -Key 'N8N_ENCRYPTION_KEY' -Value (New-BetaSecret)
  }
}

function Invoke-DockerCompose {
  param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]] $ComposeArgs
  )

  $previousEnvFile = $env:SOKRAI_ENV_FILE

  try {
    $env:SOKRAI_ENV_FILE = $script:BetaEnvFile
    & docker compose @script:ComposeBaseArgs @ComposeArgs

    if ($LASTEXITCODE -ne 0) {
      Fail "docker compose failed with exit code $LASTEXITCODE"
    }
  } finally {
    if ($null -eq $previousEnvFile) {
      Remove-Item Env:SOKRAI_ENV_FILE -ErrorAction SilentlyContinue
    } else {
      $env:SOKRAI_ENV_FILE = $previousEnvFile
    }
  }
}

function Test-DockerCompose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $ComposeArgs
  )

  $previousEnvFile = $env:SOKRAI_ENV_FILE

  try {
    $env:SOKRAI_ENV_FILE = $script:BetaEnvFile
    & docker compose @script:ComposeBaseArgs @ComposeArgs 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
  } finally {
    if ($null -eq $previousEnvFile) {
      Remove-Item Env:SOKRAI_ENV_FILE -ErrorAction SilentlyContinue
    } else {
      $env:SOKRAI_ENV_FILE = $previousEnvFile
    }
  }
}

function Test-DockerAccess {
  Ensure-DockerAvailable

  & docker info 1>$null 2>$null

  if ($LASTEXITCODE -eq 0) {
    return
  }

  if (Start-DockerDesktop) {
    Write-Step 'Waiting for Docker Desktop'
    Wait-For -Label 'docker' -MaxAttempts 90 -Check ${function:Test-DockerReady}
    return
  }

  [void](Open-Url -Url $script:DockerInstallUrl)
  Fail 'Docker Desktop is not running and could not be started automatically. Start Docker Desktop and retry.'
}

function Wait-For {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Label,
    [Parameter(Mandatory = $true)]
    [int] $MaxAttempts,
    [Parameter(Mandatory = $true)]
    [scriptblock] $Check
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if (& $Check) {
      return
    }

    if ($attempt -ge $MaxAttempts) {
      Fail "Timed out while waiting for $Label"
    }

    Start-Sleep -Seconds 2
  }
}

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Uri,
    [hashtable] $Headers = @{}
  )

  $handler = [System.Net.Http.HttpClientHandler]::new()
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(5)

  try {
    foreach ($entry in $Headers.GetEnumerator()) {
      [void] $client.DefaultRequestHeaders.Remove($entry.Key)
      [void] $client.DefaultRequestHeaders.Add($entry.Key, $entry.Value)
    }

    $response = $client.GetAsync($Uri).GetAwaiter().GetResult()

    try {
      return $response.IsSuccessStatusCode
    } finally {
      $response.Dispose()
    }
  } catch {
    return $false
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Get-N8nAuthHeaders {
  $user = Read-EnvValue -Path $script:BetaEnvFile -Key 'N8N_BASIC_AUTH_USER'
  $password = Read-EnvValue -Path $script:BetaEnvFile -Key 'N8N_BASIC_AUTH_PASSWORD'
  $tokenBytes = [System.Text.Encoding]::ASCII.GetBytes("${user}:${password}")
  $token = [Convert]::ToBase64String($tokenBytes)

  return @{
    Authorization = "Basic $token"
  }
}

function Test-PostgresReady {
  return (Test-DockerCompose -ComposeArgs @('exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres'))
}

function Test-DockerReady {
  & docker info 1>$null 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Test-OllamaReady {
  return (Test-DockerCompose -ComposeArgs @('exec', '-T', 'ollama', 'ollama', 'list'))
}

function Test-ApiReady {
  return (Test-HttpEndpoint -Uri 'http://localhost:3001/healthz')
}

function Test-N8nReady {
  return (Test-HttpEndpoint -Uri 'http://localhost:5678' -Headers (Get-N8nAuthHeaders))
}

function Test-WebReady {
  return (Test-HttpEndpoint -Uri 'http://localhost:3000')
}

function Get-WorkflowId {
  param(
    [Parameter(Mandatory = $true)]
    [string] $WorkflowFile
  )

  $workflow = Get-Content -LiteralPath $WorkflowFile -Raw | ConvertFrom-Json
  $workflowId = [string]$workflow.id

  if ([string]::IsNullOrWhiteSpace($workflowId)) {
    Fail "Workflow file $([System.IO.Path]::GetFileName($WorkflowFile)) is missing a top-level id"
  }

  return $workflowId
}

function Publish-Workflow {
  param(
    [Parameter(Mandatory = $true)]
    [string] $WorkflowFile
  )

  $workflowId = Get-WorkflowId -WorkflowFile $WorkflowFile
  Invoke-DockerCompose exec -T -u node n8n n8n publish:workflow "--id=$workflowId"
}

function Get-CanonicalWorkflowIds {
  $canonicalIds = @{}

  foreach ($workflowFile in $script:BetaWorkflowFiles) {
    $workflowPath = Join-Path $script:RepoRoot "infra/n8n/workflows/$workflowFile"
    $workflow = Get-Content -LiteralPath $workflowPath -Raw | ConvertFrom-Json
    $canonicalIds[[string]$workflow.name] = [string]$workflow.id
  }

  return $canonicalIds
}

function Repair-DuplicateN8nWorkflows {
  if (-not (Test-N8nReady)) {
    return $false
  }

  $canonicalIds = Get-CanonicalWorkflowIds
  $duplicateIds = New-Object System.Collections.Generic.List[string]
  $listOutput = Invoke-DockerCompose exec -T -u node n8n n8n list:workflow 2>$null

  foreach ($line in $listOutput) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    $parts = $line -split '\|', 2
    if ($parts.Count -ne 2) {
      continue
    }

    $workflowId = $parts[0].Trim()
    $workflowName = $parts[1].Trim()

    if (-not $canonicalIds.ContainsKey($workflowName)) {
      continue
    }

    if ($canonicalIds[$workflowName] -ne $workflowId) {
      $duplicateIds.Add($workflowId) | Out-Null
    }
  }

  if ($duplicateIds.Count -eq 0) {
    return $false
  }

  Write-Step "Removing $($duplicateIds.Count) duplicate n8n workflow(s)"

  $quotedIds = $duplicateIds | ForEach-Object { "'$_'" }
  $idList = $quotedIds -join ', '
  $sql = @"
DELETE FROM webhook_entity WHERE "workflowId" IN ($idList);
DELETE FROM workflow_entity WHERE id IN ($idList);
"@

  $sql | Invoke-DockerCompose exec -T postgres psql -U sokrai_n8n -d sokrai_n8n -v ON_ERROR_STOP=1 | Out-Null
  return $true
}

function Invoke-OllamaModelPull {
  $model = Read-EnvValue -Path $script:BetaEnvFile -Key 'OLLAMA_MODEL'
  $retryCount = if ($env:SOKRAI_BETA_OLLAMA_PULL_RETRIES) { [int]$env:SOKRAI_BETA_OLLAMA_PULL_RETRIES } else { 3 }

  if ([string]::IsNullOrWhiteSpace($model)) {
    Fail "OLLAMA_MODEL is empty in $([System.IO.Path]::GetFileName($script:BetaEnvFile))"
  }

  if ($env:SOKRAI_BETA_SKIP_OLLAMA_PULL -eq '1') {
    Write-Step 'Skipping Ollama model pull because SOKRAI_BETA_SKIP_OLLAMA_PULL=1'
    return
  }

  if (Test-DockerCompose -ComposeArgs @('exec', '-T', 'ollama', 'ollama', 'show', $model)) {
    Write-Step "Ollama model already present: $model"
    return
  }

  for ($attempt = 1; $attempt -le $retryCount; $attempt++) {
    Write-Step "Pulling Ollama model: $model (attempt $attempt/$retryCount)"

    try {
      Invoke-DockerCompose exec -T ollama ollama pull $model
      return
    } catch {
      if ($attempt -ge $retryCount) {
        Fail "Could not pull Ollama model '$model'. The Ollama container could not resolve or reach the model registry. Check Docker DNS/outbound network, retry later, or rerun with SOKRAI_BETA_SKIP_OLLAMA_PULL=1 if the model is already cached."
      }

      Start-Sleep -Seconds 5
    }
  }
}

function Invoke-DatabaseMigrations {
  Write-Step 'Running database migrations'
  Invoke-DockerCompose run --rm api pnpm --filter @sokrai/api migrate
}

function Test-WorkflowMarker {
  return (Test-DockerCompose -ComposeArgs @(
      'exec', '-T', '-u', 'node', 'n8n',
      'node', '-e', 'const fs=require("fs"); process.exit(fs.existsSync(process.argv[1]) ? 0 : 1);',
      $script:WorkflowMarkerFile
    ))
}

function New-WorkflowMarker {
  Invoke-DockerCompose exec -T -u node n8n node -e 'const fs=require("fs"); fs.closeSync(fs.openSync(process.argv[1], "a"));' $script:WorkflowMarkerFile
}

function Invoke-WorkflowBootstrap {
  $repairedDuplicates = Repair-DuplicateN8nWorkflows

  if (Test-WorkflowMarker) {
    if ($repairedDuplicates) {
      Write-Step 'Restarting n8n after removing duplicate workflows'
      Invoke-DockerCompose restart n8n
      Wait-For -Label 'n8n' -MaxAttempts 60 -Check ${function:Test-N8nReady}
    } else {
      Write-Step 'Skipping workflow import: already bootstrapped in this beta environment'
    }

    return
  }

  Write-Step 'Importing n8n workflows'
  foreach ($workflowFile in $script:BetaWorkflowFiles) {
    Invoke-DockerCompose exec -T -u node n8n n8n import:workflow "--input=/workflows/$workflowFile"
  }

  Repair-DuplicateN8nWorkflows | Out-Null

  Write-Step 'Publishing imported workflows'
  foreach ($workflowFile in $script:BetaWorkflowFiles) {
    Publish-Workflow -WorkflowFile (Join-Path $script:RepoRoot "infra/n8n/workflows/$workflowFile")
  }
  New-WorkflowMarker

  Write-Step 'Restarting n8n so active workflow state is applied'
  Invoke-DockerCompose restart n8n
  Wait-For -Label 'n8n' -MaxAttempts 60 -Check ${function:Test-N8nReady}
}

function Show-BetaEndpoints {
  @"

SokrAI beta is ready.

- Web UI: http://localhost:3000
- API health: http://localhost:3001/healthz
- n8n: http://localhost:5678
- n8n user: $(Read-EnvValue -Path $script:BetaEnvFile -Key 'N8N_BASIC_AUTH_USER')
- n8n password: $(Read-EnvValue -Path $script:BetaEnvFile -Key 'N8N_BASIC_AUTH_PASSWORD')

Next commands:
- Start again later: powershell -ExecutionPolicy Bypass -File .\scripts\start-beta.ps1
- Stop while keeping data: powershell -ExecutionPolicy Bypass -File .\scripts\stop-beta.ps1
- Tail logs:
  `$env:SOKRAI_ENV_FILE = "$script:BetaEnvFile"
  docker compose --env-file "$script:BetaEnvFile" -p "$script:ComposeProjectName" -f docker-compose.yml -f docker-compose.beta.yml logs -f

"@ | Write-Host
}
