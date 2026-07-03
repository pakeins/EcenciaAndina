locals {
  project_services = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
  ])

  runtime_secrets = {
    n8n_db_database           = "eciencia-n8n-db-database"
    n8n_db_host               = "eciencia-n8n-db-host"
    n8n_db_password           = "eciencia-n8n-db-password"
    n8n_db_port               = "eciencia-n8n-db-port"
    n8n_db_user               = "eciencia-n8n-db-user"
    n8n_encryption_key        = "eciencia-n8n-encryption-key"
    n8n_menu_webhook_secret   = "eciencia-n8n-menu-webhook-secret"
    outlook_client_id         = "eciencia-outlook-client-id"
    outlook_client_secret     = "eciencia-outlook-client-secret"
    outlook_refresh_token     = "eciencia-outlook-refresh-token"
    supabase_publishable_key  = "eciencia-supabase-publishable-key"
    supabase_service_role_key = "eciencia-supabase-service-role-key"
    telegram_bot_token        = "eciencia-telegram-bot-token"
    telegram_webhook_secret   = "eciencia-telegram-webhook-secret"
  }

  managed_secret_value_keys = toset([
    for key in nonsensitive(keys(var.secret_values)) : key
    if contains(keys(local.runtime_secrets), key)
  ])

  backend_url  = trimspace(var.public_backend_url)
  frontend_url = trimspace(var.public_frontend_url)
  n8n_url      = trimspace(var.public_n8n_url)

  backend_env = merge(
    {
      NODE_ENV              = "production"
      N8N_ECIENCIA_TIMEZONE = "America/Bogota"
      OUTLOOK_FROM_EMAIL    = var.outlook_from_email
      OUTLOOK_TOKEN_TENANT  = var.outlook_token_tenant
      SUPABASE_URL          = var.supabase_url
    },
    trimspace(var.telegram_bot_username) == "" ? {} : {
      TELEGRAM_BOT_USERNAME = trimspace(var.telegram_bot_username)
    },
    local.backend_url == "" ? {} : {
      N8N_ECIENCIA_BACKEND_URL = local.backend_url
      PUBLIC_BACKEND_URL       = local.backend_url
      TELEGRAM_WEBHOOK_URL     = "${local.backend_url}/api/telegram/webhook"
    },
    local.frontend_url == "" ? {} : {
      CORS_ORIGINS        = local.frontend_url
      PUBLIC_FRONTEND_URL = local.frontend_url
    },
    local.n8n_url == "" ? {} : {
      N8N_MENU_WEBHOOK_URL = "${local.n8n_url}/webhook/eciencia-enviar-menu-manual"
    },
  )

  backend_secret_env = {
    N8N_MENU_WEBHOOK_SECRET   = "n8n_menu_webhook_secret"
    OUTLOOK_CLIENT_ID         = "outlook_client_id"
    OUTLOOK_CLIENT_SECRET     = "outlook_client_secret"
    OUTLOOK_REFRESH_TOKEN     = "outlook_refresh_token"
    SUPABASE_SERVICE_ROLE_KEY = "supabase_service_role_key"
    TELEGRAM_BOT_TOKEN        = "telegram_bot_token"
    TELEGRAM_WEBHOOK_SECRET   = "telegram_webhook_secret"
  }

  frontend_env = merge(
    {
      SUPABASE_PROJECT_ID = var.supabase_project_id
      SUPABASE_URL        = var.supabase_url
    },
    local.backend_url == "" ? {} : {
      API_BASE_URL = "${local.backend_url}/api"
    },
    local.frontend_url == "" ? {} : {
      PUBLIC_FRONTEND_URL = local.frontend_url
    },
  )

  frontend_secret_env = {
    SUPABASE_PUBLISHABLE_KEY = "supabase_publishable_key"
  }

  n8n_env = merge(
    {
      DB_POSTGRESDB_POOL_SIZE               = "2"
      DB_POSTGRESDB_SCHEMA                  = "n8n_preprod"
      DB_POSTGRESDB_SSL_ENABLED             = "true"
      DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED = "false"
      DB_TYPE                               = "postgresdb"
      EXECUTIONS_DATA_MAX_AGE               = "168"
      EXECUTIONS_DATA_PRUNE                 = "true"
      GENERIC_TIMEZONE                      = "America/Bogota"
      N8N_BLOCK_ENV_ACCESS_IN_NODE          = "false"
      N8N_DIAGNOSTICS_ENABLED               = "false"
      N8N_ECIENCIA_ESTADO_RESERVADO_NOMBRE  = "Reservado"
      N8N_ECIENCIA_ORIGEN_NOMBRE            = "Telegram"
      N8N_ECIENCIA_PRODUCTO_ALMUERZO_NOMBRE = "Almuerzo Telegram"
      N8N_ECIENCIA_TIMEZONE                 = "America/Bogota"
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS = "true"
      N8N_ENDPOINT_HEALTH                   = "health"
      N8N_PORT                              = "5678"
      N8N_PUBLIC_API_DISABLED               = "true"
      N8N_PUBLIC_API_SWAGGERUI_DISABLED     = "true"
      N8N_PROTOCOL                          = "https"
      N8N_PROXY_HOPS                        = "1"
      N8N_SECURE_COOKIE                     = "true"
      N8N_VERSION_NOTIFICATIONS_ENABLED     = "false"
      N8N_WORKFLOW_REVISION                 = "telegram-consent-20260618-schema"
      SUPABASE_URL                          = var.supabase_url
      TELEGRAM_CONSENT_VERSION              = "EC-LOPDP-2026-06"
      TZ                                    = "America/Bogota"
    },
    local.backend_url == "" ? {} : {
      N8N_ECIENCIA_BACKEND_URL = local.backend_url
      PUBLIC_BACKEND_URL       = local.backend_url
    },
    local.n8n_url == "" ? {} : {
      N8N_EDITOR_BASE_URL = local.n8n_url
      N8N_HOST            = replace(replace(local.n8n_url, "https://", ""), "http://", "")
      WEBHOOK_URL         = local.n8n_url
    },
  )

  n8n_secret_env = {
    DB_POSTGRESDB_DATABASE    = "n8n_db_database"
    DB_POSTGRESDB_HOST        = "n8n_db_host"
    DB_POSTGRESDB_PASSWORD    = "n8n_db_password"
    DB_POSTGRESDB_PORT        = "n8n_db_port"
    DB_POSTGRESDB_USER        = "n8n_db_user"
    N8N_ENCRYPTION_KEY        = "n8n_encryption_key"
    N8N_MENU_WEBHOOK_SECRET   = "n8n_menu_webhook_secret"
    SUPABASE_SERVICE_ROLE_KEY = "supabase_service_role_key"
    TELEGRAM_BOT_TOKEN        = "telegram_bot_token"
  }
}

resource "google_project_service" "apis" {
  for_each = local.project_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

data "google_artifact_registry_repository" "eciencia" {
  project       = var.project_id
  location      = var.region
  repository_id = var.gar_repository
}

resource "google_service_account" "backend" {
  account_id   = "eciencia-backend-run"
  display_name = "Eciencia backend Cloud Run runtime"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "frontend" {
  account_id   = "eciencia-frontend-run"
  display_name = "Eciencia frontend Cloud Run runtime"

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "n8n" {
  account_id   = "eciencia-n8n-run"
  display_name = "Eciencia n8n Cloud Run runtime"

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "runtime" {
  for_each = local.runtime_secrets

  secret_id = each.value

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "managed" {
  for_each = local.managed_secret_value_keys

  secret      = google_secret_manager_secret.runtime[each.key].id
  secret_data = var.secret_values[each.key]

  lifecycle {
    ignore_changes = [secret_data]
  }
}

locals {
  runtime_secret_access = concat(
    [
      for secret_key in values(local.backend_secret_env) : {
        service_account = google_service_account.backend.email
        secret_key      = secret_key
      }
    ],
    [
      for secret_key in values(local.frontend_secret_env) : {
        service_account = google_service_account.frontend.email
        secret_key      = secret_key
      }
    ],
    [
      for secret_key in values(local.n8n_secret_env) : {
        service_account = google_service_account.n8n.email
        secret_key      = secret_key
      }
    ],
  )
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each = {
    for access in local.runtime_secret_access : "${access.service_account}/${access.secret_key}" => access
  }

  secret_id = google_secret_manager_secret.runtime[each.value.secret_key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.service_account}"
}

resource "google_cloud_run_v2_service" "backend" {
  name                = var.backend_service_name
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.backend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.backend_image

      ports {
        container_port = 3001
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      dynamic "env" {
        for_each = local.backend_env
        iterator = env_var

        content {
          name  = env_var.key
          value = env_var.value
        }
      }

      dynamic "env" {
        for_each = local.backend_secret_env
        iterator = secret_env

        content {
          name = secret_env.key

          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[secret_env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    data.google_artifact_registry_repository.eciencia,
    google_secret_manager_secret_iam_member.runtime_access,
  ]
}

resource "google_cloud_run_v2_service" "frontend" {
  name                = var.frontend_service_name
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend.email

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.frontend_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      dynamic "env" {
        for_each = local.frontend_env
        iterator = env_var

        content {
          name  = env_var.key
          value = env_var.value
        }
      }

      dynamic "env" {
        for_each = local.frontend_secret_env
        iterator = secret_env

        content {
          name = secret_env.key

          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[secret_env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    data.google_artifact_registry_repository.eciencia,
    google_secret_manager_secret_iam_member.runtime_access,
  ]
}

resource "google_cloud_run_v2_service" "n8n" {
  name                = var.n8n_service_name
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.n8n.email

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.n8n_image

      ports {
        container_port = 5678
      }

      startup_probe {
        failure_threshold = 3
        period_seconds    = 240
        timeout_seconds   = 240

        tcp_socket {
          port = 5678
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      dynamic "env" {
        for_each = local.n8n_env
        iterator = env_var

        content {
          name  = env_var.key
          value = env_var.value
        }
      }

      dynamic "env" {
        for_each = local.n8n_secret_env
        iterator = secret_env

        content {
          name = secret_env.key

          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.runtime[secret_env.value].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_access]
}

locals {
  public_services = {
    backend = {
      location = google_cloud_run_v2_service.backend.location
      name     = google_cloud_run_v2_service.backend.name
    }
    frontend = {
      location = google_cloud_run_v2_service.frontend.location
      name     = google_cloud_run_v2_service.frontend.name
    }
    n8n = {
      location = google_cloud_run_v2_service.n8n.location
      name     = google_cloud_run_v2_service.n8n.name
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = local.public_services

  project  = var.project_id
  location = each.value.location
  name     = each.value.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_scheduler_job" "daily_menu" {
  count = var.enable_daily_menu_scheduler && local.n8n_url != "" && trimspace(var.daily_menu_scheduler_webhook_secret) != "" ? 1 : 0

  name        = "eciencia-daily-menu-preprod"
  description = "Calls the n8n daily menu webhook for preprod."
  region      = var.region
  schedule    = var.daily_menu_scheduler_cron
  time_zone   = "America/Bogota"

  http_target {
    http_method = "POST"
    uri         = "${local.n8n_url}/webhook/eciencia-enviar-menu-manual"
    headers = {
      "Content-Type"              = "application/json"
      "X-Eciencia-Webhook-Secret" = var.daily_menu_scheduler_webhook_secret
    }
    body = base64encode(jsonencode({ source = "cloud-scheduler" }))
  }

  depends_on = [google_project_service.apis]
}
