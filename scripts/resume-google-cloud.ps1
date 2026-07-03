param(
  [string]$ProjectId = "eciencia-andina-preprod",
  [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"

function Get-Service {
  param([string]$ServiceName)

  $service = gcloud run services describe $ServiceName `
    --project $ProjectId `
    --region $Region `
    --format json | ConvertFrom-Json

  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo leer la configuracion de $ServiceName."
  }
  return $service
}

foreach ($serviceName in @("eciencia-frontend", "eciencia-backend")) {
  Write-Host "Reactivando $serviceName..."
  gcloud run services update $serviceName `
    --project $ProjectId `
    --region $Region `
    --ingress all `
    --min-instances 0 `
    --quiet

  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo reactivar $serviceName."
  }
}

$backend = Get-Service -ServiceName "eciencia-backend"
$backendUrl = [string]$backend.status.url

Write-Host "Reactivando eciencia-n8n..."
gcloud run services update "eciencia-n8n" `
  --project $ProjectId `
  --region $Region `
  --ingress all `
  --min-instances 1 `
  --no-cpu-throttling `
  --update-env-vars "N8N_ECIENCIA_BACKEND_URL=$backendUrl" `
  --quiet

if ($LASTEXITCODE -ne 0) {
  throw "No se pudo reactivar eciencia-n8n."
}

$environment = @{}
foreach ($item in $backend.spec.template.spec.containers[0].env) {
  if ($item.value) {
    $environment[$item.name] = [string]$item.value
  }
}

$telegramToken = $environment["TELEGRAM_BOT_TOKEN"]
$telegramSecret = $environment["TELEGRAM_WEBHOOK_SECRET"]
if (-not $telegramToken -or -not $telegramSecret -or -not $backendUrl) {
  throw "Faltan datos para registrar el webhook de Telegram."
}

Write-Host "Registrando webhook de Telegram..."
$telegramResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.telegram.org/bot$telegramToken/setWebhook" `
  -ContentType "application/json" `
  -Body (@{
    url = "$backendUrl/api/telegram/webhook"
    secret_token = $telegramSecret
    drop_pending_updates = $false
  } | ConvertTo-Json)

if ($telegramResponse.ok -ne $true) {
  throw "Telegram no permitio registrar el webhook."
}

Write-Host "Sistema reactivado."
Write-Host "Frontend: https://eciencia-frontend-6l6z5rafiq-uc.a.run.app"
Write-Host "Backend:  $backendUrl"
Write-Host "n8n:     https://eciencia-n8n-6l6z5rafiq-uc.a.run.app"
