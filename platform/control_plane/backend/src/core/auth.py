"""
Authentication utilities with development mode support
"""

from typing import Dict
from fastapi import Depends

from core.config import settings

# USE_DEV_AUTH alone, deliberately. It already folds in DEBUG and the environment
# gate - see Settings.__init__. Re-adding `or settings.DEBUG` here would reopen the
# door that gate exists to close.
if settings.USE_DEV_AUTH:
    from core.dev_auth import get_current_user_dev as get_current_user
    from core.dev_auth import require_admin_dev as require_admin
else:
    from core.security import get_current_user, require_admin

# Export for use in routes
__all__ = ["get_current_user", "require_admin"]
