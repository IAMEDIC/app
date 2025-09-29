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


class AutoExtractionParams(BaseModel):
    """Parameters for automatic frame extraction algorithm"""
    run_threshold: float = Field(0.8, ge=0.0, le=1.0, description="Minimum probability threshold for starting a run")
    min_run_length: int = Field(5, ge=1, description="Minimum number of consecutive frames to consider a valid run")
    prediction_threshold: float = Field(0.95, ge=0.0, le=1.0, description="Minimum probability threshold for extracting a frame")
    patience: int = Field(2, ge=0, description="Number of frames below threshold before ending a run")


class AutoExtractionRequest(BaseModel):
    """Request schema for automatic frame extraction"""
    params: Optional[AutoExtractionParams] = Field(None, description="Algorithm parameters (uses defaults if not provided)")
    force_reprocess: bool = Field(False, description="Force reprocessing even if cached predictions exist")


class AutoExtractionResponse(BaseModel):
    """Response schema for automatic frame extraction"""
    frames: List[Frame] = Field(..., description="Extracted frames that meet the criteria")
    total_frames_analyzed: int = Field(..., description="Total number of frames analyzed in the video")
    runs_found: int = Field(..., description="Number of runs found above the run threshold")
    compliant_frames: int = Field(..., description="Number of frames that met the prediction threshold")
    message: str = Field("Auto extraction completed successfully", description="Status message")