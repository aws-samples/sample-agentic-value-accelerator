# SPDX-License-Identifier: Apache-2.0
"""
Orchestration Patterns Module.

Provides reusable orchestration patterns for multi-agent workflows.
These patterns are generic and can be used by any agent implementation.
"""

import asyncio
from typing import List, Callable, TypeVar, Any, Dict

T = TypeVar('T')


async def parallel_execution(
    functions: List[Callable[..., T]],
    *args,
    **kwargs
) -> List[T]:
    """
    Execute multiple async functions in parallel.
    
    All functions receive the same arguments and are executed concurrently
    using asyncio.gather.
    
    Args:
        functions: List of async functions to execute
        *args: Positional arguments to pass to each function
        **kwargs: Keyword arguments to pass to each function
        
    Returns:
        List of results from each function in the same order as input
        
    Usage:
        results = await parallel_execution(
            [analyze_credit, check_compliance],
            customer_id="CUST001"
        )
    """
    tasks = [func(*args, **kwargs) for func in functions]
    return await asyncio.gather(*tasks)


async def sequential_pipeline(
    functions: List[Callable],
    initial_state: dict
) -> dict:
    """
    Execute functions sequentially, passing state through each step.
    
    Each function receives the state from the previous function and
    returns an updated state for the next function.
    
    Args:
        functions: List of async functions to execute in sequence
        initial_state: Initial state dictionary to pass to first function
        
    Returns:
        Final state after all functions have executed
        
    Usage:
        result = await sequential_pipeline(
            [step1, step2, step3],
            {"input": "data"}
        )
    """
    state = initial_state
    for func in functions:
        state = await func(state)
    return state


def conditional_router(
    condition_func: Callable[[Any], str],
    routes: Dict[str, Callable]
) -> Callable:
    """
    Create a conditional router function.
    
    The router evaluates a condition on the input state and routes
    to the appropriate handler based on the result.
    
    Args:
        condition_func: Function that takes state and returns a route key
        routes: Dictionary mapping route keys to handler functions
        
    Returns:
        Async function that routes based on condition
        
    Usage:
        router = conditional_router(
            lambda state: state["type"],
            {"full": run_full, "partial": run_partial}
        )
        result = await router(state)
    """
    async def route(state: Any) -> Any:
        condition = condition_func(state)
        handler = routes.get(condition)
        if handler is None:
            available_routes = list(routes.keys())
            raise ValueError(
                f"No route for condition: '{condition}'. "
                f"Available routes: {available_routes}"
            )
        return await handler(state)
    return route
