"""
Streaming schemas for request/response models.
"""

from typing import Optional
from pydantic import BaseModel, Field


class StreamingSessionCreate(BaseModel):
    """Request to create a streaming session"""
    pass  # No additional fields needed beyond study_id from URL


class StreamingSessionResponse(BaseModel):
    """Response for streaming session creation"""
    session_id: str = Field(..., description="Unique session identifier")
    message: str = Field(..., description="Response message")


class StreamingSessionInfo(BaseModel):
    """Information about a streaming session"""
    id: str = Field(..., description="Session ID")
    study_id: str = Field(..., description="Study ID")
    video_media_id: str = Field(..., description="Video media ID")
    duration_seconds: float = Field(..., description="Recording duration in seconds")
    total_size: int = Field(..., description="Total file size in bytes")
    frame_count: int = Field(..., description="Number of frames processed")
    is_active: bool = Field(..., description="Whether session is active")
    created_at: str = Field(..., description="Session creation timestamp")
    last_frame_time: Optional[str] = Field(None, description="Last frame processing timestamp")


class FrameProcessingResponse(BaseModel):
    """Response for frame processing"""
    is_useful_frame: bool = Field(..., description="Whether frame is considered useful")
    confidence: float = Field(..., description="AI confidence score")
    frame_extracted: bool = Field(..., description="Whether frame was extracted and saved")
    frame_id: Optional[str] = Field(None, description="Extracted frame ID if saved")
    frame_media_id: Optional[str] = Field(None, description="Extracted frame media ID if saved")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class StreamingSessionFinalizeResponse(BaseModel):
    """Response for streaming session finalization"""
    video_media_id: str = Field(..., description="Final video media ID")
    message: str = Field(..., description="Response message")


class VideoChunkUploadResponse(BaseModel):
    """Response for video chunk upload"""
    message: str = Field(..., description="Response message")
    size: int = Field(..., description="Chunk size in bytes")
