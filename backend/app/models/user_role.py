"""
User role model definition.
"""

import uuid
from enum import Enum

from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserRoleType(str, Enum):
    """Enumeration of available user roles"""
    ADMIN = "admin"
    DOCTOR = "doctor"


# pylint: disable=not-callable
class UserRole(Base):
    """User role model for role-based access control"""
    __tablename__ = "user_roles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    # Relationships
    user = relationship("User", back_populates="roles")
    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'role', name='unique_user_role'),
    )

    def __repr__(self):
        return f"<UserRole(user_id='{self.user_id}', role='{self.role}')>"