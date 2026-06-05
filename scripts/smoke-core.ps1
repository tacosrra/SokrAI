Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { 'http://localhost:3001' }
$N8nBaseUrl = if ($env:N8N_BASE_URL) { $env:N8N_BASE_URL } else { 'http://localhost:5678' }
$InternalSharedSecret = if ($env:INTERNAL_SHARED_SECRET) { $env:INTERNAL_SHARED_SECRET } else { 'replace-with-a-random-32-char-secret' }
$RequestTimeoutSeconds = if ($env:REQUEST_TIMEOUT_SECONDS) { [int]$env:REQUEST_TIMEOUT_SECONDS } else { 480 }

function Write-Step {
  param([Parameter(Mandatory = $true)][string] $Message)
  Write-Host "[smoke-core] $Message"
}

function Fail {
  param([Parameter(Mandatory = $true)][string] $Message)
  throw "smoke-core: $Message"
}

function ConvertTo-SafeFailureSummary {
  param([Parameter(Mandatory = $true)] $ErrorRecord)

  $response = $ErrorRecord.Exception.Response
  $statusCode = $null

  if ($null -ne $response -and $null -ne $response.StatusCode) {
    $statusCode = [int]$response.StatusCode
  }

  return @{
    status_code = $statusCode
    error_type = $ErrorRecord.Exception.GetType().Name
    message = $ErrorRecord.Exception.Message
  } | ConvertTo-Json -Compress
}

function New-SmokeRequestId {
  return "smoke-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$([Guid]::NewGuid())"
}

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)][string] $Method,
    [Parameter(Mandatory = $true)][string] $Uri,
    [object] $Body,
    [hashtable] $Headers = @{}
  )

  $params = @{
    Method = $Method
    Uri = $Uri
    TimeoutSec = $RequestTimeoutSeconds
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    Fail "$Method $Uri failed: $(ConvertTo-SafeFailureSummary -ErrorRecord $_)"
  }
}

function Assert-Smoke {
  param(
    [Parameter(Mandatory = $true)][bool] $Condition,
    [Parameter(Mandatory = $true)][string] $Message
  )

  if (-not $Condition) {
    Fail $Message
  }
}

Write-Step 'Checking API health'
$health = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/healthz"
Assert-Smoke -Condition ($health.status -eq 'ok') -Message 'healthz did not return ok'

$startRequestId = New-SmokeRequestId
$startPayload = Get-Content -LiteralPath 'examples/proposal-start.payload.json' -Raw | ConvertFrom-Json
$startPayload | Add-Member -NotePropertyName 'request_id' -NotePropertyValue $startRequestId -Force

Write-Step 'Starting proposal through n8n webhook'
$startResponse = Invoke-JsonRequest -Method 'POST' -Uri "$N8nBaseUrl/webhook/proposal-start-v1" -Body $startPayload -Headers @{
  'x-request-id' = $startRequestId
}
Assert-Smoke -Condition (-not [string]::IsNullOrWhiteSpace([string]$startResponse.session_id)) -Message 'start response missing session_id'
Assert-Smoke -Condition ($null -ne $startResponse.structured_brief) -Message 'start response missing structured_brief'
Assert-Smoke -Condition ($null -ne $startResponse.next_question) -Message 'start response missing next_question'
Assert-Smoke -Condition (@('continue', 'done', 'blocked') -contains $startResponse.agent_status) -Message 'start response has invalid agent_status'
$sessionId = [string]$startResponse.session_id

Write-Step 'Checking persisted session audit'
$audit = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$sessionId"
Assert-Smoke -Condition ($null -ne $audit.session -and $audit.turns.Count -ge 1) -Message 'audit response missing persisted turn'

$replyRequestId = New-SmokeRequestId
$replyPayload = Get-Content -LiteralPath 'examples/proposal-reply.payload.json' -Raw | ConvertFrom-Json
$replyPayload | Add-Member -NotePropertyName 'request_id' -NotePropertyValue $replyRequestId -Force
$replyPayload.session_id = $sessionId

Write-Step 'Appending reply through n8n webhook'
$replyResponse = Invoke-JsonRequest -Method 'POST' -Uri "$N8nBaseUrl/webhook/proposal-reply-v1" -Body $replyPayload -Headers @{
  'x-request-id' = $replyRequestId
}
Assert-Smoke -Condition ($replyResponse.session_id -eq $sessionId) -Message 'reply response session_id mismatch'
Assert-Smoke -Condition (@('continue', 'done', 'blocked') -contains $replyResponse.agent_status) -Message 'reply response has invalid agent_status'

$postReplyAudit = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$sessionId"
$sectionKinds = @($postReplyAudit.generated_sections | ForEach-Object { $_.section_kind })

if (($sectionKinds -contains 'problem') -and ($sectionKinds -contains 'solution')) {
  $reportRequestId = New-SmokeRequestId
  $reportPayload = @{
    request_id = $reportRequestId
    workflow_version = 'basic_alpha_report_v1'
    session_id = $sessionId
  }
  $reportHeaders = @{
    'x-internal-shared-secret' = $InternalSharedSecret
    'x-request-id' = $reportRequestId
  }

  Write-Step 'Composing and reading Basic Alpha report'
  $reportResponse = Invoke-JsonRequest -Method 'POST' -Uri "$ApiBaseUrl/internal/reports/basic-alpha/compose" -Body $reportPayload -Headers $reportHeaders
  $reportJson = $reportResponse | ConvertTo-Json -Depth 30 -Compress
  Assert-Smoke -Condition (@('ready', 'needs_revision', 'draft') -contains $reportResponse.report_status) -Message 'report response has invalid status'
  Assert-Smoke -Condition ($reportResponse.problem_section.section_kind -eq 'problem') -Message 'report missing problem section'
  Assert-Smoke -Condition ($reportResponse.solution_section.section_kind -eq 'solution') -Message 'report missing solution section'
  Assert-Smoke -Condition (($reportResponse.warnings -join ' ') -like '*does not approve*') -Message 'report missing no-decision warning'
  Assert-Smoke -Condition (-not $reportJson.Contains('raw_model_output')) -Message 'report exposed raw model output'

  $reportGetResponse = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$sessionId/report"
  $reportGetJson = $reportGetResponse | ConvertTo-Json -Depth 30 -Compress
  Assert-Smoke -Condition (-not [string]::IsNullOrWhiteSpace([string]$reportGetResponse.report_id)) -Message 'report GET missing report_id'
  Assert-Smoke -Condition (-not $reportGetJson.Contains('validated_output_json')) -Message 'report GET exposed raw validated output'
} else {
  Write-Step 'Skipping report smoke because the current smoke flow has not generated both Alpha sections'
}

Write-Step 'Checking request execution status'
$startStatus = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/requests/$startRequestId"
$replyStatus = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/requests/$replyRequestId"
Assert-Smoke -Condition ($startStatus.status -eq 'completed') -Message 'start request did not complete'
Assert-Smoke -Condition ($replyStatus.status -eq 'completed') -Message 'reply request did not complete'

$recoveryRequestId = New-SmokeRequestId
$proposalPayload = Get-Content -LiteralPath 'examples/proposal-start.payload.json' -Raw | ConvertFrom-Json
$recoveryPayload = @{
  request_id = $recoveryRequestId
  workflow_version = 'proposal_start_v1'
  payload = $proposalPayload
}
$headers = @{
  'x-internal-shared-secret' = $InternalSharedSecret
  'x-request-id' = $recoveryRequestId
}

Write-Step 'Creating partial start request and recovering it'
Invoke-JsonRequest -Method 'POST' -Uri "$ApiBaseUrl/internal/sessions/start-context" -Body $recoveryPayload -Headers $headers | Out-Null
$pendingStatus = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/requests/$recoveryRequestId"
Assert-Smoke -Condition ($pendingStatus.status -eq 'pending') -Message 'partial start request should be pending before recovery'
$recoveryStatus = Invoke-JsonRequest -Method 'POST' -Uri "$ApiBaseUrl/api/v1/requests/$recoveryRequestId/recover"
Assert-Smoke -Condition ($recoveryStatus.status -eq 'completed') -Message 'recovery did not complete the partial start request'
Assert-Smoke -Condition ($recoveryStatus.request_kind -eq 'proposal_start') -Message 'recovery response has wrong request kind'
Assert-Smoke -Condition (-not [string]::IsNullOrWhiteSpace([string]$recoveryStatus.session_id)) -Message 'recovery response missing session_id'

Write-Step 'Core smoke completed'
