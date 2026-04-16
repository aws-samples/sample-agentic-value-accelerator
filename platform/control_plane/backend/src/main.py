"""
Control Plane FastAPI Application
Main entry point for the backend API
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
import logging

from core.config import settings
from core.database import init_db

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# ASGI middleware to strip ROOT_PATH prefix
class StripPathPrefixMiddleware:
    def __init__(self, app: ASGIApp, prefix: str):
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http" and self.prefix:
            path = scope["path"]
            if path.startswith(self.prefix):
                scope["path"] = path[len(self.prefix):]
                if not scope["path"]:
                    scope["path"] = "/"
                logger.info(f"Stripped prefix: {path} -> {scope['path']}")
        await self.app(scope, receive, send)

# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """
    Initialize application on startup
    """
    logger.info("Starting Control Plane API...")

    # Initialize database
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

    logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} started")


@app.on_event("shutdown")
async def shutdown_event():
    """
    Cleanup on application shutdown
    """
    logger.info("Shutting down Control Plane API...")


@app.get("/")
async def root():
    """
    Root endpoint

    Returns:
        API information
    """
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running"
    }


# Add stage-prefixed routes for API Gateway (e.g., /dev, /prod, /staging)
if settings.ROOT_PATH:
    @app.get(f"{settings.ROOT_PATH}/test")
    async def test_stage():
        return {"message": "stage test endpoint works", "ROOT_PATH": settings.ROOT_PATH}

    @app.get(f"{settings.ROOT_PATH}/ping")
    async def ping_stage():
        return {"message": "pong"}

    @app.get(f"{settings.ROOT_PATH}/")
    async def root_stage():
        return {
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "running",
            "ROOT_PATH": settings.ROOT_PATH
        }

    @app.get(f"{settings.ROOT_PATH}/health")
    async def health_stage():
        """Health check endpoint with stage prefix"""
        return {
            "status": "healthy",
            "name": settings.APP_NAME,
            "version": settings.APP_VERSION
        }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc):
    """
    Global exception handler

    Args:
        request: FastAPI request
        exc: Exception

    Returns:
        JSON error response
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    response = JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error": str(exc) if settings.DEBUG else "An error occurred"
        }
    )
    # Ensure CORS headers are present on error responses
    origin = request.headers.get("origin")
    if origin and origin in settings.CORS_ORIGINS:
        response.headers["access-control-allow-origin"] = origin
        response.headers["access-control-allow-credentials"] = "true"
    return response


# Import and include routers
from api.routes import projects_router, langfuse_router, health_router, templates_router, bootstrap_router, deployments_router, applications_router, app_factory_router, users_router

# Include routers
app.include_router(projects_router, prefix=settings.API_PREFIX)
app.include_router(langfuse_router, prefix=settings.API_PREFIX)
app.include_router(health_router)
app.include_router(templates_router, prefix=settings.API_PREFIX)
app.include_router(bootstrap_router, prefix=settings.API_PREFIX)
app.include_router(deployments_router, prefix=settings.API_PREFIX)
app.include_router(applications_router, prefix=settings.API_PREFIX)
app.include_router(app_factory_router, prefix=settings.API_PREFIX)
app.include_router(users_router, prefix=settings.API_PREFIX)

# Include routers with stage prefix for API Gateway (e.g., /dev, /prod)
if settings.ROOT_PATH:
    app.include_router(projects_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(langfuse_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(health_router, prefix=settings.ROOT_PATH)
    app.include_router(templates_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(bootstrap_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(deployments_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(applications_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(app_factory_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")
    app.include_router(users_router, prefix=f"{settings.ROOT_PATH}{settings.API_PREFIX}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower()
    )
