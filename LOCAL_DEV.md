# Guía de Ejecución y Desarrollo Local - ECencia Andina 🚀

Esta guía detalla los pasos para levantar de forma local los diferentes componentes que integran el ecosistema de **ECencia Andina**: Backend, Frontend y el Bot de Telegram.

---

## 🛠️ Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en tu máquina local:
1. **Node.js** (Versión 18 o superior recomendada).
2. **Azure Functions Core Tools** (Requerido para emular el Bot de Telegram localmente).
   * Para instalarlo globalmente:
     ```bash
     npm install -g azure-functions-core-tools@4 --unsafe-perm true
     ```
3. Puertos libres en tu red local:
   * **3001** (Backend API)
   * **5173** (Frontend Dashboard)
   * **7071** (Telegram Bot Azure Function)

---

## ⚙️ Paso 1: Levantar el Backend (API Express)

El backend gestiona la lógica de negocio y se conecta con Supabase.

1. Abre una terminal y navega al directorio del backend:
   ```bash
   cd backend
   ```
2. Instala las dependencias necesarias:
   ```bash
   npm install
   ```
3. **Archivo de Configuración:**
   * Asegúrate de contar con el archivo de variables de entorno `.env` en la ruta `/backend/.env`. Este archivo debe contener las credenciales de Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) y tokens de Telegram.
4. Levanta el servidor en modo desarrollo (con recarga automática mediante `nodemon`):
   ```bash
   npm run dev
   ```
   * *El backend estará disponible en:* [http://localhost:3001](http://localhost:3001)
   * *Para validar la conexión con Supabase visita:* [http://localhost:3001/api/check-db](http://localhost:3001/api/check-db)

---

## 🖥️ Paso 2: Levantar el Frontend (React + Vite)

El frontend contiene la interfaz administrativa y el panel de reportería.

1. Abre una **nueva terminal** y navega al directorio del frontend:
   ```bash
   cd frontend
   ```
2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```
3. **Archivo de Configuración:**
   * Verifica la existencia del archivo `/frontend/.env` indicando la URL del backend local:
     ```env
     VITE_API_BASE_URL=http://localhost:3001/api
     ```
4. Ejecuta el servidor de desarrollo de Vite:
   ```bash
   npm run dev
   ```
   * *El panel de administración estará disponible en:* [http://localhost:5173](http://localhost:5173)

---

## 🤖 Paso 3: Levantar el Bot de Telegram (Azure Function)

El bot de Telegram opera como una Azure Function sin servidor.

1. Abre una **tercera terminal** y navega al directorio del bot:
   ```bash
   cd telegram-bot-function
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Arranca el runtime local de Azure Functions:
   ```bash
   func start
   ```
   * *El endpoint local del bot estará escuchando en:* `http://localhost:7071/api/telegram/webhook`

---

## ⛓️ Paso 4: Levantar n8n (Motor de Integración y Programación)

n8n se encarga de programar el envío automático del menú diario y otros flujos de integración. Tienes dos opciones para ejecutarlo localmente:

### Opción A: Sin Docker (Usando `npx` - Recomendado si no tienes Docker activo)

Puedes ejecutar n8n directamente sobre Node.js de forma muy ligera:

1. Abre una **nueva terminal** en cualquier directorio.
2. Define las variables de entorno necesarias y ejecuta n8n:
   * **En Windows (PowerShell):**
     ```powershell
     $env:NODE_FUNCTION_ALLOW_ENV="*"
     $env:NODE_FUNCTION_ALLOW_BUILTIN="fs"
     npx n8n start
     ```
   * **En Linux / macOS / Git Bash:**
     ```bash
     NODE_FUNCTION_ALLOW_ENV="*" NODE_FUNCTION_ALLOW_BUILTIN="fs" npx n8n start
     ```
3. **Acceso Local:**
   * n8n se abrirá en tu navegador en: [http://localhost:5678](http://localhost:5678)
4. **Importar workflows existentes:**
   * Abre la interfaz de n8n, crea un nuevo flujo y usa la opción **"Import from File"** en el menú superior derecho para cargar los JSONs que están en tu directorio `backend/n8n/workflows/`.

---

### Opción B: Con Docker (Usando Docker Compose)

Si prefieres usar Docker y mantener tus flujos sincronizados automáticamente:

1. Asegúrate de tener **Docker Desktop** abierto y ejecutándose en segundo plano.
2. Abre una **nueva terminal** en la raíz de `ECenciaAPP/`.
3. Levanta el contenedor de n8n:
   ```bash
   docker compose up -d n8n
   ```
4. **Acceso Local:**
   * n8n estará disponible en: [http://localhost:5678/n8n/](http://localhost:5678/n8n/)
   * Los flujos locales ubicados en la carpeta `backend/n8n/workflows/` se cargarán automáticamente.

---

## 🔄 Paso 5: Redirección del Webhook de Telegram (Modo Polling Local)

> [!IMPORTANT]
> Telegram requiere por defecto una URL pública HTTPS para el funcionamiento de los Webhooks. Para evitar configurar túneles complejos (como ngrok) en desarrollo local, el sistema cuenta con un script de sondeo (`poll_telegram.js`).

Este script desactiva el webhook de producción de Telegram y empieza a redirigir todos los mensajes que reciba el bot directamente a tu Azure Function local en el puerto `7071`.

1. Abre una **quinta terminal** y ve a la ruta del backend:
   ```bash
   cd backend
   ```
2. Ejecuta el script de redirección:
   ```bash
   node poll_telegram.js
   ```
3. Ahora puedes abrir Telegram, enviar comandos a tu bot y ver los logs de depuración directamente en la consola de la Azure Function.

---

## ⚠️ Solución de Problemas Comunes (Troubleshooting)

### 1. Error de CORS en el Frontend
* **Causa:** El backend no reconoce el puerto del frontend local.
* **Solución:** Abre `/backend/.env` y asegúrate de que el puerto del frontend esté incluido en la variable `CORS_ORIGINS`, separando los hosts por comas:
  ```env
  CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000
  ```

### 2. Conflicto de Webhooks (Error 409 en Telegram)
* **Causa:** El bot de producción en Azure o Cloud Run sigue activo y compitiendo por los mensajes.
* **Solución:** Ejecutar `node poll_telegram.js` borrará de forma automática el webhook activo en producción para dar prioridad a tu máquina local.

### 3. Puerto 3001 u otros ya en uso
* **Solución (Windows):** Ejecuta en PowerShell para buscar y cerrar el proceso bloqueando el puerto:
  ```powershell
  # Buscar PID en puerto 3001
  netstat -ano | findstr :3001
  # Detener proceso (reemplazar PID)
  taskkill /PID <PID_ENCONTRADO> /F
  ```

