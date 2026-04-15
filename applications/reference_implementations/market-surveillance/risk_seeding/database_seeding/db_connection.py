"""
Shared DatabaseManager with retry logic.

Provides PostgreSQL connection management for the Risk Analyst seeding pipeline.
"""

import os
import sys
import time


class DatabaseManager:
    """Handles database connections with retry logic and SSL support."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 5432,
        database: str = "",
        user: str = "postgres",
        password: str = "",
        sslmode: str = "require",
        max_retries: int = 3,
    ):
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password or os.environ.get("DB_PASSWORD", "")
        self.sslmode = sslmode
        self.max_retries = max_retries
        self._conn = None

    def connect(self):
        """Create database connection with retry logic."""
        try:
            import psycopg
        except ImportError:
            print("Error: psycopg not installed. Run: pip install psycopg[binary]")
            sys.exit(1)

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                self._conn = psycopg.connect(
                    host=self.host,
                    port=self.port,
                    dbname=self.database,
                    user=self.user,
                    password=self.password,
                    sslmode=self.sslmode,
                )
                self._conn.autocommit = False
                return self._conn
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    wait_time = 2 ** attempt
                    print(f"Connection attempt {attempt} failed, retrying in {wait_time}s...")
                    time.sleep(wait_time)

        print(f"Error connecting to database after {self.max_retries} attempts: {last_error}")
        sys.exit(1)

    def close(self):
        """Close the database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    @property
    def connection(self):
        """Get the current connection."""
        return self._conn

    def execute(self, query, params=None) -> bool:
        """Execute SQL statement."""
        if not self._conn:
            print("Error: Not connected to database")
            return False
        try:
            cursor = self._conn.cursor()
            cursor.execute(query, params)
            cursor.close()
            return True
        except Exception as e:
            print(f"Error executing SQL: {e}")
            self._conn.rollback()
            return False

    def executemany(self, query, params_list: list) -> bool:
        """Execute SQL statement with multiple parameter sets."""
        if not self._conn:
            print("Error: Not connected to database")
            return False
        try:
            cursor = self._conn.cursor()
            cursor.executemany(query, params_list)
            cursor.close()
            return True
        except Exception as e:
            print(f"Error executing SQL: {e}")
            self._conn.rollback()
            return False

    def query(self, query_str, params=None) -> list:
        """Execute SQL query and return results."""
        if not self._conn:
            print("Error: Not connected to database")
            return []
        try:
            cursor = self._conn.cursor()
            cursor.execute(query_str, params)
            results = cursor.fetchall()
            cursor.close()
            return results
        except Exception as e:
            print(f"Error executing query: {e}")
            return []

    def commit(self):
        """Commit current transaction."""
        if self._conn:
            self._conn.commit()

    def rollback(self):
        """Rollback current transaction."""
        if self._conn:
            self._conn.rollback()
