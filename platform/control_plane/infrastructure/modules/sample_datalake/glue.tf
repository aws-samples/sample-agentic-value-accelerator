# -----------------------------------------------------------------------------
# Glue Database: fsi_trading
# -----------------------------------------------------------------------------

resource "aws_glue_catalog_database" "trading" {
  name        = "fsi_trading"
  description = "Capital markets trading data — trades, orders, and market data"

  depends_on = [time_sleep.wait_for_lf, aws_lakeformation_permissions.admin_data_location]
}

resource "aws_glue_catalog_table" "trades" {
  database_name = aws_glue_catalog_database.trading.name
  name          = "trades"
  description   = "Executed trades across equities, fixed income, and derivatives"
  table_type    = "EXTERNAL_TABLE"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
    }
  }

  storage_descriptor {
    location = "s3://${aws_s3_bucket.datalake.id}/fsi_trading/trades/"

    columns {
      name = "trade_id"
      type = "string"
    }
    columns {
      name = "trade_date"
      type = "date"
    }
    columns {
      name = "settlement_date"
      type = "date"
    }
    columns {
      name = "symbol"
      type = "string"
    }
    columns {
      name = "asset_class"
      type = "string"
    }
    columns {
      name = "side"
      type = "string"
    }
    columns {
      name = "quantity"
      type = "int"
    }
    columns {
      name = "price"
      type = "double"
    }
    columns {
      name = "notional"
      type = "double"
    }
    columns {
      name = "currency"
      type = "string"
    }
    columns {
      name = "counterparty"
      type = "string"
    }
    columns {
      name = "trader_id"
      type = "string"
    }
    columns {
      name = "desk"
      type = "string"
    }
    columns {
      name = "status"
      type = "string"
    }
  }

  lifecycle {
    ignore_changes = [parameters, storage_descriptor]
  }
}

resource "aws_glue_catalog_table" "orders" {
  database_name = aws_glue_catalog_database.trading.name
  name          = "orders"
  description   = "Order book — submitted, filled, cancelled orders"
  table_type    = "EXTERNAL_TABLE"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
    }
  }

  storage_descriptor {
    location = "s3://${aws_s3_bucket.datalake.id}/fsi_trading/orders/"

    columns {
      name = "order_id"
      type = "string"
    }
    columns {
      name = "timestamp"
      type = "timestamp"
    }
    columns {
      name = "symbol"
      type = "string"
    }
    columns {
      name = "side"
      type = "string"
    }
    columns {
      name = "order_type"
      type = "string"
    }
    columns {
      name = "quantity"
      type = "int"
    }
    columns {
      name = "limit_price"
      type = "double"
    }
    columns {
      name = "filled_quantity"
      type = "int"
    }
    columns {
      name = "avg_fill_price"
      type = "double"
    }
    columns {
      name = "status"
      type = "string"
    }
    columns {
      name = "trader_id"
      type = "string"
    }
    columns {
      name = "desk"
      type = "string"
    }
    columns {
      name = "algo"
      type = "string"
    }
  }

  lifecycle {
    ignore_changes = [parameters, storage_descriptor]
  }
}

resource "aws_glue_catalog_table" "market_data" {
  database_name = aws_glue_catalog_database.trading.name
  name          = "market_data"
  description   = "End-of-day market data — OHLCV prices"
  table_type    = "EXTERNAL_TABLE"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
    }
  }

  storage_descriptor {
    location = "s3://${aws_s3_bucket.datalake.id}/fsi_trading/market_data/"

    columns {
      name = "date"
      type = "date"
    }
    columns {
      name = "symbol"
      type = "string"
    }
    columns {
      name = "open"
      type = "double"
    }
    columns {
      name = "high"
      type = "double"
    }
    columns {
      name = "low"
      type = "double"
    }
    columns {
      name = "close"
      type = "double"
    }
    columns {
      name = "volume"
      type = "bigint"
    }
    columns {
      name = "vwap"
      type = "double"
    }
    columns {
      name = "market_cap"
      type = "double"
    }
    columns {
      name = "sector"
      type = "string"
    }
  }

  lifecycle {
    ignore_changes = [parameters, storage_descriptor]
  }
}

# -----------------------------------------------------------------------------
# Glue Database: fsi_risk
# -----------------------------------------------------------------------------

resource "aws_glue_catalog_database" "risk" {
  name        = "fsi_risk"
  description = "Risk and compliance data — exposures, alerts, and transactions"

  depends_on = [time_sleep.wait_for_lf, aws_lakeformation_permissions.admin_data_location]
}

resource "aws_glue_catalog_table" "exposures" {
  database_name = aws_glue_catalog_database.risk.name
  name          = "exposures"
  description   = "Counterparty and sector exposure snapshots"
  table_type    = "EXTERNAL_TABLE"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
    }
  }

  storage_descriptor {
    location = "s3://${aws_s3_bucket.datalake.id}/fsi_risk/exposures/"

    columns {
      name = "snapshot_date"
      type = "date"
    }
    columns {
      name = "counterparty"
      type = "string"
    }
    columns {
      name = "sector"
      type = "string"
    }
    columns {
      name = "asset_class"
      type = "string"
    }
    columns {
      name = "gross_exposure"
      type = "double"
    }
    columns {
      name = "net_exposure"
      type = "double"
    }
    columns {
      name = "limit_amount"
      type = "double"
    }
    columns {
      name = "utilization_pct"
      type = "double"
    }
    columns {
      name = "rating"
      type = "string"
    }
    columns {
      name = "region"
      type = "string"
    }
  }

  lifecycle {
    ignore_changes = [parameters, storage_descriptor]
  }
}

resource "aws_glue_catalog_table" "alerts" {
  database_name = aws_glue_catalog_database.risk.name
  name          = "alerts"
  description   = "Compliance and AML alerts generated by monitoring systems"
  table_type    = "EXTERNAL_TABLE"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
    }
  }

  storage_descriptor {
    location = "s3://${aws_s3_bucket.datalake.id}/fsi_risk/alerts/"

    columns {
      name = "alert_id"
      type = "string"
    }
    columns {
      name = "created_at"
      type = "timestamp"
    }
    columns {
      name = "alert_type"
      type = "string"
    }
    columns {
      name = "severity"
      type = "string"
    }
    columns {
      name = "status"
      type = "string"
    }
    columns {
      name = "customer_id"
      type = "string"
    }
    columns {
      name = "account_id"
      type = "string"
    }
    columns {
      name = "amount"
      type = "double"
    }
    columns {
      name = "rule_name"
      type = "string"
    }
    columns {
      name = "description"
      type = "string"
    }
    columns {
      name = "assigned_to"
      type = "string"
    }
  }

  lifecycle {
    ignore_changes = [parameters, storage_descriptor]
  }
}

resource "aws_glue_catalog_table" "transactions" {
  database_name = aws_glue_catalog_database.risk.name
  name          = "transactions"
  description   = "Customer transactions for fraud detection and AML monitoring"
  table_type    = "EXTERNAL_TABLE"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
    }
  }

  storage_descriptor {
    location = "s3://${aws_s3_bucket.datalake.id}/fsi_risk/transactions/"

    columns {
      name = "transaction_id"
      type = "string"
    }
    columns {
      name = "timestamp"
      type = "timestamp"
    }
    columns {
      name = "customer_id"
      type = "string"
    }
    columns {
      name = "account_id"
      type = "string"
    }
    columns {
      name = "transaction_type"
      type = "string"
    }
    columns {
      name = "amount"
      type = "double"
    }
    columns {
      name = "currency"
      type = "string"
    }
    columns {
      name = "merchant"
      type = "string"
    }
    columns {
      name = "country"
      type = "string"
    }
    columns {
      name = "channel"
      type = "string"
    }
    columns {
      name = "risk_score"
      type = "double"
    }
    columns {
      name = "is_flagged"
      type = "boolean"
    }
  }

  lifecycle {
    ignore_changes = [parameters, storage_descriptor]
  }
}
