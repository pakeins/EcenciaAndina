# Script de Despliegue Automatizado para Ecencia Andina en Azure
# Requiere: Azure CLI (logeado con az login), Terraform, Node.js y OpenSSH Client (incluido por defecto en Windows)

$ErrorActionPreference = "Continue"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Iniciando Despliegue de Ecencia Andina en Azure " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Ajustar permisos de la llave privada SSH (requerido en Windows para evitar error UNPROTECTED PRIVATE KEY)
$sshKeyPath = "terraform-lab/id_rsa.pem"
if (Test-Path $sshKeyPath) {
    Write-Host "[1/8] Configurando permisos seguros para la llave SSH..." -ForegroundColor Yellow
    $absoluteKeyPath = (Get-Item $sshKeyPath).FullName
    
    # Deshabilitar herencia de permisos y remover accesos heredados, concediendo Full Control al usuario actual
    Write-Host "Configurando ACL usando icacls.exe..."
    $output = icacls.exe $absoluteKeyPath /inheritance:r /grant:r "${env:USERNAME}:F" 2>&1
    Write-Host $output
    Write-Host "¡Permisos seguros aplicados a $sshKeyPath!" -ForegroundColor Green
} else {
    Write-Host "[1/8] La llave SSH no existe todavía. Terraform la generará..." -ForegroundColor Yellow
}

# 2. Ejecutar Terraform Apply (con reintentos para manejar latencia transitoria de Azure)
Write-Host "[2/8] Aplicando cambios de Terraform..." -ForegroundColor Yellow
Push-Location terraform-lab
try {
    terraform init
    $success = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-Host "Ejecutando terraform apply (intento $attempt de 3)..."
        terraform apply -auto-approve
        if ($LASTEXITCODE -eq 0) {
            $success = $true
            break
        }
        Write-Host "Terraform apply falló (intento $attempt). Reintentando en 10 segundos..." -ForegroundColor Red
        Start-Sleep -Seconds 10
    }
    if (-not $success) {
        Write-Error "Terraform apply falló de forma persistente tras 3 intentos."
        exit 1
    }
} finally {
    Pop-Location
}

# 3. Obtener la IP Pública asignada
Push-Location terraform-lab
$ip = (terraform output -raw direccion_ip_publica).Trim()
Pop-Location

if (-not $ip -or $ip -eq "") {
    Write-Error "No se pudo obtener la dirección IP pública del output de Terraform."
    exit 1
}
Write-Host "¡Dirección IP pública obtenida: $ip!" -ForegroundColor Green

# 4. Esperar a que el puerto SSH esté disponible en la VM
Write-Host "[3/8] Esperando conexión SSH con la VM en $ip..." -ForegroundColor Yellow
$sshReady = $false
while (-not $sshReady) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect($ip, 22, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(2000, $false)
        if ($tcp.Connected) {
            $tcp.Close()
            $sshReady = $true
            Write-Host "¡Puerto SSH abierto y listo!" -ForegroundColor Green
        }
    } catch {}
    if (-not $sshReady) {
        Write-Host "SSH no responde aún, reintentando en 3 segundos..."
        Start-Sleep -Seconds 3
    }
}

# Pequeña pausa adicional para asegurar que SSHD esté completamente listo para autenticar
Start-Sleep -Seconds 5

# 5. Compilar el Frontend localmente
Write-Host "[4/8] Compilando el Frontend localmente con npm run build..." -ForegroundColor Yellow
Push-Location frontend
try {
    Write-Host "Instalando dependencias de frontend..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install falló"; exit 1 }
    Write-Host "Compilando frontend..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "npm run build falló"; exit 1 }
} finally {
    Pop-Location
}
Write-Host "¡Frontend compilado con éxito!" -ForegroundColor Green

# 6. Esperar a que Docker se termine de instalar en la VM (custom_data)
Write-Host "[5/8] Esperando a que Docker y Apache finalicen su instalación en la VM..." -ForegroundColor Yellow
$dockerReady = $false
for ($i = 1; $i -le 30; $i++) {
    Write-Host "Verificando instalación de Docker (intento $i de 30)..."
    $checkDocker = & ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@$ip "which docker" 2>$null
    if ($checkDocker -and $checkDocker -like "*docker*") {
        $dockerReady = $true
        Write-Host "¡Docker y Docker Compose están listos en el servidor!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 10
}

if (-not $dockerReady) {
    Write-Error "El script de aprovisionamiento (custom_data) de la VM tomó demasiado tiempo o falló instalando Docker."
    exit 1
}

# 7. Subir el Frontend compilado y los archivos PDF
Write-Host "[6/8] Subiendo frontend al servidor web Apache..." -ForegroundColor Yellow

if (Test-Path frontend.tar.gz) {
    Remove-Item frontend.tar.gz
}

# Crear archivo tar.gz del frontend de forma robusta
Write-Host "Empaquetando directorio frontend compilado (dist)..."
tar -czf frontend.tar.gz -C frontend/dist .

# Subir el frontend comprimido
Write-Host "Subiendo frontend comprimido al servidor..."
scp -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null frontend.tar.gz azureuser@${ip}:/home/azureuser/

# Extraer en /var/www/html y limpiar el archivo en la VM
Write-Host "Descomprimiendo frontend en /var/www/html/..."
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@${ip} "tar -xzf /home/azureuser/frontend.tar.gz -C /var/www/html/ && rm /home/azureuser/frontend.tar.gz"

# Limpiar archivo tar.gz local
Remove-Item frontend.tar.gz

# Subir PDFs de forma condicional si existen en el directorio
if (Test-Path "Carvajal - Rengifo.pdf") {
    Write-Host "Subiendo tesis escrita..."
    scp -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "Carvajal - Rengifo.pdf" azureuser@${ip}:/var/www/html/tesis.pdf
}

if (Test-Path "MANUAL DE MARCA ECENCIA ANDINA.pdf") {
    Write-Host "Subiendo manual de marca..."
    scp -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "MANUAL DE MARCA ECENCIA ANDINA.pdf" azureuser@${ip}:/var/www/html/marca.pdf
}

Write-Host "¡Frontend subido exitosamente!" -ForegroundColor Green

# Corregir permisos en el servidor para evitar errores 403 Forbidden en Apache
Write-Host "Ajustando permisos de archivos en Apache..."
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@${ip} "chmod -R 755 /var/www/html"


# 8. Empaquetar y subir el Backend
Write-Host "[7/8] Empaquetando y subiendo el backend..." -ForegroundColor Yellow

if (Test-Path backend.tar.gz) {
    Remove-Item backend.tar.gz
}

# Crear archivo tar.gz excluyendo node_modules locales, base de datos n8n local y archivos .env locales
Write-Host "Empaquetando directorio backend..."
tar --exclude="backend/node_modules" --exclude="backend/n8n/.n8n" --exclude="backend/.env*" -czf backend.tar.gz backend docker-compose.yml

# Crear el directorio del proyecto en la VM por si no existe
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@$ip "mkdir -p /home/azureuser/ECenciaAPP/convenios"

# Subir el backend comprimido
Write-Host "Subiendo backend al servidor..."
scp -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null backend.tar.gz azureuser@${ip}:/home/azureuser/ECenciaAPP/

# Extraer el backend en la VM y borrar el archivo comprimido
Write-Host "Descomprimiendo backend en el servidor..."
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@${ip} "tar -xzf /home/azureuser/ECenciaAPP/backend.tar.gz -C /home/azureuser/ECenciaAPP/ && rm /home/azureuser/ECenciaAPP/backend.tar.gz"

# Limpiar archivo tar.gz local
Remove-Item backend.tar.gz

# Generar e inyectar el archivo .env de producción a la máquina virtual
Write-Host "Generando archivo .env de producción basado en el .env local..." -ForegroundColor Yellow
$localEnvPath = "backend/.env"
$tempProdEnvPath = "backend/.env.production_temp"

if (Test-Path $localEnvPath) {
    # Cargar variables del .env local
    $envVars = @{}
    Get-Content $localEnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line -like "*=*") {
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            $envVars[$key] = $val
        }
    }

    # Adaptar variables críticas para producción
    $envVars["NODE_ENV"] = "production"
    $envVars["PORT"] = "3001"
    $envVars["COOKIE_SECURE"] = "false"
    $envVars["COOKIE_SAME_SITE"] = "lax"
    $envVars["CORS_ORIGINS"] = "https://ecenciaapp.eastus2.cloudapp.azure.com,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
    $envVars["PUBLIC_FRONTEND_URL"] = "https://ecenciaapp.eastus2.cloudapp.azure.com"
    $envVars["PUBLIC_BACKEND_URL"] = "https://ecenciaapp.eastus2.cloudapp.azure.com/api"
    $envVars["FRONTEND_URL"] = "https://ecenciaapp.eastus2.cloudapp.azure.com"
    $envVars["N8N_MENU_WEBHOOK_URL"] = "http://n8n:5678/webhook/ecencia-enviar-menu-manual"
    $envVars["N8N_ECENCIA_BACKEND_URL"] = "http://backend:3001"
    $envVars["TELEGRAM_MICROSERVICE_URL"] = "https://ecencia-bot-function.azurewebsites.net/api"
    $envVars["PASSWORD_RECOVERY_REDIRECT_URL"] = "https://ecenciaapp.eastus2.cloudapp.azure.com/login"
    $envVars["CONVENIOS_UPLOAD_DIR"] = "/usr/src/convenios"
    
    # Asegurar que el secreto de invitación de Telegram tenga al menos 32 caracteres
    if ($envVars["TELEGRAM_INVITE_TOKEN_SECRET"] -like "GENERA_UN_SECRETO*" -or $envVars["TELEGRAM_INVITE_TOKEN_SECRET"].Length -lt 32) {
        $envVars["TELEGRAM_INVITE_TOKEN_SECRET"] = "EcenciaInviteTokenSecretLargo2026Prod"
    }

    # Escribir archivo temporal
    $envContent = @()
    $envVars.GetEnumerator() | Sort-Object Name | ForEach-Object {
        $envContent += "$($_.Key)=$($_.Value)"
    }
    $envContent | Out-File -FilePath $tempProdEnvPath -Encoding utf8 -Force
    
    Write-Host "Subiendo el archivo .env de producción a la máquina virtual..." -ForegroundColor Yellow
    scp -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $tempProdEnvPath azureuser@${ip}:/home/azureuser/ECenciaAPP/backend/.env
    
    Remove-Item $tempProdEnvPath -ErrorAction SilentlyContinue
    Write-Host "¡Archivo .env de producción configurado en el servidor!" -ForegroundColor Green
} else {
    Write-Warning "No se encontró el archivo backend/.env local. No se inyectaron variables de entorno en la VM."
}

Write-Host "¡Backend subido y descomprimido en /home/azureuser/ECenciaAPP/!" -ForegroundColor Green

# 9. Levantar el Backend en Docker Compose en la VM
Write-Host "[8/11] Levantando el Backend con Docker Compose..." -ForegroundColor Yellow
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@${ip} "cd /home/azureuser/ECenciaAPP && docker compose down && docker compose up -d --build"

# 10. Importar y activar flujos de n8n
Write-Host "[9/11] Importando y activando flujos de n8n..." -ForegroundColor Yellow
Write-Host "Esperando 10 segundos a que n8n inicie..."
Start-Sleep -Seconds 10
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@${ip} "cd /home/azureuser/ECenciaAPP && docker compose exec -T n8n n8n import:workflow --separate --input=/workflows/ && docker compose exec -T n8n n8n publish:workflow --id=ecenciaTelegramMenuReservas && docker compose restart n8n"
Write-Host "¡Flujos de n8n importados y activados exitosamente!" -ForegroundColor Green

# 11. Empaquetar y Desplegar el Bot de Telegram a Azure Functions
$functionAppName = "ecencia-bot-function"
Write-Host "[10/12] Desplegando el Bot de Telegram como Azure Function ($functionAppName)..." -ForegroundColor Yellow

if (Get-Command az -ErrorAction SilentlyContinue) {
    Push-Location telegram-bot-function
    try {
        Write-Host "Instalando dependencias de producción para el bot..."
        npm ci --omit=dev | Out-Null
        
        Write-Host "Empaquetando código de la Azure Function en bot-deploy.zip..."
        if (Test-Path "bot-deploy.zip") { Remove-Item "bot-deploy.zip" }
        Get-ChildItem -Path * -Exclude "node_modules", "bot-deploy.zip", ".env", "local.settings.json" | Compress-Archive -DestinationPath "bot-deploy.zip" -Force
        
        Write-Host "Publicando paquete .zip a Azure Function App..."
        $publishOutput = az functionapp deployment source config-zip -g RG-TERRAFORM-PROCESS -n $functionAppName --src "bot-deploy.zip" 2>&1
        
        Remove-Item "bot-deploy.zip"
        Write-Host "¡Bot desplegado exitosamente a Azure Functions!" -ForegroundColor Green
    } catch {
        Write-Warning "Hubo un error empaquetando o publicando el bot a Azure Functions: $_"
    } finally {
        Pop-Location
    }

    # 12. Sincronizar Variables en Azure Function (Bot)
    Write-Host "[11/12] Sincronizando configuraciones con Azure Function App..." -ForegroundColor Yellow
    try {
        # Tomamos las variables leídas del env local
        $supaUrl = $envVars["SUPABASE_URL"]
        $supaKey = $envVars["SUPABASE_SERVICE_ROLE_KEY"]
        $supaAnon = $envVars["SUPABASE_ANON_KEY"]
        $tgToken = $envVars["TELEGRAM_BOT_TOKEN"]
        $tgUsername = $envVars["TELEGRAM_BOT_USERNAME"]
        if (-not $tgUsername) { $tgUsername = "EcenciaBot" }
        $tgContact = $envVars["TELEGRAM_PRIVACY_CONTACT"]
        if (-not $tgContact) { $tgContact = "ecenciaconvenios@outlook.com" }
        $tgConsent = $envVars["TELEGRAM_CONSENT_VERSION"]
        if (-not $tgConsent) { $tgConsent = "EC-LOPDP-2026-06" }
        $tgInvite = $envVars["TELEGRAM_INVITE_TOKEN_SECRET"]
        $tgWHSecret = $envVars["TELEGRAM_WEBHOOK_SECRET"]
        if (-not $tgWHSecret) { $tgWHSecret = "EcenciaWebhookSecret2026" }
        $internalSecret = $envVars["INTERNAL_API_SECRET"]
        $tz = $envVars["N8N_ECENCIA_TIMEZONE"]
        if (-not $tz) { $tz = "America/Bogota" }

        # Ejecutar el comando az config
        az functionapp config appsettings set `
            --name $functionAppName `
            --resource-group RG-TERRAFORM-PROCESS `
            --settings `
                SUPABASE_URL="$supaUrl" `
                SUPABASE_SERVICE_ROLE_KEY="$supaKey" `
                SUPABASE_ANON_KEY="$supaAnon" `
                TELEGRAM_BOT_TOKEN="$tgToken" `
                TELEGRAM_BOT_USERNAME="$tgUsername" `
                TELEGRAM_PRIVACY_CONTACT="$tgContact" `
                TELEGRAM_CONSENT_VERSION="$tgConsent" `
                TELEGRAM_INVITE_TOKEN_SECRET="$tgInvite" `
                TELEGRAM_WEBHOOK_SECRET="$tgWHSecret" `
                INTERNAL_API_SECRET="$internalSecret" `
                PUBLIC_FRONTEND_URL="https://ecenciaapp.eastus2.cloudapp.azure.com" `
                N8N_ECENCIA_TIMEZONE="$tz" `
                N8N_ECENCIA_ORIGEN_NOMBRE="Telegram" `
                AzureWebJobsFeatureFlags="EnableWorkerIndexing" `
                SCM_DO_BUILD_DURING_DEPLOYMENT="true" > $null
                
        Write-Host "¡Azure Function App Settings actualizados exitosamente!" -ForegroundColor Green

        # 13. Configurar Webhook de Telegram hacia Azure Functions
        Write-Host "[12/12] Configurando Webhook de Telegram apuntando a Azure Functions..." -ForegroundColor Yellow
        $webhookUrl = "https://${functionAppName}.azurewebsites.net/api/telegram/webhook"
        $curlOutput = curl.exe -s -X POST "https://api.telegram.org/bot${tgToken}/setWebhook" `
            -d "url=${webhookUrl}" `
            -d "secret_token=${tgWHSecret}"
        Write-Host "¡Webhook configurado! Respuesta de Telegram: $curlOutput" -ForegroundColor Green

    } catch {
        Write-Warning "Hubo un problema actualizando las variables o configurando el webhook. Asegúrese de estar autenticado en az CLI."
    }
} else {
    Write-Warning "La Azure CLI (az) no está instalada localmente o no está disponible en la terminal. Se omite el despliegue del bot de Telegram."
}

Write-Host "=========================================================" -ForegroundColor Green
Write-Host " ¡Despliegue Completado Exitosamente! " -ForegroundColor Green
Write-Host " Aplicación disponible en: http://$ip " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green

