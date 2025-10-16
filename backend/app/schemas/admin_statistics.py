"""
Admin statistics schemas for model performance metrics.
"""

from datetime import date
from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class ModelVersionInfo(BaseModel):
    """Information about available model versions"""
    model_type: str = Field(description="Type of model: 'classifier' or 'bounding_box'")
    versions: List[str] = Field(description="List of available model versions")


class ClassificationConfusionMatrix(BaseModel):
    """2x2 Confusion matrix for binary classification"""
    true_positive: int = Field(description="Correctly predicted useful images")
    false_positive: int = Field(description="Incorrectly predicted as useful")
    true_negative: int = Field(description="Correctly predicted not useful")
    false_negative: int = Field(description="Incorrectly predicted as not useful")


class ClassificationMetrics(BaseModel):
    """Classification model performance metrics"""
    accuracy: float = Field(description="Overall accuracy (0-1)", ge=0, le=1)
    precision: float = Field(description="Precision for useful class (0-1)", ge=0, le=1)
    recall: float = Field(description="Recall for useful class (0-1)", ge=0, le=1)
    f1_score: float = Field(description="F1-score for useful class (0-1)", ge=0, le=1)
    confusion_matrix: ClassificationConfusionMatrix
    total_samples: int = Field(description="Total number of samples", ge=0)


class ClassificationStatisticsResponse(BaseModel):
    """Response for classification model statistics"""
    model_version: str
    date_range: Dict[str, str] = Field(description="Start and end dates")
    metrics: ClassificationMetrics
    sample_distribution: Dict[str, int] = Field(description="Distribution of actual labels")
    included_soft_deleted: bool = Field(description="Whether soft-deleted records were included in computation")


class BoundingBoxMetrics(BaseModel):
    """Bounding box model performance metrics"""
    map_score: float = Field(description="Mean Average Precision at configured threshold", ge=0, le=1)
    iou_threshold: float = Field(description="IoU threshold used for mAP calculation", ge=0, le=1)
    confidence_threshold: float = Field(description="Confidence threshold for predictions", ge=0, le=1)
    per_class_ap: Dict[str, float] = Field(description="Average Precision per class")
    total_annotations: int = Field(description="Total number of bounding box annotations", ge=0)
    total_predictions: int = Field(description="Total number of predictions", ge=0)


class BoundingBoxStatisticsResponse(BaseModel):
    """Response for bounding box model statistics"""
    model_version: str
    date_range: Dict[str, str] = Field(description="Start and end dates")
    metrics: BoundingBoxMetrics
    class_distribution: Dict[str, int] = Field(description="Distribution of classes in annotations")
    included_soft_deleted: bool = Field(description="Whether soft-deleted records were included in computation")
    included_hidden_annotations: bool = Field(description="Whether hidden bounding box annotations were included")


class StatisticsRequest(BaseModel):
    """Request parameters for statistics computation"""
    model_version: str = Field(description="Model version to compute statistics for")
    start_date: date = Field(description="Start date for statistics (inclusive)")
    end_date: date = Field(description="End date for statistics (inclusive)")
    iou_threshold: Optional[float] = Field(default=0.5, description="IoU threshold for bounding box evaluation", ge=0, le=1)
    confidence_threshold: Optional[float] = Field(default=0.5, description="Confidence threshold for predictions", ge=0, le=1)
    include_soft_deleted: Optional[bool] = Field(default=False, description="Whether to include soft-deleted media in statistics")
    include_hidden_annotations: Optional[bool] = Field(default=False, description="Whether to include hidden bounding box annotations")