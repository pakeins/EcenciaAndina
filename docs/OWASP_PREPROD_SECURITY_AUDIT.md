# Auditoria OWASP para preproduccion

Fecha: 2026-06-04

Alcance local:
- Backend Express, rutas API, Dockerfile y pipeline CI.
- Frontend Vite/React, Dockerfile, build de Cloud Build y manejo de variables publicas.
- Planes de despliegue hacia Google Cloud Run, Supabase y n8n.
- Revision de postura Supabase realizada en modo lectura.

Contexto confirmado:
- Esta preproduccion usara Supabase personal con datos de prueba, no datos finales del cliente.
- La fase final migrara a Hostinger/MySQL; esa migracion queda fuera del alcance de este despliegue.
- Secret Manager, IAM minimo formal, alertas y presupuesto de Google Cloud quedan fuera del plan disponible; se aceptan como riesgo de preproduccion controlada.

Referencias:
- OWASP Top 10:2025: https://owasp.org/Top10/2025/
- OWASP API Security Top 10:2023: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- Supabase secure configuration: https://supabase.com/docs/guides/security/product-security

## Resumen ejecutivo

El proyecto queda mas preparado para preproduccion: los contenedores no corren como root, los artefactos de despliegue ya excluyen archivos `.env`, el frontend se compila con sustituciones explicitas de Cloud Build, la API tiene limitacion general de requests, los errores de produccion ya no exponen detalles internos y la integracion con n8n valida el webhook para reducir riesgo de SSRF/configuracion insegura.

No se hizo commit, push ni despliegue.

## Controles corregidos

### A01: Broken Access Control / API1, API5

- Las rutas sensibles existentes siguen protegidas por autenticacion y roles.
- `/api/check-db` ya no devuelve registros de negocio ni detalles internos de error en produccion.
- El webhook de Telegram mantiene validacion por token secreto.

Riesgo residual:
- Revisar manualmente en cada nueva ruta que no haya acceso directo por ID sin comprobar autorizacion de objeto.

### A02: Security Misconfiguration / API8

- Se agregaron `.gcloudignore` para raiz, backend y frontend, excluyendo `.env`, archivos temporales, builds locales, logs, `node_modules` y cache de Supabase.
- El backend y frontend corren como usuarios no root dentro de Docker.
- El plan de n8n ya exige una version probada en lugar de `latest`.
- La documentacion de despliegue ahora exige verificar el listado real de archivos que se subiran con `gcloud meta list-files-for-upload`.

Riesgo residual:
- Corregir el error local de certificados de `gcloud` sin desactivar verificacion SSL de forma permanente.
- Mantener preproduccion con datos de prueba y sin credenciales finales del cliente.

### A03: Software Supply Chain Failures / A08

- CI ahora usa `npm ci`, auditoria `npm audit --audit-level=moderate`, lint, tests y build.
- Docker build del frontend evita descargas innecesarias de Puppeteer durante `npm ci`.

Riesgo residual:
- Activar proteccion de ramas en GitHub y requerir CI verde antes de merge.
- Mantener imagenes base y version de n8n actualizadas con ventana de pruebas.

### A04: Cryptographic Failures

- Los planes ya no dependen de subir `.env` al build context.
- Las variables publicas del frontend se pasan como argumentos explicitamente publicos de Cloud Build.

Riesgo residual:
- Rotar secretos si alguna vez estuvieron incluidos en builds, logs o artefactos remotos.
- Como Secret Manager queda fuera del plan, usar variables de entorno de Cloud Run cargadas desde archivos locales ignorados y no imprimir valores en consola, documentos ni chat.

### A05: Injection

- No se detecto SQL crudo construido con input de usuario en las rutas revisadas; el backend usa consultas del cliente Supabase y validaciones.

Riesgo residual:
- Mantener validacion estricta con Zod/Joi/validadores existentes en rutas nuevas.
- Evitar concatenar SQL o URLs con input de usuario.

### A06: Insecure Design

- El plan ahora distingue preproduccion de produccion y evita mezclar `.env` local con valores remotos.
- Se documento que los archivos de convenios en filesystem local son efimeros en Cloud Run.

Riesgo residual:
- Migrar firmas/archivos de convenios a Supabase Storage o almacenamiento persistente antes de uso real.
- El frontend puede apuntar a otro proyecto Supabase si es intencional; las substitutions de Cloud Build son la fuente de verdad para preproduccion.
- Para produccion final con Hostinger/MySQL, preparar una migracion explicita de esquema, datos y capa de acceso.

### A07: Authentication Failures / API2

- La ruta de refresh queda bajo rate limit especifico, ademas del limitador general de `/api`.
- La autorizacion del backend no debe confiar en `user_metadata` editable del usuario.

Riesgo residual:
- Activar leaked password protection en Supabase Auth antes de produccion real; para esta preproduccion con datos de prueba no bloquea el despliegue.
- Evaluar migrar tokens del frontend desde `localStorage` a cookies `HttpOnly`, `Secure`, `SameSite` si el riesgo XSS aumenta.

### A09: Security Logging and Alerting Failures

- El backend registra errores 5xx sin devolver detalles internos al cliente.

Riesgo residual:
- Como alertas y presupuesto quedan fuera del plan, hacer revision manual de Billing/Cloud Run durante las pruebas y apagar servicios al terminar.
- Documentar runbook de incidentes y rotacion de secretos.

### A10: Mishandling of Exceptional Conditions

- El handler global de errores responde de forma generica en produccion y evita filtrar stack traces.
- Los errores CORS devuelven 403 controlado.

Riesgo residual:
- Revisar que rutas nuevas usen `next(error)` o respuestas controladas.

### API4: Unrestricted Resource Consumption

- Se agrego rate limit general para `/api` y uno especifico para login/refresh.

Riesgo residual:
- Ajustar `API_RATE_LIMIT` con trafico real.
- Agregar limites de tamano y duracion a integraciones de terceros cuando aplique.

### API7: Server Side Request Forgery

- `N8N_MENU_WEBHOOK_URL` ahora se valida como URL.
- En produccion se exige HTTPS y se bloquean hosts locales para el webhook.

Riesgo residual:
- Mantener el webhook fuera de input de usuario y rotar `N8N_WEBHOOK_SECRET` si fue compartido.

### API10: Unsafe Consumption of APIs

- La llamada a n8n queda condicionada a una URL configurada y validada, con secreto de integracion.

Riesgo residual:
- Validar la respuesta de n8n si en el futuro se usa para tomar decisiones de negocio.

## Evidencia de verificacion

Comandos ejecutados localmente:
- `npm test` backend: OK.
- `npm run lint` backend: OK.
- `npm audit --audit-level=moderate` backend: 0 vulnerabilidades.
- `npm test` frontend: OK.
- `npm run lint` frontend: OK.
- `npm run build` frontend: OK, con advertencia esperada de chunk grande de Vite.
- `npm audit --audit-level=moderate` frontend: 0 vulnerabilidades.
- `docker build -t ecencia-backend-sec-check backend`: OK.
- `docker build -t ecencia-frontend-sec-check frontend`: OK.
- Backend container UID: 1000.
- Frontend container UID: 101.
- `gcloud meta list-files-for-upload backend/frontend`: verificado sin `.env` ni temporales.
- `gcloud config list` y `gcloud auth list`: cuenta y proyecto local configurados.
- `gcloud projects list --limit=1`: sigue bloqueado por `SSLCertVerificationError` al renovar token contra `oauth2.googleapis.com`.
- La cadena TLS local muestra inspeccion de Norton Web/Mail Shield; su CA raiz tiene Basic Constraints no critico y Python/gcloud la rechaza.
- `WINCERTSTORE=1` y una prueba temporal con `core/custom_ca_certs_file` no resolvieron el bloqueo mientras Norton inspecciona TLS; `gcloud` quedo de nuevo sin custom CA configurada.

## Bloqueadores antes de desplegar preproduccion

1. Resolver la inspeccion TLS de Norton para `oauth2.googleapis.com`/`*.googleapis.com`, o ejecutar `gcloud` desde un entorno que no sea interceptado.
2. Reautenticar `gcloud` despues de corregir TLS.
3. Definir y fijar la version exacta de n8n.
4. Confirmar que las substitutions Supabase del frontend son intencionales, aunque apunten a otro proyecto.
5. Reconciliar migraciones locales/remotas de Supabase solo si se van a aplicar cambios DB.
6. Decidir almacenamiento persistente para convenios si esa funcionalidad sera usada en preproduccion real.

## Riesgos aceptados para esta fase

- Supabase es personal y de pruebas; no almacenar datos finales del cliente.
- Sin Secret Manager: usar variables de entorno de Cloud Run y archivos locales ignorados.
- Sin budgets/alertas: revisar costos manualmente y apagar servicios al terminar.
- Sin IAM minimo formal: limitar el alcance operativo del proyecto y no compartir credenciales.
