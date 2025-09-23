"""
Picture classification prediction model definition.
"""

import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.media import MediaType


# pylint: disable=not-callable,line-too-long
class PictureClassificationPrediction(Base):
    """Model for storing AI model predictions for picture usefulness classification"""
    __tablename__ = "picture_classification_predictions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    media_type = Column(SQLEnum(MediaType, name='prediction_media_type', values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    prediction = Column(Float, nullable=False)  # Model prediction value (0.0 to 1.0)
    model_version = Column(String(255), nullable=False, index=True)  # Version of the classification model
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    media = relationship("Media", back_populates="classification_predictions")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('media_id', 'model_version', name='unique_media_model_classification'),
    )
    
    def __repr__(self):
        return f"<PictureClassificationPrediction(id='{self.id}', media_id='{self.media_id}', prediction='{self.prediction}', model_version='{self.model_version}')>"