resource "cloudflare_d1_database" "learning" {
  account_id = var.account_id
  name       = "${var.worker_name}-learning"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "materials" {
  account_id    = var.account_id
  name          = "${var.worker_name}-materials"
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_zero_trust_access_application" "lab" {
  account_id                  = var.account_id
  name                        = var.worker_name
  type                        = "self_hosted"
  domain                      = var.hostname
  destinations                = [{ type = "public", uri = var.hostname }]
  allowed_idps                = [var.access_identity_provider_id]
  allow_authenticate_via_warp = false
  app_launcher_visible        = false
  http_only_cookie_attribute  = true
  session_duration            = "12h"

  policies = [{
    name       = "Owner only"
    decision   = "allow"
    precedence = 1
    include    = [{ email = { email = var.owner_email } }]
    require    = [{ login_method = { id = var.access_identity_provider_id } }]
  }]
}

resource "cloudflare_workers_custom_domain" "lab" {
  count = var.attach_worker_hostname ? 1 : 0

  account_id       = var.account_id
  zone_id          = var.zone_id
  hostname         = cloudflare_zero_trust_access_application.lab.domain
  service          = var.worker_name
  enabled          = true
  previews_enabled = false
}
