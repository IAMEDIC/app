"""
Media model definition.
"""

import uuid
from enum import Enum
from sqlalchemy import Column, String, DateTime, ForeignKey, BigInteger, CheckConstraint, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class MediaType(str, Enum):
    """Enumeration of media types"""
    IMAGE = "image"
    VIDEO = "video"
    FRAME = "frame"


class UploadStatus(str, Enum):
    """Enumeration of upload statuses"""
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    FAILED = "failed"


# pylint: disable=not-callable,line-too-long
class Media(Base):
    """Media model for storing ultrasound images and videos"""
    __tablename__ = "media"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    study_id = Column(UUID(as_uuid=True), ForeignKey("studies.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)  # Storage path/ID for the file
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(255), nullable=False, index=True)
    media_type = Column(SQLEnum(MediaType, name='mediatype', values_callable=lambda x: [e.value for e in x]), nullable=False, index=True)
    upload_status = Column(SQLEnum(UploadStatus, name='uploadstatus', values_callable=lambda x: [e.value for e in x]), nullable=False, default=UploadStatus.UPLOADED, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    study = relationship("Study", back_populates="media")
    classification_predictions = relationship("PictureClassificationPrediction", back_populates="media", cascade="all, delete-orphan")
    classification_annotation = relationship("PictureClassificationAnnotation", back_populates="media", uselist=False, cascade="all, delete-orphan")
    bb_predictions = relationship("PictureBBPrediction", back_populates="media", cascade="all, delete-orphan")
    bb_annotations = relationship("PictureBBAnnotation", back_populates="media", cascade="all, delete-orphan")
    
    # Frame relationships (for videos and extracted frames)
    frames = relationship("Frame", foreign_keys="Frame.video_media_id", back_populates="video_media", cascade="all, delete-orphan")
    frame_record = relationship("Frame", foreign_keys="Frame.frame_media_id", back_populates="frame_media", uselist=False, cascade="all, delete-orphan")
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            f"media_type IN ('{MediaType.IMAGE}', '{MediaType.VIDEO}', '{MediaType.FRAME}')",
            name='valid_media_type'
        ),
        CheckConstraint(
            f"upload_status IN ('{UploadStatus.UPLOADED}', '{UploadStatus.PROCESSING}', '{UploadStatus.FAILED}')",
            name='valid_upload_status'
        ),
    )
    
    def __repr__(self):
        return f"<Media(id='{self.id}', study_id='{self.study_id}', filename='{self.filename}', media_type='{self.media_type}')>"