# Preprod Terraform

This stack deploys:

- Artifact Registry repository `ecencia`
- Secret Manager secret containers for runtime values
- Runtime service accounts
- Cloud Run services for backend, frontend and n8n
- Public invoker IAM for the three Cloud Run services
- Optional Cloud Scheduler job for the daily menu webhook

Runtime secrets are created as Secret Manager resources. Add the latest versions before the services need to start:

- `ecencia-supabase-service-role-key`
- `ecencia-supabase-publishable-key`
- `ecencia-telegram-bot-token`
- `ecencia-telegram-webhook-secret`
- `ecencia-outlook-client-id`
- `ecencia-outlook-client-secret`
- `ecencia-outlook-refresh-token`
- `ecencia-n8n-encryption-key`
- `ecencia-n8n-db-host`
- `ecencia-n8n-db-port`
- `ecencia-n8n-db-database`
- `ecencia-n8n-db-user`
- `ecencia-n8n-db-password`
- `ecencia-n8n-menu-webhook-secret`

Deployment is intentionally two-pass:

1. Apply with image tags only.
2. Read `backend_url`, `frontend_url` and `n8n_url`.
3. Reapply passing those URLs so Cloud Run receives CORS, webhook and runtime frontend config.

The GitHub Actions workflow automates that two-pass apply on `main`.
