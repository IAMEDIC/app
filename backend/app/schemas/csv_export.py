"""
CSV export schemas for annotation downloads.
"""

from datetime import date
from typing import Optional
from pydantic import BaseModel, Field


class CSVExportRequest(BaseModel):
    """Request parameters for CSV export"""
    start_date: date = Field(description="Start date for export (inclusive)")
    end_date: date = Field(description="End date for export (inclusive)")
    include_soft_deleted: Optional[bool] = Field(default=False, description="Whether to include soft-deleted media in export")
    include_hidden_annotations: Optional[bool] = Field(default=False, description="Whether to include hidden bounding box annotations")


class CSVExportInfo(BaseModel):
    """Information about CSV export"""
    export_type: str = Field(description="Type of export: 'classification' or 'bounding_box'")
    date_range: dict[str, str] = Field(description="Start and end dates")
    total_records: int = Field(description="Total number of records exported", ge=0)
    included_soft_deleted: bool = Field(description="Whether soft-deleted records were included")
    included_hidden_annotations: Optional[bool] = Field(default=None, description="Whether hidden annotations were included (bounding box only)")
    filename: str = Field(description="Generated filename for the export")