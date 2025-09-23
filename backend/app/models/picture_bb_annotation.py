"""
Picture bounding box annotation model definition.
"""

import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Integer, Boolean, UniqueConstraint, CheckConstraint, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.media import MediaType


# pylint: disable=not-callable,line-too-long
class PictureBBAnnotation(Base):
    """Model for storing clinician annotations for bounding boxes"""
    __tablename__ = "picture_bb_annotations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    media_type = Column(SQLEnum(MediaType, name='bb_annotation_media_type', values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    bb_class = Column(String(100), nullable=False, index=True)  # Bounding box class name
    usefulness = Column(Integer, nullable=False, default=1)  # Clinician assessment: 0 (not useful) or 1 (useful)
    x_min = Column(Float, nullable=False)  # Bounding box coordinates
    y_min = Column(Float, nullable=False)
    width = Column(Float, nullable=False)  # Bounding box dimensions
    height = Column(Float, nullable=False)
    is_hidden = Column(Boolean, nullable=False, default=False)  # Whether annotation is hidden for model training
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    media = relationship("Media", back_populates="bb_annotations")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('media_id', 'bb_class', name='unique_media_bb_class_annotation'),
        CheckConstraint('usefulness IN (0, 1)', name='valid_bb_usefulness'),
    )
    
    def __repr__(self):
        return f"<PictureBBAnnotation(id='{self.id}', media_id='{self.media_id}', bb_class='{self.bb_class}', usefulness='{self.usefulness}', is_hidden='{self.is_hidden}')>"