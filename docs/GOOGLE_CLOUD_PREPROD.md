# Google Cloud preproduccion low-cost

Objetivo: desplegar pruebas con credito estudiantil sin dejar recursos caros encendidos.

## Guardrails de costo

- Usar Cloud Run, no GKE.
- `min-instances=0` para backend, frontend y n8n.
- `max-instances=1` en preproduccion.
- Mantener Supabase como base de datos; no crear Cloud SQL para esta fase.
- Crear budgets/alerts en Billing: USD 10, 25 y 50.
- Usar una sola region, por ejemplo `us-central1`.
- Desactivar o borrar servicios cuando terminen las pruebas.

## Backend Cloud Run

```powershell
gcloud builds submit backend --tag us-central1-docker.pkg.dev/PROJECT_ID/eciencia/backend:preprod

gcloud run deploy eciencia-backend `
  --image us-central1-docker.pkg.dev/PROJECT_ID/eciencia/backend:preprod `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --memory 512Mi `
  --set-env-vars NODE_ENV=production,PORT=3001
```

Configura secretos/variables reales en Cloud Run:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_URL`
- `N8N_MENU_WEBHOOK_URL`
- `N8N_MENU_WEBHOOK_SECRET`

Despues del deploy:

```powershell
cd backend
npm run telegram:set-webhook
```

## Frontend Cloud Run

```powershell
gcloud builds submit frontend --tag us-central1-docker.pkg.dev/PROJECT_ID/eciencia/frontend:preprod

gcloud run deploy eciencia-frontend `
  --image us-central1-docker.pkg.dev/PROJECT_ID/eciencia/frontend:preprod `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --memory 256Mi
```

En `frontend/.env` antes de construir:

```txt
VITE_API_BASE_URL=https://eciencia-backend-xxxxx.run.app/api
```

## n8n

Para preproduccion barata, mantener el workflow exportado en `backend/n8n/workflows` y desplegar n8n solo cuando se pruebe el envio. Si se publica n8n:

- Configurar `WEBHOOK_URL=https://TU_N8N`.
- Configurar `N8N_MENU_WEBHOOK_SECRET`.
- No usar polling de Telegram.
- Usar Cloud Scheduler para llamar `eciencia-enviar-menu-manual` si se requiere envio diario.

## Telegram

El bot queda con webhook:

```txt
https://TU_BACKEND/api/telegram/webhook
```

Telegram envia el header `X-Telegram-Bot-Api-Secret-Token`; el backend lo compara con `TELEGRAM_WEBHOOK_SECRET`.
