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

# Crear archivo tar.gz excluyendo node_modules locales
Write-Host "Empaquetando directorio backend..."
tar --exclude="backend/node_modules" -czf backend.tar.gz backend docker-compose.yml

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

Write-Host "¡Backend subido y descomprimido en /home/azureuser/ECenciaAPP/!" -ForegroundColor Green

# 9. Levantar el Backend en Docker Compose en la VM
Write-Host "[8/8] Levantando el Backend con Docker Compose..." -ForegroundColor Yellow
ssh -i terraform-lab/id_rsa.pem -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null azureuser@${ip} "cd /home/azureuser/ECenciaAPP && docker compose down && docker compose up -d --build"

Write-Host "=========================================================" -ForegroundColor Green
Write-Host " ¡Despliegue Completado Exitosamente! " -ForegroundColor Green
Write-Host " Aplicación disponible en: http://$ip " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
