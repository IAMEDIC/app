"""
Frame model definition - stores extracted video frames for analysis.
"""


import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Float, Integer, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.core.database import Base


# pylint: disable=not-callable,line-too-long
class Frame(Base):
    """Model for storing extracted video frames"""
    __tablename__ = "frames"
    # Primary identifiers
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    video_media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    frame_media_id = Column(UUID(as_uuid=True), ForeignKey("media.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    # Frame-specific properties
    timestamp_seconds = Column(Float, nullable=False, index=True)   # Position in video (seconds)
    frame_number = Column(Integer, nullable=False, index=True)      # Sequential frame number for this video
    width = Column(Integer, nullable=False)                         # Frame width in pixels
    height = Column(Integer, nullable=False)                        # Frame height in pixels
    # Metadata
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    # Relationships
    video_media = relationship("Media", foreign_keys=[video_media_id], back_populates="frames")
    frame_media = relationship("Media", foreign_keys=[frame_media_id], back_populates="frame_record")
    # Indexes for efficient querying
    __table_args__ = (
        Index('ix_frames_video_timestamp', 'video_media_id', 'timestamp_seconds'),
        Index('ix_frames_video_frame_num', 'video_media_id', 'frame_number'),
    )

    def __repr__(self):
        return f"<Frame(id='{self.id}', video_media_id='{self.video_media_id}', timestamp={self.timestamp_seconds}s, frame_num={self.frame_number})>"
    