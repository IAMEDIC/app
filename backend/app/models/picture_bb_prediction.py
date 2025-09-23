"""
Picture bounding box prediction model definition.
"""

import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.media import MediaType


# pylint: disable=not-callable,line-too-long
class PictureBBPrediction(Base):
    """Model for storing AI model predictions for bounding boxes"""
    __tablename__ = "picture_bb_predictions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    media_type = Column(SQLEnum(MediaType, name='bb_prediction_media_type', values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    bb_class = Column(String(100), nullable=False, index=True)  # Bounding box class name
    confidence = Column(Float, nullable=False)  # Model confidence (0.0 to 1.0)
    x_min = Column(Float, nullable=False)  # Bounding box coordinates
    y_min = Column(Float, nullable=False)
    width = Column(Float, nullable=False)  # Bounding box dimensions
    height = Column(Float, nullable=False)
    model_version = Column(String(255), nullable=False, index=True)  # Version of the BB model
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    media = relationship("Media", back_populates="bb_predictions")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('media_id', 'model_version', 'bb_class', name='unique_media_model_bb_class'),
    )
    
    def __repr__(self):
        return f"<PictureBBPrediction(id='{self.id}', media_id='{self.media_id}', bb_class='{self.bb_class}', confidence='{self.confidence}', model_version='{self.model_version}')>"