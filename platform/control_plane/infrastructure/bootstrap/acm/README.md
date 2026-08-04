# ACM certificate bootstrap

Provisions the two ACM certificates used by the AVA Control Plane custom
domain, plus their DNS-01 validation CNAMEs in the Route 53 hosted zone.

## What gets created

| Resource | Region | Domain |
|---|---|---|
| `aws_acm_certificate.apex` | `us-east-1` (fixed — CloudFront requirement) | `<domain_name>` |
| `aws_route53_record.apex_validation` | (Route 53 is global) | `_<hash>.<domain_name>` CNAME |
| `aws_acm_certificate_validation.apex` | `us-east-1` | Blocks until cert reaches ISSUED |
| `aws_acm_certificate.api` | `var.aws_region` | `api.<domain_name>` |
| `aws_route53_record.api_validation` | Route 53 | `_<hash>.api.<domain_name>` CNAME |
| `aws_acm_certificate_validation.api` | `var.aws_region` | Blocks until cert reaches ISSUED |

## Pre-requisites

1. `bootstrap/hosted_zone` has already run and produced a `zone_id`.
2. The parent zone (`example.com`) has been delegated to the four
   name servers `bootstrap/hosted_zone` printed. **Without delegation, ACM's
   DNS-01 validation cannot resolve the CNAME and `terraform apply` here
   will hang for up to 40 minutes before timing out.**

## Usage

Called by `scripts/acm.sh`. Direct usage:

```bash
cd platform/control_plane/infrastructure/bootstrap/acm

terraform init
terraform apply \
  -var "domain_name=$HOSTED_ZONE_DOMAIN" \
  -var "hosted_zone_id=$(cd ../hosted_zone && terraform output -raw zone_id)" \
  -var 'aws_region=us-east-1'
```

`$HOSTED_ZONE_DOMAIN` comes from repo-root `.env` (see `.env.example`).

Both cert ARNs are exposed as outputs:

```bash
terraform output -raw cloudfront_acm_certificate_arn
terraform output -raw api_acm_certificate_arn
```

`scripts/acm.sh` reads these outputs and passes them into the main CP
terraform's second apply.

## State

Local `terraform.tfstate` in this directory (same pattern as
`bootstrap/hosted_zone` and `bootstrap/state_backend`). Since this is a
one-time bootstrap that runs after the S3 remote backend already exists,
you may migrate to a remote backend if you want to manage the certs from
elsewhere later.

## Destroy

`terraform destroy` here removes both certs cleanly and also removes the
validation CNAMEs from Route 53. Remember to remove the cert ARNs from the
CP terraform's tfvars (or clear `cloudfront_acm_certificate_arn` and
`api_acm_certificate_arn`) before destroying — otherwise CloudFront and
API Gateway will still hold references to the cert ARNs and the AWS API
will refuse to delete them.
