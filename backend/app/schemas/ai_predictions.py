"""
AI/ML service related schema definitions.
"""

from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field

from .picture_classification_prediction import PictureClassificationPrediction
from .picture_classification_annotation import PictureClassificationAnnotation
from .picture_bb_prediction import PictureBBPrediction
from .picture_bb_annotation import PictureBBAnnotation


class ModelInfo(BaseModel):
    """Schema for model information"""
    name: str = Field(..., description="Model name")
    version: str = Field(..., description="Model version")
    expected_width: int = Field(..., description="Expected image width")
    expected_height: int = Field(..., description="Expected image height")
    classes: Optional[List[str]] = Field(None, description="Available classes (for BB models)")


class PredictionRequest(BaseModel):
    """Schema for requesting predictions for a media file"""
    media_id: UUID = Field(..., description="ID of the media file to predict")
    force_refresh: bool = Field(default=False, description="Force refresh predictions even if they exist")


class ClassificationPredictionResponse(BaseModel):
    """Schema for classification prediction response"""
    prediction: Optional[PictureClassificationPrediction] = Field(None, description="Classification prediction")
    annotation: Optional[PictureClassificationAnnotation] = Field(None, description="Classification annotation")


class BBPredictionResponse(BaseModel):
    """Schema for bounding box prediction response"""
    predictions: List[PictureBBPrediction] = Field(default=[], description="Bounding box predictions")
    annotations: List[PictureBBAnnotation] = Field(default=[], description="Bounding box annotations")


class MediaPredictionsResponse(BaseModel):
    """Schema for complete media predictions response"""
    media_id: UUID = Field(..., description="ID of the media file")
    classification: ClassificationPredictionResponse = Field(..., description="Classification predictions and annotations")
    bounding_boxes: BBPredictionResponse = Field(..., description="Bounding box predictions and annotations")


class SaveAnnotationsRequest(BaseModel):
    """Schema for saving clinician annotations"""
    media_id: UUID = Field(..., description="ID of the media file")
    classification_annotation: Optional[PictureClassificationAnnotation] = Field(None, description="Classification annotation to save")
    bb_annotations: List[PictureBBAnnotation] = Field(default=[], description="Bounding box annotations to save")


class SaveAnnotationsResponse(BaseModel):
    """Schema for save annotations response"""
    success: bool = Field(..., description="Whether the save operation was successful")
    message: str = Field(..., description="Success or error message")
    saved_count: int = Field(..., description="Number of annotations saved")