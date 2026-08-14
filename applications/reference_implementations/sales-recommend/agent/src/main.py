# SPDX-License-Identifier: Apache-2.0
"""
Sales Recommend Agent — Main Entry Point (AVA-compatible)

Supports two deployment modes via DEPLOYMENT_MODE env var:
- agentcore (default): Runs the BedrockAgentCoreApp directly
- fastapi: Wraps the handler in a FastAPI app for local development
"""

import os
import sys

DEPLOYMENT_MODE = os.environ.get("DEPLOYMENT_MODE", "agentcore").lower()

if DEPLOYMENT_MODE == "agentcore":
    # When running as `python -m src.main`, relative imports work.
    # When running as `python src/main.py`, they don't. Handle both.
    try:
        from .recommend import app
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from recommend import app

    if __name__ == "__main__":
        app.run()

elif DEPLOYMENT_MODE == "fastapi":
    import json
    import uvicorn
    from fastapi import FastAPI, Request

    try:
        from .recommend import handler
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from recommend import handler

    api = FastAPI(title="Sales Recommend Agent", version="0.1.0")

    @api.post("/invoke")
    async def invoke(request: Request):
        body = await request.json()
        result = await handler(body)
        return result

    @api.get("/health")
    async def health():
        return {"status": "ok"}

    if __name__ == "__main__":
        uvicorn.run("src.main:api", host="0.0.0.0", port=8080, reload=True)

else:
    raise ValueError(
        f"Invalid DEPLOYMENT_MODE: {DEPLOYMENT_MODE}. Valid: agentcore, fastapi"
    )
