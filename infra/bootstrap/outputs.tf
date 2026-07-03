output "terraform_state_bucket" {
  description = "GCS bucket for Terraform remote state."
  value       = google_storage_bucket.terraform_state.name
}

output "workload_identity_provider" {
  description = "Full Workload Identity Provider id for google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "Service account email used by GitHub Actions."
  value       = google_service_account.deployer.email
}
