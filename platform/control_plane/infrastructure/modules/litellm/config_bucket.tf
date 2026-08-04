# =============================================================================
# LiteLLM Gateway Module - Config S3 Bucket
# =============================================================================
# Provides the S3 bucket used by the Config Generator to store versioned
# LiteLLM config files. The ECS task downloads config-latest.yaml on boot.
#
# Task: 2.2
# Requirements: 2.6, 16.6
# =============================================================================

resource "aws_s3_bucket" "config" {
  bucket = var.config_s3_bucket

  tags = merge(local.tags, {
    Name = "${local.resource_prefix}-config-bucket"
  })
}

resource "aws_s3_bucket_versioning" "config" {
  bucket = aws_s3_bucket.config.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config" {
  bucket = aws_s3_bucket.config.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "config" {
  bucket = aws_s3_bucket.config.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Seed config-latest.yaml so the very first ECS boot succeeds
# -----------------------------------------------------------------------------
# MIGRATION NOTE for existing environments:
# If your environment already has a real config-latest.yaml in this bucket
# (written by ConfigGenerator.publish()), you must import the existing object
# into Terraform state BEFORE applying this resource:
#
#   terraform import 'module.litellm.aws_s3_object.config_seed' \
#     '<bucket-name>/<prefix>/config-latest.yaml'
#
# This prevents Terraform from overwriting your production config with the
# seed content. After import, ignore_changes=all ensures Terraform never
# modifies the object again.
# -----------------------------------------------------------------------------

resource "aws_s3_object" "config_seed" {
  bucket       = aws_s3_bucket.config.id
  key          = "${var.config_s3_prefix}/config-latest.yaml"
  content_type = "text/yaml"
  content      = <<-YAML
    model_list: []
    litellm_settings:
      drop_params: true
      set_verbose: false
      num_retries: 2
      request_timeout: 60
    general_settings:
      master_key: os.environ/LITELLM_MASTER_KEY
      database_url: os.environ/DATABASE_URL
    router_settings:
      routing_strategy: simple-shuffle
      num_retries: 2
      timeout: 30
  YAML

  # This object is seeded by Terraform on first-create only.
  # At runtime, ConfigGenerator.publish() overwrites this key with real config.
  # ignore_changes = all prevents Terraform from reverting runtime updates
  # or creating confusing plan diffs on any mutable field (content, etag,
  # metadata, etc.).
  lifecycle {
    ignore_changes = all
  }

  tags = local.tags
}
