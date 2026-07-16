<div align="center">

# UNIVERSIDAD DE LAS AMÉRICAS (UDLA)
### FACULTAD DE INGENIERÍA Y CIENCIAS APLICADAS
### INGENIERÍA EN DESARROLLO DE SOFTWARE

<br><br><br>

# MANUAL DE DESPLIEGUE Y OPERACIÓN DE SISTEMA
## "Ecencia Andina"

<br><br><br>

**Autores:**  
Esteban Manuel Carvajal Landázuri  
Alexander Iván Rengifo Mantilla

**Tutor/Director:**  
Ing. Paulo Guerra Terán

<br><br><br>
**Quito, Ecuador**  
**Julio, 2026**

</div>

<div style="page-break-after: always"></div>

## Tabla de Contenidos
1. [Introducción y Objetivos del Despliegue](#1-introducci%C3%B3n-y-objetivos-del-despliegue)
2. [Arquitectura de Despliegue](#2-arquitectura-de-despliegue)
3. [Requerimientos, Dimensionamiento y Prerrequisitos](#3-requerimientos-dimensionamiento-y-prerrequisitos)
4. [Gestión de Secretos y Responsabilidades](#4-gesti%C3%B3n-de-secretos-y-responsabilidades)
5. [Pasos Detallados de Instalación y Despliegue](#5-pasos-detallados-de-instalaci%C3%B3n-y-despliegue)
6. [Plan de Pruebas y Matriz de Validación](#6-plan-de-pruebas-y-matriz-de-validaci%C3%B3n)
7. [Plan de Rollback y Contingencia](#7-plan-de-rollback-y-contingencia)
8. [Endurecimiento, Mantenimiento y Monitoreo](#8-endurecimiento-mantenimiento-y-monitoreo)

<div style="page-break-after: always"></div>

> [!IMPORTANT]
> **Documento Oficial de Titulación - Universidad de las Américas (UDLA)**
> Este documento describe de forma exhaustiva los procedimientos técnicos para el aprovisionamiento de infraestructura, dimensionamiento, configuración, endurecimiento y monitoreo del sistema "Ecencia Andina" en entornos productivos.

---

## 1. Introducción y Objetivos del Despliegue

### 1.1 Propósito del Documento
El presente manual establece los lineamientos técnicos, prerrequisitos, pasos de configuración y validaciones necesarios para desplegar de manera exitosa la plataforma integral "Ecencia Andina" en un entorno de producción.

El sistema fue concebido bajo un enfoque *Cloud-Native* teniendo a **Microsoft Azure** como el proveedor principal (utilizando Azure Functions y Azure Virtual Machines) orquestado vía Terraform. Sin embargo, gracias a su arquitectura basada en contenedores, **el sistema mantiene portabilidad total y puede ser desplegado de forma manual (Agnóstica) en cualquier servidor o proveedor de nube** (AWS, Google Cloud, Hostinger VPS) que soporte Linux y Docker, ya que incluso los componentes *Serverless* proveen métodos de ejecución contenerizada como respaldo.

### 1.2 Alcance
El alcance de este manual cubre el despliegue de los siguientes componentes:
*   **Aprovisionamiento Automatizado y Serverless (Microsoft Azure - Primario):**
    *   **Bot de Telegram:** Microservicio Serverless desplegado nativamente como una **Azure Function App** (independiente de la máquina virtual).
    *   **Infraestructura:** Creación de red, seguridad y servidores mediante Terraform y GitHub Actions (CI/CD).
*   **Despliegue Agnóstico (Cualquier Nube / VPS - Respaldo):**
    *   **Frontend (Cliente Web):** Despliegue de aplicación React + Vite servida mediante Apache2 (o proxy reverso).
    *   **Backend (API Rest):** Aplicación Node.js/Express empacada en Docker.
    *   **Gestor de Workflows (n8n):** Contenedor Docker para orquestación de procesos y envíos automatizados.
    *   **Base de Datos:** Conexiones externas hacia Supabase (Plan Pro recomendado para evitar suspensión).

---

## 2. Arquitectura de Despliegue

### 2.1 Diagrama Lógico de Despliegue

```mermaid
flowchart TD
    User([Navegador del Usuario]) -- Puerto 80 HTTP / 443 HTTPS --> VM[Azure VM / Servidor Linux]
    
    subgraph VM [Servidor Linux Ubuntu 22.04 / 24.04 LTS]
        Apache[Apache2 Web Server / Proxy Reverso]
        FE[Archivos Estáticos Frontend\n/var/www/html]
        
        subgraph Contenedores Docker [Docker Compose]
            BE[Backend Node.js API\nPuerto Local 3001]
            N8N[n8n Workflows\nPuerto Local 5678]
        end
        
        Apache -- Sirve directamente --> FE
        Apache -- Proxy Reverso /api --> BE
        Apache -- Proxy Reverso /n8n --> N8N
    end
    
    subgraph Entorno Serverless [Plataforma de Nube]
        BOT[Bot de Telegram\nAzure Function App]
    end
    
    BE -- Llamadas Remotas --> DB[(Supabase Cloud Database)]
    BOT -- Consultas Directas --> DB
    BOT -- Webhooks Bidireccionales --> TG[Telegram API]
    N8N -- Webhooks y Llamadas --> BE
```

### 2.2 Justificación de Decisiones Arquitectónicas
*   **Portabilidad Parcial (Docker y Serverless):** El uso de Docker Compose encapsula todas las dependencias del backend y n8n, garantizando que el sistema base funcione idénticamente en cualquier servidor físico o de nube. El **Bot de Telegram** se abstrajo como una Azure Function para garantizar una respuesta instantánea y elástica, independizando su carga de trabajo del servidor principal.
*   **Proxy Reverso (Apache2 / Nginx / Caddy):** Permite aislar los puertos y resolver el enrutamiento de la SPA de React sin problemas de CORS, dirigiendo transparentemente `/api` al backend y `/n8n` al gestor de workflows.
*   **Integración y Despliegue Continuo (CI/CD):** Se implementó un pipeline en GitHub Actions (`main.yml`) con validación de calidad, escaneo de vulnerabilidades en contenedores (Trivy), detección de secretos (Gitleaks) y despliegue automatizado.

---

## 3. Requerimientos, Dimensionamiento y Prerrequisitos

### 3.1 Hardware / Recursos de Nube Mínimos
Para garantizar la fluidez de todos los contenedores y el sistema operativo, se requiere:
*   **Servidor:** Azure Virtual Machine o Servidor VPS KVM equivalente.
*   **Sistema Operativo:** Ubuntu Server 22.04 LTS o 24.04 LTS.
*   **Recursos (Recomendado):** Mínimo 2 vCPUs, 8 GB de Memoria RAM.
*   **Almacenamiento:** Disco de Estado Sólido (NVMe o SSD) de 30 GB a 100 GB.

### 3.2 Presupuesto de Memoria RAM Estimado
La elección de un servidor con 8 GB de RAM (o superior) se justifica operativamente bajo el siguiente presupuesto aproximado:

| Componente | Uso Operativo Inicial | Límite Recomendado | Observaciones |
| :--- | :--- | :--- | :--- |
| **Ubuntu + Docker** | 600 – 900 MiB | N/A | Incluye demonios, SSH, FW y base OS. |
| **Proxy (Apache/Caddy)** | 30 – 100 MiB | 128 MiB | Enrutamiento TLS de baja carga. |
| **Frontend** | 50 – 120 MiB | 256 MiB | Servido estáticamente. |
| **Backend Node.js** | 150 – 350 MiB | 512 MiB | Puede escalar por uso de la API REST. |
| **Gestor n8n** | 500 MiB – 1.2 GiB | 1.5 GiB | Consumidor principal de RAM (Java/Node) al ejecutar workflows complejos. |
| **Margen Libre** | 2 – 4 GiB | N/A | Absorbente de picos, builds (NPM Install) y actualizaciones del SO. |

### 3.3 Software y Herramientas Locales
El entorno de desarrollo para aprovisionar el despliegue requiere:
*   **Terraform:** Versión Core `v1.5+` (Provider `azurerm` v3.0 o superior).
*   **Git Bash / PowerShell:** Con cliente SSH y SCP habilitado.
*   **Azure CLI:** Autenticado con los permisos de propietario (`az login`).

### 3.4 Prerrequisitos de Servicios de Terceros
*   **Supabase:** Proyecto activo con esquema SQL cargado. Se recomienda obligatoriamente el **Plan Pro ($25/mes)** para evitar la pausa (sleep) del servicio por inactividad y para obtener respaldos automáticos diarios.
*   **Telegram Bot API:** Token generado desde `@BotFather`.
*   **n8n:** Contenedor hospedado localmente (auto-gestionado) sin necesidad de cuenta externa de nube.

---

## 4. Gestión de Secretos y Responsabilidades

### 4.1 Administración de Secretos de Producción
*   **GitHub Secrets (CI/CD):** En producción, las variables **no deben** declararse en el código fuente. El pipeline inyecta de forma segura los valores desde `GitHub Settings > Secrets and variables > Actions`.
*   **Clave de Cifrado n8n (`N8N_ENCRYPTION_KEY`):** Es un secreto crítico. Una pérdida o rotación accidental de este secreto dejará ilegibles todas las credenciales integradas en los workflows de n8n.
*   **Archivo `.env`:** Si se despliega localmente o sin GitHub Actions, es obligatorio generar el archivo `.env` en la raíz del backend asignándole permisos restrictivos (`chmod 600 .env.production`).

> [!WARNING]  
> Nunca versione el archivo `.env` en el repositorio. Los valores reales deben inyectarse estrictamente en el entorno local antes de comprimir los artefactos.

**Plantilla Exhaustiva `.env` requerida para Producción:**
```env
# ==========================================
# CONFIGURACIÓN DEL SERVIDOR Y ENTORNO
# ==========================================
NODE_ENV=production
PORT=3001
AZURE_DOMAIN=ecenciaapp.eastus2.cloudapp.azure.com
PUBLIC_BACKEND_URL=https://ecenciaapp.eastus2.cloudapp.azure.com/api
PUBLIC_FRONTEND_URL=https://ecenciaapp.eastus2.cloudapp.azure.com
FRONTEND_URL=https://ecenciaapp.eastus2.cloudapp.azure.com
CORS_ORIGINS=https://ecenciaapp.eastus2.cloudapp.azure.com,http://127.0.0.1:3000

# ==========================================
# SEGURIDAD Y AUTENTICACIÓN
# ==========================================
JWT_SECRET=[CADENA_SEGURA_GENERADA]
INTERNAL_API_SECRET=[SECRETO_PARA_COMUNICACION_INTERNA]
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax

# ==========================================
# BASE DE DATOS (SUPABASE)
# ==========================================
SUPABASE_URL=https://[ID_PROYECTO].supabase.co
SUPABASE_ANON_KEY=[API_KEY_PUBLICA]
SUPABASE_SERVICE_ROLE_KEY=[API_KEY_PRIVADA_ADMIN]

# ==========================================
# BOT DE TELEGRAM
# ==========================================
TELEGRAM_BOT_TOKEN=[TOKEN_DE_BOTFATHER]
TELEGRAM_BOT_USERNAME=EcenciaBot
TELEGRAM_WEBHOOK_SECRET=[SECRETO_PARA_VALIDAR_WEBHOOKS]
TELEGRAM_INVITE_TOKEN_SECRET=[SECRETO_PARA_ENLACES_DE_INVITACION]
TELEGRAM_PRIVACY_CONTACT=ecenciaconvenios@outlook.com
TELEGRAM_CONSENT_VERSION=EC-LOPDP-2026-06
TELEGRAM_MICROSERVICE_URL=https://[NOMBRE_AZURE_FUNCTION].azurewebsites.net/api

# ==========================================
# GESTOR DE WORKFLOWS (n8n)
# ==========================================
N8N_ECENCIA_BACKEND_URL=http://backend:3001
N8N_ECENCIA_TIMEZONE=America/Bogota
N8N_ECENCIA_ORIGEN_NOMBRE=Telegram
N8N_ECENCIA_ESTADO_RESERVADO_NOMBRE=Reservado
N8N_MENU_WEBHOOK_URL=http://n8n:5678/webhook/ecencia-enviar-menu-manual
N8N_MENU_WEBHOOK_SECRET=[SECRETO_COMPARTIDO_CON_BACKEND]

# ==========================================
# NOTIFICACIONES (EMAIL)
# ==========================================
GMAIL_USER=ecencia.andina.notificaciones@gmail.com
GMAIL_APP_PASSWORD=[PASSWORD_DE_APLICACION_GMAIL]

# ==========================================
# ALMACENAMIENTO DE ARCHIVOS
# ==========================================
CONVENIOS_UPLOAD_DIR=/usr/src/convenios
```
### 4.2 Matriz de Responsabilidades (RACI) Simplificada

| Actividad | Cliente/Negocio | DevOps | Desarrollo |
| :--- | :--- | :--- | :--- |
| **Aprobar Costos (Azure/Hostinger + Supabase)** | **A / R** | C | I |
| **Aprovisionar Servidores, DNS y Firewall** | A | **R** | C |
| **Preparar Variables de Entorno y Secretos** | A | **R** | C |
| **Ajustar / Exportar Workflow de Producción** | I | C | **A / R** |
| **Ejecutar Despliegue Automatizado** | I | **A / R** | C |
| **Aprobar Lanzamiento a Producción (Go-live)** | **A** | C | R |

> *A=Accountable (Aprobador final), R=Responsible (Ejecutor), C=Consulted (Consultado), I=Informed (Informado).*

---

## 5. Pasos Detallados de Instalación y Despliegue

### Opción A: Despliegue Automatizado Completo (Azure + GitHub Actions)

**Paso 1: Aprovisionamiento de la Nube (Terraform)**
1. Abra su consola PowerShell como Administrador y autentíquese: `az login`.
2. Ubíquese en la carpeta `terraform-lab/` y ejecute:
   ```bash
   terraform init
   terraform apply -auto-approve
   ```

**Paso 2: Ejecución del Script de Despliegue Central (`deploy.ps1`)**
Para simplificar la operación técnica y evitar errores manuales, el sistema cuenta con un script maestro de PowerShell que automatiza el pase a producción.
1. Abra una terminal de PowerShell en la raíz del proyecto.
2. Ejecute el script de despliegue:
   ```powershell
   .\deploy.ps1
   ```
3. El script automáticamente empaquetará los cambios, hará un push a GitHub y disparará el Pipeline CI/CD configurado en `.github/workflows/main.yml`, el cual desplegará la infraestructura Serverless y los contenedores en la nube.

**Paso 3: Webhook Automatizado**
Durante el flujo del pipeline disparado por el script, se configura mediante `curl` la conexión bidireccional entre la API de Telegram y Azure Functions de forma invisible.

### Opción B: Despliegue Manual (VPS Linux / AGNÓSTICO)
Si no utiliza Azure Functions, la carpeta `telegram-bot-function/` incluye un `Dockerfile` compatible para empaquetarlo localmente junto a la API.

**Paso 1: Preparación del Servidor**
1. Instale los demonios: `sudo apt update && sudo apt install apache2 docker.io docker-compose -y`.
2. Habilite el proxy reverso: `sudo a2enmod proxy proxy_http rewrite`.

**Paso 2: Transferencia Segura**
Utilice SCP para transferir la carpeta compilada `dist/` a `/var/www/html/` en el servidor, y luego suba las carpetas del `backend/` y `telegram-bot-function/` junto a su archivo `.env` configurado en producción.

**Paso 3: Levantar los Contenedores**
1. Ingrese por SSH: `ssh usuario_servidor@[IP_PUBLICA]`
2. Ejecute los servicios:
   ```bash
   cd ~/backend
   docker compose up -d --build
   ```

### 5.1 Configuración de SSL con Certbot (Opcional pero Crítico)
Para que los webhooks funcionen, el tráfico HTTPS (Puerto 443) es indispensable.

1. Instalar Certbot:
   ```bash
   sudo apt install certbot python3-certbot-apache -y
   ```
2. Ejecutar y autorizar:
   ```bash
   sudo certbot --apache -d tudominio.com
   ```

---

## 6. Plan de Pruebas y Aceptación Técnica (UAT)

Se debe ejecutar una ronda de Aceptación Técnica obligatoria antes de habilitar los Workflows automáticos de n8n para el cliente final. A continuación se detallan las pruebas a ejecutar:

### 6.1 [INF-01] TLS en Proxy Reverso
*   **Validación:** El navegador indica conexión segura HTTPS y redirige el puerto 80 al 443 automáticamente.
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Navegador mostrando el candado HTTPS]**

### 6.2 [APP-01] Carga del Frontend React
*   **Validación:** La interfaz gráfica carga correctamente sin errores de CORS o CSP en la consola de desarrollador (F12).
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Pantalla de Login o Inicio del Sistema]**

### 6.3 [API-01] Disponibilidad de API
*   **Validación:** Ejecutar `curl -I https://[dominio]/api/check-db` o consultar vía navegador/Postman y confirmar que retorna `200 OK`.
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Salida de Terminal o Postman con código 200]**

### 6.4 [N8N-01] Acceso a n8n y Persistencia
*   **Validación:** Ingresar a la URL del panel de n8n. Verificar que los workflows y credenciales existan y persistan al reiniciar el contenedor.
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Panel principal de Workflows de n8n]**

### 6.5 [TG-01] Onboarding Telegram
*   **Validación:** Un usuario de pruebas interactúa con `/start` en el bot y acepta explícitamente las políticas LOPDP.
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Chat de Telegram mostrando el inicio y aceptación]**

### 6.6 [TG-02] Reserva Automática
*   **Validación:** El usuario completa un flujo guiado de menú del día. La orden se debe reflejar exitosamente en Supabase con origen "Telegram".
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Registro en la base de datos o tablero mostrando la orden]**

### 6.7 [OPS-01] Ejecución de Cron Jobs
*   **Validación:** Las tareas programadas de n8n (purgas de imágenes y cierre de reservas) se ejecutan a las horas acordadas bajo la zona horaria (Timezone) de Guayaquil.
*   **Evidencia:**
    > [!NOTE] 
    > **[INSERTAR CAPTURA AQUÍ: Historial de ejecuciones automáticas en n8n]**

---

## 7. Plan de Rollback y Contingencia

Si el paso de despliegue presenta anomalías críticas que impiden la operación, se ejecuta el siguiente plan considerando las métricas de recuperación:

*   **RPO (Recovery Point Objective):** $\le$ 24 horas (Dependiente directamente de los respaldos automáticos diarios ofrecidos por el plan Supabase Pro).
*   **RTO (Recovery Time Objective):** 30 – 120 minutos (Tiempo que tarda Terraform en redesplegar la nube + el pipeline en reinyectar el código).

**Procedimientos:**
*   **Fallo de actualización de código (Crash Loop):** Revertir rápidamente ejecutando el contenedor con la etiqueta de la imagen del commit anterior (ej. `docker compose pull backend:version-anterior`).
*   **Fallo estructural o corrupción de Máquina Virtual:**
    ```bash
    cd terraform-lab/
    terraform destroy -auto-approve
    terraform apply -auto-approve
    ```
    *(Nota: La base de datos, Auth y almacenamiento de imágenes residen externamente en Supabase, por lo que están a salvo de destrucción física de la VM).*

---

## 8. Endurecimiento, Mantenimiento y Monitoreo

### 8.1 Endurecimiento de Seguridad (Security Hardening)
Para servidores de producción en Azure o Hostinger, aplique obligatoriamente:
1.  **Deshabilitar contraseñas SSH:** Forzar autenticación exclusiva por llaves (`PubkeyAuthentication yes` y `PasswordAuthentication no` en `/etc/ssh/sshd_config`).
2.  **Protección Anti-Bruteforce:** Habilitar e instalar `fail2ban` para bloquear IPs maliciosas después de 3 intentos fallidos.
3.  **Firewall por Defecto (UFW):**
    ```bash
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow OpenSSH
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw enable
    ```

### 8.2 Monitoreo Rutinario
*   **Logs del Proxy Web (Apache):**
    Esencial para diagnosticar ataques o errores `502 Bad Gateway` entre Apache y Docker.
    ```bash
    tail -f /var/log/apache2/error.log
    ```
*   **Logs de Aplicación (Docker Backend/n8n):**
    ```bash
    docker logs -f ecencia-backend
    docker logs -f ecencia-n8n
    ```
*   **Mantenimiento OS:** 
    Es responsabilidad del administrador aplicar parches trimestralmente (`sudo apt update && sudo apt full-upgrade -y`) y verificar el consumo de disco (`df -h`).
