#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:?GCP_REGION is required}"
GAR_REPOSITORY="${GAR_REPOSITORY:?GAR_REPOSITORY is required}"
BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"
N8N_IMAGE="${N8N_IMAGE:?N8N_IMAGE is required}"
SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required}"
SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_ID:?SUPABASE_PROJECT_ID is required}"
TELEGRAM_BOT_USERNAME="${TELEGRAM_BOT_USERNAME:-}"
TF_LOCK_TIMEOUT="${TF_LOCK_TIMEOUT:-10m}"

TF_DIR="infra/preprod"

tf_vars=(
  "-var=project_id=${PROJECT_ID}"
  "-var=region=${REGION}"
  "-var=gar_repository=${GAR_REPOSITORY}"
  "-var=backend_image=${BACKEND_IMAGE}"
  "-var=frontend_image=${FRONTEND_IMAGE}"
  "-var=n8n_image=${N8N_IMAGE}"
  "-var=supabase_url=${SUPABASE_URL}"
  "-var=supabase_project_id=${SUPABASE_PROJECT_ID}"
)

if [ -n "${TELEGRAM_BOT_USERNAME}" ]; then
  tf_vars+=("-var=telegram_bot_username=${TELEGRAM_BOT_USERNAME}")
fi

state_has() {
  terraform -chdir="${TF_DIR}" state list | grep -Fx "$1" >/dev/null 2>&1
}

tf_import() {
  local address="$1"
  local import_id="$2"
  local required="${3:-false}"

  if state_has "${address}"; then
    echo "Terraform state already has ${address}"
    return
  fi

  echo "Importing ${address}"
  if terraform -chdir="${TF_DIR}" import -input=false -lock-timeout="${TF_LOCK_TIMEOUT}" "${tf_vars[@]}" "${address}" "${import_id}"; then
    return
  fi

  if [ "${required}" = "true" ]; then
    echo "::error title=Terraform import failed::Could not import required resource ${address}. Import id: ${import_id}"
    exit 1
  fi

  echo "::warning title=Terraform import skipped::Could not import optional existing resource ${address}. Terraform apply may update or report this resource later."
}

if ! gcloud artifacts repositories describe "${GAR_REPOSITORY}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" >/dev/null 2>&1; then
  echo "::error title=Missing Artifact Registry repository::${GAR_REPOSITORY} must exist in ${REGION} before deployment."
  exit 1
fi

echo "Artifact Registry repository ${GAR_REPOSITORY} exists in ${REGION}."

for service in backend:eciencia-backend frontend:eciencia-frontend n8n:eciencia-n8n; do
  key="${service%%:*}"
  name="${service#*:}"

  if gcloud run services describe "${name}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" >/dev/null 2>&1; then
    tf_import \
      "google_cloud_run_v2_service.${key}" \
      "projects/${PROJECT_ID}/locations/${REGION}/services/${name}"
  else
    echo "Cloud Run service ${name} does not exist yet."
  fi
done

secret_imports=(
  'n8n_db_database:eciencia-n8n-db-database'
  'n8n_db_host:eciencia-n8n-db-host'
  'n8n_db_password:eciencia-n8n-db-password'
  'n8n_db_port:eciencia-n8n-db-port'
  'n8n_db_user:eciencia-n8n-db-user'
  'n8n_encryption_key:eciencia-n8n-encryption-key'
  'n8n_menu_webhook_secret:eciencia-n8n-menu-webhook-secret'
  'outlook_client_id:eciencia-outlook-client-id'
  'outlook_client_secret:eciencia-outlook-client-secret'
  'outlook_refresh_token:eciencia-outlook-refresh-token'
  'supabase_publishable_key:eciencia-supabase-publishable-key'
  'supabase_service_role_key:eciencia-supabase-service-role-key'
  'telegram_bot_token:eciencia-telegram-bot-token'
  'telegram_webhook_secret:eciencia-telegram-webhook-secret'
)

for item in "${secret_imports[@]}"; do
  key="${item%%:*}"
  name="${item#*:}"

  if gcloud secrets describe "${name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    tf_import \
      "google_secret_manager_secret.runtime[\"${key}\"]" \
      "projects/${PROJECT_ID}/secrets/${name}"
  else
    echo "Secret Manager secret ${name} does not exist yet."
  fi
done
