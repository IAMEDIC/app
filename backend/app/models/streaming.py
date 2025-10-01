"""
Streaming session models and dataclasses.
"""


from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional
from uuid import UUID


@dataclass
class StreamingSession:
    """Active streaming session"""
    id: str
    study_id: UUID
    doctor_id: UUID
    video_media_id: UUID
    created_at: datetime
    file_handle: Any  # File handle for writing video data
    file_path: str
    total_size: int
    frame_count: int
    duration_seconds: float
    last_frame_time: Optional[datetime]
    is_active: bool


@dataclass
class FrameProcessingResult:
    """Result of frame processing for streaming"""
    is_useful_frame: bool
    should_extract: bool
    confidence_score: float
    processing_time_ms: float
    extracted_frame_id: Optional[UUID] = None
    extracted_frame_media_id: Optional[UUID] = None
    ai_prediction_id: Optional[UUID] = None
