param(
  [string]$ProjectId = "eciencia-andina-preprod",
  [string]$ProjectNumber = "388587559842",
  [string]$Region = "us-central1",
  [string]$Repository = "eciencia",
  [string]$Tag = "preprod",
  [string]$BackendService = "eciencia-backend",
  [string]$FrontendService = "eciencia-frontend"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BackendEnvFile = Join-Path $Root "backend\.env.cloudrun.preprod.yaml"

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Script
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Script
}

function Read-SimpleYaml {
  param([string]$Path)

  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }

    $idx = $trimmed.IndexOf(":")
    if ($idx -le 0) { continue }

    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$key] = $value
  }
  return $values
}

function Set-SimpleYamlValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $lines = [System.Collections.Generic.List[string]]::new()
  $updated = $false

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^$([regex]::Escape($Key))\s*:") {
      $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
      $lines.Add("${Key}: `"$escaped`"")
      $updated = $true
    } else {
      $lines.Add($line)
    }
  }

  if (-not $updated) {
    $escaped = $Value.Replace('\', '\\').Replace('"', '\"')
    $lines.Add("${Key}: `"$escaped`"")
  }

  Set-Content -LiteralPath $Path -Value $lines -Encoding ascii
}

function Remove-SimpleYamlKey {
  param(
    [string]$Path,
    [string]$Key
  )

  $filtered = Get-Content -LiteralPath $Path | Where-Object { $_ -notmatch "^$([regex]::Escape($Key))\s*:" }
  Set-Content -LiteralPath $Path -Value $filtered -Encoding ascii
}

function Get-ProjectRefFromSupabaseUrl {
  param([string]$SupabaseUrl)

  $uri = [System.Uri]$SupabaseUrl
  return $uri.Host.Split(".")[0]
}

function Assert-HttpsPublicUrl {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Falta $Name."
  }

  $uri = [System.Uri]$Value
  if ($uri.Scheme -ne "https") {
    throw "$Name debe usar HTTPS."
  }

  $localHosts = @("localhost", "127.0.0.1", "0.0.0.0", "::1")
  if ($localHosts -contains $uri.Host.ToLowerInvariant()) {
    throw "$Name no puede apuntar a localhost en preproduccion."
  }
}

Set-Location $Root

if (-not (Test-Path -LiteralPath $BackendEnvFile)) {
  throw "No existe $BackendEnvFile. Crea ese archivo local ignorado antes de desplegar."
}

Remove-SimpleYamlKey -Path $BackendEnvFile -Key "PORT"

$envValues = Read-SimpleYaml -Path $BackendEnvFile
$required = @(
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "N8N_MENU_WEBHOOK_URL",
  "N8N_MENU_WEBHOOK_SECRET"
)
foreach ($name in $required) {
  if (-not $envValues.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($envValues[$name])) {
    throw "Falta $name en $BackendEnvFile."
  }
}

Assert-HttpsPublicUrl -Name "SUPABASE_URL" -Value $envValues["SUPABASE_URL"]
Assert-HttpsPublicUrl -Name "N8N_MENU_WEBHOOK_URL" -Value $envValues["N8N_MENU_WEBHOOK_URL"]

$publishableKey = $envValues["SUPABASE_ANON_KEY"]
if ([string]::IsNullOrWhiteSpace($publishableKey)) {
  $publishableKey = $envValues["SUPABASE_KEY"]
}
if ([string]::IsNullOrWhiteSpace($publishableKey)) {
  throw "Falta SUPABASE_ANON_KEY o SUPABASE_KEY en $BackendEnvFile para construir el frontend."
}

$supabaseUrl = $envValues["SUPABASE_URL"]
$supabaseProjectRef = Get-ProjectRefFromSupabaseUrl -SupabaseUrl $supabaseUrl
$buildServiceAccount = "$ProjectNumber-compute@developer.gserviceaccount.com"

Invoke-Step "Configurar proyecto gcloud" {
  gcloud config set project $ProjectId
}

Invoke-Step "Activar APIs necesarias" {
  gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    --project $ProjectId
}

Invoke-Step "Asegurar permisos de Cloud Build" {
  gcloud projects add-iam-policy-binding $ProjectId `
    --member "serviceAccount:$buildServiceAccount" `
    --role "roles/cloudbuild.builds.builder" `
    --quiet | Out-Null
}

Invoke-Step "Crear Artifact Registry si no existe" {
  $repoExists = $true
  try {
    gcloud artifacts repositories describe $Repository `
      --project $ProjectId `
      --location $Region `
      --format "value(name)" | Out-Null
  } catch {
    $repoExists = $false
  }

  if (-not $repoExists) {
    gcloud artifacts repositories create $Repository `
      --project $ProjectId `
      --repository-format docker `
      --location $Region `
      --description "Eciencia Andina containers"
  } else {
    Write-Host "Artifact Registry ya existe: $Repository"
  }
}

Invoke-Step "Verificar que backend/frontend no suben archivos .env" {
  $backendEnvMatches = gcloud meta list-files-for-upload backend | Select-String -Pattern "\.env"
  $frontendEnvMatches = gcloud meta list-files-for-upload frontend | Select-String -Pattern "\.env"

  if ($backendEnvMatches -or $frontendEnvMatches) {
    Write-Host "Archivos .env detectados en el contexto de subida:" -ForegroundColor Red
    $backendEnvMatches
    $frontendEnvMatches
    throw "Corrige .gcloudignore antes de desplegar."
  }
}

$backendImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/backend:$Tag"
$frontendImage = "$Region-docker.pkg.dev/$ProjectId/$Repository/frontend:$Tag"

Invoke-Step "Construir imagen backend" {
  gcloud builds submit backend `
    --project $ProjectId `
    --tag $backendImage
}

Invoke-Step "Desplegar backend" {
  gcloud run deploy $BackendService `
    --project $ProjectId `
    --image $backendImage `
    --region $Region `
    --allow-unauthenticated `
    --min-instances 0 `
    --max-instances 1 `
    --memory 512Mi `
    --port 3001 `
    --env-vars-file $BackendEnvFile
}

$backendUrl = gcloud run services describe $BackendService `
  --project $ProjectId `
  --region $Region `
  --format "value(status.url)"

Set-SimpleYamlValue -Path $BackendEnvFile -Key "PUBLIC_BACKEND_URL" -Value $backendUrl
Set-SimpleYamlValue -Path $BackendEnvFile -Key "TELEGRAM_WEBHOOK_URL" -Value "$backendUrl/api/telegram/webhook"

Invoke-Step "Actualizar backend con su URL publica" {
  gcloud run services update $BackendService `
    --project $ProjectId `
    --region $Region `
    --env-vars-file $BackendEnvFile
}

Invoke-Step "Registrar webhook Telegram en backend Cloud Run" {
  $envValues = Read-SimpleYaml -Path $BackendEnvFile
  $telegramToken = $envValues["TELEGRAM_BOT_TOKEN"]
  $telegramSecret = $envValues["TELEGRAM_WEBHOOK_SECRET"]
  $telegramWebhookUrl = $envValues["TELEGRAM_WEBHOOK_URL"]

  Assert-HttpsPublicUrl -Name "TELEGRAM_WEBHOOK_URL" -Value $telegramWebhookUrl

  $body = @{
    url = $telegramWebhookUrl
    secret_token = $telegramSecret
    drop_pending_updates = $false
  } | ConvertTo-Json

  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "https://api.telegram.org/bot$telegramToken/setWebhook" `
    -ContentType "application/json" `
    -Body $body

  if (-not $response.ok) {
    throw "Telegram no acepto el webhook: $($response.description)"
  }

  Write-Host "Webhook Telegram registrado: $telegramWebhookUrl"
}

Invoke-Step "Construir imagen frontend" {
  gcloud builds submit frontend `
    --project $ProjectId `
    --config frontend/cloudbuild.yaml `
    --substitutions "_PROJECT_ID=$ProjectId,_REGION=$Region,_REPO=$Repository,_TAG=$Tag"
}

Invoke-Step "Desplegar frontend" {
  gcloud run deploy $FrontendService `
    --project $ProjectId `
    --image $frontendImage `
    --region $Region `
    --allow-unauthenticated `
    --min-instances 0 `
    --max-instances 1 `
    --memory 256Mi `
    --port 8080 `
    --set-env-vars "API_BASE_URL=$backendUrl/api,SUPABASE_URL=$supabaseUrl,SUPABASE_PUBLISHABLE_KEY=$publishableKey,SUPABASE_PROJECT_ID=$supabaseProjectRef"
}

$frontendUrl = gcloud run services describe $FrontendService `
  --project $ProjectId `
  --region $Region `
  --format "value(status.url)"

Set-SimpleYamlValue -Path $BackendEnvFile -Key "CORS_ORIGINS" -Value $frontendUrl
Set-SimpleYamlValue -Path $BackendEnvFile -Key "PUBLIC_FRONTEND_URL" -Value $frontendUrl

Invoke-Step "Actualizar CORS del backend" {
  gcloud run services update $BackendService `
    --project $ProjectId `
    --region $Region `
    --env-vars-file $BackendEnvFile
}

Invoke-Step "Probar servicios" {
  $check = Invoke-RestMethod "$backendUrl/api/check-db"
  Write-Host "Backend check-db: $($check.mensaje)"

  $front = Invoke-WebRequest $frontendUrl -UseBasicParsing
  Write-Host "Frontend HTTP status: $($front.StatusCode)"
}

Write-Host ""
Write-Host "Preproduccion levantada." -ForegroundColor Green
Write-Host "Backend:  $backendUrl"
Write-Host "Frontend: $frontendUrl"
Write-Host ""
Write-Host "Login de prueba: Admin / la password que configuraste en Supabase"
