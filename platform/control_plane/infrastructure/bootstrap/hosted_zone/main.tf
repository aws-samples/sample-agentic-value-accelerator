# =============================================================================
# Bootstrap: Route 53 hosted zone (name from var.domain_name / .env HOSTED_ZONE_DOMAIN)
# =============================================================================
# Owns only the zone itself. The apex A/AAAA alias, the api.<zone> alias, and
# the two ACM validation CNAMEs are managed by the main CP terraform once
# `hosted_zone_id` + `domain_name` are populated in its tfvars. This split
# keeps ownership clean:
#
#   bootstrap/hosted_zone -> zone resource (+ auto NS + auto SOA)
#   ../..  (main CP tf)   -> apex + api. alias records, ACM certs and their
#                            DNS-01 validation CNAMEs, CloudFront + API GW
#                            custom-domain bindings
#
# deploy-full.sh runs the bootstrap once (Step 1b), captures the zone_id,
# writes it back into ../../terraform.tfvars, then re-runs the main CP
# terraform (Step 1c) so it can create the remaining records against the
# just-created zone.
#
# The parent zone `example.com` is owned by another team. After the
# first apply here, the four NS records exposed via `name_servers` must be
# handed off to the parent-zone owner so they add an NS record set for
# `ava-demo`. Until they do, the zone is authoritative in Route 53 but
# public resolvers won't find it.
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ava"
      Environment = var.environment
      ManagedBy   = "terraform"
      Module      = "bootstrap/hosted_zone"
    }
  }
}

# -----------------------------------------------------------------------------
# The zone itself (public, delegated child of example.com)
# -----------------------------------------------------------------------------
# NS and SOA are created automatically by AWS. The aws_route53_zone resource
# reads them back and exposes them via .name_servers / .primary_name_server.
# See outputs.tf.
#
# Cruft records 8 and 9 in the source `ava-demo.` zone (double-suffixed ACM
# validation CNAMEs from console-driven cert requests) are intentionally NOT
# reproduced.
resource "aws_route53_zone" "this" {
  name    = var.domain_name
  comment = "AVA Control Plane demo domain -- IaC parity with the hand-created demo zone."
}
