"""
Picture classification annotation schema definitions.
"""


from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.models.media import MediaType


class PictureClassificationAnnotationBase(BaseModel):
    """Base picture classification annotation schema"""
    media_type: MediaType = Field(..., description="Type of media (image/frame)")
    usefulness: int = Field(..., ge=0, le=1, description="Clinician assessment: 0 (not useful) or 1 (useful)")


class PictureClassificationAnnotationCreate(PictureClassificationAnnotationBase):
    """Schema for creating picture classification annotation"""
    media_id: UUID = Field(..., description="ID of the media file")


class PictureClassificationAnnotationUpdate(BaseModel):
    """Schema for updating picture classification annotation"""
    usefulness: Optional[int] = Field(None, ge=0, le=1, description="Clinician assessment: 0 (not useful) or 1 (useful)")


class PictureClassificationAnnotationInDB(PictureClassificationAnnotationBase):
    """Schema representing a picture classification annotation in the database"""
    id: UUID
    media_id: UUID = Field(alias="mediaId")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PictureClassificationAnnotation(PictureClassificationAnnotationInDB):
    """Schema for picture classification annotation responses"""
