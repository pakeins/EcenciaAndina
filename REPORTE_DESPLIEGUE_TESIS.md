# Reporte de Despliegue de Infraestructura y Aplicación - "Ecencia Andina"

***Este documento está clasificado como PUBLICO por TELEFÓNICA.***
***This document is classified as PUBLIC by TELEFÓNICA.***

---

## 1. Resumen del Proyecto y Arquitectura de Despliegue

El sistema integral de **Ecencia Andina** ha sido desplegado exitosamente en la nube de Microsoft Azure utilizando un flujo moderno de **Infraestructura como Código (IaC)** con Terraform, junto con contenedorización mediante **Docker / Docker Compose** y el servidor web **Apache2** actuando como servidor estático y proxy reverso.

### Diagrama Lógico de Arquitectura
```
[ Navegador del Usuario ]
       │
       │ (Puerto 80 HTTP)
       ▼
┌────────────────────────────────────── Azure VM ──────────────────────────────────────┐
│                                                                                      │
│   ┌─────────────────────────── Servidor Web Apache2 ─────────────────────────────┐   │
│   │                                                                              │   │
│   │   ├── [ Frontend React + Vite ] (Servido estático desde /var/www/html)       │   │
│   │   │                                                                          │   │
│   │   └── [ Proxy Reverso ] (Redirecciona peticiones /api a localhost:3001)       │   │
│   └──────────────────────────────────────┬───────────────────────────────────────┘   │
│                                          │                                           │
│                                          ▼ (Puerto 3001 interno)                     │
│                       ┌──────────────────────────────────────┐                       │
│                       │ Contenedor Docker (ecencia-backend)  │                       │
│                       │    [ Backend Node.js / Express ]     │                       │
│                       └──────────────────┬───────────────────┘                       │
└──────────────────────────────────────────┼───────────────────────────────────────────┘
                                           │
                                           ▼ (Puerto 443 HTTPS)
                               [ Base de Datos Supabase (Cloud) ]
```

### Componentes de la Arquitectura
1. **Frontend (React + TypeScript + Vite):** Compilado localmente en recursos estáticos (HTML, JS, CSS) y servido directamente por **Apache2** en el puerto 80 para una carga ultrarrápida.
2. **Backend (Node.js + Express):** Empaquetado y ejecutado dentro de un contenedor **Docker** administrado por **Docker Compose** en el puerto local `3001`, garantizando aislamiento y portabilidad de dependencias.
3. **Proxy Reverso (Apache2 VirtualHost):** Apache redirige de forma transparente todas las solicitudes entrantes que inicien con `/api` hacia el puerto `3001` donde corre Express. Esto evita configuraciones complejas de CORS en producción y unifica el punto de entrada bajo el puerto HTTP estándar.
4. **Base de Datos (Supabase):** El backend se comunica con Supabase de forma remota, permitiendo persistencia de datos en una base de datos gestionada e independiente de la máquina virtual.

---

## 2. Infraestructura como Código (IaC) con Terraform

Toda la infraestructura en Azure se definió en archivos declarativos dentro del directorio `terraform-lab/`:

### 2.1 Variables Parametrizadas (`variables.tf` y `terraform.tfvars`)
* **`azure_region`:** Configurada en `eastus2` en `terraform.tfvars`. (Se seleccionó esta región debido a limitaciones físicas de capacidad y cuotas en la región por defecto `eastus`).
* **`tamano_vm`:** Configurada como `Standard_D2s_v3` (2 vCPUs, 8 GiB RAM). Este dimensionamiento garantiza un rendimiento óptimo al procesar la compilación del backend y la ejecución del motor Docker sin saturar el procesador o la memoria de la máquina virtual.

### 2.2 Archivo Principal de Configuración (`main.tf`)
Contiene los siguientes bloques ordenados:
1. **Configuración de Terraform:** Bloqueo de versiones para el proveedor Azure (`~> 4.0` o `~> 3.0`) garantizando que actualizaciones automáticas del proveedor en la nube no rompan la sintaxis del script en el futuro.
2. **Proveedor (Provider):** Configuración del proveedor de Azure con el bloque obligatorio `features {}`.
3. **Grupo de Recursos (`azurerm_resource_group`):** Denominado `rg-terraform-process`.
4. **Red Virtual (`azurerm_virtual_network` y `azurerm_subnet`):** Crea una red privada virtual `10.0.0.0/16` y una subred `10.0.1.0/24`.
5. **IP Pública (`azurerm_public_ip`):** Asigna una dirección IPv4 pública de forma dinámica a la VM.
6. **Grupo de Seguridad de Red (NSG) (`azurerm_network_security_group`):** Abre exclusivamente el puerto **80** (para tráfico HTTP web) y el puerto **22** (para administración remota SSH).
7. **Interfaz de Red (NIC) (`azurerm_network_interface`):** Asocia la máquina virtual a la red virtual y a la IP pública, vinculando también las reglas de seguridad del NSG.
8. **Generación de Llaves SSH (`tls_private_key`):** Genera dinámicamente un par de llaves criptográficas RSA de 4096 bits para el acceso SSH, almacenando de forma segura la clave privada localmente en formato PEM.
9. **Máquina Virtual Linux (`azurerm_linux_virtual_machine`):**
   * Despliega una máquina basada en la imagen oficial de **Ubuntu Server 22.04 LTS**.
   * Integra la llave SSH generada y el tamaño configurado en variables.
   * **Script de Automatización (`custom_data`):**
     * **Seguridad en la ejecución:** Desactiva temporalmente el servicio de actualizaciones automáticas desatendidas de Ubuntu (`unattended-upgrades`) y ejecuta un bucle que monitorea que el candado de `dpkg` (`/var/lib/dpkg/lock-frontend`) esté libre antes de proceder. Esto evita que el script de aprovisionamiento falle silenciosamente debido a colisiones de instalación en el arranque.
     * Instala **Apache2**, **Docker** y **Docker Compose**.
     * Habilita los módulos `proxy`, `proxy_http` y `rewrite` de Apache.
     * Genera la configuración de VirtualHost con las directivas de proxy reverso hacia el puerto `3001` y añade reglas de reescritura para dar soporte nativo a las rutas SPA de **React Router** (evitando el clásico error 404 al recargar páginas web secundarias).

---

## 3. Script de Despliegue Automatizado (`deploy.ps1`)

Para automatizar por completo el ciclo de despliegue desde la máquina de desarrollo de Windows a la nube en Azure, se implementó un script en PowerShell (`deploy.ps1`) estructurado en 9 pasos principales:

1. **Ajuste de ACLs para la Llave Privada:** Modifica los permisos NTFS del archivo PEM de la clave SSH utilizando `icacls.exe`, removiendo herencias para cumplir con las restricciones de seguridad OpenSSH (evitando el error de "llave privada no protegida").
2. **Ejecución de Terraform Apply:** Inicializa y aplica la configuración de Terraform con lógica de reintentos para mitigar errores de latencia transitoria en la API de Azure.
3. **Obtención de la IP Pública:** Extrae dinámicamente la IP de salida de Terraform y la almacena en una variable del script.
4. **Verificación de Disponibilidad SSH:** Realiza un bucle de comprobación TCP en el puerto 22 para esperar a que el demonio SSH esté completamente en línea en la máquina virtual remota.
5. **Compilación del Frontend:** Ejecuta de forma local `npm run build` en el directorio de frontend para generar los archivos HTML/JS de producción optimizados.
6. **Espera de Servicios en la VM:** Verifica mediante consultas SSH que Docker y Docker Compose se hayan terminado de instalar correctamente a través de la tarea en segundo plano de `custom_data`.
7. **Transferencia del Frontend:** Sube mediante `scp` los archivos compilados del frontend a `/var/www/html` en la VM. Ajusta los permisos en Linux de forma recursiva a `755` para evitar errores `403 Forbidden` al ser leídos por Apache.
8. **Empaquetado y Transferencia del Backend:** Comprime el directorio del backend (excluyendo la carpeta local `node_modules` para optimizar el peso del archivo), lo transfiere al servidor virtual, lo descomprime y limpia el archivo temporal.
9. **Inicialización de Contenedores:** Accede a la máquina vía SSH para detener contenedores existentes y levantar los nuevos servicios del backend mediante `docker compose up -d --build`.

---

## 4. Comandos DevOps Utilizados

A continuación se listan todos los comandos clave que estructuran el despliegue del proyecto:

### Comandos de Infraestructura (Terraform)
* `terraform init`: Inicializa el entorno de trabajo de Terraform y descarga los proveedores (`azurerm` y `tls`).
* `terraform validate`: Valida sintácticamente los archivos de código Terraform.
* `terraform apply -auto-approve`: Planifica y ejecuta la creación de los recursos en Azure sin solicitar confirmación manual.
* `terraform output -raw direccion_ip_publica`: Obtiene la dirección IP pública del servidor aprovisionado.
* `terraform destroy -auto-approve`: Destruye toda la infraestructura creada al concluir el desarrollo para evitar cargos.

### Comandos de Compilación y Transferencia
* `npm install` (en carpetas de frontend y backend): Descarga e instala localmente las dependencias de Node.js.
* `npm run build` (en carpeta frontend): Compila el proyecto React.
* `tar --exclude="backend/node_modules" -czf backend.tar.gz backend docker-compose.yml`: Empaqueta el backend optimizado para transmisión.
* `scp -i <llave_ssh> -r <origen> <usuario>@<ip>:<destino>`: Transfiere directorios y archivos de forma segura por SSH.
* `ssh -i <llave_ssh> <usuario>@<ip> "<comando>"`: Ejecuta comandos administrativos directamente en la máquina virtual Linux remota.

### Comandos de Contenedores (Docker en la VM)
* `docker compose down`: Apaga y remueve los contenedores de base y red creados previamente.
* `docker compose up -d --build`: Compila y levanta la imagen de Node.js del backend en segundo plano (modo detached).
* `docker ps`: Muestra los contenedores que están activos y su mapeo de puertos en el servidor Linux.

---

## 5. Guía de Evidencias y Capturas de Pantalla (Para el Reporte de Tesis)

Para documentar y certificar el despliegue en tu reporte de tesis, toma y añade las capturas de pantalla de tu aplicación real en las siguientes secciones:

### 📸 Evidencia 1: Consola de Despliegue Exitoso (`deploy.ps1`)
* **Detalle:** Captura de tu terminal PowerShell después de ejecutar `./deploy.ps1`, donde se observe el mensaje final en verde: `¡Despliegue Completado Exitosamente! Aplicación disponible en: http://20.65.69.211`.
* **Ubicación de la Imagen:**
  ![Terminal de Terraform Apply Exitoso](file:///C:/Users/esteb/.gemini/antigravity-ide/brain/ed1d2f0e-92ae-4bef-96f5-0fe7116594d9/evidencia_1_terraform_1781581979136.png)


### 📸 Evidencia 2: Recursos en Azure Portal
* **Detalle:** Ingresa a [portal.azure.com](https://portal.azure.com), ve al grupo de recursos `rg-terraform-process` y toma una captura donde se vean listados los componentes creados: la Máquina Virtual `vm-terraform-process`, la IP Pública `pip-terraform-process`, el NSG, la NIC, el Disco de OS y la red virtual.
* **Ubicación de la Imagen:**
  *(Reemplace este texto por la captura del panel de recursos de Azure)*

### 📸 Evidencia 3: Frontend de "Ecencia Andina" en Producción
* **Detalle:** Captura del navegador web ingresando a `http://20.110.180.240/login` mostrando la pantalla de inicio de sesión de la aplicación web funcionando de manera fluida y con los estilos correctos cargados desde Apache.
* **Ubicación de la Imagen:**
  *(Reemplace este texto por tu captura del login de Ecencia Andina)*

### 📸 Evidencia 4: Consulta de Integración con Base de Datos
* **Detalle:** Captura de pantalla de la respuesta del backend consultando la base de datos Supabase en vivo, accediendo a la URL: `http://20.110.180.240/api/check-db`. Debe verse el JSON que confirma la conexión exitosa y devuelve datos reales.
* **Ubicación de la Imagen:**
  *(Reemplace este texto por la captura de la prueba de base de datos en el navegador)*

