"""
Picture bounding box annotation schema definitions.
"""


from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.models.media import MediaType


class PictureBBAnnotationBase(BaseModel):
    """Base picture bounding box annotation schema"""
    media_type: MediaType = Field(..., description="Type of media (image/frame)")
    bb_class: str = Field(..., min_length=1, max_length=100, description="Bounding box class name")
    usefulness: int = Field(default=1, ge=0, le=1, description="Clinician assessment: 0 (not useful) or 1 (useful)")
    x_min: float = Field(..., description="Bounding box x minimum coordinate")
    y_min: float = Field(..., description="Bounding box y minimum coordinate")
    width: float = Field(..., gt=0, description="Bounding box width")
    height: float = Field(..., gt=0, description="Bounding box height")
    is_hidden: bool = Field(default=False, description="Whether annotation is hidden for model training")


class PictureBBAnnotationCreate(PictureBBAnnotationBase):
    """Schema for creating picture bounding box annotation"""
    media_id: UUID = Field(..., description="ID of the media file")


class PictureBBAnnotationUpdate(BaseModel):
    """Schema for updating picture bounding box annotation"""
    usefulness: Optional[int] = Field(None, ge=0, le=1, description="Clinician assessment: 0 (not useful) or 1 (useful)")
    x_min: Optional[float] = Field(None, description="Bounding box x minimum coordinate")
    y_min: Optional[float] = Field(None, description="Bounding box y minimum coordinate")
    width: Optional[float] = Field(None, gt=0, description="Bounding box width")
    height: Optional[float] = Field(None, gt=0, description="Bounding box height")
    is_hidden: Optional[bool] = Field(None, description="Whether annotation is hidden for model training")


class PictureBBAnnotationInDB(PictureBBAnnotationBase):
    """Schema representing a picture bounding box annotation in the database"""
    id: UUID
    media_id: UUID = Field(alias="mediaId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PictureBBAnnotation(PictureBBAnnotationInDB):
    """Schema for picture bounding box annotation responses"""
