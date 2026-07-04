variable "project_id" {
  description = "Google Cloud project that owns preprod infrastructure."
  type        = string
  default     = "eciencia-andina-preprod"
}

variable "tf_state_bucket_name" {
  description = "GCS bucket used by Terraform remote state."
  type        = string
  default     = "eciencia-andina-preprod-tfstate"
}

variable "tf_state_bucket_location" {
  description = "Location for the Terraform state bucket."
  type        = string
  default     = "US"
}

variable "tf_state_bucket_force_destroy" {
  description = "Whether Terraform may destroy the state bucket even when it has objects."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "GitHub repository allowed to impersonate the deployer service account."
  type        = string
  default     = "RengifORG/gestion-almuerzos-bot"
}

variable "workload_identity_pool_id" {
  description = "Workload Identity Pool id for GitHub Actions."
  type        = string
  default     = "github-actions"
}

variable "workload_identity_provider_id" {
  description = "Workload Identity Provider id for GitHub Actions OIDC."
  type        = string
  default     = "github"
}

variable "deployer_service_account_id" {
  description = "Service account id used by GitHub Actions deployments."
  type        = string
  default     = "github-actions-deployer"
}
