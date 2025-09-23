"""
Picture bounding box prediction schema definitions.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

from app.models.media import MediaType


class PictureBBPredictionBase(BaseModel):
    """Base picture bounding box prediction schema"""
    media_type: MediaType = Field(..., description="Type of media (image/frame)")
    bb_class: str = Field(..., min_length=1, max_length=100, description="Bounding box class name")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence (0.0 to 1.0)")
    x_min: float = Field(..., description="Bounding box x minimum coordinate")
    y_min: float = Field(..., description="Bounding box y minimum coordinate")
    width: float = Field(..., gt=0, description="Bounding box width")
    height: float = Field(..., gt=0, description="Bounding box height")
    model_version: str = Field(..., min_length=1, max_length=255, description="Version of the BB model")


class PictureBBPredictionCreate(PictureBBPredictionBase):
    """Schema for creating picture bounding box prediction"""
    media_id: UUID = Field(..., description="ID of the media file")


class PictureBBPredictionUpdate(BaseModel):
    """Schema for updating picture bounding box prediction"""
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0, description="Model confidence (0.0 to 1.0)")
    x_min: Optional[float] = Field(None, description="Bounding box x minimum coordinate")
    y_min: Optional[float] = Field(None, description="Bounding box y minimum coordinate")
    width: Optional[float] = Field(None, gt=0, description="Bounding box width")
    height: Optional[float] = Field(None, gt=0, description="Bounding box height")
    model_version: Optional[str] = Field(None, min_length=1, max_length=255, description="Version of the BB model")


class PictureBBPredictionInDB(PictureBBPredictionBase):
    """Schema representing a picture bounding box prediction in the database"""
    id: UUID
    media_id: UUID = Field(alias="mediaId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PictureBBPrediction(PictureBBPredictionInDB):
    """Schema for picture bounding box prediction responses"""
    pass