"""
Picture classification prediction schema definitions.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

from app.models.media import MediaType


class PictureClassificationPredictionBase(BaseModel):
    """Base picture classification prediction schema"""
    media_type: MediaType = Field(..., description="Type of media (image/frame)")
    prediction: float = Field(..., ge=0.0, le=1.0, description="Model prediction value (0.0 to 1.0)")
    model_version: str = Field(..., min_length=1, max_length=255, description="Version of the classification model")


class PictureClassificationPredictionCreate(PictureClassificationPredictionBase):
    """Schema for creating picture classification prediction"""
    media_id: UUID = Field(..., description="ID of the media file")


class PictureClassificationPredictionUpdate(BaseModel):
    """Schema for updating picture classification prediction"""
    prediction: Optional[float] = Field(None, ge=0.0, le=1.0, description="Model prediction value (0.0 to 1.0)")
    model_version: Optional[str] = Field(None, min_length=1, max_length=255, description="Version of the classification model")


class PictureClassificationPredictionInDB(PictureClassificationPredictionBase):
    """Schema representing a picture classification prediction in the database"""
    id: UUID
    media_id: UUID = Field(alias="mediaId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PictureClassificationPrediction(PictureClassificationPredictionInDB):
    """Schema for picture classification prediction responses"""
    pass