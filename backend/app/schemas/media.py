"""
Media schema definitions.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

from app.models.media import MediaType, UploadStatus


class MediaBase(BaseModel):
    """Base media schema"""
    filename: str = Field(..., min_length=1, max_length=500, description="Original filename")


class MediaCreate(MediaBase):
    """Schema for creating media (used internally after file upload)"""
    model_config = ConfigDict(use_enum_values=True)
    study_id: UUID
    file_path: str = Field(..., description="Storage path/ID for the file")
    file_size: int = Field(..., gt=0, description="File size in bytes")
    mime_type: str = Field(..., description="MIME type of the file")
    media_type: MediaType = Field(..., description="Type of media (image/video)")
    upload_status: UploadStatus = Field(default=UploadStatus.UPLOADED, description="Upload status")


class MediaUpdate(BaseModel):
    """Schema for updating media"""
    model_config = ConfigDict(use_enum_values=True)
    filename: Optional[str] = Field(None, min_length=1, max_length=500, description="Original filename") # pylint: disable=line-too-long
    upload_status: Optional[UploadStatus] = Field(None, description="Upload status")


class MediaInDBBase(MediaBase):
    """Base schema for media in database"""
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: UUID
    study_id: UUID
    file_path: str
    file_size: int
    mime_type: str
    media_type: MediaType
    upload_status: UploadStatus
    created_at: datetime
    updated_at: datetime


class Media(MediaInDBBase):
    """Media schema for API responses"""


class MediaSummary(BaseModel):
    """Summary schema for media information"""
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: UUID
    filename: str
    file_size: int
    mime_type: str
    media_type: MediaType
    upload_status: UploadStatus
    created_at: datetime


class MediaInDB(MediaInDBBase):
    """Media schema for database operations"""


class MediaListResponse(BaseModel):
    """Response schema for media list"""
    media: List[MediaSummary]
    total: int
    study_id: UUID


class MediaUploadResponse(BaseModel):
    """Response schema for media upload"""
    media: Media
    message: str = "Media uploaded successfully"


class StorageInfo(BaseModel):
    """Schema for storage usage information"""
    used_bytes: int
    total_bytes: int
    available_bytes: int
    used_percentage: float
    used_mb: float
    total_mb: float
    available_mb: float
