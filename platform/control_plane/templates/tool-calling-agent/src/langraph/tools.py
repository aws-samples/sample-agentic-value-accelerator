"""
Tool Definitions

This module defines the tools available to the agent.
Tools are functions that the agent can invoke to accomplish tasks.

TODO: Replace these mock tools with real implementations for your use case.

Tool Best Practices:
1. Use clear, descriptive names and docstrings
2. Include type annotations for all parameters
3. Return structured data when possible
4. Handle errors gracefully (return error messages, don't raise)
5. Keep tools focused and single-purpose
6. Add validation for inputs
"""

from typing import Optional, List, Dict, Any
from langchain_core.tools import tool
import json


@tool
def calculator(expression: str) -> str:
    """
    Evaluate a mathematical expression.

    Use this tool when you need to perform calculations.
    Supports basic arithmetic: +, -, *, /, **, (), etc.

    Args:
        expression: Mathematical expression to evaluate (e.g., "15 * 23")

    Returns:
        Result of the calculation as a string

    Examples:
        - calculator("2 + 2") -> "4"
        - calculator("(10 + 5) * 3") -> "45"
        - calculator("2 ** 8") -> "256"
    """
    try:
        # TODO: Add more sophisticated math operations if needed
        # Could use sympy for symbolic math, numpy for scientific computing, etc.

        # Basic implementation using eval (safe for numeric expressions)
        # In production, consider using ast.literal_eval or a proper parser
        result = eval(expression, {"__builtins__": {}}, {})
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"


@tool
def search(query: str, max_results: int = 5) -> str:
    """
    Search for information on the web or in a knowledge base.

    Use this tool when you need to find information about a topic.

    Args:
        query: Search query
        max_results: Maximum number of results to return (default: 5)

    Returns:
        Search results as formatted string

    Examples:
        - search("machine learning basics")
        - search("Python best practices", max_results=3)
    """
    # TODO: Implement real search
    # Options:
    # - Web search API (Google, Bing, SerpAPI, etc.)
    # - Internal knowledge base
    # - Vector database search
    # - Elasticsearch/OpenSearch

    # Mock implementation
    mock_results = [
        {
            "title": f"Result 1 for '{query}'",
            "snippet": "This is a placeholder result. TODO: Implement real search.",
            "url": "https://example.com/result1"
        },
        {
            "title": f"Result 2 for '{query}'",
            "snippet": "Replace this with actual search results from your search API.",
            "url": "https://example.com/result2"
        }
    ]

    # Limit results
    results = mock_results[:max_results]

    # Format as string
    formatted = []
    for i, result in enumerate(results, 1):
        formatted.append(
            f"{i}. {result['title']}\n"
            f"   {result['snippet']}\n"
            f"   URL: {result['url']}"
        )

    return "\n\n".join(formatted)


@tool
def get_weather(location: str, units: str = "celsius") -> str:
    """
    Get current weather information for a location.

    Use this tool when you need weather data.

    Args:
        location: City name or coordinates
        units: Temperature units - "celsius" or "fahrenheit" (default: celsius)

    Returns:
        Weather information as formatted string

    Examples:
        - get_weather("San Francisco")
        - get_weather("New York", units="fahrenheit")
    """
    # TODO: Implement real weather API
    # Options:
    # - OpenWeatherMap
    # - WeatherAPI
    # - AWS Weather Service
    # - NOAA API

    # Mock implementation
    mock_weather = {
        "location": location,
        "temperature": 22 if units == "celsius" else 72,
        "units": units,
        "condition": "Partly Cloudy",
        "humidity": 65,
        "wind_speed": 10,
        "wind_unit": "km/h" if units == "celsius" else "mph"
    }

    return (
        f"Weather in {mock_weather['location']}:\n"
        f"Temperature: {mock_weather['temperature']}°{units[0].upper()}\n"
        f"Condition: {mock_weather['condition']}\n"
        f"Humidity: {mock_weather['humidity']}%\n"
        f"Wind: {mock_weather['wind_speed']} {mock_weather['wind_unit']}\n"
        f"\nTODO: Replace with real weather data from API"
    )


@tool
def set_timer(duration_minutes: int, label: Optional[str] = None) -> str:
    """
    Set a timer or reminder.

    Use this tool when you need to schedule a reminder or timer.

    Args:
        duration_minutes: Timer duration in minutes
        label: Optional label for the timer

    Returns:
        Confirmation message

    Examples:
        - set_timer(30, "Meeting reminder")
        - set_timer(5)
    """
    # TODO: Implement real timer/reminder system
    # Options:
    # - AWS EventBridge scheduled events
    # - Database-backed job queue
    # - Integration with calendar service
    # - Push notification service

    # Mock implementation
    timer_label = label if label else "Timer"
    return (
        f"✅ Timer set: {timer_label} for {duration_minutes} minutes\n"
        f"TODO: Implement actual timer/reminder system"
    )


@tool
def send_notification(message: str, recipient: Optional[str] = None) -> str:
    """
    Send a notification message.

    Use this tool when you need to notify someone.

    Args:
        message: Notification message
        recipient: Optional recipient identifier

    Returns:
        Confirmation message

    Examples:
        - send_notification("Task completed", "admin")
        - send_notification("Alert: System status update")
    """
    # TODO: Implement real notification system
    # Options:
    # - SNS (email, SMS, push)
    # - Slack webhook
    # - Email service (SES)
    # - In-app notifications

    # Mock implementation
    recipient_info = f" to {recipient}" if recipient else ""
    return (
        f"✅ Notification sent{recipient_info}\n"
        f"Message: {message}\n"
        f"TODO: Implement actual notification delivery"
    )


@tool
def fetch_data(endpoint: str, method: str = "GET", params: Optional[Dict[str, Any]] = None) -> str:
    """
    Fetch data from an API endpoint.

    Use this tool when you need to retrieve data from external APIs.

    Args:
        endpoint: API endpoint URL
        method: HTTP method (GET, POST, etc.)
        params: Optional request parameters

    Returns:
        API response data

    Examples:
        - fetch_data("https://api.example.com/users/123")
        - fetch_data("https://api.example.com/search", params={"q": "test"})
    """
    # TODO: Implement real API client
    # Options:
    # - requests library
    # - httpx for async
    # - boto3 for AWS services
    # - Custom API clients

    # Important: Add authentication, rate limiting, error handling

    # Mock implementation
    mock_response = {
        "endpoint": endpoint,
        "method": method,
        "params": params or {},
        "data": "TODO: Implement real API call",
        "status": "mock"
    }

    return json.dumps(mock_response, indent=2)


def get_example_tools() -> List:
    """
    Get list of example tools for the agent.

    Returns:
        List of tool instances
    """
    return [
        calculator,
        search,
        get_weather,
        set_timer,
        send_notification,
        fetch_data
    ]


# Tool categories for organization
TOOL_CATEGORIES = {
    "computation": [calculator],
    "information": [search, get_weather],
    "scheduling": [set_timer],
    "communication": [send_notification],
    "integration": [fetch_data]
}


def get_tools_by_category(category: str) -> List:
    """
    Get tools by category.

    Args:
        category: Tool category name

    Returns:
        List of tools in that category
    """
    return TOOL_CATEGORIES.get(category, [])


def list_available_tools() -> Dict[str, Any]:
    """
    List all available tools with metadata.

    Returns:
        Dictionary of tool information
    """
    tools = get_example_tools()

    tool_info = {}
    for tool in tools:
        tool_info[tool.name] = {
            "description": tool.description,
            "parameters": tool.args_schema.schema() if hasattr(tool, 'args_schema') else {}
        }

    return tool_info


# Example: Adding a custom tool
"""
@tool
def my_custom_tool(param1: str, param2: int) -> str:
    '''
    Description of what this tool does.

    Args:
        param1: Description of param1
        param2: Description of param2

    Returns:
        Description of return value
    '''
    # TODO: Implement your tool logic here
    result = f"Processed {param1} with {param2}"
    return result

# Add to get_example_tools():
# return [calculator, search, get_weather, ..., my_custom_tool]
"""
