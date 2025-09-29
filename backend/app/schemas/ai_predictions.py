"""
AI/ML service related schema definitions.
"""


from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.picture_classification_prediction import PictureClassificationPrediction
from app.schemas.picture_classification_annotation import PictureClassificationAnnotation
from app.schemas.picture_bb_prediction import PictureBBPrediction
from app.schemas.picture_bb_annotation import PictureBBAnnotation


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


class ClassificationAnnotationSave(BaseModel):
    """Simple schema for saving classification annotation"""
    usefulness: int = Field(..., ge=0, le=1, description="Clinician assessment: 0 (not useful) or 1 (useful)")


class BoundingBoxAnnotationSave(BaseModel):
    """Simple schema for saving bounding box annotation"""
    bb_class: str = Field(..., min_length=1, max_length=100, description="Bounding box class name")
    usefulness: int = Field(default=1, ge=0, le=1, description="Clinician assessment: 0 (not useful) or 1 (useful)")
    x_min: float = Field(..., description="Bounding box x minimum coordinate")
    y_min: float = Field(..., description="Bounding box y minimum coordinate")
    width: float = Field(..., gt=0, description="Bounding box width")
    height: float = Field(..., gt=0, description="Bounding box height")
    is_hidden: bool = Field(default=False, description="Whether annotation is hidden for model training")


class SaveAnnotationsRequest(BaseModel):
    """Schema for saving clinician annotations"""
    media_id: UUID = Field(..., description="ID of the media file")
    classification_annotation: Optional[ClassificationAnnotationSave] = Field(None, description="Classification annotation to save")
    bb_annotations: List[BoundingBoxAnnotationSave] = Field(default=[], description="Bounding box annotations to save")


class SaveAnnotationsResponse(BaseModel):
    """Schema for save annotations response"""
    success: bool = Field(..., description="Whether the save operation was successful")
    message: str = Field(..., description="Success or error message")
    saved_count: int = Field(..., description="Number of annotations saved")
