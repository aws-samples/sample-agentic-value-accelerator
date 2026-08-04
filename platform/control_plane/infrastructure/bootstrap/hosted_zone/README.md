# Route 53 hosted zone bootstrap

Creates the public Route 53 hosted zone for the AVA Control Plane's optional
custom domain. The zone name is passed in as `var.domain_name` — set the
`HOSTED_ZONE_DOMAIN` environment variable in the repo-root `.env` file (see
`.env.example`) and `deploy-full.sh` forwards it here automatically.

Default value in `.env.example`: `ava-demo.example.com`.

## What gets created

| Record | Type | Target |
|---|---|---|
| `<HOSTED_ZONE_DOMAIN>` | NS  | Auto — 4 AWS-assigned name servers |
| `<HOSTED_ZONE_DOMAIN>` | SOA | Auto |

Only the zone itself. The apex + `api.` alias records and the 2 ACM
validation CNAMEs are written by `scripts/acm.sh` (via `bootstrap/acm` +
a CP re-apply), not from here.

## Pre-requisites

None from a code perspective. The parent zone `example.com` is owned
by another team; after this bootstrap creates the child zone, send them
the four name servers from the `name_servers` output so they add an `NS`
record set delegating this subzone. Until they do, the zone works but
public resolvers won't find it.

## Usage

Automated (recommended) — invoked by `scripts/deploy-full.sh` Step 1b:

```bash
./platform/control_plane/infrastructure/scripts/deploy-full.sh
```

Direct terraform:

```bash
cd platform/control_plane/infrastructure/bootstrap/hosted_zone

terraform init
terraform apply -var "domain_name=$HOSTED_ZONE_DOMAIN"

# Outputs
terraform output name_servers
terraform output zone_id
```

## Wiring into the main CP terraform

`scripts/acm.sh` reads this bootstrap's `zone_id` output and passes it
into the CP re-apply as `hosted_zone_id`. No manual tfvars edit needed.
