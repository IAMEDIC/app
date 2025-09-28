"""
Frame schema definitions.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class FrameBase(BaseModel):
    """Base frame schema"""
    video_media_id: UUID = Field(..., description="ID of the video media this frame was extracted from")
    timestamp_seconds: float = Field(..., ge=0, description="Position in video in seconds")
    frame_number: int = Field(..., ge=0, description="Sequential frame number for this video")
    width: int = Field(..., gt=0, description="Frame width in pixels")
    height: int = Field(..., gt=0, description="Frame height in pixels")


class FrameCreate(FrameBase):
    """Schema for creating a frame (used internally after frame extraction)"""
    frame_media_id: UUID = Field(..., description="ID of the media record for the extracted frame image")


class FrameUpdate(BaseModel):
    """Schema for updating a frame"""
    is_active: Optional[bool] = Field(None, description="Whether the frame is active")


class FrameInDBBase(FrameBase):
    """Base schema for frame in database"""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    frame_media_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime


class Frame(FrameInDBBase):
    """Frame schema for API responses"""


class FrameSummary(BaseModel):
    """Summary schema for frame information"""
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    frame_media_id: UUID
    timestamp_seconds: float
    frame_number: int
    width: int
    height: int
    is_active: bool
    created_at: datetime


class FrameInDB(FrameInDBBase):
    """Frame schema for database operations"""


class FrameListResponse(BaseModel):
    """Response schema for frame list"""
    frames: List[FrameSummary]
    total: int
    video_media_id: UUID


class FrameCreateRequest(BaseModel):
    """Request schema for frame extraction"""
    timestamp_seconds: float = Field(..., ge=0, description="Position in video to extract frame from (seconds)")


class FrameCreateResponse(BaseModel):
    """Response schema for frame creation"""
    frame: Frame
    message: str = "Frame extracted successfully"


class VideoMetadata(BaseModel):
    """Schema for video metadata used in frame extraction"""
    duration_seconds: float
    width: int
    height: int
    fps: float
    total_frames: int