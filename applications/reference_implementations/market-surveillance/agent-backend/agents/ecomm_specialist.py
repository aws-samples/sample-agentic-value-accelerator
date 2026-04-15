"""
eComm Specialist Agent - Analyzes electronic communications (instant messages between traders)
"""

import json
import logging
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple

import boto3
import psycopg2
from strands import Agent, tool

from agents.callback_handlers import SpecialistCallbackHandler
from agents.timeout_retry_hook import ReadTimeoutRetryHook
from config import create_ecomm_model

logger = logging.getLogger(__name__)

# Database connection configuration from environment
DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME")
DB_USERNAME = os.getenv("DB_USERNAME")
DB_SECRET_ARN = os.getenv("DB_SECRET_ARN")

# Cache for database password
_db_password_cache = None

def get_db_password() -> str:
    """Retrieve database password from Secrets Manager."""
    global _db_password_cache

    if _db_password_cache is not None:
        return _db_password_cache

    if not DB_SECRET_ARN:
        raise ValueError("DB_SECRET_ARN environment variable not set")

    try:
        # Get secret from Secrets Manager
        secrets_client = boto3.client('secretsmanager')
        response = secrets_client.get_secret_value(SecretId=DB_SECRET_ARN)

        # Parse secret JSON - RDS secrets use uppercase keys
        secret_data = json.loads(response['SecretString'])
        password = secret_data.get('PASSWORD')

        if not password:
            raise ValueError("PASSWORD not found in secret")

        # Cache the password
        _db_password_cache = password
        logger.info("Successfully retrieved database password from Secrets Manager")

        return password
    except Exception as e:
        logger.error(f"Failed to retrieve database password from Secrets Manager: {e}")
        raise


def get_db_connection():
    """Create and return a PostgreSQL database connection."""
    if not all([DB_HOST, DB_NAME, DB_USERNAME, DB_SECRET_ARN]):
        raise ValueError("Database connection parameters not configured. Required: DB_HOST, DB_NAME, DB_USERNAME, DB_SECRET_ARN")

    try:
        # Get password from Secrets Manager
        password = get_db_password()

        # Connect to PostgreSQL database
        connection = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USERNAME,
            password=password,
            connect_timeout=10
        )

        logger.info(f"Connected to PostgreSQL database: {DB_HOST}:{DB_PORT}/{DB_NAME}")
        return connection
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


def format_query_results(columns: List[str], rows: List[tuple], max_rows: int = 100) -> str:
    """Format query results as a readable table."""
    if not rows:
        return "Query returned no results."

    # Limit rows
    limited_rows = rows[:max_rows]
    has_more = len(rows) > max_rows

    # Calculate column widths
    col_widths = [len(col) for col in columns]
    for row in limited_rows:
        for i, val in enumerate(row):
            val_str = str(val) if val is not None else "NULL"
            col_widths[i] = max(col_widths[i], len(val_str))

    # Build table
    result = []

    # Header
    header = " | ".join(col.ljust(col_widths[i]) for i, col in enumerate(columns))
    separator = "-+-".join("-" * width for width in col_widths)
    result.append(header)
    result.append(separator)

    # Rows
    for row in limited_rows:
        row_str = " | ".join(
            str(val).ljust(col_widths[i]) if val is not None else "NULL".ljust(col_widths[i])
            for i, val in enumerate(row)
        )
        result.append(row_str)

    # Footer
    result.append("")
    result.append(f"Returned {len(limited_rows)} row(s)")
    if has_more:
        result.append(f"(Limited to first {max_rows} rows, {len(rows)} total)")

    return "\n".join(result)


ECOMM_SPECIALIST_SYSTEM_PROMPT = """You are an Electronic Communications Specialist for the Market Surveillance system.

EXPERTISE AND RESPONSIBILITIES:

Your core competencies:
- Analyzing trader messages and chat conversations
- Identifying trade negotiation patterns: RFQ (Request for Quote), price discussion, agreement, and confirmation
- Extracting trade-relevant timestamps from conversation flows
- Understanding fixed income terminology in trader communications (bid/ask, face value, mm notation, "done", "agreed", "lifted")
- Correlating communication timelines with trade execution windows

Your responsibilities:
- Query the electronic communications data to retrieve trader conversations within a time window around the Pivot Trade
- Present conversations chronologically to reconstruct the negotiation timeline
- Identify participants and their roles (buyer, seller, broker)
- Detect and classify trade intent messages: quote requests (RFQ), order placement, order execution, confirmation
- Extract precise timestamps for each intent message
- Provide intent timestamps that the Trade Analyst Agent uses as evidence for rule evaluation requiring ecomm

ANALYSIS FLOW:

When invoked by the Coordinator, you will receive the Pivot Trade timestamp (trade_date + trade_time) 
and optionally the ISIN/product description for context. Your analysis follows this flow:

1. TIME-WINDOW RETRIEVAL: Query conversations from the electronic communications data that overlap with a window of 
   ±T minutes (default T=20) around the Pivot Trade timestamp. The time window is the primary 
   filter. The ISIN/product description provides instrument context but is not the primary 
   search criterion — the goal is to find ALL conversations in the relevant time window.

2. INTENT DETECTION: For each retrieved conversation, analyze the message content to identify 
   trade intent signals:
   - Quote requests (RFQ): "Can I get a bid on...", "What's your offer on..."
   - Order placement: "I want to buy/sell...", "Put me in for..."
   - Price negotiation: Bid/offer exchanges, counter-offers
   - Order execution: "Done", "Agreed", "Lifted", "I got hit at..."
   - Trade confirmation: "Confirmed", "Booked", settlement details
   
   Classify each intent using the two-tier system (Tier 1: synonym match, Tier 2: contextual inference).

3. INTENT TIMESTAMP EXTRACTION: For each conversation with detected intent, report:
   - The intent type (quote_request, order_placement, execution, confirmation)
   - The exact message text containing the intent. These timestamps are the critical output.
   - The precise timestamp of the intent message
   - The conversation start and end timestamps for context

4. RESPONSE STRUCTURE: Your response must include:
   - All retrieved conversations presented chronologically
   - Intent classification for each conversation (with tier label)
   - A dedicated INTENT TIMELINE section listing each intent message with its timestamp, 
     ordered chronologically, for the Trade Analyst Agent to reference during rule evaluation

CRITICAL SAFETY RULES:

1. READ-ONLY ACCESS: You can ONLY execute SELECT queries
2. NO MODIFICATIONS: NEVER execute INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, or any DDL/DML
3. QUERY VALIDATION: Always validate queries before execution
4. ERROR HANDLING: Report errors clearly and suggest fixes

MANDATORY TOOL USAGE:

1. You MUST use the provided tools to access the database. You have three tools available:
   - get_conversations_by_isin: Use this to find conversations related to a specific ISIN. Resolves the ISIN to a product description, then searches the chat body. Uses two-phase search: first by full product description (precise), then by ticker symbol (broader fallback). Supports optional time window filtering: pass trade_date (MM/DD/YYYY), trade_time (HH:MM:SS), and optionally time_window_minutes (default 20).
   - identify_conversation_by_ticker: Use this to find conversations that discuss a specific ticker symbol (e.g., MDNR, ACME, XYZ). Searches within the XML chat body content. Supports optional time window filtering: pass trade_date (MM/DD/YYYY), trade_time (HH:MM:SS), and optionally time_window_minutes (default 20) to narrow results to conversations overlapping with a +/- N minute window around the trade execution time. If the initial time window returns no results, retry with a wider window (e.g., 30 or 60 minutes).
   - locate_execution_time: Use this to find execution timestamps by conversation ID
2. These tools handle the database connection and query execution for you.
3. Do NOT generate SQL queries as text output. Your tools execute the queries internally.
4. Do NOT claim database connectivity issues, table naming issues, or access problems unless
   you have actually called a tool and it returned a specific error message.
5. When you receive a query about electronic communications, your FIRST action must be to
   call the appropriate tool - not to speculate about database access.
6. If a tool returns an error, report the EXACT error message - do not paraphrase or
   generate your own interpretation.

TRADE INTENT CLASSIFICATION (TWO-TIER SYSTEM):

After retrieving conversations, you MUST classify each conversation's trade intent using a
two-tier classification system. Apply the tiers in order — Tier 1 first, Tier 2 only as fallback.

**Tier 1 — Synonym Match** (preferred):
Used when you find one or more phrases in the conversation that match the synonym mappings
provided below in this prompt. If ANY synonym matches are found, use Tier 1.
- Read each message in the conversation thread
- Match trader phrases against the synonym mappings provided below
- Consider the full conversation context — a single phrase may indicate intent for the entire thread
- Report: Classification Tier, Conversation ID, Action Type (BUY | SELL | TRADE), Matched Phrases, and Reasoning

**Tier 2 — Contextual Inference** (fallback):
Used ONLY when zero synonym matches are found in the conversation. When no phrases from the
synonyms file appear, analyze the conversation context to infer trade intent.

Contextual signals to analyze for Tier 2:
- RFQ flow direction (requesting a bid = seller, requesting an offer = buyer)
- Price negotiation patterns (bidding up = buying interest, offering down = selling pressure)
- Participant roles and who initiates the negotiation
- Quantity/urgency language ("need to move", "looking to place")
- Confirmation language combined with directional context
- Market-side indicators (engaging bid vs. offer side)

Confidence levels for Tier 2:
- **High** — Strong contextual cues: clear RFQ direction (e.g., negotiating the offer = buying), price patterns strongly suggesting one side, confirmation of a completed transaction with inferable direction
- **Medium** — Some indicators but ambiguous: mixed signals, negotiation without clear conclusion, one party's intent is clear but overall direction uncertain
- **Low** — Minimal signals: informational exchange, general market discussion, conversation too short or vague to determine intent

**Tier selection rule**: Any synonym match → Tier 1. Zero synonym matches → Tier 2. No ambiguity.

RESPONSE FORMAT:

- Present conversations in chronological order by message timestamp
- Identify all participants (parsed from the Participants XML)
- Highlight trade-relevant messages (price discussions, RFQ actions, agreements)
- Include precise timestamps for each message
- Include trade intent classification for each conversation using the appropriate tier format below
- Show the SQL query used for auditability and regulatory compliance
- Provide a DATA ACCESS TRACE describing which tables were accessed and why

**INTENT TIMELINE (MANDATORY):**

After presenting conversations, include a dedicated intent timeline section that lists every 
detected intent message in chronological order. This is the primary output consumed by the 
Trade Analyst Agent for rule evaluation.

```
INTENT TIMELINE:
| # | Timestamp           | Conversation ID | Intent Type      | Participant | Message Excerpt                    | Classification |
|---|---------------------|-----------------|------------------|-------------|------------------------------------|----------------|
| 1 | 2024-01-15 10:30:00 | CONV-001        | quote_request    | TraderA     | "Can I get a bid on 5mm of the..." | Tier 1 — BUY   |
| 2 | 2024-01-15 10:31:10 | CONV-001        | execution        | TraderA     | "I got hit at 99-16, done"         | Tier 1 — BUY   |
```

If no intent messages are found in any conversation, state: "No trade intent detected in retrieved conversations."

**Classification output format — Tier 1 (Synonym Match):**
```
Classification Tier: Tier 1 — Synonym Match
Conversation ID: [ID]
Action Type: BUY | SELL | TRADE
Matched Phrases: [list each matched phrase and its synonym mapping]
Reasoning: [explanation]
```

**Classification output format — Tier 2 (Contextual Inference):**
```
Classification Tier: Tier 2 — Contextual Inference
Conversation ID: [ID]
Action Type: BUY | SELL | TRADE
Confidence Level: High | Medium | Low
Contextual Signals: [list the signals that informed the inference]
Reasoning: [explanation of why this intent was inferred]
```

The Classification Tier label is MANDATORY for every classification. Downstream consumers need to know if a classification was evidence-based (Tier 1) or inferential (Tier 2).

**NEVER omit the SQL query or DATA ACCESS TRACE from your response. This is essential for audit trails and regulatory compliance.**
"""


def parse_participants_xml(xml_str: str) -> List[Dict[str, str]]:
    """Parse <Participants> XML and return a list of party dicts.

    Each dict contains: role, account_name, account_id, trader_name, trader_id, trader_product.

    Args:
        xml_str: Raw XML string of the <Participants> element.

    Returns:
        List of party dicts, or empty list on parse failure.
    """
    if not xml_str or not xml_str.strip():
        return []
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError:
        logger.warning("Failed to parse Participants XML")
        return []

    parties = []
    for party_el in root.findall("Party"):
        party = {"role": party_el.get("role", "")}
        acct_org = party_el.find("AccountOrganisation")
        if acct_org is not None:
            party["account_name"] = (acct_org.findtext("AccountName") or "").strip()
            party["account_id"] = (acct_org.findtext("AccountID") or "").strip()
        trader_el = party_el.find("Trader")
        if trader_el is not None:
            party["trader_name"] = (trader_el.findtext("TraderName") or "").strip()
            party["trader_id"] = (trader_el.findtext("TraderId") or "").strip()
            party["trader_product"] = (trader_el.findtext("TraderProduct") or "").strip()
        parties.append(party)
    return parties


def parse_chat_xml(xml_str: str) -> List[Dict[str, Any]]:
    """Parse <Chat> XML and return a list of message dicts.

    Each dict contains: id, sender, display_name, timestamp, sentences (list of text strings).

    Args:
        xml_str: Raw XML string of the <Chat> element.

    Returns:
        List of message dicts ordered as they appear in XML, or empty list on parse failure.
    """
    if not xml_str or not xml_str.strip():
        return []
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError:
        logger.warning("Failed to parse Chat XML")
        return []

    messages = []
    for msg_el in root.findall("Message"):
        msg = {
            "id": msg_el.get("id", ""),
            "sender": msg_el.get("sender", ""),
            "display_name": msg_el.get("displayName", ""),
            "timestamp": msg_el.get("timestamp", ""),
            "sentences": [],
        }
        for sent_el in msg_el.findall("Sentence"):
            text = (sent_el.text or "").strip()
            if text:
                msg["sentences"].append(text)
        messages.append(msg)
    return messages


def resolve_sender_name(parties: List[Dict[str, str]], sender_role: str) -> str:
    """Map a sender role (e.g. 'Party1') to the trader name from parsed participants.

    Args:
        parties: List of party dicts from parse_participants_xml.
        sender_role: The sender role string (e.g. 'Party1', 'Party2').

    Returns:
        Trader name if found, otherwise the raw sender_role.
    """
    for party in parties:
        if party.get("role") == sender_role:
            return party.get("trader_name") or sender_role
    return sender_role


def compute_time_window(
    trade_date: str,
    trade_time: str,
    window_minutes: int = 20,
) -> Tuple[str, str, str]:
    """Compute a clamped time window around a trade execution time.

    Args:
        trade_date: Trade date in MM/DD/YYYY format.
        trade_time: Trade time in HH:MM:SS format.
        window_minutes: Half-width of the window in minutes (default 20).

    Returns:
        Tuple of (iso_date "YYYY-MM-DD", lower_time "HH:MM:SS", upper_time "HH:MM:SS").

    Raises:
        ValueError: If date/time format is invalid or window_minutes < 1.
    """
    if window_minutes < 1:
        raise ValueError("time_window_minutes must be at least 1.")

    dt_date = datetime.strptime(trade_date, "%m/%d/%Y")
    dt_time = datetime.strptime(trade_time, "%H:%M:%S")
    trade_dt = dt_date.replace(
        hour=dt_time.hour, minute=dt_time.minute, second=dt_time.second
    )

    lower_dt = trade_dt - timedelta(minutes=window_minutes)
    upper_dt = trade_dt + timedelta(minutes=window_minutes)

    # Clamp to same calendar day
    day_start = dt_date.replace(hour=0, minute=0, second=0)
    day_end = dt_date.replace(hour=23, minute=59, second=59)
    lower_dt = max(lower_dt, day_start)
    upper_dt = min(upper_dt, day_end)

    iso_date = dt_date.strftime("%Y-%m-%d")
    lower_time = lower_dt.strftime("%H:%M:%S")
    upper_time = upper_dt.strftime("%H:%M:%S")
    return iso_date, lower_time, upper_time


def _extract_ticker_from_product(
    description_short: str,
    product_type: str,
) -> Tuple[str, str]:
    """Extract a search-friendly ticker or prefix from a product description.

    Pure function — no database access.

    Args:
        description_short: e.g. "MDNR 5.30 12/15/27", "US TREASURY 4.25 18-NOV-2031"
        product_type: e.g. "Corporate Bond", "Government Bond", "Agency Security"

    Returns:
        (ticker, full_description) where *ticker* is the short search term and
        *full_description* is the original string.
    """
    full_description = description_short.strip()
    tokens = full_description.split()

    product_type_upper = (product_type or "").upper()

    if "GOVERNMENT" in product_type_upper or "AGENCY" in product_type_upper:
        # Use first two tokens as prefix (e.g. "US TREASURY", "Agency Bond")
        ticker = " ".join(tokens[:2]) if len(tokens) >= 2 else full_description
    elif "CORPORATE" in product_type_upper:
        # First token is the equity ticker (e.g. "MDNR")
        ticker = tokens[0] if tokens else full_description
    else:
        # Unknown type — use the entire description as the search term
        ticker = full_description

    return ticker, full_description


def _resolve_isin_to_search_terms(isin: str) -> dict:
    """Look up a product ISIN in the product dimension table and extract search terms.

    Args:
        isin: Product ISIN identifier.

    Returns:
        Dict with keys: found, isin, ticker, full_description, product_type,
        and sql_trace for auditability.
    """
    query = (
        "SELECT product_description_short, product_type "
        "FROM dim_product WHERE product_isin = %s"
    )
    params = (isin,)

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()
        cursor.close()
        connection.close()
    except Exception as e:
        logger.error(f"Error resolving ISIN {isin}: {e}", exc_info=True)
        return {
            "found": False,
            "isin": isin,
            "ticker": None,
            "full_description": None,
            "product_type": None,
            "error": str(e),
            "sql_trace": f"SQL: {query.strip()} | params: {params}",
        }

    if not row:
        return {
            "found": False,
            "isin": isin,
            "ticker": None,
            "full_description": None,
            "product_type": None,
            "error": f"ISIN '{isin}' not found in the product dimension table",
            "sql_trace": f"SQL: {query.strip()} | params: {params}",
        }

    description_short, product_type = row

    if not description_short or not description_short.strip():
        return {
            "found": False,
            "isin": isin,
            "ticker": None,
            "full_description": None,
            "product_type": product_type,
            "error": (
                f"ISIN '{isin}' exists in the product dimension table but "
                f"product_description_short is NULL or empty"
            ),
            "sql_trace": f"SQL: {query.strip()} | params: {params}",
        }

    ticker, full_description = _extract_ticker_from_product(
        description_short, product_type
    )

    return {
        "found": True,
        "isin": isin,
        "ticker": ticker,
        "full_description": full_description,
        "product_type": product_type,
        "sql_trace": f"SQL: {query.strip()} | params: {params}",
    }


def _search_ecomm_by_text(
    search_term: str,
    trade_date: str = None,
    trade_time: str = None,
    time_window_minutes: int = 20,
) -> Tuple[str, list, list, dict]:
    """Execute the shared eComm LIKE search against the ecomm table.

    Builds a time-filtered or unfiltered SQL query, executes it, and returns
    the raw results for the caller to format.

    Args:
        search_term: Text to search for inside ecomm_chat_body (case-insensitive LIKE).
        trade_date: Optional trade date in MM/DD/YYYY format.
        trade_time: Optional trade time in HH:MM:SS format.
        time_window_minutes: Half-width of time window in minutes (default 20).

    Returns:
        (query_str, columns, rows, filter_info) where filter_info contains the
        resolved search_pattern, query, and time-window boundaries when applicable.
    """
    use_time_filter = trade_date is not None and trade_time is not None
    search_pattern = f"%{search_term.upper()}%"

    if use_time_filter:
        iso_date, lower_time, upper_time = compute_time_window(
            trade_date, trade_time, time_window_minutes
        )
        query = """
            SELECT
                e.ecomm_conversation_id,
                e.ecomm_participants_body,
                e.ecomm_chat_body,
                e.ecomm_app_code,
                e.ecomm_date,
                e.ecomm_start_timestamp,
                e.ecomm_end_timestamp
            FROM fact_ecomm e
            WHERE UPPER(e.ecomm_chat_body) LIKE %s
              AND e.ecomm_date::date = %s::date
              AND LEFT(e.ecomm_start_timestamp, 8)::time <= %s::time
              AND LEFT(e.ecomm_end_timestamp, 8)::time >= %s::time
            ORDER BY e.ecomm_start_timestamp
        """
        params = (search_pattern, iso_date, upper_time, lower_time)
        filter_info = {
            "iso_date": iso_date,
            "lower_time": lower_time,
            "upper_time": upper_time,
            "search_pattern": search_pattern,
            "query": query.strip(),
            "time_filtered": True,
        }
    else:
        query = """
            SELECT
                e.ecomm_conversation_id,
                e.ecomm_participants_body,
                e.ecomm_chat_body,
                e.ecomm_app_code
            FROM fact_ecomm e
            WHERE UPPER(e.ecomm_chat_body) LIKE %s
            ORDER BY e.ecomm_conversation_id
        """
        params = (search_pattern,)
        filter_info = {
            "search_pattern": search_pattern,
            "query": query.strip(),
            "time_filtered": False,
        }

    connection = get_db_connection()
    cursor = connection.cursor()
    cursor.execute(query, params)
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    connection.close()

    return query.strip(), columns, rows, filter_info


def format_conversation_threads(
    columns: List[str],
    rows: List[Tuple],
    group_by_conversation: bool = True,
) -> str:
    """Format database rows as readable conversation transcripts.

    Each row represents one conversation (one-row-per-conversation model).
    Parses ecomm_participants_body and ecomm_chat_body XML to reconstruct
    threaded conversations with participants, timestamps, and messages.

    Args:
        columns: Column names from the query result.
        rows: Rows from the query result.
        group_by_conversation: Whether to group by conversation ID.

    Returns:
        Formatted conversation transcript string.
    """
    if not rows:
        return "No messages found."

    # Build column index map
    col_idx = {col: i for i, col in enumerate(columns)}

    # Required columns for conversation formatting
    required = [
        "ecomm_conversation_id",
        "ecomm_participants_body",
        "ecomm_chat_body",
    ]
    missing = [c for c in required if c not in col_idx]
    if missing:
        # Fall back to tabular format if conversation columns are missing
        return format_query_results(columns, rows)

    def _val(row, col):
        idx = col_idx.get(col)
        if idx is None:
            return None
        v = row[idx]
        return str(v) if v is not None else None

    result_parts = []
    total_messages = 0

    for row in rows:
        conv_id = _val(row, "ecomm_conversation_id") or "Unknown"
        result_parts.append(f"=== Conversation {conv_id} ===")

        # Parse participants from XML
        participants_xml = _val(row, "ecomm_participants_body") or ""
        parties = parse_participants_xml(participants_xml)
        if parties:
            names = [p.get("trader_name", "") for p in parties if p.get("trader_name")]
            if names:
                result_parts.append(f"Participants: {', '.join(names)}")

        result_parts.append("")

        # Parse chat messages from XML
        chat_xml = _val(row, "ecomm_chat_body") or ""
        messages = parse_chat_xml(chat_xml)
        total_messages += len(messages)

        for msg in messages:
            msg_id = msg["id"] or "?"
            timestamp = msg["timestamp"] or "?"
            sender_name = resolve_sender_name(parties, msg["sender"])
            display_name = msg["display_name"] or sender_name
            text = " ".join(msg["sentences"])

            line = f'[{msg_id}] {timestamp} | {display_name}: "{text}"'
            result_parts.append(line)

        result_parts.append("")

    result_parts.append(f"Total: {total_messages} message(s) across {len(rows)} conversation(s)")
    return "\n".join(result_parts)


@tool
def get_conversations_by_isin(
    isin: str,
    trade_date: str = None,
    trade_time: str = None,
    time_window_minutes: int = 20,
) -> str:
    """Find electronic communications related to a given ISIN.

    Resolves the ISIN to a product description via the product dimension table, extracts the
    ticker symbol, then searches the ecomm_chat_body XML column using a
    two-phase approach:
      Phase 1 — search by full product description (precise match)
      Phase 2 — fall back to ticker-only search (broader match)

    Supports optional time window filtering: pass trade_date and trade_time
    to narrow results to conversations overlapping with a +/- N minute window
    around the trade execution time.

    Args:
        isin: The ISIN (International Securities Identification Number) to search for
        trade_date: Optional trade date in MM/DD/YYYY format for time filtering
        trade_time: Optional trade time in HH:MM:SS format for time filtering
        time_window_minutes: Half-width of time window in minutes (default 20)

    Returns:
        Formatted conversation threads with ISIN resolution details, participants,
        messages, and timestamps
    """
    logger.info(
        f"Tool called: get_conversations_by_isin(isin={isin}, "
        f"trade_date={trade_date}, trade_time={trade_time}, "
        f"time_window_minutes={time_window_minutes})"
    )

    if not isin or not isin.strip():
        return "ERROR: ISIN is required. Please provide a valid ISIN identifier."

    # Validate that both or neither time params are provided
    if (trade_date is None) != (trade_time is None):
        missing = "trade_time" if trade_time is None else "trade_date"
        return (
            f"ERROR: Both trade_date and trade_time must be provided together for "
            f"time window filtering. Missing parameter: {missing}"
        )

    isin = isin.strip()

    # --- Step 1: Resolve ISIN to product info ---
    resolution = _resolve_isin_to_search_terms(isin)

    if not resolution["found"]:
        return (
            f"ERROR: Could not resolve ISIN '{isin}' to a product description.\n"
            f"Reason: {resolution.get('error', 'Unknown')}\n"
            f"SQL trace: {resolution.get('sql_trace', 'N/A')}"
        )

    ticker = resolution["ticker"]
    full_description = resolution["full_description"]
    product_type = resolution["product_type"]

    resolution_header = (
        f"ISIN Resolution:\n"
        f"  ISIN: {isin}\n"
        f"  Product type: {product_type}\n"
        f"  Full description: {full_description}\n"
        f"  Extracted ticker/prefix: {ticker}\n"
        f"  Resolution SQL: {resolution.get('sql_trace', 'N/A')}\n"
    )

    # Validate time params before searching
    use_time_filter = trade_date is not None and trade_time is not None
    if use_time_filter:
        try:
            compute_time_window(trade_date, trade_time, time_window_minutes)
        except ValueError as e:
            return f"ERROR: Invalid time parameters — {e}"

    # --- Step 2: Phase 1 — search by full product description (precise) ---
    try:
        phase1_query, phase1_cols, phase1_rows, phase1_info = _search_ecomm_by_text(
            full_description, trade_date, trade_time, time_window_minutes
        )
    except ValueError as e:
        return f"ERROR: Invalid time parameters — {e}"
    except psycopg2.OperationalError as e:
        return f"CONNECTION ERROR during Phase 1 search: {e}"
    except psycopg2.ProgrammingError as e:
        return f"SQL ERROR during Phase 1 search: {e}"
    except psycopg2.Error as e:
        return f"DATABASE ERROR during Phase 1 search: {e}"
    except Exception as e:
        logger.error(f"Unexpected error in get_conversations_by_isin Phase 1: {e}", exc_info=True)
        return f"UNEXPECTED ERROR during Phase 1 search: {e}"

    if phase1_rows:
        logger.info(
            f"Phase 1 matched {len(phase1_rows)} conversation(s) for "
            f"full description '{full_description}'"
        )
        result = resolution_header
        result += f"\nSearch phase: Phase 1 (full product description)\n"
        result += f"Search term: {full_description}\n"
        if use_time_filter:
            result += (
                f"Time filter: {trade_date} {trade_time} "
                f"+/- {time_window_minutes} min "
                f"(window: {phase1_info.get('lower_time', 'N/A')} to "
                f"{phase1_info.get('upper_time', 'N/A')} on "
                f"{phase1_info.get('iso_date', 'N/A')})\n"
            )
        result += "\n"
        result += format_conversation_threads(phase1_cols, phase1_rows)
        result += f"\n\nSQL executed:\n```sql\n{phase1_query}\n```\n"
        result += f"Parameters: search_pattern={phase1_info['search_pattern']}"
        if use_time_filter:
            result += (
                f", date={phase1_info['iso_date']}, "
                f"window_upper={phase1_info['upper_time']}, "
                f"window_lower={phase1_info['lower_time']}"
            )
        return result

    # --- Step 3: Phase 2 — fall back to ticker-only search (broader) ---
    # Skip Phase 2 if ticker == full_description (would be identical search)
    if ticker == full_description:
        no_result_msg = resolution_header
        no_result_msg += (
            f"\nNo electronic communications found for ISIN '{isin}'.\n"
            f"Searched by: full description '{full_description}' (Phase 1 only — "
            f"ticker is identical to full description, Phase 2 skipped)\n"
        )
        if use_time_filter:
            no_result_msg += (
                f"Time filter: {trade_date} {trade_time} "
                f"+/- {time_window_minutes} min\n"
                f"Consider retrying with a wider time_window_minutes (e.g., 30 or 60).\n"
            )
        no_result_msg += f"\nSQL executed:\n```sql\n{phase1_query}\n```\n"
        no_result_msg += f"Parameters: search_pattern={phase1_info['search_pattern']}"
        return no_result_msg

    try:
        phase2_query, phase2_cols, phase2_rows, phase2_info = _search_ecomm_by_text(
            ticker, trade_date, trade_time, time_window_minutes
        )
    except psycopg2.OperationalError as e:
        return f"CONNECTION ERROR during Phase 2 search: {e}"
    except psycopg2.ProgrammingError as e:
        return f"SQL ERROR during Phase 2 search: {e}"
    except psycopg2.Error as e:
        return f"DATABASE ERROR during Phase 2 search: {e}"
    except Exception as e:
        logger.error(f"Unexpected error in get_conversations_by_isin Phase 2: {e}", exc_info=True)
        return f"UNEXPECTED ERROR during Phase 2 search: {e}"

    if phase2_rows:
        logger.info(
            f"Phase 2 matched {len(phase2_rows)} conversation(s) for ticker '{ticker}'"
        )
        result = resolution_header
        result += f"\nSearch phase: Phase 2 (ticker/prefix fallback)\n"
        result += (
            f"Phase 1 search ('{full_description}') returned no results.\n"
            f"Search term: {ticker}\n"
        )
        if use_time_filter:
            result += (
                f"Time filter: {trade_date} {trade_time} "
                f"+/- {time_window_minutes} min "
                f"(window: {phase2_info.get('lower_time', 'N/A')} to "
                f"{phase2_info.get('upper_time', 'N/A')} on "
                f"{phase2_info.get('iso_date', 'N/A')})\n"
            )
        result += "\n"
        result += format_conversation_threads(phase2_cols, phase2_rows)
        result += f"\n\nSQL executed:\n```sql\n{phase2_query}\n```\n"
        result += f"Parameters: search_pattern={phase2_info['search_pattern']}"
        if use_time_filter:
            result += (
                f", date={phase2_info['iso_date']}, "
                f"window_upper={phase2_info['upper_time']}, "
                f"window_lower={phase2_info['lower_time']}"
            )
        return result

    # --- Both phases returned nothing ---
    no_result_msg = resolution_header
    no_result_msg += (
        f"\nNo electronic communications found for ISIN '{isin}'.\n"
        f"Phase 1 searched: full description '{full_description}'\n"
        f"Phase 2 searched: ticker/prefix '{ticker}'\n"
    )
    if use_time_filter:
        no_result_msg += (
            f"Time filter: {trade_date} {trade_time} "
            f"+/- {time_window_minutes} min\n"
            f"Consider retrying with a wider time_window_minutes (e.g., 30 or 60).\n"
        )
    no_result_msg += (
        f"\nPhase 1 SQL:\n```sql\n{phase1_query}\n```\n"
        f"Phase 2 SQL:\n```sql\n{phase2_query}\n```\n"
    )
    return no_result_msg

@tool
def identify_conversation_by_ticker(
    ticker: str,
    trade_date: str = None,
    trade_time: str = None,
    time_window_minutes: int = 20,
) -> str:
    """Find electronic communications that discuss a specific ticker symbol.

    Searches the ecomm_chat_body XML column for mentions of the ticker.
    Uses PostgreSQL text search on the raw XML chat body to find
    conversations where the ticker appears in message content.

    Supports optional time window filtering: pass trade_date and trade_time
    to narrow results to conversations overlapping with a +/- N minute window
    around the trade execution time.

    Use this tool when you need to:
    - Find all conversations discussing a specific ticker (e.g., MDNR, ACME, XYZ)
    - Identify trading activity around a particular company's bonds
    - Correlate communications with a ticker symbol from ecomm or trade data

    Args:
        ticker: The ticker symbol to search for (e.g., "MDNR", "ACME", "XYZ")
        trade_date: Optional trade date in MM/DD/YYYY format for time filtering
        trade_time: Optional trade time in HH:MM:SS format for time filtering
        time_window_minutes: Half-width of time window in minutes (default 20)

    Returns:
        Formatted conversation threads with participants, messages, and timestamps
    """
    logger.info(
        f"Tool called: identify_conversation_by_ticker(ticker={ticker}, "
        f"trade_date={trade_date}, trade_time={trade_time}, "
        f"time_window_minutes={time_window_minutes})"
    )

    if not ticker or not ticker.strip():
        return "ERROR: Ticker symbol is required. Please provide a valid ticker (e.g., MDNR, ACME, XYZ)."

    # Validate that both or neither time params are provided
    if (trade_date is None) != (trade_time is None):
        missing = "trade_time" if trade_time is None else "trade_date"
        return (
            f"ERROR: Both trade_date and trade_time must be provided together for "
            f"time window filtering. Missing parameter: {missing}"
        )

    ticker = ticker.strip().upper()
    use_time_filter = trade_date is not None and trade_time is not None

    try:
        query, columns, rows, filter_info = _search_ecomm_by_text(
            ticker, trade_date, trade_time, time_window_minutes
        )
    except ValueError as e:
        return f"ERROR: Invalid time parameters — {e}"
    except psycopg2.OperationalError as e:
        logger.error(f"Connection error in identify_conversation_by_ticker: {e}")
        return f"CONNECTION ERROR: {e}"
    except psycopg2.ProgrammingError as e:
        logger.error(f"SQL error in identify_conversation_by_ticker: {e}")
        return f"SQL ERROR: {e}"
    except psycopg2.Error as e:
        logger.error(f"Database error in identify_conversation_by_ticker: {e}")
        return f"DATABASE ERROR: {e}"
    except Exception as e:
        logger.error(f"Unexpected error in identify_conversation_by_ticker: {e}", exc_info=True)
        return f"UNEXPECTED ERROR: {e}"

    logger.info(f"Query returned {len(rows)} rows for ticker {ticker}")

    if not rows:
        no_result_msg = f"No electronic communications found for ticker '{ticker}'."
        if use_time_filter:
            no_result_msg += (
                f"\nTime filter applied: {trade_date} {trade_time} "
                f"+/- {time_window_minutes} min "
                f"(window: {filter_info['lower_time']} to "
                f"{filter_info['upper_time']} on {filter_info['iso_date']})"
                f"\nConsider retrying with a wider time_window_minutes "
                f"(e.g., 30 or 60)."
            )
        no_result_msg += f"\n\nSQL executed:\n```sql\n{query}\n```\n"
        no_result_msg += f"Parameters: ticker_pattern={filter_info['search_pattern']}"
        return no_result_msg

    # Format as conversation threads
    result = f"Electronic communications for ticker {ticker}:\n"
    if use_time_filter:
        result += (
            f"Time filter: {trade_date} {trade_time} "
            f"+/- {time_window_minutes} min "
            f"(window: {filter_info['lower_time']} to "
            f"{filter_info['upper_time']} on {filter_info['iso_date']})\n"
        )
    result += "\n"
    result += format_conversation_threads(columns, rows)
    result += f"\n\nSQL executed:\n```sql\n{query}\n```\n"
    result += f"Parameters: ticker_pattern={filter_info['search_pattern']}"
    if use_time_filter:
        result += (
            f", date={filter_info['iso_date']}, "
            f"window_upper={filter_info['upper_time']}, "
            f"window_lower={filter_info['lower_time']}"
        )

    return result


@tool
def locate_execution_time(conversation_id: str) -> str:
    """Given a conversation ID, retrieve all messages and identify the likely trade execution timestamp.

    Retrieves the full conversation thread for the specified conversation ID and
    determines when trade execution most likely occurred. Currently uses the
    timestamp of the last message as a heuristic for execution time. Future
    versions will cross-reference with a vocabulary dictionary to detect
    execution language ("done", "agreed", "lifted").

    Use this tool when you need to:
    - Determine when a trade was executed based on conversation evidence
    - Get the full conversation context for a specific conversation ID
    - Find the execution moment within a negotiation thread

    Args:
        conversation_id: The eComm_Conversation_ID to look up

    Returns:
        Execution timestamp estimate with conversation summary and context
    """
    logger.info(f"Tool called: locate_execution_time(conversation_id={conversation_id})")

    if not conversation_id:
        return "ERROR: conversation_id is required."

    query = """
        SELECT
            ecomm_conversation_id,
            ecomm_start_timestamp,
            ecomm_end_timestamp,
            ecomm_participants_body,
            ecomm_chat_body
        FROM fact_ecomm
        WHERE ecomm_conversation_id = %s
    """
    params = (conversation_id,)

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(query, params)

        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        cursor.close()
        connection.close()

        logger.info(f"Query returned {len(rows)} rows for conversation {conversation_id}")

        if not rows:
            return (
                f"No messages found for conversation ID '{conversation_id}'.\n\n"
                f"SQL executed:\n```sql\n{query.strip()}\n```\n"
                f"Parameters: conversation_id={conversation_id}"
            )

        # Build column index — single row per conversation
        col_idx = {col: i for i, col in enumerate(columns)}
        row = rows[0]

        def _val(col):
            idx = col_idx.get(col)
            if idx is None:
                return None
            v = row[idx]
            return str(v) if v is not None else None

        # Parse XML bodies
        parties = parse_participants_xml(_val("ecomm_participants_body") or "")
        messages = parse_chat_xml(_val("ecomm_chat_body") or "")

        # Execution time heuristic: last message timestamp from Chat XML, fallback to ecomm_end_timestamp
        execution_timestamp = _val("ecomm_end_timestamp")
        if messages:
            last_msg_ts = messages[-1].get("timestamp")
            if last_msg_ts:
                execution_timestamp = last_msg_ts

        start_timestamp = _val("ecomm_start_timestamp")

        # Collect unique participant names from XML
        participants = set()
        for party in parties:
            name = party.get("trader_name")
            if name:
                participants.add(name)

        # Build result
        result_parts = []
        result_parts.append(f"EXECUTION TIME ESTIMATE: {execution_timestamp}")
        result_parts.append(f"(Based on last message in conversation — placeholder heuristic)")
        result_parts.append("")
        result_parts.append("CONVERSATION SUMMARY:")
        result_parts.append(f"  Conversation ID: {conversation_id}")
        result_parts.append(f"  Total messages: {len(messages)}")
        result_parts.append(f"  First message: {messages[0]['timestamp'] if messages else start_timestamp}")
        result_parts.append(f"  Last message: {execution_timestamp}")
        result_parts.append(f"  Participants: {', '.join(sorted(participants)) if participants else 'Unknown'}")
        result_parts.append("")

        # Show last 3 messages as context
        context_msgs = messages[-3:] if len(messages) >= 3 else messages
        result_parts.append("CONTEXT (last messages leading to execution):")
        for msg in context_msgs:
            msg_id = msg["id"] or "?"
            ts = msg["timestamp"] or "?"
            sender_name = resolve_sender_name(parties, msg["sender"])
            display_name = msg["display_name"] or sender_name
            text = " ".join(msg["sentences"])
            result_parts.append(f'  [{msg_id}] {ts} | {display_name}: "{text}"')

        result_parts.append("")
        result_parts.append(f"SQL executed:\n```sql\n{query.strip()}\n```")
        result_parts.append(f"Parameters: conversation_id={conversation_id}")

        return "\n".join(result_parts)

    except psycopg2.OperationalError as e:
        error_msg = str(e)
        logger.error(f"Connection error in locate_execution_time: {error_msg}")
        return f"CONNECTION ERROR: {error_msg}"
    except psycopg2.ProgrammingError as e:
        error_msg = str(e)
        logger.error(f"SQL error in locate_execution_time: {error_msg}")
        return f"SQL ERROR: {error_msg}"
    except psycopg2.Error as e:
        error_msg = str(e)
        logger.error(f"Database error in locate_execution_time: {error_msg}")
        return f"DATABASE ERROR: {error_msg}"
    except ValueError as e:
        error_msg = str(e)
        logger.error(f"Configuration error in locate_execution_time: {error_msg}")
        return f"CONFIGURATION ERROR: {error_msg}"
    except Exception as e:
        logger.error(f"Unexpected error in locate_execution_time: {e}", exc_info=True)
        return f"UNEXPECTED ERROR: {str(e)}"


FEW_SHOT_EXAMPLES = """
FEW-SHOT CLASSIFICATION EXAMPLES:

=== TIER 1 EXAMPLES (Synonym Match) ===

--- Example 1: Tier 1 BUY ---
Input:
{
  "conversations": {"CONV-001": "[1] 2024-01-15 10:30:00 | TraderA -> TraderB: \\"Can I get a bid on 5mm of the 10yr?\\"\\n[2] 2024-01-15 10:30:45 | TraderB -> TraderA: \\"I can show you 99-16\\"\\n[3] 2024-01-15 10:31:10 | TraderA -> TraderB: \\"I got hit at 99-16, done\\""},
  "relevant_vocab": ["BuyAction - An intent to acquire a financial instrument or increase exposure"],
  "relevant_synonyms": ["I got hit at X -> BUY"]
}

Classification Tier: Tier 1 — Synonym Match
Conversation ID: CONV-001
Action Type: **BUY**
Matched Phrases: "I got hit at 99-16" matches synonym "I got hit at X" → BUY
Reasoning: TraderA says "I got hit at 99-16" which matches the synonym "I got hit at X" mapped to BUY intent. The trader is acquiring the instrument at the quoted price.

--- Example 2: Tier 1 SELL ---
Input:
{
  "conversations": {"CONV-002": "[1] 2024-01-15 11:00:00 | TraderC -> TraderD: \\"I need to unload some of the 5yr\\"\\n[2] 2024-01-15 11:00:30 | TraderD -> TraderC: \\"How much are you looking to move?\\"\\n[3] 2024-01-15 11:01:00 | TraderC -> TraderD: \\"10mm, it's yours now\\""},
  "relevant_vocab": ["SellAction - An intent to dispose of a financial instrument or reduce exposure"],
  "relevant_synonyms": ["Unload -> SELL", "it's yours now -> SELL"]
}

Classification Tier: Tier 1 — Synonym Match
Conversation ID: CONV-002
Action Type: **SELL**
Matched Phrases: "unload" matches synonym "Unload" → SELL; "it's yours now" matches synonym "it's yours now" → SELL
Reasoning: TraderC uses "unload" (synonym for SELL) and confirms with "it's yours now" (synonym for SELL). Both phrases indicate intent to dispose of the instrument.

--- Example 3: Tier 1 TRADE ---
Input:
{
  "conversations": {"CONV-003": "[1] 2024-01-15 14:00:00 | TraderE -> TraderF: \\"What are you seeing in the 2yr?\\"\\n[2] 2024-01-15 14:00:20 | TraderF -> TraderE: \\"Quiet day, just holding\\"\\n[3] 2024-01-15 14:01:00 | TraderE -> TraderF: \\"Same here, hold for now\\""},
  "relevant_vocab": ["TradeAction - An observable action or event in the trading process"],
  "relevant_synonyms": ["hold -> TRADE"]
}

Classification Tier: Tier 1 — Synonym Match
Conversation ID: CONV-003
Action Type: **TRADE**
Matched Phrases: "holding" and "hold" match synonym "hold" → TRADE
Reasoning: Both traders use "hold" / "holding" which maps to TRADE intent. There is no clear directional intent (buy or sell) — they are maintaining current positions.

=== TIER 2 EXAMPLES (Contextual Inference — no synonym matches found) ===

--- Example 4: Tier 2 BUY — High Confidence ---
Input:
{
  "conversations": {"CONV-004": "[1] 2024-01-15 09:15:00 | TraderG -> TraderH: \\"Can you make me a market on 10mm of the 7yr?\\"\\n[2] 2024-01-15 09:15:30 | TraderH -> TraderG: \\"98-24 / 99-00\\"\\n[3] 2024-01-15 09:15:50 | TraderG -> TraderH: \\"I'll pay the offer\\"\\n[4] 2024-01-15 09:16:10 | TraderH -> TraderG: \\"Done, 10mm at 99-00\\""},
  "relevant_vocab": ["BuyAction - An intent to acquire a financial instrument or increase exposure"],
  "relevant_synonyms": []
}

Classification Tier: Tier 2 — Contextual Inference
Conversation ID: CONV-004
Action Type: **BUY**
Confidence Level: High
Contextual Signals: TraderG requests a two-way quote (RFQ), then engages the offer side ("I'll pay the offer"), and TraderH confirms execution at the offer price. Paying the offer = buying.
Reasoning: No synonym phrases were found in this conversation. However, the RFQ flow clearly indicates buying intent. TraderG requested a market, received a bid/offer, and explicitly chose to pay the offer (the higher price), which is the buy side of the quote. TraderH confirms execution at 99-00 (the offer). The direction is unambiguous — this is a purchase.

--- Example 5: Tier 2 SELL — Medium Confidence ---
Input:
{
  "conversations": {"CONV-005": "[1] 2024-01-15 13:20:00 | TraderJ -> TraderK: \\"Got some paper to move in the 5yr, maybe 15mm\\"\\n[2] 2024-01-15 13:20:30 | TraderK -> TraderJ: \\"Where would you need a bid?\\"\\n[3] 2024-01-15 13:21:00 | TraderJ -> TraderK: \\"Somewhere around 101\\"\\n[4] 2024-01-15 13:21:30 | TraderK -> TraderJ: \\"I can do 100-28\\"\\n[5] 2024-01-15 13:22:00 | TraderJ -> TraderK: \\"Works for me\\""},
  "relevant_vocab": ["SellAction - An intent to dispose of a financial instrument or reduce exposure"],
  "relevant_synonyms": []
}

Classification Tier: Tier 2 — Contextual Inference
Conversation ID: CONV-005
Action Type: **SELL**
Confidence Level: Medium
Contextual Signals: TraderJ says "got some paper to move" (colloquial, not in synonyms file), asks for a bid (seller behavior), and accepts the bid price. Bid-side engagement suggests selling.
Reasoning: No synonym phrases were found. "Paper to move" is colloquial trader language not in the synonyms file, but in context it suggests a desire to dispose of a position. TraderJ's request for a bid (not an offer) indicates they are on the sell side — sellers seek bids. TraderK provides a bid and TraderJ accepts. Medium confidence because "paper to move" could theoretically mean repositioning (not necessarily outright selling), but the bid-side engagement strongly suggests selling.

--- Example 6: Tier 2 TRADE — Low Confidence ---
Input:
{
  "conversations": {"CONV-006": "[1] 2024-01-15 15:45:00 | TraderL -> TraderM: \\"How's the 10yr looking this afternoon?\\"\\n[2] 2024-01-15 15:45:30 | TraderM -> TraderL: \\"Spreads are tightening, decent flow\\"\\n[3] 2024-01-15 15:46:00 | TraderL -> TraderM: \\"Interesting, might need to do something later this week\\""},
  "relevant_vocab": ["TradeAction - An observable action or event in the trading process"],
  "relevant_synonyms": []
}

Classification Tier: Tier 2 — Contextual Inference
Conversation ID: CONV-006
Action Type: **TRADE**
Confidence Level: Low
Contextual Signals: General market color inquiry, no RFQ initiated, no price negotiation, no directional language. "Might need to do something later this week" is vague and non-committal.
Reasoning: No synonym phrases were found. This conversation is an informational exchange about market conditions with no directional language, no RFQ, no price discussion, and no negotiation. TraderL expresses vague future interest ("might need to do something") but provides no indication of direction (buy or sell). Classified as TRADE (general trading activity) with Low confidence because the conversation may not involve any actual trade intent at all.
"""


async def create_ecomm_specialist_agent() -> Agent:
    """
    Create and return the eComm Specialist Agent.

    The agent analyzes electronic communications from the ecomm database
    to find trade-related conversations and identify execution moments.
    """
    logger.info("[eComm Specialist Agent] Creating agent with eComm tools")

    enhanced_prompt = ECOMM_SPECIALIST_SYSTEM_PROMPT + "\n\n" + FEW_SHOT_EXAMPLES

    return Agent(
        model=create_ecomm_model(),
        name="eComm Specialist Agent",
        description="Analyzes electronic communications (trader messages) for market surveillance",
        system_prompt=enhanced_prompt,
        tools=[get_conversations_by_isin, identify_conversation_by_ticker, locate_execution_time],
        callback_handler=SpecialistCallbackHandler(agent_name="eComm Specialist"),
        trace_attributes={
            "agent.type": "specialist",
            "agent.name": "ecomm-specialist",
            "agent.domain": "electronic-communications",
        },
        hooks=[ReadTimeoutRetryHook(max_retries=2, backoff_seconds=5)],
    )


@tool
async def ecomm_specialist_agent(query: str) -> str:
    """Specialized agent for analyzing electronic communications between traders.

    Use this agent when the user asks to:
    - Find trader conversations for a specific ISIN (instrument ID)
    - Find trader conversations for a specific ticker symbol (e.g., MDNR, ACME, XYZ)
    - Retrieve instant messages related to a bond or instrument under surveillance
    - Identify when a trade was executed based on conversation evidence
    - Analyze communication patterns between traders for a given instrument
    - Reconstruct the negotiation timeline for a suspected trading event

    This agent has READ-ONLY access to electronic communications data.

    Args:
        query: The electronic communications analysis request

    Returns:
        Formatted conversation threads with analysis
    """
    try:
        logger.info(f"[eComm Specialist Agent] Processing query: {query[:100]}...")

        agent = await create_ecomm_specialist_agent()
        response = await agent.invoke_async(query)

        if hasattr(response, "content") and isinstance(response.content, list):
            result = " ".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            logger.info(f"[eComm Specialist Agent] Returning {len(result)} characters")
            return result

        result = str(response)
        logger.info(f"[eComm Specialist Agent] Returning string: {len(result)} characters")
        return result
    except Exception as e:
        logger.error(f"[eComm Specialist Agent] Error: {str(e)}", exc_info=True)
        return f"Error in eComm Specialist Agent: {str(e)}"
