"""
Lambda function for Market Surveillance Data API
Exposes market surveillance data from PostgreSQL RDS for web portal application
Version: 1.0.1
"""

import json
import os
import boto3
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, date, time
from decimal import Decimal
from typing import Dict, Any, List, Optional

# Initialize AWS clients
secrets_client = boto3.client('secretsmanager')

# Cache for database connection and credentials
_db_connection = None
_db_credentials = None


class CustomEncoder(json.JSONEncoder):
    """Custom JSON encoder for database types"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, time):
            return obj.isoformat()
        if isinstance(obj, bytes):
            return obj.decode('utf-8')
        return super(CustomEncoder, self).default(obj)


def cors_headers():
    """Return CORS headers for API responses"""
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    }


def response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Format API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': cors_headers(),
        'body': json.dumps(body, cls=CustomEncoder)
    }


def error_response(status_code: int, message: str) -> Dict[str, Any]:
    """Format error response"""
    return response(status_code, {'error': message})


def get_db_credentials() -> Dict[str, str]:
    """Retrieve database credentials from Secrets Manager"""
    global _db_credentials
    
    if _db_credentials:
        return _db_credentials
    
    secret_name = os.environ.get('DB_SECRET_NAME')
    if not secret_name:
        raise ValueError('DB_SECRET_NAME environment variable not set')
    
    try:
        secret_response = secrets_client.get_secret_value(SecretId=secret_name)
        _db_credentials = json.loads(secret_response['SecretString'])
        return _db_credentials
    except Exception as e:
        print(f"Error retrieving database credentials: {str(e)}")
        raise


def get_db_connection():
    """Get or create database connection"""
    global _db_connection
    
    # Check if connection exists and is alive
    if _db_connection and not _db_connection.closed:
        try:
            # Test connection
            cursor = _db_connection.cursor()
            cursor.execute('SELECT 1')
            cursor.close()
            return _db_connection
        except:
            _db_connection = None
    
    # Create new connection
    credentials = get_db_credentials()
    
    try:
        _db_connection = psycopg2.connect(
            host=credentials['HOST'],
            port=credentials['PORT'],
            database=credentials['DBNAME'],
            user=credentials['USERNAME'],
            password=credentials['PASSWORD'],
            connect_timeout=5
        )
        return _db_connection
    except Exception as e:
        print(f"Error connecting to database: {str(e)}")
        raise


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for RDS Data API
    
    Routes:
    - GET /alerts - List all alerts with optional filtering
    - GET /alerts/{alertId} - Get detailed alert information
    - GET /alerts/{alertId}/account - Get account details for alert
    - GET /alerts/{alertId}/product - Get product details for alert
    - GET /alerts/{alertId}/customer-trade - Get customer trade that triggered alert
    - GET /alerts/{alertId}/related-trades - Get related trades for alert
    """
    
    try:
        # Parse request
        http_method = event.get('httpMethod', '')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters', {}) or {}
        query_parameters = event.get('queryStringParameters', {}) or {}
        
        print(f"Request: {http_method} {path}")
        print(f"Path params: {path_parameters}")
        print(f"Query params: {query_parameters}")
        
        # Handle OPTIONS for CORS
        if http_method == 'OPTIONS':
            return response(200, {})
        
        # Route to appropriate handler
        if http_method == 'GET':
            if path == '/alerts' or path.endswith('/alerts'):
                return list_alerts(query_parameters)
            elif '/customer-trade' in path:
                return get_customer_trade(path_parameters)
            elif '/related-trades' in path:
                return get_related_trades(path_parameters, query_parameters)
            elif '/account' in path:
                return get_account_details(path_parameters)
            elif '/product' in path:
                return get_product_details(path_parameters)
            elif path_parameters.get('alertId'):
                return get_alert_details(path_parameters)
            else:
                return error_response(404, 'Route not found')
        else:
            return error_response(405, f'Method {http_method} not allowed')
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return error_response(500, f'Internal server error: {str(e)}')


def list_alerts(query_params: Dict[str, str]) -> Dict[str, Any]:
    """
    List all alerts with optional filtering
    
    Query params:
    - status: Filter by status (pending, investigating, resolved)
    - isin: Filter by ISIN (partial match)
    - accountNumber: Filter by account number (partial match)
    - accountName: Filter by account name (partial match)
    - alertId: Filter by Alert ID (exact match)
    - dateFrom: Filter alerts from this date (YYYY-MM-DD)
    - dateTo: Filter alerts up to this date (YYYY-MM-DD)
    - sortBy: Sort field (date, alertAge) - default: date
    - sortOrder: Sort direction (asc, desc) - default: desc
    - limit: Maximum number of results (default: 100)
    - offset: Pagination offset (default: 0)
    """
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query
        query = """
            SELECT
                fa.Alert_ID,
                fa.Alert_Date,
                fa.Alert_time,
                fa.Alert_Summary,
                fa.Alert_ISIN as ISIN,
                fa.Alert_Account_Name as Account_Name,
                fa.Alert_Account_Number as Account_Number,
                ft.Trade_Price,
                ft.Trade_Qty,
                ft.Trade_Side_Code as Trade_Side,
                'pending' as status
            FROM fact_alert fa
            LEFT JOIN fact_trade ft ON fa.Alert_Trade_ID = ft.Trade_ID
            WHERE 1=1
        """
        
        params = []
        
        # Add filters
        if query_params.get('alertId'):
            query += " AND CAST(fa.Alert_ID AS TEXT) = %s"
            params.append(query_params['alertId'])
        
        if query_params.get('isin'):
            query += " AND fa.Alert_ISIN ILIKE %s"
            params.append(f"%{query_params['isin']}%")
        
        if query_params.get('accountNumber'):
            query += " AND fa.Alert_Account_Number ILIKE %s"
            params.append(f"%{query_params['accountNumber']}%")
        
        if query_params.get('accountName'):
            query += " AND fa.Alert_Account_Name ILIKE %s"
            params.append(f"%{query_params['accountName']}%")
        
        if query_params.get('dateFrom'):
            query += " AND fa.Alert_Date >= %s"
            params.append(query_params['dateFrom'])
        
        if query_params.get('dateTo'):
            query += " AND fa.Alert_Date <= %s"
            params.append(query_params['dateTo'])
        
        # Add ordering
        sort_by = query_params.get('sortBy', 'date')
        sort_order = query_params.get('sortOrder', 'desc').upper()
        if sort_order not in ('ASC', 'DESC'):
            sort_order = 'DESC'
        
        if sort_by == 'alertAge':
            # Alert age = days since alert date; sorting by age DESC = oldest first = date ASC
            query += f" ORDER BY fa.Alert_Date {'ASC' if sort_order == 'DESC' else 'DESC'}, fa.Alert_time {'ASC' if sort_order == 'DESC' else 'DESC'}"
        else:
            # Default: sort by date
            query += f" ORDER BY fa.Alert_Date {sort_order}, fa.Alert_time {sort_order}"

        
        # Add pagination
        limit = int(query_params.get('limit', 100))
        offset = int(query_params.get('offset', 0))
        query += " LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        # Execute query
        cursor.execute(query, params)
        alerts = cursor.fetchall()
        
        # Get total count
        count_query = """
            SELECT COUNT(*) as total
            FROM fact_alert fa
            WHERE 1=1
        """
        count_params = []
        
        if query_params.get('alertId'):
            count_query += " AND CAST(fa.Alert_ID AS TEXT) = %s"
            count_params.append(query_params['alertId'])
        
        if query_params.get('isin'):
            count_query += " AND fa.Alert_ISIN ILIKE %s"
            count_params.append(f"%{query_params['isin']}%")
        
        if query_params.get('accountNumber'):
            count_query += " AND fa.Alert_Account_Number ILIKE %s"
            count_params.append(f"%{query_params['accountNumber']}%")
        
        if query_params.get('accountName'):
            count_query += " AND fa.Alert_Account_Name ILIKE %s"
            count_params.append(f"%{query_params['accountName']}%")
        
        if query_params.get('dateFrom'):
            count_query += " AND fa.Alert_Date >= %s"
            count_params.append(query_params['dateFrom'])
        
        if query_params.get('dateTo'):
            count_query += " AND fa.Alert_Date <= %s"
            count_params.append(query_params['dateTo'])
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']
        
        cursor.close()
        
        return response(200, {
            'alerts': alerts,
            'total': total,
            'limit': limit,
            'offset': offset
        })
    
    except Exception as e:
        print(f"Error listing alerts: {str(e)}")
        return error_response(500, f'Failed to list alerts: {str(e)}')


def get_alert_details(path_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get detailed alert information
    
    Path params:
    - alertId: Alert identifier
    """
    
    alert_id = path_params.get('alertId')
    if not alert_id:
        return error_response(400, 'alertId is required')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get alert details
        query = """
            SELECT
                fa.Alert_ID,
                fa.Alert_Date,
                fa.Alert_time,
                fa.Alert_Summary,
                fa.Alert_ISIN as ISIN,
                fa.Alert_Account_ID,
                fa.Alert_Account_Name as Account_Name,
                fa.Alert_Account_Number as Account_Number,
                fa.Alert_Trade_ID,
                ft.Trade_Price,
                ft.Trade_Qty,
                ft.Trade_Side_Code as Trade_Side,
                ft.Trade_Side_Name,
                'pending' as status
            FROM fact_alert fa
            LEFT JOIN fact_trade ft ON fa.Alert_Trade_ID = ft.Trade_ID
            WHERE fa.Alert_ID = %s
        """
        
        cursor.execute(query, (alert_id,))
        alert = cursor.fetchone()
        
        if not alert:
            cursor.close()
            return error_response(404, f'Alert {alert_id} not found')
        
        cursor.close()
        
        return response(200, {'alert': alert})
    
    except Exception as e:
        print(f"Error getting alert details: {str(e)}")
        return error_response(500, f'Failed to get alert details: {str(e)}')


def get_account_details(path_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get account details for an alert
    
    Path params:
    - alertId: Alert identifier
    """
    
    alert_id = path_params.get('alertId')
    if not alert_id:
        return error_response(400, 'alertId is required')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get account details from alert
        query = """
            SELECT
                da.Account_ID,
                da.Account_Number,
                da.Account_Name,
                da.Account_Type,
                da.Account_Sub_Type,
                da.Account_FRB_Code as FRB_Code,
                da.Account_MLI_number as MLI_Number,
                da.Account_Country
            FROM fact_alert fa
            JOIN dim_account da ON fa.Alert_Account_ID = da.Account_ID
            WHERE fa.Alert_ID = %s
        """
        
        cursor.execute(query, (alert_id,))
        account = cursor.fetchone()
        
        cursor.close()
        
        if not account:
            return error_response(404, f'Account not found for alert {alert_id}')
        
        return response(200, {'account': account})
    
    except Exception as e:
        print(f"Error getting account details: {str(e)}")
        return error_response(500, f'Failed to get account details: {str(e)}')


def get_product_details(path_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get product details for an alert
    
    Path params:
    - alertId: Alert identifier
    """
    
    alert_id = path_params.get('alertId')
    if not alert_id:
        return error_response(400, 'alertId is required')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get product details from alert
        query = """
            SELECT
                dp.Product_ISIN as ISIN,
                dp.Product_CUSIP as CUSIP,
                dp.Product_BBGID as BBGID,
                dp.Product_Description_Short as Product_Description,
                dp.Product_Country_of_issue as Country_of_issue,
                dp.Product_Currency_of_issue as Currency_of_issue,
                dp.Product_Issue_Date as Issue_Date,
                dp.Product_Maturity_Date as Maturity_Date,
                dp.Product_Type,
                dp.Product_Sub_Type,
                dp.Product_Category
            FROM fact_alert fa
            JOIN dim_product dp ON fa.Alert_ISIN = dp.Product_ISIN
            WHERE fa.Alert_ID = %s
        """
        
        cursor.execute(query, (alert_id,))
        product = cursor.fetchone()
        
        cursor.close()
        
        if not product:
            return error_response(404, f'Product not found for alert {alert_id}')
        
        return response(200, {'product': product})
    
    except Exception as e:
        print(f"Error getting product details: {str(e)}")
        return error_response(500, f'Failed to get product details: {str(e)}')


def get_customer_trade(path_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get customer trade that triggered the alert
    
    Path params:
    - alertId: Alert identifier
    """
    
    alert_id = path_params.get('alertId')
    if not alert_id:
        return error_response(400, 'alertId is required')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get customer trade details
        query = """
            SELECT
                ft.Trade_ID,
                ft.Trade_Account_Name as Account_Name,
                ft.Trade_Side_Code as Trade_Side,
                ft.Trade_Side_Name,
                ft.Trade_Book_Code as Book_Code,
                ft.Trade_Standard_ID as Standard_ID,
                ft.Trade_Qty,
                ft.Trade_Price,
                ft.Trade_Notional,
                ft.Trade_Date,
                ft.Trade_Time,
                ft.Trade_Entry_Date,
                ft.Trade_Event_Type as Event_Type,
                ft.Trade_Trader_Capacity as Trader_Capacity,
                ft.Trade_source_name as Trade_Source,
                ft.Trade_Legal_Entity as Legal_Entity,
                ft.Trade_Algorithm_Flag as Algo,
                ft.Trade_Type_Name as Trade_Type,
                ft.Trade_Trader_ID as Trader_ID,
                ft.Trade_Trader_Name as Trader_Name,
                ft.Trade_Venue as Venue,
                ft.Trade_Dealer_Name as Dealer_Name,
                ft.Trade_IsVoiceTrade as Is_Voice_Trade,
                ft.Trade_State
            FROM fact_alert fa
            JOIN fact_trade ft ON fa.Alert_Trade_ID = ft.Trade_ID
            WHERE fa.Alert_ID = %s
        """
        
        cursor.execute(query, (alert_id,))
        trade = cursor.fetchone()
        
        cursor.close()
        
        if not trade:
            return error_response(404, f'Customer trade not found for alert {alert_id}')
        
        return response(200, {'customerTrade': trade})
    
    except Exception as e:
        print(f"Error getting customer trade: {str(e)}")
        return error_response(500, f'Failed to get customer trade: {str(e)}')


def get_related_trades(path_params: Dict[str, str], query_params: Dict[str, str]) -> Dict[str, Any]:
    """
    Get related trades for an alert (flagged trades)

    Path params:
    - alertId: Alert identifier

    Query params:
    - limit: Maximum number of results (default: 50)
    """
    
    alert_id = path_params.get('alertId')
    if not alert_id:
        return error_response(400, 'alertId is required')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        limit = int(query_params.get('limit', 50))
        
        # Get related trades (flagged trades)
        query = """
            SELECT 
                ft.Trade_ID,
                ft.Trade_Account_Name as Account_Name,
                ft.Trade_Side_Code as Trade_Side,
                ft.Trade_Side_Name,
                ft.Trade_Book_Code as Book_Code,
                ft.Trade_Standard_ID as Standard_ID,
                ft.Trade_Qty,
                ft.Trade_Price,
                ft.Trade_Date,
                ft.Trade_Time,
                ft.Trade_Trader_ID as Trader_ID,
                ft.Trade_Trader_Name as Trader_Name,
                ft.Trade_Venue as Venue,
                ft.Trade_State,
                ft.Trade_Trader_Capacity as Trader_Capacity,
                ft.Trade_Legal_Entity as Legal_Entity,
                ft.Trade_Type_Name as Trade_Type,
                ft.Trade_IsVoiceTrade as Is_Voice_Trade
            FROM flagged_trade frt
            JOIN fact_trade ft ON frt.trade_id = ft.trade_id
            WHERE frt.trade_alert_id = %s
            ORDER BY ft.Trade_Date DESC, ft.Trade_Time DESC
            LIMIT %s
        """
        
        cursor.execute(query, (alert_id, limit))
        trades = cursor.fetchall()
        
        cursor.close()
        
        return response(200, {
            'relatedTrades': trades,
            'count': len(trades)
        })
    
    except Exception as e:
        print(f"Error getting related trades: {str(e)}")
        return error_response(500, f'Failed to get related trades: {str(e)}')
