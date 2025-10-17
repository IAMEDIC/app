"""
File management schemas for storage statistics and hard delete operations.
"""

from typing import List
from pydantic import BaseModel, Field


class FileManagementStats(BaseModel):
    """Schema for system-wide file storage statistics"""
    total_storage_bytes: int = Field(description="Total storage used in bytes", ge=0)
    total_storage_mb: float = Field(description="Total storage used in MB", ge=0)
    active_files_count: int = Field(description="Number of active files", ge=0)
    soft_deleted_files_count: int = Field(description="Number of soft-deleted files", ge=0)
    active_files_bytes: int = Field(description="Storage used by active files in bytes", ge=0)
    soft_deleted_files_bytes: int = Field(description="Storage used by soft-deleted files in bytes", ge=0)
    active_files_mb: float = Field(description="Storage used by active files in MB", ge=0)
    soft_deleted_files_mb: float = Field(description="Storage used by soft-deleted files in MB", ge=0)
    active_files_percentage: float = Field(description="Percentage of active files by count", ge=0, le=100)
    soft_deleted_files_percentage: float = Field(description="Percentage of soft-deleted files by count", ge=0, le=100)
    active_storage_percentage: float = Field(description="Percentage of storage used by active files", ge=0, le=100)
    soft_deleted_storage_percentage: float = Field(description="Percentage of storage used by soft-deleted files", ge=0, le=100)


class HardDeleteRequest(BaseModel):
    """Request schema for hard delete operation"""
    confirmation_text: str = Field(description="Must be exactly 'DELETE' to confirm the operation")


class HardDeleteProgress(BaseModel):
    """Schema for tracking hard delete operation progress"""
    status: str = Field(description="Current status: 'running', 'completed', 'failed'")
    progress: float = Field(description="Progress percentage from 0.0 to 1.0", ge=0, le=1)
    processed_items: int = Field(description="Number of items processed so far", ge=0)
    total_items: int = Field(description="Total number of items to process", ge=0)
    current_operation: str = Field(description="Description of current operation being performed")
    errors: List[str] = Field(default=[], description="List of errors encountered during the operation")


class HardDeleteResponse(BaseModel):
    """Response schema for starting hard delete operation"""
    task_id: str = Field(description="Unique identifier for tracking the deletion task")
    message: str = Field(description="Success message confirming task initiation")


class HardDeleteSummary(BaseModel):
    """Summary of completed hard delete operation"""
    deleted_studies_count: int = Field(description="Number of studies permanently deleted", ge=0)
    deleted_media_count: int = Field(description="Number of media records permanently deleted", ge=0)
    deleted_files_count: int = Field(description="Number of physical files removed from disk", ge=0)
    freed_storage_bytes: int = Field(description="Amount of storage space freed in bytes", ge=0)
    freed_storage_mb: float = Field(description="Amount of storage space freed in MB", ge=0)
    total_errors: int = Field(description="Total number of errors encountered", ge=0)
    operation_duration_seconds: float = Field(description="Total time taken for the operation", ge=0)