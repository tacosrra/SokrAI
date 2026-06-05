Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ApiBaseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { 'http://localhost:3001' }
$N8nBaseUrl = if ($env:N8N_BASE_URL) { $env:N8N_BASE_URL } else { 'http://localhost:5678' }
$InternalSharedSecret = if ($env:INTERNAL_SHARED_SECRET) { $env:INTERNAL_SHARED_SECRET } else { 'replace-with-a-random-32-char-secret' }
$RequestTimeoutSeconds = if ($env:REQUEST_TIMEOUT_SECONDS) { [int]$env:REQUEST_TIMEOUT_SECONDS } else { 480 }
$MaxClinicTurns = if ($env:MAX_CLINIC_TURNS) { [int]$env:MAX_CLINIC_TURNS } else { 4 }

function Write-Step {
  param([Parameter(Mandatory = $true)][string] $Message)
  Write-Host "[smoke-clinic-demo] $Message"
}

function Fail {
  param([Parameter(Mandatory = $true)][string] $Message)
  throw "smoke-clinic-demo: $Message"
}

function ConvertTo-SafeSummary {
  param([Parameter(Mandatory = $true)] $Data)

  $keys = @()
  $counts = @{}
  $sectionKinds = @()

  if ($null -ne $Data -and $Data -isnot [string]) {
    $properties = @($Data.PSObject.Properties)
    $keys = @($properties | Select-Object -First 24 | ForEach-Object { $_.Name })

    foreach ($property in $properties) {
      if ($property.Value -is [array]) {
        $counts[$property.Name] = @($property.Value).Count
      }
    }

    if ($null -ne $Data.generated_sections) {
      $sectionKinds = @($Data.generated_sections | ForEach-Object { $_.section_kind })
    }
  }

  return @{
    top_level_keys = $keys
    session_id = if ($Data.session_id) { $Data.session_id } elseif ($Data.session) { $Data.session.id } else { $null }
    request_id = $Data.request_id
    stage = if ($Data.stage) { $Data.stage } elseif ($Data.session) { $Data.session.current_stage } else { $null }
    agent_status = $Data.agent_status
    activation_result = $Data.activation_result
    error_code = $Data.error_code
    safe_message = $Data.safe_message
    status = if ($Data.status) { $Data.status } elseif ($Data.session) { $Data.session.status } elseif ($Data.report_status) { $Data.report_status } else { $null }
    next_question_present = ($Data.next_question -is [string] -and $Data.next_question.Length -gt 0)
    section_kinds = $sectionKinds
    counts = $counts
  } | ConvertTo-Json -Compress
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
  return "clinic-smoke-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$([Guid]::NewGuid())"
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
    $params.Body = ($Body | ConvertTo-Json -Depth 30)
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
    [Parameter(Mandatory = $true)][string] $Message,
    [object] $Data = $null
  )

  if (-not $Condition) {
    if ($null -ne $Data) {
      Fail "$Message`: $(ConvertTo-SafeSummary -Data $Data)"
    }

    Fail $Message
  }
}

function Invoke-Webhook {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][object] $Body,
    [Parameter(Mandatory = $true)][string] $RequestId
  )

  return Invoke-JsonRequest -Method 'POST' -Uri "$N8nBaseUrl/webhook/$Path" -Body $Body -Headers @{
    'x-request-id' = $RequestId
  }
}

function New-SessionPayload {
  param(
    [Parameter(Mandatory = $true)][string] $RequestId,
    [Parameter(Mandatory = $true)][string] $SessionId,
    [bool] $IncludeProfile = $false
  )

  $payload = [ordered]@{
    request_id = $RequestId
    session_id = $SessionId
  }

  if ($IncludeProfile) {
    $payload.profile_id = 'hospital_clinic_v1'
  }

  return $payload
}

function New-ReplyPayload {
  param(
    [Parameter(Mandatory = $true)][string] $RequestId,
    [Parameter(Mandatory = $true)][string] $SessionId,
    [Parameter(Mandatory = $true)][string] $Answer
  )

  return @{
    request_id = $RequestId
    session_id = $SessionId
    answer = $Answer
  }
}

function Invoke-RepliesUntilDone {
  param(
    [Parameter(Mandatory = $true)][string] $Label,
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $SessionId,
    [Parameter(Mandatory = $true)] $StartResponse,
    [Parameter(Mandatory = $true)][string[]] $Answers
  )

  $current = $StartResponse
  $status = [string]$current.agent_status
  $turns = 0

  foreach ($answer in $Answers) {
    if ($status -eq 'done' -or $status -eq 'blocked') {
      break
    }

    if ($turns -ge $MaxClinicTurns) {
      break
    }

    $requestId = New-SmokeRequestId
    $current = Invoke-Webhook -Path $Path -Body (New-ReplyPayload -RequestId $requestId -SessionId $SessionId -Answer $answer) -RequestId $requestId
    Assert-Smoke -Condition (@('continue', 'done', 'blocked') -contains $current.agent_status) -Message "$Label reply response has invalid contract" -Data $current
    $status = [string]$current.agent_status
    $turns += 1
    Write-Step "$Label status=$status"
  }

  Assert-Smoke -Condition ($status -eq 'done') -Message "$Label did not reach done within $MaxClinicTurns turns" -Data $current
}

function Assert-AuditRedacted {
  param([Parameter(Mandatory = $true)][string] $SessionId)

  $audit = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$SessionId"
  $runs = @($audit.runs)
  $sections = @($audit.generated_sections | ForEach-Object { $_.section_kind })
  $serialized = $audit | ConvertTo-Json -Depth 40 -Compress
  $unsafeRuns = @($runs | Where-Object { $null -ne $_.raw_model_output -or $null -ne $_.validated_output_json })

  Assert-Smoke -Condition ($unsafeRuns.Count -eq 0) -Message 'public audit exposed raw agent run output' -Data $audit
  Assert-Smoke -Condition (-not $serialized.Contains('content_base64') -and -not $serialized.Contains('INTERNAL_SHARED_SECRET')) -Message 'public audit exposed sensitive marker' -Data $audit

  foreach ($kind in @('problem', 'solution', 'data_ai_privacy', 'resources_pilot_viability')) {
    Assert-Smoke -Condition ($sections -contains $kind) -Message "audit missing expected section kind $kind" -Data $audit
  }
}

Write-Step 'Checking API health'
$health = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/healthz"
Assert-Smoke -Condition ($health.status -eq 'ok') -Message 'healthz did not return ok' -Data $health

$startRequestId = New-SmokeRequestId
$startPayload = Get-Content -LiteralPath 'examples/proposal-start.payload.json' -Raw | ConvertFrom-Json
$startPayload | Add-Member -NotePropertyName 'request_id' -NotePropertyValue $startRequestId -Force
$startPayload | Add-Member -NotePropertyName 'document_text' -NotePropertyValue 'Datos ficticios para demo local Clinic. Esperas simuladas de 27 minutos en admision. Sin datos reales de pacientes.' -Force
$startPayload | Add-Member -NotePropertyName 'metadata' -NotePropertyValue @{ demo = 'clinic-local'; data_policy = 'fake-only' } -Force

Write-Step 'Starting fake Clinic proposal'
$startResponse = Invoke-Webhook -Path 'proposal-start-v1' -Body $startPayload -RequestId $startRequestId
Assert-Smoke -Condition (-not [string]::IsNullOrWhiteSpace([string]$startResponse.session_id)) -Message 'start response missing session_id' -Data $startResponse
Assert-Smoke -Condition ($null -ne $startResponse.structured_brief) -Message 'start response missing structured_brief' -Data $startResponse
$sessionId = [string]$startResponse.session_id
Write-Step "session_id=$sessionId"

Invoke-RepliesUntilDone -Label 'problem' -Path 'proposal-reply-v1' -SessionId $sessionId -StartResponse $startResponse -Answers @(
  'El owner principal es coordinacion de urgencias y la responsable operativa es enfermeria de admision. El problema es el retraso en clasificacion inicial durante picos. Evidencia ficticia: esperas medias de 27 minutos, quejas simuladas y variabilidad entre turnos. Alcance: urgencias de adultos, sin diagnostico automatico.',
  'La medicion ficticia sale de una semana simulada: 120 admisiones, 34 esperas por encima de 30 minutos y 11 reclamaciones simuladas por demora. La hipotesis principal es que falta informacion estructurada al inicio.',
  'Quedan como ambiguedades la cobertura exacta de turnos, criterios de escalado y quien valida cambios. La demo debe cerrar solo la definicion del problema y dejar esas dudas como supuestos auditables.'
)

$solutionStartId = New-SmokeRequestId
Write-Step 'Starting solution lane'
$solutionStart = Invoke-Webhook -Path 'solution-start-v1' -Body (New-SessionPayload -RequestId $solutionStartId -SessionId $sessionId) -RequestId $solutionStartId
Assert-Smoke -Condition ($solutionStart.stage -eq 'solution_definition') -Message 'solution start response has invalid stage' -Data $solutionStart
Invoke-RepliesUntilDone -Label 'solution' -Path 'solution-reply-v1' -SessionId $sessionId -StartResponse $solutionStart -Answers @(
  'La solucion de demo es un asistente local que guia preguntas estructuradas, resume datos recogidos y deja un resumen para revision humana. No prioriza pacientes, no diagnostica y no sustituye el protocolo vigente.',
  'El flujo cambia al pedir datos minimos antes de cerrar la clasificacion manual: motivo, tiempo de espera, informacion faltante y duda de escalado. La persona revisora confirma o corrige el resumen.',
  'Los limites son explicitos: sin integracion hospitalaria, sin respuesta automatica al paciente, sin scoring clinico, sin decisiones regulatorias y sin uso fuera del entorno local.'
)

$dataStartId = New-SmokeRequestId
Write-Step 'Starting data/AI/privacy lane'
$dataStart = Invoke-Webhook -Path 'data-ai-privacy-start-v1' -Body (New-SessionPayload -RequestId $dataStartId -SessionId $sessionId -IncludeProfile $true) -RequestId $dataStartId
$dataStartValid = $dataStart.stage -eq 'data_ai_privacy' -and $dataStart.profile_id -eq 'hospital_clinic_v1'
Assert-Smoke -Condition $dataStartValid -Message 'data/AI/privacy start response has invalid contract' -Data $dataStart
Invoke-RepliesUntilDone -Label 'data-ai-privacy' -Path 'data-ai-privacy-reply-v1' -SessionId $sessionId -StartResponse $dataStart -Answers @(
  'La demo usa solo datos ficticios: edad en rangos, motivo de consulta simulado, hora de llegada y prioridad manual simulada. No hay integracion hospitalaria. Las salidas se revisan por personal competente y no se usan para decisiones clinicas, legales o regulatorias.',
  'Los controles esperados para un piloto real serian minimizacion, trazabilidad, acceso restringido, revision humana competente, separacion de datos de entrenamiento y validacion local.',
  'Las incertidumbres son base juridica, DPIA, responsable del tratamiento, periodo de conservacion, gestion de errores y como retirar datos si alguien pega informacion real por error.'
)

$medicalStartId = New-SmokeRequestId
Write-Step 'Starting medical-device triage lane'
$medicalStart = Invoke-Webhook -Path 'medical-device-triage-start-v1' -Body (New-SessionPayload -RequestId $medicalStartId -SessionId $sessionId -IncludeProfile $true) -RequestId $medicalStartId
$medicalStartValid = $medicalStart.stage -eq 'medical_device_triage' -and (@('applicable', 'not_applicable', 'uncertain') -contains $medicalStart.activation_result)
Assert-Smoke -Condition $medicalStartValid -Message 'medical-device start response has invalid contract' -Data $medicalStart

if ($medicalStart.agent_status -ne 'done') {
  Invoke-RepliesUntilDone -Label 'medical-device' -Path 'medical-device-triage-reply-v1' -SessionId $sessionId -StartResponse $medicalStart -Answers @(
    'El uso previsto de la demo es administrativo y de maduracion de propuesta, no asistencial. No genera prioridad clinica ni recomendacion individual. La incertidumbre se documenta para revision humana competente.',
    'Si el alcance cambiara hacia soporte de triaje real, haria falta revisar intended purpose, usuarios, claims, validacion clinica, integracion, supervision y posible encaje MDR antes de piloto.',
    'Para esta demo el resultado aceptable es registrar gaps y preguntas; no se debe emitir clase MDR, aprobacion, cumplimiento ni decision de producto sanitario.'
  )
} else {
  Write-Step "medical-device status=done activation=$($medicalStart.activation_result)"
}

$resourcesStartId = New-SmokeRequestId
Write-Step 'Starting resources/pilot/viability lane'
$resourcesStart = Invoke-Webhook -Path 'resources-pilot-viability-start-v1' -Body (New-SessionPayload -RequestId $resourcesStartId -SessionId $sessionId) -RequestId $resourcesStartId
Assert-Smoke -Condition ($resourcesStart.stage -eq 'resources_pilot_viability') -Message 'resources/pilot start response has invalid stage' -Data $resourcesStart
Invoke-RepliesUntilDone -Label 'resources' -Path 'resources-pilot-viability-reply-v1' -SessionId $sessionId -StartResponse $resourcesStart -Answers @(
  'El piloto ficticio requiere un portatil local, Ollama, n8n, PostgreSQL, dos revisores, sesiones semanales y datos sinteticos. Metricas: tiempo de entrevista, completitud del brief y gaps aclarados. Riesgos: expectativas clinicas indebidas, datos reales por error y disponibilidad local.',
  'Las dependencias son disponibilidad de sala, responsable de demo, checklist de datos ficticios, workflows importados, modelo descargado y reset local antes de repetir la sesion.',
  'La viabilidad se revisaria por capacidad operativa, tiempo de respuesta local, claridad del brief, numero de dudas restantes y ausencia de datos reales en logs o auditoria publica.'
)

$reportRequestId = New-SmokeRequestId
$reportPayload = New-SessionPayload -RequestId $reportRequestId -SessionId $sessionId
$reportPayload['workflow_version'] = 'basic_alpha_report_v1'
$reportHeaders = @{
  'x-internal-shared-secret' = $InternalSharedSecret
  'x-request-id' = $reportRequestId
}

Write-Step 'Composing Basic Alpha report'
$reportResponse = Invoke-JsonRequest -Method 'POST' -Uri "$ApiBaseUrl/internal/reports/basic-alpha/compose" -Body $reportPayload -Headers $reportHeaders
$reportJson = $reportResponse | ConvertTo-Json -Depth 40 -Compress
Assert-Smoke -Condition (@('ready', 'needs_revision', 'draft') -contains $reportResponse.report_status) -Message 'report response has invalid status' -Data $reportResponse
$reportRedacted = -not $reportJson.Contains('raw_model_output') -and -not $reportJson.Contains('validated_output_json')
Assert-Smoke -Condition $reportRedacted -Message 'report exposed raw model output' -Data $reportResponse

$reportGet = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$sessionId/report"
$reportGetValid = -not [string]::IsNullOrWhiteSpace([string]$reportGet.report_id) -and $reportGet.problem_section.section_kind -eq 'problem' -and $reportGet.solution_section.section_kind -eq 'solution'
Assert-Smoke -Condition $reportGetValid -Message 'report GET missing expected Alpha sections' -Data $reportGet

$pdfPath = Join-Path ([System.IO.Path]::GetTempPath()) "sokrai-clinic-demo-$sessionId.pdf"
try {
  $pdfResponse = Invoke-WebRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$sessionId/report.pdf" -TimeoutSec $RequestTimeoutSeconds -OutFile $pdfPath
} catch {
  Fail "GET report.pdf failed: $(ConvertTo-SafeFailureSummary -ErrorRecord $_)"
}

$contentType = [string]$pdfResponse.Headers['Content-Type']
Assert-Smoke -Condition ($contentType -like '*application/pdf*') -Message 'PDF response missing application/pdf content type'
$bytes = [System.IO.File]::ReadAllBytes($pdfPath)
$pdfHeaderValid = $bytes.Length -ge 4 -and [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4) -eq '%PDF'
Assert-Smoke -Condition $pdfHeaderValid -Message 'PDF body missing PDF header'
Remove-Item -LiteralPath $pdfPath -Force

Assert-AuditRedacted -SessionId $sessionId
$finalAudit = Invoke-JsonRequest -Method 'GET' -Uri "$ApiBaseUrl/api/v1/sessions/$sessionId"
$sectionKinds = @($finalAudit.generated_sections | ForEach-Object { $_.section_kind }) -join ','
Write-Step "section_kinds=$sectionKinds"
Write-Step 'Clinic demo smoke completed'
