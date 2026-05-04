#!/usr/bin/env python3
"""
Database Cleaning Script

Truncates all data from the market surveillance database tables while preserving
the schema structure. This allows for clean re-seeding of data.

Usage:
    python db_clean.py --database mydb [--host localhost] [--port 5432] [--user postgres]

Environment Variables:
    DB_PASSWORD - Database password (required)
"""

import argparse
import os
import sys
import psycopg
from psycopg import sql


def get_db_connection(host: str, port: int, database: str, user: str, password: str):
    """Create database connection"""
    try:
        conn = psycopg.connect(
            host=host,
            port=port,
            dbname=database,
            user=user,
            password=password
        )
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)


def get_all_tables(cursor) -> list:
    """Get all user tables in the database"""
    cursor.execute("""
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    """)
    return [row[0] for row in cursor.fetchall()]


def truncate_tables(conn, tables: list, cascade: bool = True):
    """Truncate all tables"""
    cursor = conn.cursor()
    
    print(f"\nFound {len(tables)} tables to clean:")
    for table in tables:
        print(f"  - {table}")
    
    print("\nTruncating tables...")
    
    try:
        # Disable foreign key checks temporarily
        cursor.execute("SET session_replication_role = 'replica';")
        
        # Truncate each table
        for table in tables:
            try:
                if cascade:
                    # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
                    cursor.execute(sql.SQL("TRUNCATE TABLE {} CASCADE").format(sql.Identifier(table)))
                else:
                    # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
                    cursor.execute(sql.SQL("TRUNCATE TABLE {}").format(sql.Identifier(table)))
                print(f"  ✓ Truncated {table}")
            except Exception as e:
                print(f"  ✗ Error truncating {table}: {e}")
        
        # Re-enable foreign key checks
        cursor.execute("SET session_replication_role = 'origin';")
        
        conn.commit()
        print("\n✓ All tables truncated successfully")
        
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Error during truncation: {e}")
        sys.exit(1)
    finally:
        cursor.close()


def drop_tables(conn, tables: list):
    """Drop all tables (more aggressive cleanup)"""
    cursor = conn.cursor()
    
    print(f"\nFound {len(tables)} tables to drop:")
    for table in tables:
        print(f"  - {table}")
    
    print("\nDropping tables...")
    
    try:
        # Drop each table
        for table in tables:
            try:
                # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
                cursor.execute(sql.SQL("DROP TABLE IF EXISTS {} CASCADE").format(sql.Identifier(table)))
                print(f"  ✓ Dropped {table}")
            except Exception as e:
                print(f"  ✗ Error dropping {table}: {e}")
        
        conn.commit()
        print("\n✓ All tables dropped successfully")
        
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Error during drop: {e}")
        sys.exit(1)
    finally:
        cursor.close()


def get_table_counts(cursor, tables: list) -> dict:
    """Get row counts for all tables"""
    counts = {}
    for table in tables:
        try:
            # nosemgrep: python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query
            cursor.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
            counts[table] = cursor.fetchone()[0]
        except Exception as e:
            counts[table] = f"Error: {e}"
    return counts


def main():
    parser = argparse.ArgumentParser(
        description="Clean/truncate all data from market surveillance database",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Truncate all tables (preserves schema)
  python db_clean.py --database marketsurveillance

  # Drop all tables (removes schema)
  python db_clean.py --database marketsurveillance --drop

  # Show table counts without cleaning
  python db_clean.py --database marketsurveillance --dry-run

  # With custom connection
  python db_clean.py --host localhost --port 5432 --database mydb --user dbadmin

Environment Variables:
  DB_HOST      PostgreSQL host (default: localhost)
  DB_PORT      PostgreSQL port (default: 5432)
  DB_NAME      Database name
  DB_USER      Database user (default: postgres)
  DB_PASSWORD  Database password (required)
        """
    )
    
    # Connection parameters
    parser.add_argument(
        '--database',
        default=os.environ.get('DB_NAME', ''),
        help='Database name (required)'
    )
    parser.add_argument(
        '--host',
        default=os.environ.get('DB_HOST', 'localhost'),
        help='Database host (default: localhost)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=int(os.environ.get('DB_PORT', '5432')),
        help='Database port (default: 5432)'
    )
    parser.add_argument(
        '--user',
        default=os.environ.get('DB_USER', 'postgres'),
        help='Database user (default: postgres)'
    )
    parser.add_argument(
        '--password',
        default=os.environ.get('DB_PASSWORD', ''),
        help='Database password (default: from DB_PASSWORD env var)'
    )
    
    # Operation mode
    parser.add_argument(
        '--drop',
        action='store_true',
        help='Drop tables instead of truncating (removes schema)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be cleaned without actually doing it'
    )
    parser.add_argument(
        '--no-cascade',
        action='store_true',
        help='Do not use CASCADE when truncating (may fail with FK constraints)'
    )
    
    args = parser.parse_args()
    
    # Validate required parameters
    if not args.database:
        print("Error: Database name required. Use --database or set DB_NAME env var")
        sys.exit(1)
    
    if not args.password:
        print("Error: Database password required. Use --password or set DB_PASSWORD env var")
        sys.exit(1)
    
    print("=" * 70)
    print("Database Cleaning Script")
    print("=" * 70)
    print(f"\nDatabase: {args.database}")
    print(f"Host: {args.host}:{args.port}")
    print(f"User: {args.user}")
    
    if args.drop:
        print("\nMode: DROP TABLES (will remove schema)")
    else:
        print("\nMode: TRUNCATE TABLES (preserves schema)")
    
    if args.dry_run:
        print("\n[DRY RUN MODE - No changes will be made]")
    
    # Connect to database
    print("\nConnecting to database...")
    conn = get_db_connection(
        host=args.host,
        port=args.port,
        database=args.database,
        user=args.user,
        password=args.password
    )
    
    cursor = conn.cursor()
    
    # Get all tables
    tables = get_all_tables(cursor)
    
    if not tables:
        print("\n✓ No tables found in database")
        cursor.close()
        conn.close()
        sys.exit(0)
    
    # Show current counts
    print("\nCurrent table row counts:")
    counts = get_table_counts(cursor, tables)
    total_rows = 0
    for table, count in sorted(counts.items()):
        if isinstance(count, int):
            print(f"  {table:40} {count:>10,} rows")
            total_rows += count
        else:
            print(f"  {table:40} {count}")
    
    print(f"\n  {'TOTAL':40} {total_rows:>10,} rows")
    
    cursor.close()
    
    # Confirm before proceeding
    if not args.dry_run:
        print("\n" + "!" * 70)
        if args.drop:
            print("WARNING: This will DROP all tables and DESTROY the schema!")
        else:
            print("WARNING: This will DELETE all data from all tables!")
        print("!" * 70)
        
        response = input("\nAre you sure you want to continue? (yes/no): ")
        if response.lower() != 'yes':
            print("\nAborted by user")
            conn.close()
            sys.exit(0)
        
        # Perform cleanup
        if args.drop:
            drop_tables(conn, tables)
        else:
            truncate_tables(conn, tables, cascade=not args.no_cascade)
        
        # Commit and create new cursor for verification
        conn.commit()
        cursor = conn.cursor()
        print("\nVerifying cleanup...")
        
        if args.drop:
            # Get remaining tables after drop
            remaining_tables = get_all_tables(cursor)
        else:
            # Get row counts after truncate
            counts_after = get_table_counts(cursor, tables)
        
        if args.drop:
            if remaining_tables:
                print(f"\n⚠ Warning: {len(remaining_tables)} tables still exist")
            else:
                print("\n✓ All tables successfully dropped")
        else:
            total_remaining = sum(c for c in counts_after.values() if isinstance(c, int))
            if total_remaining == 0:
                print("\n✓ All tables successfully cleaned (0 rows remaining)")
            else:
                print(f"\n⚠ Warning: {total_remaining} rows still remain")
                for table, count in sorted(counts_after.items()):
                    if isinstance(count, int) and count > 0:
                        print(f"  {table}: {count} rows")
        
        cursor.close()
    
    conn.close()
    
    print("\n" + "=" * 70)
    print("Cleanup Complete")
    print("=" * 70)
    
    if not args.dry_run:
        print("\nYou can now re-run the seeding script:")
        print(f"  python orchestrate_seeding.py --database {args.database}")


if __name__ == '__main__':
    main()
