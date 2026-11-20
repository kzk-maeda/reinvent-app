output "application_url" {
  description = "Intended application URL. Routable after attaching the deployed Worker."
  value       = "https://${var.hostname}"
}

output "access_audience" {
  description = "Cloudflare Access audience for validating the application's Access JWT."
  value       = cloudflare_zero_trust_access_application.lab.aud
}

output "wrangler_config" {
  description = "Generate this Wrangler configuration at the repository root after porting the Worker entry point."
  value = {
    name               = var.worker_name
    account_id         = var.account_id
    main               = "cloudflare/worker.ts"
    compatibility_date = "2026-11-20"
    workers_dev        = false
    preview_urls       = false
    assets = {
      directory        = "./dist"
      binding          = "ASSETS"
      run_worker_first = true
    }
    d1_databases = [{
      binding       = "DB"
      database_name = cloudflare_d1_database.learning.name
      database_id   = cloudflare_d1_database.learning.id
    }]
    r2_buckets = [{
      binding     = "MATERIALS"
      bucket_name = cloudflare_r2_bucket.materials.name
    }]
    vars = {
      APP_ORIGIN    = "https://${var.hostname}"
      CF_ACCESS_AUD = cloudflare_zero_trust_access_application.lab.aud
    }
  }
}
