variable "account_id" {
  type        = string
  description = "Cloudflare account that owns the Worker, D1, R2 and Access app."

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id must be a 32-character lowercase hexadecimal Cloudflare account ID."
  }
}

variable "zone_id" {
  type        = string
  description = "Cloudflare zone in that account containing the application hostname."

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.zone_id))
    error_message = "zone_id must be a 32-character lowercase hexadecimal Cloudflare zone ID."
  }
}

variable "hostname" {
  type        = string
  description = "Dedicated application hostname in the zone, without a scheme, port or path."

  validation {
    condition     = length(var.hostname) <= 253 && can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$", var.hostname))
    error_message = "hostname must be a lowercase fully qualified hostname without a wildcard, scheme, port or path."
  }
}

variable "owner_email" {
  type        = string
  description = "Single email address authorized to use the application."

  validation {
    condition     = can(regex("^[A-Za-z0-9.!#$%&'+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$", var.owner_email))
    error_message = "owner_email must be one full email address. Domain rules and wildcards are unavailable."
  }
}

variable "access_identity_provider_id" {
  type        = string
  description = "ID of an existing login method in the account's Cloudflare Zero Trust organization."

  validation {
    condition     = can(regex("^([0-9a-f]{32}|[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})$", var.access_identity_provider_id))
    error_message = "access_identity_provider_id must be a Cloudflare login method ID."
  }
}

variable "worker_name" {
  type        = string
  description = "Worker name and prefix for its storage resources. Set distinct names per environment."
  default     = "reinvent-english-lab"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,50}[a-z0-9])?$", var.worker_name))
    error_message = "worker_name must be 1–52 lowercase letters, digits or hyphens, and start and end with an alphanumeric character."
  }
}

variable "attach_worker_hostname" {
  type        = bool
  description = "Attach the Access-protected hostname after deploying a compatible Worker with its alternate URLs disabled."
  default     = false
}
