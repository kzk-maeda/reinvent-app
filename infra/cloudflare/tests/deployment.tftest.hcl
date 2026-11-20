mock_provider "cloudflare" {
  mock_resource "cloudflare_d1_database" {
    defaults = { id = "a9f10ad2-8bac-4c40-987f-1626a4776d3f" }
  }
}

variables {
  account_id                  = "00000000000000000000000000000000"
  zone_id                     = "11111111111111111111111111111111"
  hostname                    = "english-lab.example.com"
  owner_email                 = "owner@example.com"
  access_identity_provider_id = "22222222-2222-2222-2222-222222222222"
}

run "foundation" {
  command = apply

  assert {
    condition     = length(cloudflare_workers_custom_domain.lab) == 0
    error_message = "Provisioning the foundation must not route public requests to a Worker."
  }

  assert {
    condition = (
      one(cloudflare_zero_trust_access_application.lab.destinations).uri == var.hostname &&
      one(cloudflare_zero_trust_access_application.lab.allowed_idps) == var.access_identity_provider_id &&
      one(cloudflare_zero_trust_access_application.lab.policies).decision == "allow" &&
      one(one(cloudflare_zero_trust_access_application.lab.policies).include).email.email == var.owner_email
    )
    error_message = "Access must secure the whole hostname and allow only the configured email and login method."
  }

  assert {
    condition = (
      !output.wrangler_config.workers_dev && !output.wrangler_config.preview_urls &&
      output.wrangler_config.assets.run_worker_first &&
      one(output.wrangler_config.d1_databases).database_id == cloudflare_d1_database.learning.id &&
      one(output.wrangler_config.r2_buckets).bucket_name == cloudflare_r2_bucket.materials.name
    )
    error_message = "The Worker must use the provisioned bindings and serve through its protected hostname."
  }
}

run "attach_worker" {
  command = plan

  variables {
    attach_worker_hostname = true
  }

  assert {
    condition = (
      cloudflare_workers_custom_domain.lab[0].hostname == var.hostname &&
      cloudflare_workers_custom_domain.lab[0].zone_id == var.zone_id &&
      cloudflare_workers_custom_domain.lab[0].service == var.worker_name &&
      !cloudflare_workers_custom_domain.lab[0].previews_enabled
    )
    error_message = "Attaching the Worker must use the same Access-protected hostname with previews off."
  }
}

run "reject_wide_access" {
  command = plan

  variables {
    hostname    = "*.example.com"
    owner_email = "*@example.com"
  }

  expect_failures = [var.hostname, var.owner_email]
}
