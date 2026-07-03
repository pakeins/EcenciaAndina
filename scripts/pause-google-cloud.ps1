param(
  [string]$ProjectId = "eciencia-andina-preprod",
  [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"

function Get-ServiceEnvironment {
  param([string]$ServiceName)

  $service = gcloud run services describe $ServiceName `
    --project $ProjectId `
    --region $Region `
    --format json | ConvertFrom-Json

  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo leer la configuracion de $ServiceName."
  }

  $values = @{}
  foreach ($item in $service.spec.template.spec.containers[0].env) {
    if ($item.value) {
      $values[$item.name] = [string]$item.value
    }
  }
  return $values
}

Write-Host "Desregistrando webhook de Telegram..."
$backendEnvironment = Get-ServiceEnvironment -ServiceName "eciencia-backend"
$telegramToken = $backendEnvironment["TELEGRAM_BOT_TOKEN"]

if (-not $telegramToken) {
  throw "El backend no contiene TELEGRAM_BOT_TOKEN."
}

$telegramResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.telegram.org/bot$telegramToken/deleteWebhook" `
  -ContentType "application/json" `
  -Body (@{ drop_pending_updates = $false } | ConvertTo-Json)

if ($telegramResponse.ok -ne $true) {
  throw "Telegram no permitio eliminar el webhook."
}

foreach ($serviceName in @("eciencia-frontend", "eciencia-backend", "eciencia-n8n")) {
  Write-Host "Pausando $serviceName..."
  $arguments = @(
    "run", "services", "update", $serviceName,
    "--project", $ProjectId,
    "--region", $Region,
    "--ingress", "internal",
    "--min-instances", "0",
    "--quiet"
  )

  if ($serviceName -eq "eciencia-n8n") {
    $arguments += "--cpu-throttling"
  }

  & gcloud @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo pausar $serviceName."
  }
}

Write-Host "Sistema pausado. Los servicios y datos se conservaron."
