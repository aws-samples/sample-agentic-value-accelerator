"""Agent tools for the conversational assistant."""

import ast
import math
import operator
from datetime import datetime, timezone

from strands import tool

_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

_SAFE_FUNCTIONS = {
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "abs": abs,
    "round": round,
}

_SAFE_CONSTANTS = {
    "pi": math.pi,
    "e": math.e,
}


def _safe_eval(node: ast.AST) -> float:
    """Recursively evaluate an AST node with only safe operations."""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.Name) and node.id in _SAFE_CONSTANTS:
        return _SAFE_CONSTANTS[node.id]
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_OPERATORS:
        left = _safe_eval(node.left)
        right = _safe_eval(node.right)
        return _SAFE_OPERATORS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_OPERATORS:
        return _SAFE_OPERATORS[type(node.op)](_safe_eval(node.operand))
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _SAFE_FUNCTIONS:
        args = [_safe_eval(arg) for arg in node.args]
        return _SAFE_FUNCTIONS[node.func.id](*args)
    raise ValueError(f"Unsupported expression: {ast.dump(node)}")


@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression.

    Supports basic arithmetic (+, -, *, /), exponents (**), and common math
    functions (sqrt, sin, cos, tan, log, abs, round).

    Args:
        expression: A mathematical expression to evaluate, e.g. "sqrt(144) + 2 * 3"
    """
    try:
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval(tree)
        return str(result)
    except (ValueError, SyntaxError, TypeError, ZeroDivisionError) as e:
        return f"Error evaluating '{expression}': {e}"


@tool
def get_current_datetime(timezone_name: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone_name: Timezone name. Only 'UTC' is supported without additional dependencies.
    """
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d %H:%M:%S %Z")
