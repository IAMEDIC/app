"""
Study model definition.
"""


import uuid

from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


# pylint: disable=not-callable,line-too-long
class Study(Base):
    """Study model for ultrasound scan studies"""
    __tablename__ = "studies"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    # Relationships
    doctor = relationship("User", back_populates="studies")
    media = relationship("Media", back_populates="study", cascade="all, delete-orphan")
    # Constraints
    __table_args__ = (
        UniqueConstraint('doctor_id', 'alias', name='unique_doctor_study_alias'),
    )
    
    def __repr__(self):
        return f"<Study(id='{self.id}', doctor_id='{self.doctor_id}', alias='{self.alias}', is_active={self.is_active})>"
