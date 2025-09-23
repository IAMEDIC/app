"""
Picture classification annotation model definition.
"""

import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Integer, CheckConstraint, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.media import MediaType


# pylint: disable=not-callable,line-too-long
class PictureClassificationAnnotation(Base):
    """Model for storing clinician annotations for picture usefulness"""
    __tablename__ = "picture_classification_annotations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    media_type = Column(SQLEnum(MediaType, name='annotation_media_type', values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    usefulness = Column(Integer, nullable=False)  # Clinician assessment: 0 (not useful) or 1 (useful)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    media = relationship("Media", back_populates="classification_annotation", uselist=False)
    
    # Constraints
    __table_args__ = (
        CheckConstraint('usefulness IN (0, 1)', name='valid_usefulness'),
    )
    
    def __repr__(self):
        return f"<PictureClassificationAnnotation(id='{self.id}', media_id='{self.media_id}', usefulness='{self.usefulness}')>"