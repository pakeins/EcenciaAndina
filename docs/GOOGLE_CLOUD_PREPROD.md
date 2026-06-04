# Google Cloud preproduccion low-cost

Objetivo: desplegar pruebas con credito estudiantil sin dejar recursos caros encendidos.

Proyecto Google Cloud fijo para esta preproduccion:

- Project ID: `eciencia-andina-preprod`
- Project number: `388587559842`
- Region: `us-central1`
- Artifact Registry: `eciencia`

## Guardrails de costo

- Usar Cloud Run, no GKE.
- `min-instances=0` para backend, frontend y n8n.
- `max-instances=1` en preproduccion.
- Mantener Supabase personal/de pruebas como base de datos; no crear Cloud SQL para esta fase.
- Para produccion final se migrara a Hostinger/MySQL; no mezclar datos finales del cliente en esta preproduccion.
- Budgets/alerts en Billing son recomendados, pero si el plan no los permite, revisar costos manualmente y apagar servicios al terminar.
- Usar una sola region, por ejemplo `us-central1`.
- Desactivar o borrar servicios cuando terminen las pruebas.

## Problema local de gcloud/Norton

En esta maquina, `gcloud projects list` sigue fallando por `SSLCertVerificationError`.
La cadena TLS observada para `oauth2.googleapis.com` esta interceptada por `Norton Web/Mail Shield Root`, y esa CA local no es aceptada por Python/gcloud.

Acciones manuales seguras:

- Agregar excepcion en Norton para `oauth2.googleapis.com` y `*.googleapis.com`, o desactivar solo la inspeccion HTTPS mientras se ejecuta `gcloud`.
- Volver a ejecutar `gcloud auth login` despues de corregir la inspeccion TLS.
- No usar `disable_ssl_validation=true` como solucion permanente.

## Backend Cloud Run

Antes de construir, verifica que Cloud Build no subira secretos locales:

```powershell
gcloud meta list-files-for-upload backend | Select-String -Pattern "\.env"
```

El comando no debe devolver `.env`, `.env.local` ni archivos `*.env`.

```powershell
gcloud builds submit backend `
  --project eciencia-andina-preprod `
  --tag us-central1-docker.pkg.dev/eciencia-andina-preprod/eciencia/backend:preprod

gcloud run deploy eciencia-backend `
  --project eciencia-andina-preprod `
  --image us-central1-docker.pkg.dev/eciencia-andina-preprod/eciencia/backend:preprod `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --memory 512Mi `
  --port 3001 `
  --set-env-vars NODE_ENV=production
```

Configura variables reales en Cloud Run. Si Secret Manager no esta disponible en el plan, usa un archivo local ignorado, por ejemplo `backend/.env.cloudrun.preprod.yaml`, y pasalo con `--env-vars-file`.
No incluyas `PORT` en ese archivo: Cloud Run lo reserva y lo define automaticamente desde `--port`.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_URL`
- `N8N_MENU_WEBHOOK_URL`
- `N8N_MENU_WEBHOOK_SECRET`

Ejemplo sin imprimir secretos en consola:

```powershell
gcloud run services update eciencia-backend `
  --project eciencia-andina-preprod `
  --region us-central1 `
  --env-vars-file backend/.env.cloudrun.preprod.yaml
```

Despues del deploy:

```powershell
cd backend
npm run telegram:set-webhook
```

## Frontend Cloud Run

El frontend Vite toma `VITE_*` en tiempo de build. No dependas de `frontend/.env` para Docker/Cloud Build, porque los archivos `.env*` se excluyen del contexto.

Puede apuntar a un proyecto Supabase distinto al backend si es una decision intencional de pruebas. Si necesitas que auth/storage/datos coincidan con el backend, usa el mismo `VITE_SUPABASE_URL`, publishable key y project ref del Supabase de preproduccion.

```powershell
gcloud meta list-files-for-upload frontend | Select-String -Pattern "\.env"

gcloud builds submit frontend `
  --project eciencia-andina-preprod `
  --config frontend/cloudbuild.yaml `
  --substitutions "_PROJECT_ID=eciencia-andina-preprod,_REGION=us-central1,_REPO=eciencia,_TAG=preprod,_VITE_API_BASE_URL=https://TU_BACKEND/api,_VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co,_VITE_SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY,_VITE_SUPABASE_PROJECT_ID=TU_PROJECT_REF"

gcloud run deploy eciencia-frontend `
  --project eciencia-andina-preprod `
  --image us-central1-docker.pkg.dev/eciencia-andina-preprod/eciencia/frontend:preprod `
  --region us-central1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 1 `
  --memory 256Mi
```

Si falta alguna variable `VITE_*` requerida, el Dockerfile falla a proposito para evitar publicar una imagen apuntando a `localhost`.

## n8n

Para preproduccion barata, mantener el workflow exportado en `backend/n8n/workflows` y desplegar n8n solo cuando se pruebe el envio. Si se publica n8n:

- Fijar una version de imagen probada; no usar `docker.io/n8nio/n8n:latest`.
- Configurar `WEBHOOK_URL=https://TU_N8N`.
- Configurar `N8N_MENU_WEBHOOK_SECRET`.
- Configurar `N8N_PUBLIC_API_DISABLED=true` y `N8N_PUBLIC_API_SWAGGERUI_DISABLED=true` si no se usara la API publica de n8n.
- No usar polling de Telegram.
- Usar Cloud Scheduler para llamar `eciencia-enviar-menu-manual` si se requiere envio diario.
- Con `min-instances=0`, no depender del Schedule Trigger interno de n8n: Cloud Run no despierta una instancia desde cero por tareas internas.

## Telegram

El bot queda con webhook:

```txt
https://TU_BACKEND/api/telegram/webhook
```

Telegram envia el header `X-Telegram-Bot-Api-Secret-Token`; el backend lo compara con `TELEGRAM_WEBHOOK_SECRET`.
