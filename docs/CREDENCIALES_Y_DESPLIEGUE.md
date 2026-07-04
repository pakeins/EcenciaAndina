# Credenciales y despliegue

Este archivo explica que valores debe entregar el administrador del proyecto para que otro colaborador pueda ejecutar Ecencia Andina sin subir secretos al repositorio.

## Archivos que cada colaborador debe crear

- `backend/.env.local`: credenciales del backend y URL del webhook de n8n.
- `frontend/.env`: variables publicas del frontend.
- `backend/n8n/eciencia-n8n.env`: variables del contenedor n8n.

Usa estos ejemplos como plantilla:

- `backend/.env.example`
- `frontend/.env.example`
- `backend/n8n/eciencia-n8n.env.example`

## Secretos que debes compartir por canal privado

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` si el colaborador va a aplicar scripts administrativos o conectar n8n a Postgres.
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_URL` o `PUBLIC_BACKEND_URL`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_PRIVACY_CONTACT`
- `TELEGRAM_PRIVACY_POLICY_URL`
- `TELEGRAM_CONSENT_VERSION`
- `TELEGRAM_INVITE_TOKEN_SECRET`, aleatorio y de al menos 32 caracteres.
- `RESEND_API_KEY`, cuando se habilite el envio transaccional.
- `INVITATION_FROM_EMAIL`, remitente de un dominio verificado en Resend.
- `INVITATION_REPLY_TO`, correo de soporte opcional.
- `N8N_MENU_WEBHOOK_SECRET`
- `N8N_ENCRYPTION_KEY`
- Credenciales Postgres usadas por n8n: `DB_POSTGRESDB_HOST`, `DB_POSTGRESDB_USER`, `DB_POSTGRESDB_PASSWORD`, `DB_POSTGRESDB_DATABASE`, `DB_POSTGRESDB_SCHEMA`.
- `CORS_ORIGINS` con los dominios HTTPS autorizados del frontend en preproduccion/produccion.
- `MENU_IMAGE_RETENTION_DAYS` si se quiere cambiar la retencion por defecto de 14 dias para imagenes de menus.
- `AGREEMENT_DOCUMENTS_BUCKET` si se cambia el bucket privado predeterminado.

El frontend solo necesita `VITE_API_BASE_URL`; no recibe URL ni claves de Supabase.

Nunca pegues esos valores en GitHub, issues, commits, capturas publicas o mensajes del README.

## Link de registro del bot

El cliente debe iniciar conversacion con el bot. Telegram no permite que el bot escriba primero a un usuario nuevo.

Formato:

```txt
https://t.me/NOMBRE_DEL_BOT?start=TOKEN_DE_UN_SOLO_USO
```

Bot usado en pruebas locales:

```txt
https://t.me/ECIENCIATESTEBOT?start=TOKEN
```

Flujo de alta:

1. El alta crea una invitacion de siete dias y el frontend muestra enlace y QR.
2. El primer chat que abre el enlace reclama la invitacion.
3. El cliente acepta o rechaza el aviso mediante botones.
4. Si acepta, comparte su propio contacto con el boton oficial.
5. El backend comprueba que el contacto pertenece al remitente y coincide con el cliente invitado.
6. Se registra evidencia versionada y el token queda consumido.

Si rechaza o revoca, no recibe menus y queda bloqueado hasta que un administrador use
la reinvitacion de Clientes. n8n no procesa mensajes entrantes; el backend es la unica
fuente del webhook de Telegram.

## Produccion

- Usar HTTPS para frontend/backend.
- Configurar `CORS_ORIGINS` con el dominio real del frontend; no usar comodin `*`.
- Configurar `N8N_MENU_WEBHOOK_URL` del backend apuntando al webhook real de n8n.
- Configurar `TELEGRAM_WEBHOOK_URL=https://TU_BACKEND/api/telegram/webhook`.
- Registrar el webhook con `cd backend && npm run telegram:set-webhook`.
- Configurar la pagina publica `/privacidad` como Privacy Policy URL en BotFather.
- No activar polling ni `getUpdates` en n8n cuando el webhook este configurado.
- En Supabase, mantener `telegram_subscriptions` sin acceso directo para `anon` y `authenticated`.
- Activar en Supabase Auth la proteccion contra contrasenas filtradas antes de pasar a produccion.
- Revisar `telegram_order_traces` cuando una accion por botones falle.
