output "backend_url" {
  description = "Backend Cloud Run URL."
  value       = google_cloud_run_v2_service.backend.uri
}

output "frontend_url" {
  description = "Frontend Cloud Run URL."
  value       = google_cloud_run_v2_service.frontend.uri
}

output "n8n_url" {
  description = "n8n Cloud Run URL."
  value       = google_cloud_run_v2_service.n8n.uri
}

output "artifact_registry_repository" {
  description = "Docker repository for app images."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.gar_repository}"
}

output "runtime_secret_ids" {
  description = "Secret Manager ids created for runtime configuration."
  value       = local.runtime_secrets
}
