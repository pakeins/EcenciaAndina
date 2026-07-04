variable "project_id" {
  description = "Google Cloud project for preprod."
  type        = string
  default     = "eciencia-andina-preprod"
}

variable "region" {
  description = "Google Cloud region for Cloud Run and Artifact Registry."
  type        = string
  default     = "us-central1"
}

variable "gar_repository" {
  description = "Artifact Registry repository id."
  type        = string
  default     = "eciencia"
}

variable "backend_image" {
  description = "Backend container image to deploy."
  type        = string
}

variable "frontend_image" {
  description = "Frontend container image to deploy."
  type        = string
}

variable "n8n_image" {
  description = "Pinned n8n image to deploy."
  type        = string
  default     = "docker.io/n8nio/n8n:2.26.5"
}

variable "supabase_url" {
  description = "Public Supabase project URL used by backend, frontend and n8n."
  type        = string
  default     = ""
}

variable "supabase_project_id" {
  description = "Supabase project ref exposed to the frontend runtime config."
  type        = string
  default     = ""
}

variable "public_backend_url" {
  description = "Cloud Run backend URL. Set after the first apply."
  type        = string
  default     = ""
}

variable "public_frontend_url" {
  description = "Cloud Run frontend URL. Set after the first apply."
  type        = string
  default     = ""
}

variable "public_n8n_url" {
  description = "Cloud Run n8n URL. Set after the first apply."
  type        = string
  default     = ""
}

variable "telegram_bot_username" {
  description = "Telegram bot username without @, used to generate invitation links."
  type        = string
  default     = ""
}

variable "outlook_from_email" {
  description = "Outlook mailbox used by Microsoft Graph to send bot invitations."
  type        = string
  default     = "ecenciaconvenios@outlook.com"
}

variable "outlook_token_tenant" {
  description = "Microsoft OAuth tenant for delegated Outlook token refresh. Use consumers for Outlook.com accounts."
  type        = string
  default     = "consumers"
}

variable "backend_service_name" {
  description = "Cloud Run backend service name."
  type        = string
  default     = "eciencia-backend"
}

variable "frontend_service_name" {
  description = "Cloud Run frontend service name."
  type        = string
  default     = "eciencia-frontend"
}

variable "n8n_service_name" {
  description = "Cloud Run n8n service name."
  type        = string
  default     = "eciencia-n8n"
}

variable "enable_daily_menu_scheduler" {
  description = "Create a Cloud Scheduler job that calls the n8n menu webhook."
  type        = bool
  default     = false
}

variable "daily_menu_scheduler_cron" {
  description = "Cron expression for the optional n8n daily menu scheduler."
  type        = string
  default     = "0 8 * * 1-5"
}

variable "daily_menu_scheduler_webhook_secret" {
  description = "Webhook secret header used only when enable_daily_menu_scheduler is true."
  type        = string
  sensitive   = true
  default     = ""
}

variable "secret_values" {
  description = "Optional initial Secret Manager versions keyed by the local secret names. Prefer adding versions manually for long-lived runtime secrets."
  type        = map(string)
  sensitive   = true
  default     = {}
}
