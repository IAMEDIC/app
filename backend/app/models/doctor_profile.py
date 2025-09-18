"""
Doctor profile model definition.
"""


import uuid
from enum import Enum

from sqlalchemy import Column, String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


class DoctorProfileStatus(str, Enum):
    """Enumeration of doctor profile approval statuses"""
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"


# pylint: disable=not-callable,line-too-long
class DoctorProfile(Base):
    """Doctor profile model for additional doctor information"""
    __tablename__ = "doctor_profiles"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    matriculation_id = Column(String, nullable=False, unique=True, index=True)
    legal_name = Column(String, nullable=False)
    specialization = Column(String, nullable=False)
    status = Column(String, nullable=False, default=DoctorProfileStatus.PENDING, index=True)
    notes = Column(Text, nullable=True)  # Admin notes for approval/denial
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    # Relationships
    user = relationship("User", back_populates="doctor_profile")
    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', name='unique_doctor_profile'),
        UniqueConstraint('matriculation_id', name='unique_matriculation_id'),
    )
    def __repr__(self):
        return f"<DoctorProfile(user_id='{self.user_id}', matriculation_id='{self.matriculation_id}', status='{self.status}')>"
