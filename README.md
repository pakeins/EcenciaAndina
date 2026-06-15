# Ecencia Andina APP

Sistema operativo para Ecencia Andina: administracion de clientes, convenios, productos, pedidos, menu diario y reservas por Telegram.

## Modulos principales

- Frontend React/Vite con Tailwind y shadcn-ui.
- Backend Express conectado a Supabase.
- Supabase Postgres, Storage y migraciones SQL.
- Workflow n8n limitado a difundir el menu diario por Telegram.
- Bot de Telegram con consentimiento, vinculacion por telefono y estado de suscripcion.

## Estructura

```txt
backend/                 API Express, rutas, tests y migraciones Supabase
backend/n8n/             codigo/export del workflow n8n y ejemplo de entorno
frontend/                aplicacion web Vite React
docs/                    notas de credenciales, despliegue y produccion
PLAN_PRODUCCION_ECIENCIA.md
```

Los PDFs, backups locales, `.env` y logs no deben subirse al repositorio. Los archivos
firmados de convenios se guardan en un bucket privado de Supabase.

## Requisitos

- Node.js 22.13 o superior.
- npm.
- Docker Desktop si se va a ejecutar n8n local.
- Acceso a un proyecto Supabase.
- Token de bot Telegram.
- En despliegue, dominio HTTPS para frontend/backend y origen configurado en `CORS_ORIGINS`.

## Variables de entorno

Copia los archivos de ejemplo y completa los valores reales:

```powershell
Copy-Item backend/.env.example backend/.env.local
Copy-Item frontend/.env.example frontend/.env
Copy-Item backend/n8n/eciencia-n8n.env.example backend/n8n/eciencia-n8n.env
```

Consulta [docs/CREDENCIALES_Y_DESPLIEGUE.md](docs/CREDENCIALES_Y_DESPLIEGUE.md) para saber que tokens debe compartir el administrador.
Para preproduccion en Google Cloud con bajo consumo, consulta [docs/GOOGLE_CLOUD_PREPROD.md](docs/GOOGLE_CLOUD_PREPROD.md).

Para Hostinger/preproduccion, ajusta `backend/.env.local`:

```txt
CORS_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
N8N_MENU_WEBHOOK_URL=https://tu-n8n/webhook/eciencia-enviar-menu-manual
```

## Backend

```powershell
cd backend
npm install
npm test
npm run lint
npm start
```

Por defecto queda en:

```txt
http://localhost:3001
```

## Frontend

```powershell
cd frontend
npm install
npm test
npm run lint
npm run dev
```

Por defecto queda en:

```txt
http://localhost:3000
```

## Supabase

Las migraciones del proyecto estan en:

```txt
backend/supabase/migrations
```

Tablas relevantes para Telegram:

- `telegram_subscriptions`: consentimiento, telefono normalizado, `chat_id`, estado y ultima fecha de envio.
- `telegram_invitations`: invitaciones de un solo uso con el token almacenado solo como HMAC-SHA256.
- `telegram_consent_events`: evidencia inmutable de aceptacion, rechazo, revocacion y reinvitacion.
- `telegram_privacy_requests`: solicitudes que requieren revision administrativa.
- `telegram_bot_state`: estado temporal de sesiones n8n.
- `telegram_order_traces`: trazabilidad tecnica sin almacenar mensajes libres.
- `menu_settings`: menu activo y dias de retencion para imagenes antiguas.

Endpoints utiles:

- `GET /api/menu`: lista menus registrados con fecha, estado y opciones.
- `PUT /api/menu/:fecha`: edita un menu registrado.
- `POST /api/menu/:fecha/activar`: activa un menu como menu del dia.
- `POST /api/menu/limpiar-imagenes`: limpia imagenes antiguas del bucket `eciencia-menu-assets`.
- `GET /api/ordenes/telegram/trazabilidad`: consulta trazabilidad de pedidos automaticos.

La consulta de trazabilidad es exclusiva para administradores, usa paginacion y permite
filtrar por resultado o `chat_id`. En el frontend se encuentra en `/trazabilidad-telegram`.

## n8n y Telegram

El workflow exportable esta en:

```txt
backend/n8n/workflows/eciencia_telegram_menu_reservas.workflow.json
```

Variables requeridas:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_PRIVACY_CONTACT`
- `TELEGRAM_PRIVACY_POLICY_URL`
- `TELEGRAM_CONSENT_VERSION`
- `TELEGRAM_INVITE_TOKEN_SECRET`
- `RESEND_API_KEY` (opcional mientras no exista dominio verificado)
- `INVITATION_FROM_EMAIL` (obligatorio al configurar Resend)
- `INVITATION_REPLY_TO` (opcional)
- `N8N_MENU_WEBHOOK_SECRET`
- `N8N_ECIENCIA_BACKEND_URL`
- `N8N_ECIENCIA_TIMEZONE`
- `N8N_ECIENCIA_MENU_IMAGE_URL`
- `N8N_ECIENCIA_PRODUCTO_ALMUERZO_NOMBRE`
- `N8N_ECIENCIA_ORIGEN_NOMBRE`
- `N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE`

El webhook manual que llama el backend es:

```txt
http://localhost:7000/webhook/eciencia-enviar-menu-manual
```

El workflow ejecuta diariamente a las `02:30` (zona `America/Bogota`) la limpieza de
imagenes `telegram/menu-dashboard-*` que superen la retencion de `menu_settings`.

El bot usa webhook en el backend. Despues de desplegar el backend HTTPS, registra Telegram asi:

```powershell
cd backend
npm run telegram:set-webhook
```

Endpoint esperado:

```txt
https://TU_BACKEND/api/telegram/webhook
```

No uses `getUpdates` ni polling en n8n cuando el webhook este activo.

## Alta de clientes en Telegram

Telegram no permite que un bot escriba primero a un usuario que nunca inicio conversacion.

Al crear el cliente, la API genera un enlace privado con vigencia de siete dias:

```txt
https://t.me/NOMBRE_DEL_BOT?start=TOKEN_DE_UN_SOLO_USO
```

Para el bot de pruebas usado localmente:

```txt
https://t.me/ECIENCIATESTEBOT?start=TOKEN
```

El frontend muestra el enlace y genera el QR localmente. Si Resend esta configurado,
el backend envia el mismo enlace y un QR embebido al correo obligatorio del cliente.
Un fallo de correo no revierte el alta y puede reintentarse desde Clientes.

El cliente abre el enlace,
acepta el aviso y comparte su propio contacto con el boton oficial de Telegram. El
telefono debe coincidir con el cliente exacto de la invitacion. Rechazos y
revocaciones quedan bloqueados hasta una reinvitacion administrativa.

Los pedidos solo aceptan botones para menu, cantidad y confirmacion. Los comandos de
privacidad son `/privacidad`, `/misdatos`, `/eliminarmisdatos`, `/revocar` y `/ayuda`.
Publica `TELEGRAM_PRIVACY_POLICY_URL` tambien en BotFather.

## Datos de simulacion

El saneamiento del proyecto de pruebas usa nombres empresariales reconocibles de
Ecuador como referencia visual. Todos los RUC, representantes, telefonos, correos y
convenios generados son ficticios y no representan relaciones comerciales reales.

## Validacion rapida

```powershell
cd backend
npm test
npm run lint

cd ../frontend
npm test
npm run lint
npm run build
```
