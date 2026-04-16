"""
Project database model
"""

from sqlalchemy import Column, String, DateTime, JSON, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from core.database import Base


class Project(Base):
    """
    Project model representing a generated agent project
    """

    __tablename__ = "projects"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Project details
    project_name = Column(String(255), unique=True, nullable=False, index=True)
    framework = Column(String(50), nullable=False)  # 'langraph' or 'strands'
    template_name = Column(String(100), nullable=False)
    iac_type = Column(String(50), nullable=False, default='terraform')  # 'terraform', 'cdk', or 'cloudformation'

    # Configuration
    aws_region = Column(String(50), nullable=False)
    tags = Column(JSON, nullable=True, default=dict)

    # Langfuse server reference
    langfuse_server_id = Column(
        UUID(as_uuid=True),
        ForeignKey("langfuse_servers.id"),
        nullable=True
    )
    langfuse_server = relationship("LangfuseServer", back_populates="projects")

    # S3 storage
    s3_url = Column(Text, nullable=False)
    s3_key = Column(String(500), nullable=False)
    expires_at = Column(DateTime, nullable=False)

    # Metadata
    created_by = Column(String(255), nullable=False)  # User ID from Cognito
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<Project(name='{self.project_name}', framework='{self.framework}')>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "project_name": self.project_name,
            "framework": self.framework,
            "template_name": self.template_name,
            "iac_type": self.iac_type,
            "aws_region": self.aws_region,
            "tags": self.tags,
            "langfuse_server_id": str(self.langfuse_server_id) if self.langfuse_server_id else None,
            "s3_url": self.s3_url,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
