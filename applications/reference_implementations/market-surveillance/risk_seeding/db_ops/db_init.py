#!/usr/bin/env python3
"""
Database Initialization Script for financial_risk Database.

Generates and executes DDL statements from YAML schema file.
Tables are created in dependency order across 2 levels.
"""

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

# =============================================================================
# CONFIGURATION & CONSTANTS
# =============================================================================

# Data type mapping from YAML to PostgreSQL
DATA_TYPE_MAPPING = {
    "Alphanumeric": "VARCHAR(255)",
    "Text": "TEXT",
    "Integer": "INTEGER",
    "DateTime": "TIMESTAMP",
    "Time": "TIME",
    "Decimal(18,2)": "NUMERIC(18,2)",
    "Currency": "NUMERIC(18,4)",
    "Boolean": "BOOLEAN",
}

# Table creation order by level (tables at same level have no interdependencies)
TABLE_LEVELS = {
    1: ["dim_metric"],
    2: ["fact_history"],
}

# Default schema file path (relative to this script)
DEFAULT_SCHEMA_FILE = Path(__file__).parent.parent.parent / "risk-agent-backend" / "configs" / "schema_config.yaml"


# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass
class CompositeForeignKeyDef:
    """Composite foreign key definition (multiple columns)."""

    columns: list[str]
    referenced_table: str
    referenced_columns: list[str]
    purpose: str = ""


@dataclass
class ForeignKeyDef:
    """Foreign key definition."""

    referenced_table: str
    referenced_column: str
    cardinality: str
    purpose: str


@dataclass
class ColumnDef:
    """Column definition."""

    name: str
    data_type: str
    primary_key: bool = False
    nullable: bool = True
    description: str = ""
    foreign_keys: list[ForeignKeyDef] = field(default_factory=list)


@dataclass
class TableDef:
    """Table definition."""

    name: str
    table_type: str
    purpose: str
    description: str
    columns: list[ColumnDef] = field(default_factory=list)
    composite_foreign_keys: list[CompositeForeignKeyDef] = field(default_factory=list)


# =============================================================================
# YAML SCHEMA PARSER
# =============================================================================


class YAMLSchemaParser:
    """Parser for YAML schema configuration files."""

    def __init__(self, schema_path: Path):
        self.schema_path = schema_path
        self._schema_data: Optional[dict] = None

    def parse(self) -> list[TableDef]:
        """Parse the YAML schema and return list of TableDef objects."""
        with open(self.schema_path, "r", encoding="utf-8") as f:
            self._schema_data = yaml.safe_load(f)

        tables = []
        for table_data in self._schema_data.get("tables", []):
            table_def = self._parse_table(table_data)
            tables.append(table_def)

        return tables

    def _parse_table(self, table_data: dict) -> TableDef:
        """Parse a single table definition."""
        columns = []
        for col_data in table_data.get("schema", []):
            column = self._parse_column(col_data)
            columns.append(column)

        composite_fks = []
        for cfk_data in table_data.get("composite_foreign_keys", []):
            cfk = CompositeForeignKeyDef(
                columns=cfk_data.get("columns", []),
                referenced_table=cfk_data.get("referenced_table", ""),
                referenced_columns=cfk_data.get("referenced_columns", []),
                purpose=cfk_data.get("purpose", ""),
            )
            composite_fks.append(cfk)

        return TableDef(
            name=table_data.get("name", ""),
            table_type=table_data.get("type", ""),
            purpose=table_data.get("purpose", ""),
            description=table_data.get("description", ""),
            columns=columns,
            composite_foreign_keys=composite_fks,
        )

    def _parse_column(self, col_data: dict) -> ColumnDef:
        """Parse a single column definition."""
        foreign_keys = []
        for fk_data in col_data.get("foreign_keys", []):
            fk = self._parse_foreign_key(fk_data)
            foreign_keys.append(fk)

        return ColumnDef(
            name=col_data.get("column", ""),
            data_type=col_data.get("data_type", "Alphanumeric"),
            primary_key=col_data.get("primary_key", False),
            nullable=col_data.get("nullable", True),
            description=col_data.get("description", ""),
            foreign_keys=foreign_keys,
        )

    def _parse_foreign_key(self, fk_data: dict) -> ForeignKeyDef:
        """Parse a foreign key reference."""
        references = fk_data.get("references", "")
        # Format: "TableName.ColumnName"
        if "." in references:
            table, column = references.split(".", 1)
        else:
            table = references
            column = ""

        return ForeignKeyDef(
            referenced_table=table,
            referenced_column=column,
            cardinality=fk_data.get("cardinality", ""),
            purpose=fk_data.get("purpose", ""),
        )


# =============================================================================
# DDL GENERATOR
# =============================================================================


class DDLGenerator:
    """Generates PostgreSQL DDL statements from table definitions."""

    # Characters that require quoting in PostgreSQL identifiers
    SPECIAL_CHARS_PATTERN = re.compile(r"[^a-zA-Z0-9_]")

    def __init__(self):
        pass

    def generate_create_table(self, table: TableDef) -> str:
        """Generate CREATE TABLE statement for a table definition."""
        table_name = self._quote_identifier(table.name)
        column_defs = []
        primary_keys = []

        for col in table.columns:
            col_def = self._generate_column_def(col)
            column_defs.append(col_def)
            if col.primary_key:
                primary_keys.append(self._quote_identifier(col.name))

        # Build the CREATE TABLE statement
        lines = [f"CREATE TABLE IF NOT EXISTS {table_name} ("]

        # Add column definitions
        for i, col_def in enumerate(column_defs):
            separator = "," if i < len(column_defs) - 1 or primary_keys else ""
            lines.append(f"    {col_def}{separator}")

        # Add primary key constraint if any
        if primary_keys:
            pk_cols = ", ".join(primary_keys)
            lines.append(f"    PRIMARY KEY ({pk_cols})")

        lines.append(");")

        return "\n".join(lines)

    def generate_drop_table(self, table_name: str) -> str:
        """Generate DROP TABLE statement."""
        quoted_name = self._quote_identifier(table_name)
        return f"DROP TABLE IF EXISTS {quoted_name} CASCADE;"

    def _generate_column_def(self, column: ColumnDef) -> str:
        """Generate column definition string."""
        col_name = self._quote_identifier(column.name)
        pg_type = DATA_TYPE_MAPPING.get(column.data_type, "VARCHAR(255)")

        parts = [col_name, pg_type]

        if not column.nullable:
            parts.append("NOT NULL")

        return " ".join(parts)

    def generate_foreign_key_constraints(self, table: TableDef) -> list[str]:
        """Generate ALTER TABLE statements for foreign key constraints."""
        constraints = []
        table_name = self._quote_identifier(table.name)

        # Single-column foreign keys
        for col in table.columns:
            for fk in col.foreign_keys:
                if not fk.referenced_table or not fk.referenced_column:
                    continue

                norm_table = re.sub(r"[^a-zA-Z0-9]", "_", table.name.lower())
                norm_col = re.sub(r"[^a-zA-Z0-9]", "_", col.name.lower())
                norm_ref_table = re.sub(r"[^a-zA-Z0-9]", "_", fk.referenced_table.lower())
                constraint_name = f"fk_{norm_table}_{norm_col}_{norm_ref_table}"

                col_name = self._quote_identifier(col.name)
                ref_table = self._quote_identifier(fk.referenced_table)
                ref_col = self._quote_identifier(fk.referenced_column)

                stmt = (
                    f"ALTER TABLE {table_name}\n"
                    f"ADD CONSTRAINT {constraint_name}\n"
                    f"FOREIGN KEY ({col_name}) REFERENCES {ref_table}({ref_col});"
                )
                constraints.append(stmt)

        # Composite foreign keys
        for cfk in table.composite_foreign_keys:
            if not cfk.referenced_table or not cfk.referenced_columns:
                continue

            norm_table = re.sub(r"[^a-zA-Z0-9]", "_", table.name.lower())
            norm_cols = "_".join(re.sub(r"[^a-zA-Z0-9]", "_", c.lower()) for c in cfk.columns)
            norm_ref_table = re.sub(r"[^a-zA-Z0-9]", "_", cfk.referenced_table.lower())
            constraint_name = f"fk_{norm_table}_{norm_cols}_{norm_ref_table}"

            col_names = ", ".join(self._quote_identifier(c) for c in cfk.columns)
            ref_table = self._quote_identifier(cfk.referenced_table)
            ref_cols = ", ".join(self._quote_identifier(c) for c in cfk.referenced_columns)

            stmt = (
                f"ALTER TABLE {table_name}\n"
                f"ADD CONSTRAINT {constraint_name}\n"
                f"FOREIGN KEY ({col_names}) REFERENCES {ref_table}({ref_cols});"
            )
            constraints.append(stmt)

        return constraints

    def generate_drop_foreign_key(self, table_name: str, column_name: str, ref_table_name: str) -> str:
        """Generate DROP CONSTRAINT statement for a foreign key."""
        norm_table = re.sub(r"[^a-zA-Z0-9]", "_", table_name.lower())
        norm_col = re.sub(r"[^a-zA-Z0-9]", "_", column_name.lower())
        norm_ref = re.sub(r"[^a-zA-Z0-9]", "_", ref_table_name.lower())
        constraint_name = f"fk_{norm_table}_{norm_col}_{norm_ref}"
        quoted_table = self._quote_identifier(table_name)

        return f"ALTER TABLE {quoted_table} DROP CONSTRAINT IF EXISTS {constraint_name};"

    def _quote_identifier(self, identifier: str) -> str:
        """Quote identifier if it contains special characters or is a reserved word."""
        if not identifier:
            return '""'

        # Always quote if contains special characters (spaces, dashes, etc.)
        if self.SPECIAL_CHARS_PATTERN.search(identifier):
            escaped = identifier.replace('"', '""')
            return f'"{escaped}"'

        # PostgreSQL reserved words that need quoting (common ones)
        reserved_words = {
            "user",
            "order",
            "table",
            "index",
            "group",
            "select",
            "where",
            "from",
            "to",
            "date",
            "time",
            "timestamp",
            "type",
            "state",
            "role",
            "name",
        }

        if identifier.lower() in reserved_words:
            return f'"{identifier}"'

        return identifier


# =============================================================================
# DATABASE MANAGER
# =============================================================================


class DatabaseManager:
    """Manages PostgreSQL database connections and executions."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        database: str = "",
        user: str = "postgres",
        sslmode: str = "require",
    ):
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.sslmode = sslmode
        self._connection = None

    def connect(self) -> bool:
        """Establish database connection."""
        try:
            import psycopg

            password = self._get_password()
            self._connection = psycopg.connect(
                host=self.host,
                port=self.port,
                dbname=self.database,
                user=self.user,
                password=password,
                sslmode=self.sslmode,
            )
            self._connection.autocommit = False
            return True
        except ImportError:
            print("Error: psycopg not installed. Run: pip install psycopg[binary]")
            return False
        except Exception as e:
            print(f"Error connecting to database: {e}")
            return False

    def close(self):
        """Close database connection."""
        if self._connection:
            self._connection.close()
            self._connection = None

    def execute(self, sql: str, commit: bool = False) -> bool:
        """Execute SQL statement with optional commit."""
        if not self._connection:
            print("Error: Not connected to database")
            return False

        try:
            cursor = self._connection.cursor()
            cursor.execute(sql)
            if commit:
                self._connection.commit()
            cursor.close()
            return True
        except Exception as e:
            print(f"Error executing SQL: {e}")
            self._connection.rollback()
            return False

    def commit(self):
        """Commit current transaction."""
        if self._connection:
            self._connection.commit()

    def rollback(self):
        """Rollback current transaction."""
        if self._connection:
            self._connection.rollback()

    def table_exists(self, table_name: str) -> bool:
        """Check if a table exists in the database."""
        if not self._connection:
            return False
        try:
            cursor = self._connection.cursor()
            cursor.execute(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)",
                (table_name,)
            )
            result = cursor.fetchone()[0]
            cursor.close()
            return result
        except Exception:
            return False

    def _get_password(self) -> str:
        """Get database password from environment variable."""
        return os.environ.get("DB_PASSWORD", "")


# =============================================================================
# TABLE CREATOR
# =============================================================================


class TableCreator:
    """Creates tables in the correct dependency order."""

    def __init__(
        self,
        tables: list[TableDef],
        ddl_generator: DDLGenerator,
        db_manager: Optional[DatabaseManager] = None,
    ):
        self.tables = {t.name: t for t in tables}
        self.ddl_generator = ddl_generator
        self.db_manager = db_manager

    def get_table_level(self, table_name: str) -> int:
        """Get the level for a table based on TABLE_LEVELS config."""
        for level, table_list in TABLE_LEVELS.items():
            if table_name in table_list:
                return level
        # Unknown tables go to the last level
        return max(TABLE_LEVELS.keys()) + 1

    def get_tables_by_level(self, max_level: Optional[int] = None) -> dict[int, list[str]]:
        """Get tables organized by level, up to max_level if specified."""
        result = {}
        for level in sorted(TABLE_LEVELS.keys()):
            if max_level is not None and level > max_level:
                break
            result[level] = TABLE_LEVELS[level]
        return result

    def generate_all_ddl(self, max_level: Optional[int] = None) -> str:
        """Generate all DDL statements in order."""
        ddl_statements = []
        tables_by_level = self.get_tables_by_level(max_level)

        ddl_statements.append("-- ============================================")
        ddl_statements.append("-- financial_risk Database DDL")
        ddl_statements.append("-- Generated by db_init.py")
        ddl_statements.append("-- ============================================")
        ddl_statements.append("")

        for level in sorted(tables_by_level.keys()):
            table_names = tables_by_level[level]
            ddl_statements.append(f"-- Level {level}: {len(table_names)} tables")
            ddl_statements.append(f"-- Tables: {', '.join(table_names)}")
            ddl_statements.append("")

            for table_name in table_names:
                if table_name in self.tables:
                    table_def = self.tables[table_name]
                    ddl = self.ddl_generator.generate_create_table(table_def)
                    ddl_statements.append(f"-- Table: {table_name}")
                    ddl_statements.append(ddl)
                    ddl_statements.append("")
                else:
                    ddl_statements.append(f"-- WARNING: Table {table_name} not found in schema")
                    ddl_statements.append("")

        return "\n".join(ddl_statements)

    def generate_drop_ddl(self, max_level: Optional[int] = None) -> str:
        """Generate DROP TABLE statements in reverse order."""
        ddl_statements = []
        tables_by_level = self.get_tables_by_level(max_level)

        ddl_statements.append("-- ============================================")
        ddl_statements.append("-- DROP TABLES (reverse dependency order)")
        ddl_statements.append("-- ============================================")
        ddl_statements.append("")

        # Reverse level order for dropping
        for level in sorted(tables_by_level.keys(), reverse=True):
            table_names = tables_by_level[level]
            ddl_statements.append(f"-- Level {level}")

            for table_name in table_names:
                ddl = self.ddl_generator.generate_drop_table(table_name)
                ddl_statements.append(ddl)

            ddl_statements.append("")

        return "\n".join(ddl_statements)

    def generate_all_fk_ddl(self, max_level: Optional[int] = None) -> str:
        """Generate all foreign key constraint DDL statements."""
        ddl_statements = []
        tables_by_level = self.get_tables_by_level(max_level)

        ddl_statements.append("")
        ddl_statements.append("-- ============================================")
        ddl_statements.append("-- FOREIGN KEY CONSTRAINTS")
        ddl_statements.append("-- ============================================")
        ddl_statements.append("")

        fk_count = 0
        for level in sorted(tables_by_level.keys()):
            table_names = tables_by_level[level]

            for table_name in table_names:
                if table_name in self.tables:
                    table_def = self.tables[table_name]
                    fk_constraints = self.ddl_generator.generate_foreign_key_constraints(table_def)
                    if fk_constraints:
                        ddl_statements.append(f"-- Foreign keys for: {table_name}")
                        for fk_ddl in fk_constraints:
                            ddl_statements.append(fk_ddl)
                            fk_count += 1
                        ddl_statements.append("")

        if fk_count == 0:
            ddl_statements.append("-- No foreign key constraints defined")
            ddl_statements.append("")

        return "\n".join(ddl_statements)

    def generate_drop_fk_ddl(self, max_level: Optional[int] = None) -> str:
        """Generate DROP CONSTRAINT statements for all foreign keys."""
        ddl_statements = []
        tables_by_level = self.get_tables_by_level(max_level)

        ddl_statements.append("-- ============================================")
        ddl_statements.append("-- DROP FOREIGN KEY CONSTRAINTS")
        ddl_statements.append("-- ============================================")
        ddl_statements.append("")

        # Drop FKs in reverse level order (higher levels first)
        for level in sorted(tables_by_level.keys(), reverse=True):
            table_names = tables_by_level[level]

            for table_name in table_names:
                if table_name in self.tables:
                    table_def = self.tables[table_name]
                    for col in table_def.columns:
                        for fk in col.foreign_keys:
                            if fk.referenced_table and fk.referenced_column:
                                ddl = self.ddl_generator.generate_drop_foreign_key(
                                    table_name, col.name, fk.referenced_table
                                )
                                ddl_statements.append(ddl)

                    # Composite foreign keys
                    for cfk in table_def.composite_foreign_keys:
                        if cfk.referenced_table and cfk.referenced_columns:
                            norm_table = re.sub(r"[^a-zA-Z0-9]", "_", table_name.lower())
                            norm_cols = "_".join(re.sub(r"[^a-zA-Z0-9]", "_", c.lower()) for c in cfk.columns)
                            norm_ref = re.sub(r"[^a-zA-Z0-9]", "_", cfk.referenced_table.lower())
                            constraint_name = f"fk_{norm_table}_{norm_cols}_{norm_ref}"
                            quoted_table = self.ddl_generator._quote_identifier(table_name)
                            ddl = f"ALTER TABLE {quoted_table} DROP CONSTRAINT IF EXISTS {constraint_name};"
                            ddl_statements.append(ddl)

        ddl_statements.append("")
        return "\n".join(ddl_statements)

    def create_all_foreign_keys(
        self,
        max_level: Optional[int] = None,
        dry_run: bool = False,
        continue_on_error: bool = False,
    ) -> bool:
        """Create all foreign key constraints after tables exist."""
        tables_by_level = self.get_tables_by_level(max_level)
        success = True
        fk_count = 0

        print("\n=== Creating Foreign Key Constraints ===")

        for level in sorted(tables_by_level.keys()):
            table_names = tables_by_level[level]

            for table_name in table_names:
                if table_name not in self.tables:
                    continue

                table_def = self.tables[table_name]
                fk_constraints = self.ddl_generator.generate_foreign_key_constraints(table_def)

                for fk_ddl in fk_constraints:
                    constraint_match = re.search(r"ADD CONSTRAINT (\w+)", fk_ddl)
                    constraint_name = constraint_match.group(1) if constraint_match else "unknown"

                    if dry_run:
                        print(f"  [DRY RUN] Would create FK: {constraint_name}")
                    else:
                        print(f"  Creating FK: {constraint_name}...", end=" ")
                        if self.db_manager:
                            if self.db_manager.execute(fk_ddl):
                                print("OK")
                                fk_count += 1
                            else:
                                print("FAILED")
                                success = False
                                if not continue_on_error:
                                    return False

        if not dry_run and self.db_manager and success:
            self.db_manager.commit()
            print(f"  Foreign key constraints committed. ({fk_count} created)")
        elif not dry_run and self.db_manager and not success:
            self.db_manager.rollback()
            print("  Foreign key constraints rolled back due to errors.")

        return success

    def drop_all_foreign_keys(
        self,
        max_level: Optional[int] = None,
        dry_run: bool = False,
        continue_on_error: bool = False,
    ) -> bool:
        """Drop all foreign key constraints before dropping tables."""
        tables_by_level = self.get_tables_by_level(max_level)
        success = True

        print("\n=== Dropping Foreign Key Constraints ===")

        for level in sorted(tables_by_level.keys(), reverse=True):
            table_names = tables_by_level[level]

            for table_name in table_names:
                if table_name not in self.tables:
                    continue

                if not dry_run and self.db_manager and not self.db_manager.table_exists(table_name):
                    print(f"  Skipping FK drops for {table_name} (table does not exist)")
                    continue

                table_def = self.tables[table_name]
                for col in table_def.columns:
                    for fk in col.foreign_keys:
                        if not fk.referenced_table or not fk.referenced_column:
                            continue

                        ddl = self.ddl_generator.generate_drop_foreign_key(table_name, col.name, fk.referenced_table)
                        norm_table = re.sub(r"[^a-zA-Z0-9]", "_", table_name.lower())
                        norm_col = re.sub(r"[^a-zA-Z0-9]", "_", col.name.lower())
                        norm_ref = re.sub(r"[^a-zA-Z0-9]", "_", fk.referenced_table.lower())
                        constraint_name = f"fk_{norm_table}_{norm_col}_{norm_ref}"

                        if dry_run:
                            print(f"  [DRY RUN] Would drop FK: {constraint_name}")
                        else:
                            print(f"  Dropping FK: {constraint_name}...", end=" ")
                            if self.db_manager:
                                if self.db_manager.execute(ddl):
                                    print("OK")
                                else:
                                    print("FAILED")
                                    success = False
                                    if not continue_on_error:
                                        return False

                # Composite foreign keys
                for cfk in table_def.composite_foreign_keys:
                    if not cfk.referenced_table or not cfk.referenced_columns:
                        continue

                    norm_table = re.sub(r"[^a-zA-Z0-9]", "_", table_name.lower())
                    norm_cols = "_".join(re.sub(r"[^a-zA-Z0-9]", "_", c.lower()) for c in cfk.columns)
                    norm_ref = re.sub(r"[^a-zA-Z0-9]", "_", cfk.referenced_table.lower())
                    constraint_name = f"fk_{norm_table}_{norm_cols}_{norm_ref}"
                    quoted_table = self.ddl_generator._quote_identifier(table_name)
                    ddl = f"ALTER TABLE {quoted_table} DROP CONSTRAINT IF EXISTS {constraint_name};"

                    if dry_run:
                        print(f"  [DRY RUN] Would drop composite FK: {constraint_name}")
                    else:
                        print(f"  Dropping composite FK: {constraint_name}...", end=" ")
                        if self.db_manager:
                            if self.db_manager.execute(ddl):
                                print("OK")
                            else:
                                print("FAILED")
                                success = False
                                if not continue_on_error:
                                    return False

        if not dry_run and self.db_manager and success:
            self.db_manager.commit()
            print("  Foreign key drops committed.")
        elif not dry_run and self.db_manager and not success:
            self.db_manager.rollback()
            print("  Foreign key drops rolled back due to errors.")

        return success

    def create_all_tables(
        self,
        max_level: Optional[int] = None,
        dry_run: bool = False,
        continue_on_error: bool = False,
    ) -> bool:
        """Create all tables in dependency order."""
        tables_by_level = self.get_tables_by_level(max_level)
        success = True

        for level in sorted(tables_by_level.keys()):
            table_names = tables_by_level[level]
            print(f"\n=== Level {level}: Creating {len(table_names)} tables ===")

            level_success = True
            for table_name in table_names:
                if table_name not in self.tables:
                    print(f"  WARNING: {table_name} not found in schema, skipping")
                    continue

                table_def = self.tables[table_name]
                ddl = self.ddl_generator.generate_create_table(table_def)

                if dry_run:
                    print(f"  [DRY RUN] Would create: {table_name}")
                else:
                    print(f"  Creating: {table_name}...", end=" ")
                    if self.db_manager:
                        if self.db_manager.execute(ddl):
                            print("OK")
                        else:
                            print("FAILED")
                            level_success = False
                            if not continue_on_error:
                                return False

            # Commit after each level
            if not dry_run and self.db_manager and level_success:
                self.db_manager.commit()
                print(f"  Level {level} committed.")
            elif not dry_run and self.db_manager and not level_success:
                self.db_manager.rollback()
                print(f"  Level {level} rolled back due to errors.")
                success = False

        return success

    def drop_all_tables(
        self,
        max_level: Optional[int] = None,
        dry_run: bool = False,
        continue_on_error: bool = False,
    ) -> bool:
        """Drop all tables in reverse dependency order."""
        tables_by_level = self.get_tables_by_level(max_level)
        success = True

        # Reverse level order for dropping
        for level in sorted(tables_by_level.keys(), reverse=True):
            table_names = tables_by_level[level]
            print(f"\n=== Level {level}: Dropping {len(table_names)} tables ===")

            level_success = True
            for table_name in table_names:
                ddl = self.ddl_generator.generate_drop_table(table_name)

                if dry_run:
                    print(f"  [DRY RUN] Would drop: {table_name}")
                else:
                    print(f"  Dropping: {table_name}...", end=" ")
                    if self.db_manager:
                        if self.db_manager.execute(ddl):
                            print("OK")
                        else:
                            print("FAILED")
                            level_success = False
                            if not continue_on_error:
                                return False

            # Commit after each level
            if not dry_run and self.db_manager and level_success:
                self.db_manager.commit()
                print(f"  Level {level} committed.")
            elif not dry_run and self.db_manager and not level_success:
                self.db_manager.rollback()
                print(f"  Level {level} rolled back due to errors.")
                success = False

        return success


# =============================================================================
# CLI
# =============================================================================


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Initialize financial_risk database from YAML schema",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Create all tables with foreign keys (requires database connection)
  python db_init.py --database mydb

  # Dry run - show what would be created (includes FK constraints)
  python db_init.py --dry-run

  # Create tables without foreign key constraints
  python db_init.py --database mydb --no-fk

  # Export DDL to file (includes FK constraints)
  python db_init.py --export-ddl output.sql

  # Drop and recreate all tables
  python db_init.py --database mydb --recreate

  # Override connection settings
  python db_init.py --host localhost --port 5432 --database mydb --user postgres

Environment Variables:
  DB_HOST      PostgreSQL host (default: localhost)
  DB_PORT      PostgreSQL port (default: 5432)
  DB_NAME      Database name
  DB_USER      Database user (default: postgres)
  DB_PASSWORD  Database password
        """,
    )

    parser.add_argument(
        "--schema",
        type=Path,
        default=DEFAULT_SCHEMA_FILE,
        help="Path to YAML schema file",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show DDL without executing",
    )
    parser.add_argument(
        "--level",
        type=int,
        choices=range(1, 3),
        metavar="N",
        help="Create tables up to level N (1-2)",
    )
    parser.add_argument(
        "--export-ddl",
        type=Path,
        metavar="FILE",
        help="Export DDL statements to file",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Drop and recreate tables",
    )
    parser.add_argument(
        "--drop-only",
        action="store_true",
        help="Only drop tables (no creation)",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue on errors during batch operations",
    )
    parser.add_argument(
        "--no-fk",
        action="store_true",
        help="Skip foreign key constraint creation (tables only)",
    )

    # Database connection overrides
    parser.add_argument(
        "--host",
        default=os.environ.get("DB_HOST", "localhost"),
        help="Database host (default: localhost or DB_HOST env)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("DB_PORT", "5432")),
        help="Database port (default: 5432 or DB_PORT env)",
    )
    parser.add_argument(
        "--database",
        default=os.environ.get("DB_NAME", ""),
        help="Database name (default: DB_NAME env)",
    )
    parser.add_argument(
        "--user",
        default=os.environ.get("DB_USER", "postgres"),
        help="Database user (default: postgres or DB_USER env)",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("DB_PASSWORD", ""),
        help="Database password (default: from DB_PASSWORD env var)",
    )
    parser.add_argument(
        "--no-ssl",
        action="store_true",
        help="Disable SSL (use when connecting through SSH tunnel to localhost)",
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    # Check schema file exists
    if not args.schema.exists():
        print(f"Error: Schema file not found: {args.schema}")
        sys.exit(1)

    print(f"Parsing schema: {args.schema}")

    # Parse schema
    parser = YAMLSchemaParser(args.schema)
    tables = parser.parse()
    print(f"Found {len(tables)} tables in schema")

    # Create DDL generator and table creator
    ddl_generator = DDLGenerator()
    db_manager = None

    # Only connect if not dry-run and not export-only
    needs_connection = not args.dry_run and not args.export_ddl
    if needs_connection:
        if not args.database:
            print("Error: Database name required. Use --database or set DB_NAME env var")
            sys.exit(1)

        db_manager = DatabaseManager(
            host=args.host,
            port=args.port,
            database=args.database,
            user=args.user,
            sslmode="disable" if args.no_ssl else "require",
        )

        if not db_manager.connect():
            sys.exit(1)

        print(f"Connected to {args.user}@{args.host}:{args.port}/{args.database}")

    table_creator = TableCreator(tables, ddl_generator, db_manager)

    try:
        # Export DDL to file
        if args.export_ddl:
            ddl_parts = []

            if args.recreate or args.drop_only:
                ddl_parts.append(table_creator.generate_drop_fk_ddl(args.level))
                ddl_parts.append(table_creator.generate_drop_ddl(args.level))

            if not args.drop_only:
                ddl_parts.append(table_creator.generate_all_ddl(args.level))
                if not args.no_fk:
                    ddl_parts.append(table_creator.generate_all_fk_ddl(args.level))

            ddl = "\n".join(ddl_parts)
            with open(args.export_ddl, "w", encoding="utf-8") as f:
                f.write(ddl)
            print(f"\nDDL exported to: {args.export_ddl}")
            return

        # Dry run - just print the DDL
        if args.dry_run:
            print("\n=== DRY RUN MODE ===")
            if args.recreate or args.drop_only:
                print("\n--- DROP FK CONSTRAINTS ---")
                table_creator.drop_all_foreign_keys(args.level, dry_run=True)
                print("\n--- DROP TABLES ---")
                table_creator.drop_all_tables(args.level, dry_run=True)

            if not args.drop_only:
                print("\n--- CREATE TABLES ---")
                table_creator.create_all_tables(args.level, dry_run=True)
                if not args.no_fk:
                    print("\n--- CREATE FK CONSTRAINTS ---")
                    table_creator.create_all_foreign_keys(args.level, dry_run=True)

            print("\n--- FULL DDL ---")
            ddl = table_creator.generate_all_ddl(args.level)
            if not args.no_fk:
                ddl += table_creator.generate_all_fk_ddl(args.level)
            print(ddl)
            return

        # Execute DDL
        success = True

        if args.recreate or args.drop_only:
            # Drop FK constraints first, then tables
            success = table_creator.drop_all_foreign_keys(
                args.level,
                continue_on_error=args.continue_on_error,
            )
            if success or args.continue_on_error:
                success = table_creator.drop_all_tables(
                    args.level,
                    continue_on_error=args.continue_on_error,
                ) and success

        if success and not args.drop_only:
            print("\n=== Creating Tables ===")
            success = table_creator.create_all_tables(
                args.level,
                continue_on_error=args.continue_on_error,
            )

            # Create FK constraints after tables (unless --no-fk)
            if success and not args.no_fk:
                fk_success = table_creator.create_all_foreign_keys(
                    args.level,
                    continue_on_error=args.continue_on_error,
                )
                success = success and fk_success

        if success:
            print("\n=== Complete ===")
        else:
            print("\n=== Completed with errors ===")
            sys.exit(1)

    finally:
        if db_manager:
            db_manager.close()


if __name__ == "__main__":
    main()
