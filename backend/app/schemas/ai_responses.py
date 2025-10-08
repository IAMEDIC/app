"""
Clean AI/ML response schemas with minimal data.
Separated from internal database schemas to avoid exposing unnecessary fields.
"""


from typing import Optional

from pydantic import BaseModel, Field


# Model information
class ModelInfo(BaseModel):
    """Schema for model information"""
    name: str = Field(..., description="Model name")
    version: str = Field(..., description="Model version")
    expected_width: int = Field(..., description="Expected image width")
    expected_height: int = Field(..., description="Expected image height")
    classes: Optional[list[str]] = Field(None, description="Available classes (for BB models)")
    class_titles: Optional[list[str]] = Field(None, description="Human-readable titles for classes (for BB models)")


# Raw prediction responses (no database IDs or timestamps)
class ClassificationPredictionResponse(BaseModel):
    """Raw classification prediction response"""
    prediction: float = Field(..., description="Classification prediction value (0.0 to 1.0)")
    model_version: str = Field(..., description="Version of the model used")


class BoundingBoxPrediction(BaseModel):
    """Individual bounding box prediction"""
    bb_class: str = Field(..., description="Predicted class name")
    confidence: float = Field(..., description="Prediction confidence (0.0 to 1.0)")
    x_min: float = Field(..., description="Normalized x minimum coordinate")
    y_min: float = Field(..., description="Normalized y minimum coordinate") 
    width: float = Field(..., description="Normalized width")
    height: float = Field(..., description="Normalized height")


class BoundingBoxPredictionsResponse(BaseModel):
    """Raw bounding box predictions response"""
    predictions: list[BoundingBoxPrediction] = Field(..., description="list of detected bounding boxes")
    model_version: str = Field(..., description="Version of the model used")


# Annotation responses (what user has annotated)
class ClassificationAnnotationResponse(BaseModel):
    """User's classification annotation"""
    usefulness: int = Field(..., ge=0, le=1, description="User assessment: 0 (not useful) or 1 (useful)")


class BoundingBoxAnnotation(BaseModel):
    """Individual bounding box annotation"""
    bb_class: str = Field(..., description="Annotated class name")
    usefulness: int = Field(..., ge=0, le=1, description="User assessment: 0 (not useful) or 1 (useful)")
    x_min: float = Field(..., description="Normalized x minimum coordinate")
    y_min: float = Field(..., description="Normalized y minimum coordinate")
    width: float = Field(..., description="Normalized width")
    height: float = Field(..., description="Normalized height")
    is_hidden: bool = Field(..., description="Whether annotation is hidden from training")


class BoundingBoxAnnotationsResponse(BaseModel):
    """User's bounding box annotations"""
    annotations: list[BoundingBoxAnnotation] = Field(..., description="list of user annotations")


# Request schemas for saving annotations
class SaveClassificationAnnotationRequest(BaseModel):
    """Request to save classification annotation"""
    usefulness: int = Field(..., ge=0, le=1, description="User assessment: 0 (not useful) or 1 (useful)")


class SaveBoundingBoxAnnotationItem(BaseModel):
    """Individual bounding box annotation to save"""
    bb_class: str = Field(..., min_length=1, max_length=100, description="Class name")
    usefulness: int = Field(default=1, ge=0, le=1, description="User assessment: 0 (not useful) or 1 (useful)")
    x_min: float = Field(..., description="Normalized x minimum coordinate")
    y_min: float = Field(..., description="Normalized y minimum coordinate")
    width: float = Field(..., gt=0, description="Normalized width")
    height: float = Field(..., gt=0, description="Normalized height")
    is_hidden: bool = Field(default=False, description="Whether annotation is hidden from training")


class SaveBoundingBoxAnnotationsRequest(BaseModel):
    """Request to save bounding box annotations"""
    annotations: list[SaveBoundingBoxAnnotationItem] = Field(description="list of annotations to save")


# Common response for save operations
class SaveAnnotationResponse(BaseModel):
    """Response after saving annotations"""
    success: bool = Field(..., description="Whether the save operation was successful")
    message: str = Field(..., description="Success or error message")


# Request schemas for generating predictions
class GeneratePredictionRequest(BaseModel):
    """Request to generate predictions"""
    force_refresh: bool = Field(default=False, description="Force refresh predictions even if they exist")
