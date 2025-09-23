"""
Study schema definitions.
"""


from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

from app.schemas.media import MediaSummary


class StudyBase(BaseModel):
    """Base study schema"""
    alias: str = Field(..., min_length=1, max_length=255, description="Study alias/name")


class StudyCreate(StudyBase):
    """Schema for creating a study"""


class StudyUpdate(BaseModel):
    """Schema for updating a study"""
    alias: Optional[str] = Field(None, min_length=1, max_length=255, description="Study alias/name")


class StudyInDBBase(StudyBase):
    """Base schema for studies in database"""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    doctor_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class Study(StudyInDBBase):
    """Study schema for API responses"""


class StudyWithMedia(Study):
    """Study schema with media information"""
    media: List[MediaSummary] = []


class StudyInDB(StudyInDBBase):
    """Study schema for database operations"""


class StudyListResponse(BaseModel):
    """Response schema for study list"""
    studies: List[Study]
    total: int
    page: int
    page_size: int


class StudySummary(BaseModel):
    """Summary schema for study information"""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    alias: str
    media_count: int
    created_at: datetime
    updated_at: datetime
