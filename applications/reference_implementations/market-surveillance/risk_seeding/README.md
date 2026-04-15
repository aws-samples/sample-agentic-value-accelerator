# Risk Analyst Database Seeding

Database seeding pipeline for the Risk Analyst financial risk early warning metrics system. Two-module architecture:

1. **`database_seeding`** — Load CSV files into PostgreSQL
2. **`db_ops`** — Database lifecycle management (create schema, clean, verify)

---

## Directory Structure

```
risk_seeding/
├── requirements.txt             # psycopg[binary], PyYAML, openpyxl
├── db_ops/
│   ├── db_init.py               # Create tables from YAML schema
│   ├── db_verify.py             # Inspect tables, columns, row counts
│   └── db_clean.py              # Truncate or drop tables
├── database_seeding/
│   ├── __main__.py              # Entry point (delegates to seed.main)
│   ├── seed.py                  # Main seeding orchestrator
│   ├── db_connection.py         # Connection manager with retry logic
│   ├── csv_loader.py            # CSV reader with type coercion
│   └── table_inserter.py        # Batch INSERT (1,000 rows/batch)
└── data/
    ├── dim_metric.csv           # 10 rows, 13 columns
    └── fact_history.csv         # 1,184 rows, 5 columns
```

---

## Prerequisites

Create a virtual environment and install dependencies:

```bash
cd risk_seeding
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

This installs:
- `psycopg[binary]` — PostgreSQL adapter
- `PyYAML` — YAML parser (used by `db_ops/db_init.py`)
- `openpyxl` — Excel reader (used by `data_schema/risk-plans/extract_data.py`)

> **Note:** All `python -m risk_seeding.*` commands must be run from the project root directory (the parent of `risk_seeding/`).

---

## Pre-existing Data

The repo includes pre-extracted CSV files in `data/` that are ready to use:

- `dim_metric.csv` — Metric dimension table (10 rows)
- `fact_history.csv` — Historical metric values (1,184 rows)

---

## Module 1: `database_seeding` — Load CSVs into PostgreSQL

Reads CSV files from a directory and inserts them into PostgreSQL tables in foreign-key dependency order (dimension tables first, then fact tables).

### Usage

```bash
# Load all CSVs into the database
python -m risk_seeding.database_seeding.seed \
    --input-dir ./risk_seeding/data \
    --database <database_name> --host localhost --port 5941 --user <username>

# Clear tables before loading (delete existing data first)
python -m risk_seeding.database_seeding.seed \
    --input-dir ./risk_seeding/data \
    --database <database_name> --clear
```

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--input-dir` | (required) | Directory containing CSV files |
| `--database` | `$DB_NAME` | PostgreSQL database name |
| `--host` | `$DB_HOST` or `localhost` | Database host |
| `--port` | `$DB_PORT` or `5432` | Database port |
| `--user` | `$DB_USER` or `postgres` | Database user |
| `--password` | `$DB_PASSWORD` | Database password |
| `--clear` | False | Truncate existing rows before loading |
| `--tables` | None | Load only specific tables (by DB table name) |
| `--dry-run` | False | Show plan without inserting |

### Set the Database Credentials

Retrieve the credentials from AWS Secrets Manager:

```bash
export DB_SECRET=$(aws secretsmanager get-secret-value --secret-id msp-db-dev --query SecretString --output text --region us-east-1)
export DB_PASSWORD=$(echo $DB_SECRET | jq -r '.PASSWORD')
export DB_NAME=$(echo $DB_SECRET | jq -r '.DBNAME')
export DB_USERNAME=$(echo $DB_SECRET | jq -r '.USERNAME')
```

---

## Module 2: `db_ops` — Database Lifecycle Management

Three utilities for managing the PostgreSQL database schema and data.

### `db_init` — Create Tables from Schema YAML

Reads the schema YAML file (`risk-agent-backend/configs/schema_config.yaml`) and generates DDL (CREATE TABLE, ALTER TABLE ADD CONSTRAINT).

```bash
# Create all tables
python -m risk_seeding.db_ops.db_init \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME

# Drop and recreate all tables
python -m risk_seeding.db_ops.db_init \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME --recreate
```

> **`--recreate` flag:** Drops all foreign keys and tables, then recreates them from the schema YAML. All existing data will be lost.

### `db_clean` — Truncate or Drop Tables

```bash
# Truncate all tables (preserve schema, delete data)
python -m risk_seeding.db_ops.db_clean \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME

# Drop all tables entirely
python -m risk_seeding.db_ops.db_clean \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME --drop
```

### `db_verify` — Inspect Schema and Data

```bash
# Show all tables with row counts
python -m risk_seeding.db_ops.db_verify \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME --counts

# Show details for a specific table
python -m risk_seeding.db_ops.db_verify \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME --table dim_metric
```

> **Tip:** Use `--no-ssl` with `db_init`, `db_verify`, and `db_clean` when connecting through the SSH tunnel to localhost.

---

## End-to-End Workflow

Typical workflow to set up the database from scratch:

```bash
# Step 1: Open the Risk Analyst Aurora tunnel (keep this terminal open)
make port-forward-risk

# Step 2 (separate terminal): Set the database credentials
export DB_SECRET=$(aws secretsmanager get-secret-value --secret-id msp-db-dev --query SecretString --output text --region us-east-1)
export DB_PASSWORD=$(echo $DB_SECRET | jq -r '.PASSWORD')
export DB_NAME=$(echo $DB_SECRET | jq -r '.DBNAME')
export DB_USERNAME=$(echo $DB_SECRET | jq -r '.USERNAME')

# Step 3: Create database schema (tables + foreign keys)
python -m risk_seeding.db_ops.db_init \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME

# Step 4: Load pre-existing CSVs into the database
python -m risk_seeding.database_seeding.seed \
    --input-dir ./risk_seeding/data \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME

# Step 5: Verify the loaded data
python -m risk_seeding.db_ops.db_verify \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME --counts
```

To reset and re-seed:

```bash
python -m risk_seeding.db_ops.db_init \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME --recreate
python -m risk_seeding.database_seeding.seed \
    --input-dir ./risk_seeding/data \
    --database $DB_NAME --host localhost --port 5941 --user $DB_USERNAME
```

### Port Forwarding (Aurora)

The Risk Analyst Aurora PostgreSQL database runs inside a private VPC subnet. To connect locally, the project uses an EC2 Instance Connect bastion host that tunnels traffic.

```
Local machine ──(localhost:5941)──> Bastion Host ──(private subnet)──> Risk Analyst Aurora PostgreSQL :5432
```

From the project root:

```bash
make port-forward-risk
```

This opens a tunnel from `localhost:5941` to Aurora port `5432`. Keep this terminal session open.

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region |
| `APP_NAME` | `market-surveillance` | Application name (used to find bastion host and RDS cluster) |
| `ENV_NAME` | `dev` | Environment name |
| `LOCAL_PORT` | `5941` | Local port to bind the tunnel to |

---

## Data Summary

| Table | Rows | Key Columns |
|-------|------|-------------|
| `dim_metric` | 10 | `metric_id` (PK), `metric_name`, `unit`, `entity`, `trigger_type`, `threshold_value` |
| `fact_history` | 1,184 | `metric_id` (FK → dim_metric), `cob_date`, `value` |

Schema source: `risk-agent-backend/configs/schema_config.yaml`
Data source: `risk-data-schema.xlsx`

## Notes

- All DB connections default to `sslmode=require`. Use `--no-ssl` (available on `db_init`, `db_verify`, `db_clean`) when connecting through the SSH tunnel to localhost.
- Batch insert size is 1,000 rows per statement.
- `fact_history.metric_id` references `dim_metric.metric_id` — the scripts handle insertion ordering automatically (dim tables first, then fact tables).
- The Risk Analyst database uses local port `5941` to avoid conflicts with the market surveillance tunnel on port `5940`.
