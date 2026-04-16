"""
Langfuse server database model
"""

from sqlalchemy import Column, String, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
import enum

from core.database import Base


class ServerStatus(str, enum.Enum):
    """Langfuse server status enum"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"


class LangfuseServer(Base):
    """
    Langfuse server configuration model
    """

    __tablename__ = "langfuse_servers"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Server details
    name = Column(String(255), unique=True, nullable=False, index=True)
    endpoint = Column(String(500), nullable=False)  # HTTPS URL
    region = Column(String(50), nullable=False)

    # Authentication
    public_key = Column(String(255), nullable=False)
    secret_name = Column(String(255), nullable=True)  # AWS Secrets Manager secret name
    secret_key_field = Column(String(100), nullable=True, default="langfuse_secret_key")  # JSON key within the secret


    # Status
    status = Column(
        SQLEnum(ServerStatus),
        nullable=False,
        default=ServerStatus.ACTIVE
    )

    # Metadata
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    projects = relationship("Project", back_populates="langfuse_server")

    def __repr__(self):
        return f"<LangfuseServer(name='{self.name}', status='{self.status}')>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "name": self.name,
            "endpoint": self.endpoint,
            "region": self.region,
            "public_key": self.public_key,
            "secret_name": self.secret_name,
            "secret_key_field": self.secret_key_field,
            "status": self.status.value,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
