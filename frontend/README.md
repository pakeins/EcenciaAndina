# Frontend ECencia Andina

Aplicacion React 18 con Vite 8, TypeScript, Tailwind CSS y React Query.

## Desarrollo

Requiere Node `22.13` o superior.

```powershell
Copy-Item .env.example .env
npm ci
npm test
npm run lint
npm run dev
```

La unica variable publica es:

```txt
VITE_API_BASE_URL=http://localhost:3001/api
```

No se deben incluir claves de Supabase en el frontend.

## Build y despliegue

```powershell
npm audit --audit-level=moderate
npm run build
```

La imagen se construye con `Dockerfile` y `cloudbuild.yaml`. Consulta
`../docs/GOOGLE_CLOUD_PREPROD.md` para el flujo de Cloud Run.
