variable "azure_region" {
  type        = string
  description = "Región de Azure donde se desplegarán los recursos"
  default     = "eastus"
}

variable "tamano_vm" {
  type        = string
  description = "Tamaño de la Máquina Virtual (capa gratuita o económica)"
  default     = "Standard_B1s"
}

variable "subscription_id" {
  type        = string
  description = "ID de suscripción de Azure (opcional, se usa el de az login por defecto)"
  default     = ""
}
