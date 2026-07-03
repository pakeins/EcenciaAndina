terraform {
  required_version = ">= 1.7.0"

  backend "gcs" {
    bucket = "eciencia-andina-preprod-tfstate"
    prefix = "preprod"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
