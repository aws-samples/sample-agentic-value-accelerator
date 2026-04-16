"""
Life Insurance Agent Use Case - Strands Implementation.

AI-powered life insurance advisory using the Strands agent framework.
"""
import os
import sys

# Extend __path__ to include the real strands SDK so submodule imports
# like `from strands.tools.decorator import tool` resolve correctly.
for _site in sys.path:
    _candidate = os.path.join(os.path.abspath(_site), "strands")
    if (
        _candidate != os.path.dirname(os.path.abspath(__file__))
        and os.path.isdir(_candidate)
        and os.path.isfile(os.path.join(_candidate, "__init__.py"))
        and _candidate not in __path__
    ):
        __path__.append(_candidate)
        break

# Lazy registration to avoid circular imports during testing.
_registered = False

def _do_register():
    global _registered
    if _registered:
        return
    _registered = True
    from .orchestrator import LifeInsuranceAgentOrchestrator, run_life_insurance_agent  # noqa
    from .models import InsuranceRequest, InsuranceResponse  # noqa
    from base.registry import register_agent, RegisteredAgent
    register_agent(
        name="life_insurance_agent",
        config=RegisteredAgent(
            entry_point=run_life_insurance_agent,
            request_model=InsuranceRequest,
            response_model=InsuranceResponse,
        )
    )

def __getattr__(name):
    _exports = {"LifeInsuranceAgentOrchestrator": 0, "run_life_insurance_agent": 1,
                "InsuranceRequest": 2, "InsuranceResponse": 3}
    if name in _exports:
        _do_register()
        return globals()[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

# Eagerly register when in app context (Docker)
try:
    import base.registry  # noqa
    _do_register()
except ImportError:
    pass

__all__ = ["LifeInsuranceAgentOrchestrator", "run_life_insurance_agent",
           "InsuranceRequest", "InsuranceResponse"]
