# Preprod Terraform

This stack deploys:

- Artifact Registry repository `eciencia`
- Secret Manager secret containers for runtime values
- Runtime service accounts
- Cloud Run services for backend, frontend and n8n
- Public invoker IAM for the three Cloud Run services
- Optional Cloud Scheduler job for the daily menu webhook

Runtime secrets are created as Secret Manager resources. Add the latest versions before the services need to start:

- `eciencia-supabase-service-role-key`
- `eciencia-supabase-publishable-key`
- `eciencia-telegram-bot-token`
- `eciencia-telegram-webhook-secret`
- `eciencia-outlook-client-id`
- `eciencia-outlook-client-secret`
- `eciencia-outlook-refresh-token`
- `eciencia-n8n-encryption-key`
- `eciencia-n8n-db-host`
- `eciencia-n8n-db-port`
- `eciencia-n8n-db-database`
- `eciencia-n8n-db-user`
- `eciencia-n8n-db-password`
- `eciencia-n8n-menu-webhook-secret`

Deployment is intentionally two-pass:

1. Apply with image tags only.
2. Read `backend_url`, `frontend_url` and `n8n_url`.
3. Reapply passing those URLs so Cloud Run receives CORS, webhook and runtime frontend config.

The GitHub Actions workflow automates that two-pass apply on `main`.
