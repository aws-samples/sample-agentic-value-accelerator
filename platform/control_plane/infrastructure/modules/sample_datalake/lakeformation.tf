# -----------------------------------------------------------------------------
# Lake Formation — Full governance for Iceberg data lake
# -----------------------------------------------------------------------------

# Data Lake Settings: enable FTA, remove IAM_ALLOWED_PRINCIPALS defaults
resource "aws_lakeformation_data_lake_settings" "this" {
  admins = [var.lf_admin_role_arn, var.ecs_task_role_arn]

  allow_full_table_external_data_access = true
}

# -----------------------------------------------------------------------------
# Registration Role — LF assumes this to access S3 on behalf of governed roles
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lf_registration" {
  name = "${var.name_prefix}-lf-registration"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lakeformation.amazonaws.com" }
      Action    = ["sts:AssumeRole", "sts:SetContext"]
    }]
  })
}

resource "aws_iam_role_policy" "lf_registration_s3" {
  name = "s3-data-access"
  role = aws_iam_role.lf_registration.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.datalake.arn}/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [aws_s3_bucket.datalake.arn]
      },
    ]
  })
}

# Register S3 location with Lake Formation
resource "aws_lakeformation_resource" "datalake" {
  arn      = aws_s3_bucket.datalake.arn
  role_arn = aws_iam_role.lf_registration.arn

  depends_on = [aws_lakeformation_data_lake_settings.this]
}

# Wait for LF registration and IAM role propagation
resource "time_sleep" "wait_for_lf" {
  depends_on      = [aws_lakeformation_resource.datalake]
  create_duration = "15s"
}

# Grant the deploying role (LF admin) permission to create tables at this location
resource "aws_lakeformation_permissions" "admin_data_location" {
  principal   = var.lf_admin_role_arn
  permissions = ["DATA_LOCATION_ACCESS"]

  data_location {
    arn = aws_s3_bucket.datalake.arn
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

# -----------------------------------------------------------------------------
# Grants: Glue Job Role (writer)
# -----------------------------------------------------------------------------

resource "aws_lakeformation_permissions" "glue_trading_db" {
  principal   = aws_iam_role.glue_job.arn
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.trading.name
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

resource "aws_lakeformation_permissions" "glue_trading_tables" {
  principal   = aws_iam_role.glue_job.arn
  permissions = ["ALL"]

  table {
    database_name = aws_glue_catalog_database.trading.name
    wildcard      = true
  }

  depends_on = [aws_lakeformation_resource.datalake, aws_glue_catalog_table.trades]
}

resource "aws_lakeformation_permissions" "glue_risk_db" {
  principal   = aws_iam_role.glue_job.arn
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.risk.name
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

resource "aws_lakeformation_permissions" "glue_risk_tables" {
  principal   = aws_iam_role.glue_job.arn
  permissions = ["ALL"]

  table {
    database_name = aws_glue_catalog_database.risk.name
    wildcard      = true
  }

  depends_on = [aws_lakeformation_resource.datalake, aws_glue_catalog_table.exposures]
}

# -----------------------------------------------------------------------------
# Grants: ECS Task Role (backend — discovery only)
# -----------------------------------------------------------------------------

resource "aws_lakeformation_permissions" "ecs_trading_db" {
  count       = var.grant_ecs_permissions ? 1 : 0
  principal   = var.ecs_task_role_arn
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.trading.name
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

resource "aws_lakeformation_permissions" "ecs_trading_tables" {
  count       = var.grant_ecs_permissions ? 1 : 0
  principal   = var.ecs_task_role_arn
  permissions = ["DESCRIBE"]

  table {
    database_name = aws_glue_catalog_database.trading.name
    wildcard      = true
  }

  depends_on = [aws_lakeformation_resource.datalake, aws_glue_catalog_table.trades]
}

resource "aws_lakeformation_permissions" "ecs_risk_db" {
  count       = var.grant_ecs_permissions ? 1 : 0
  principal   = var.ecs_task_role_arn
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.risk.name
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

resource "aws_lakeformation_permissions" "ecs_risk_tables" {
  count       = var.grant_ecs_permissions ? 1 : 0
  principal   = var.ecs_task_role_arn
  permissions = ["DESCRIBE"]

  table {
    database_name = aws_glue_catalog_database.risk.name
    wildcard      = true
  }

  depends_on = [aws_lakeformation_resource.datalake, aws_glue_catalog_table.exposures]
}

# -----------------------------------------------------------------------------
# Grants: Data Lake Reader Role (MCP server / Athena)
# -----------------------------------------------------------------------------

resource "aws_lakeformation_permissions" "reader_trading_db" {
  principal   = aws_iam_role.datalake_reader.arn
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.trading.name
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

resource "aws_lakeformation_permissions" "reader_trading_tables" {
  principal   = aws_iam_role.datalake_reader.arn
  permissions = ["SELECT", "DESCRIBE"]

  table {
    database_name = aws_glue_catalog_database.trading.name
    wildcard      = true
  }

  depends_on = [aws_lakeformation_resource.datalake, aws_glue_catalog_table.trades]
}

resource "aws_lakeformation_permissions" "reader_risk_db" {
  principal   = aws_iam_role.datalake_reader.arn
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.risk.name
  }

  depends_on = [aws_lakeformation_resource.datalake]
}

resource "aws_lakeformation_permissions" "reader_risk_tables" {
  principal   = aws_iam_role.datalake_reader.arn
  permissions = ["SELECT", "DESCRIBE"]

  table {
    database_name = aws_glue_catalog_database.risk.name
    wildcard      = true
  }

  depends_on = [aws_lakeformation_resource.datalake, aws_glue_catalog_table.exposures]
}
