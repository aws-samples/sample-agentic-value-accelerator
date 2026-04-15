"""
Configuration settings for Control Plane backend
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "Control Plane API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    USE_DEV_AUTH: bool = Field(default=True, description="Use development auth bypass")

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./control_plane.db",
        description="PostgreSQL connection string"
    )
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10

    # AWS
    AWS_REGION: str = Field(default="us-east-1")
    DEPLOYMENTS_TABLE_NAME: str = Field(default="fsi-control-plane-deployments")
    APP_FACTORY_TABLE_NAME: str = Field(default="fsi-control-plane-app-factory")
    S3_DELIVERY_BUCKET: str = Field(default="fsi-control-plane-deployments")
    S3_BUCKET_NAME: str = Field(
        default="",
        description="S3 bucket for project archives"
    )
    STATE_MACHINE_ARN: str = Field(
        default="",
        description="Step Functions state machine ARN for deployment pipeline"
    )

    # Cognito
    COGNITO_USER_POOL_ID: str = Field(
        default="",
        description="Cognito user pool ID"
    )
    COGNITO_CLIENT_ID: str = Field(
        default="",
        description="Cognito client ID"
    )
    COGNITO_REGION: str = Field(default="us-east-1")

    # API
    API_PREFIX: str = "/api/v1"
    ROOT_PATH: str = Field(default="", description="Root path for API (e.g., /dev for API Gateway stage)")
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"]

    # Infrastructure
    CONTROL_PLANE_VPC_ID: str = Field(default="", description="Control plane VPC ID for foundation stack reuse")

    # Templates
    TEMPLATES_DIR: str = Field(default="templates", description="Templates directory path")
    REFERENCE_IMPLEMENTATIONS_DIR: str = Field(default="", description="Reference implementations directory path")

    # FSI Foundry
    FOUNDRY_OFFERINGS_PATH: str = Field(default="", description="Path to FSI Foundry offerings.json")
    FOUNDRY_IAC_PATH: str = Field(default="", description="Path to FSI Foundry IaC foundations directory")
    FOUNDRY_SRC_PATH: str = Field(default="", description="Path to FSI Foundry foundations source")
    FOUNDRY_USE_CASES_PATH: str = Field(default="", description="Path to FSI Foundry use cases")
    FOUNDRY_DOCKER_PATH: str = Field(default="", description="Path to FSI Foundry Docker files")
    FOUNDRY_UI_PATH: str = Field(default="", description="Path to FSI Foundry per-use-case UI directory")

    # Logging
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Use TEMPLATES_PATH env var if set (for Docker), otherwise resolve relative to backend dir
        templates_path_env = os.getenv("TEMPLATES_PATH")
        if templates_path_env:
            self.TEMPLATES_DIR = templates_path_env
        elif not os.path.isabs(self.TEMPLATES_DIR):
            # Get backend directory (parent of src/)
            backend_dir = Path(__file__).parent.parent.parent
            self.TEMPLATES_DIR = str((backend_dir / self.TEMPLATES_DIR).resolve())

        # Resolve offerings path
        if not self.FOUNDRY_OFFERINGS_PATH:
            offerings_env = os.getenv("FOUNDRY_OFFERINGS_PATH")
            if offerings_env:
                self.FOUNDRY_OFFERINGS_PATH = offerings_env
            else:
                # Try Docker path first, then local dev path
                docker_path = "/app/data/offerings.json"
                if os.path.exists(docker_path):
                    self.FOUNDRY_OFFERINGS_PATH = docker_path
                else:
                    backend_dir = Path(__file__).parent.parent.parent
                    local_path = backend_dir.parent.parent.parent / "applications" / "fsi_foundry" / "data" / "registry" / "offerings.json"
                    self.FOUNDRY_OFFERINGS_PATH = str(local_path)

        # Resolve foundry IaC path
        if not self.FOUNDRY_IAC_PATH:
            iac_env = os.getenv("FOUNDRY_IAC_PATH")
            if iac_env:
                self.FOUNDRY_IAC_PATH = iac_env
            else:
                docker_path = "/app/fsi_foundry/foundations/iac"
                if os.path.exists(docker_path):
                    self.FOUNDRY_IAC_PATH = docker_path
                else:
                    backend_dir = Path(__file__).parent.parent.parent
                    local_path = backend_dir.parent.parent.parent / "applications" / "fsi_foundry" / "foundations" / "iac"
                    self.FOUNDRY_IAC_PATH = str(local_path)

        # Resolve foundry source, use cases, and docker paths
        fsi_root = Path(self.FOUNDRY_IAC_PATH).parent.parent  # foundations/iac -> foundations -> fsi_foundry root
        docker_root = "/app/fsi_foundry" if os.path.exists("/app/fsi_foundry") else str(fsi_root)

        if not self.FOUNDRY_SRC_PATH:
            self.FOUNDRY_SRC_PATH = os.getenv("FOUNDRY_SRC_PATH", str(fsi_root / "foundations" / "src"))
        if not self.FOUNDRY_USE_CASES_PATH:
            self.FOUNDRY_USE_CASES_PATH = os.getenv("FOUNDRY_USE_CASES_PATH", str(fsi_root / "use_cases"))
        if not self.FOUNDRY_DOCKER_PATH:
            self.FOUNDRY_DOCKER_PATH = os.getenv("FOUNDRY_DOCKER_PATH", str(fsi_root / "foundations" / "docker"))
        if not self.FOUNDRY_UI_PATH:
            self.FOUNDRY_UI_PATH = os.getenv("FOUNDRY_UI_PATH", str(fsi_root / "ui"))


# Global settings instance
settings = Settings()
