# Google Cloud preproduccion

Configuracion objetivo:

- Project ID: `ecencia-andina-preprod`
- Region: `us-central1`
- Artifact Registry: `ecencia`
- Backend: Cloud Run, puerto `3001`
- Frontend: Cloud Run, puerto `8080`
- Base de datos y archivos persistentes: Supabase `lkffhdcavohaxdihvwlb`

## Preparacion

El despliegue usa Node `22.22.3`, ejecuta `npm ci`, `npm audit`, pruebas, ESLint y
un escaneo Trivy de la imagen final en Cloud Build. No se publica una imagen cuando
falla alguno de esos controles o aparece una CVE alta o critica.

Aplica primero las migraciones de `backend/supabase/migrations`. La migracion
`20260611200911_add_private_agreement_documents_bucket.sql` crea el bucket privado
para documentos firmados. Cloud Run no debe usarse como almacenamiento persistente.

Crea `backend/.env.cloudrun.preprod.yaml` a partir de `backend/.env.example`. El
archivo es local e ignorado por Git. No incluyas `PORT`.

Variables esenciales:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGREEMENT_DOCUMENTS_BUCKET=ecencia-agreement-documents`
- `CORS_ORIGINS`
- `PASSWORD_RECOVERY_REDIRECT_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_PRIVACY_CONTACT`
- `TELEGRAM_PRIVACY_POLICY_URL`
- `TELEGRAM_CONSENT_VERSION`
- `TELEGRAM_INVITE_TOKEN_SECRET`
- `RESEND_API_KEY` (opcional hasta verificar un dominio en Resend)
- `INVITATION_FROM_EMAIL` (obligatorio cuando existe `RESEND_API_KEY`)
- `INVITATION_REPLY_TO` (opcional)
- `N8N_MENU_WEBHOOK_URL`
- `N8N_MENU_WEBHOOK_SECRET`

En Supabase Auth agrega `https://TU_FRONTEND/login` a las Redirect URLs permitidas.

## Despliegue automatizado

Desde la raiz:

```powershell
.\scripts\redeploy-preprod.ps1 -ValidateOnly
.\scripts\redeploy-preprod.ps1
```

El primer comando valida el entorno sin construir, desplegar ni registrar webhooks.

El script:

1. Verifica acceso a Cloud Run y Cloud Build, y crea Artifact Registry si falta.
2. Verifica que no se suban archivos `.env`.
3. Construye backend y frontend con sus `cloudbuild.yaml`.
4. Despliega ambos servicios con `min-instances=0` y `max-instances=1`.
5. Configura CORS y recuperacion de contrasena con la URL final del frontend.
6. Registra el webhook de Telegram y comprueba ambos servicios.

El frontend recibe solamente `VITE_API_BASE_URL` durante el build. Ninguna clave de
Supabase se incorpora al bundle.

## Despliegue manual

Backend:

```powershell
gcloud builds submit backend `
  --project ecencia-andina-preprod `
  --config backend/cloudbuild.yaml `
  --substitutions "_PROJECT_ID=ecencia-andina-preprod,_REGION=us-central1,_REPO=ecencia,_TAG=preprod"
```

Frontend:

```powershell
gcloud builds submit frontend `
  --project ecencia-andina-preprod `
  --config frontend/cloudbuild.yaml `
  --substitutions "_PROJECT_ID=ecencia-andina-preprod,_REGION=us-central1,_REPO=ecencia,_TAG=preprod,_VITE_API_BASE_URL=https://TU_BACKEND/api"
```

Antes de enviar cada contexto:

```powershell
gcloud meta list-files-for-upload backend | Select-String -Pattern "\.env"
gcloud meta list-files-for-upload frontend | Select-String -Pattern "\.env"
```

No deben aparecer secretos locales.

## Costos y operacion

- Usar Cloud Run, no GKE ni Cloud SQL en esta fase.
- Mantener `min-instances=0` y `max-instances=1` en preproduccion.
- Mantener frontend, backend y Artifact Registry en una sola region.
- Configurar alertas de presupuesto cuando la cuenta lo permita.
- Fijar una version probada de n8n; no usar `latest`.
- n8n debe usar su propia base y conectarse a Supabase mediante `service_role`.
- Con `min-instances=0`, usar Cloud Scheduler para tareas programadas de n8n.

Si `gcloud` vuelve a fallar con `SSLCertVerificationError`, corrige la inspeccion TLS
del antivirus para `oauth2.googleapis.com` y `*.googleapis.com`. No desactives la
validacion SSL de forma permanente.
