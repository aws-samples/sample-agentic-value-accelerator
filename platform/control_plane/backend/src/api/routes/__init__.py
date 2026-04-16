"""
API routes
"""

from api.routes.projects import router as projects_router
from api.routes.langfuse import router as langfuse_router
from api.routes.health import router as health_router
from api.routes.templates import router as templates_router
from api.routes.bootstrap import router as bootstrap_router
from api.routes.deployments import router as deployments_router
from api.routes.applications import router as applications_router
from api.routes.app_factory import router as app_factory_router
from api.routes.users import router as users_router

__all__ = [
    "projects_router",
    "langfuse_router",
    "health_router",
    "templates_router",
    "bootstrap_router",
    "deployments_router",
    "applications_router",
    "app_factory_router",
    "users_router",
]
