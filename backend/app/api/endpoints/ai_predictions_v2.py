"""
Clean AI prediction endpoints with clear separation of concerns.
Provides 4 separate endpoints for predictions and annotations.
"""


import logging
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.services.ai_prediction_service_v2 import AIPredictionService
from app.schemas.ai_responses import (
    ClassificationPredictionResponse,
    BoundingBoxPredictionsResponse, BoundingBoxPrediction,
    ClassificationAnnotationResponse,
    BoundingBoxAnnotationsResponse,
    SaveClassificationAnnotationRequest,
    SaveBoundingBoxAnnotationsRequest,
    SaveAnnotationResponse,
    GeneratePredictionRequest,
    ModelInfo
)


logger = logging.getLogger(__name__)

router = APIRouter()



@router.post("/media/{media_id}/predictions/classification", response_model=ClassificationPredictionResponse)
async def generate_classification_prediction(
    media_id: UUID,
    request: GeneratePredictionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> ClassificationPredictionResponse:
    """Generate classification prediction for a media file (raw prediction only)"""
    logger.debug("🤖 Doctor %s generating classification prediction for media %s", current_user.email, media_id)
    doctor_id = cast(UUID, current_user.id)
    
    ai_service = AIPredictionService(db)
    result = await ai_service.generate_classification_prediction(
        media_id, doctor_id, request.force_refresh
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate classification prediction"
        )
    return result


@router.post("/media/{media_id}/predictions/bounding-boxes", response_model=BoundingBoxPredictionsResponse)
async def generate_bounding_box_predictions(
    media_id: UUID,
    request: GeneratePredictionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> BoundingBoxPredictionsResponse:
    """Generate bounding box predictions for a media file (raw predictions only)"""
    logger.debug("🤖 Doctor %s generating bounding box predictions for media %s", current_user.email, media_id)
    doctor_id = cast(UUID, current_user.id)
    ai_service = AIPredictionService(db)
    result = await ai_service.generate_bounding_box_predictions(
        media_id, doctor_id, request.force_refresh
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate bounding box predictions"
        )
    
    return result


@router.get("/media/{media_id}/annotations/classification", response_model=ClassificationAnnotationResponse)
async def get_classification_annotation(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> ClassificationAnnotationResponse:
    """Get user's classification annotation for a media file"""
    logger.debug("📋 Doctor %s requesting classification annotation for media %s", current_user.email, media_id)
    ai_service = AIPredictionService(db)
    result = ai_service.get_classification_annotation(media_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No classification annotation found"
        )
    return result


@router.get("/media/{media_id}/annotations/bounding-boxes", response_model=BoundingBoxAnnotationsResponse)
async def get_bounding_box_annotations(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> BoundingBoxAnnotationsResponse:
    """Get user's bounding box annotations for a media file"""
    logger.debug("📋 Doctor %s requesting bounding box annotations for media %s", current_user.email, media_id)
    ai_service = AIPredictionService(db)
    result = ai_service.get_bounding_box_annotations(media_id)
    if not result:
        # Return empty annotations instead of 404 for bounding boxes
        return BoundingBoxAnnotationsResponse(annotations=[])
    return result


@router.post("/media/{media_id}/annotations/classification", response_model=SaveAnnotationResponse)
async def save_classification_annotation(
    media_id: UUID,
    request: SaveClassificationAnnotationRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> SaveAnnotationResponse:
    """Save user's classification annotation"""
    logger.debug("💾 Doctor %s saving classification annotation for media %s", current_user.email, media_id)
    ai_service = AIPredictionService(db)
    result = ai_service.save_classification_annotation(media_id, request)
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )
    return result


@router.post("/media/{media_id}/annotations/bounding-boxes", response_model=SaveAnnotationResponse)
async def save_bounding_box_annotations(
    media_id: UUID,
    request: SaveBoundingBoxAnnotationsRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> SaveAnnotationResponse:
    """Save user's bounding box annotations"""
    logger.debug("💾 Doctor %s saving bounding box annotations for media %s", current_user.email, media_id)
    ai_service = AIPredictionService(db)
    result = ai_service.save_bounding_box_annotations(media_id, request)
    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.message
        )
    return result


@router.get("/media/{media_id}/predictions/classification/existing", response_model=ClassificationPredictionResponse)
async def get_existing_classification_prediction(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> ClassificationPredictionResponse:
    """Get existing cached classification prediction (no generation)"""
    logger.debug("📋 Doctor %s requesting existing classification prediction for media %s", current_user.email, media_id)
    ai_service = AIPredictionService(db)
    # Get model info to check for cached predictions with current model version
    model_info = await ai_service.get_model_info("classifier")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Classifier service unavailable"
        )
    model_version = model_info.get("version", "unknown")
    cached_prediction = ai_service.get_cached_classification_prediction(media_id, model_version)
    if not cached_prediction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existing classification prediction found"
        )
    # Use model_dump() to ensure proper value extraction
    return ClassificationPredictionResponse(
        prediction=cached_prediction.prediction,  # type: ignore
        model_version=cached_prediction.model_version  # type: ignore
    )


@router.get("/media/{media_id}/predictions/bounding-boxes/existing", response_model=BoundingBoxPredictionsResponse)
async def get_existing_bounding_box_predictions(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> BoundingBoxPredictionsResponse:
    """Get existing cached bounding box predictions (no generation)"""
    logger.debug("📋 Doctor %s requesting existing bounding box predictions for media %s", current_user.email, media_id)
    ai_service = AIPredictionService(db)
    # Get model info to check for cached predictions with current model version
    model_info = await ai_service.get_model_info("bounding_box")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BB service unavailable"
        )
    model_version = model_info.get("version", "unknown")
    cached_predictions = ai_service.get_cached_bb_predictions(media_id, model_version)
    if not cached_predictions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existing bounding box predictions found"
        )
    return BoundingBoxPredictionsResponse(
        predictions=[
            BoundingBoxPrediction(
                bb_class=pred.bb_class,  # type: ignore
                confidence=pred.confidence,  # type: ignore
                x_min=pred.x_min,  # type: ignore
                y_min=pred.y_min,  # type: ignore
                width=pred.width,  # type: ignore
                height=pred.height  # type: ignore
            ) for pred in cached_predictions
        ],
        model_version=model_version
    )


@router.get("/ai/models/classifier/info", response_model=ModelInfo)
async def get_classifier_model_info(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> ModelInfo:
    """Get classifier model information"""
    logger.debug("📊 Doctor %s requesting classifier model info", current_user.email)
    ai_service = AIPredictionService(db)
    model_info = await ai_service.get_model_info("classifier")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Classifier service unavailable"
        )
    return ModelInfo(**model_info)


@router.get("/ai/models/bb-regressor/info", response_model=ModelInfo)
async def get_bb_model_info(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
) -> ModelInfo:
    """Get bounding box model information"""
    logger.debug("📊 Doctor %s requesting BB model info", current_user.email)
    ai_service = AIPredictionService(db)
    model_info = await ai_service.get_model_info("bounding_box")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BB regressor service unavailable"
        )
    return ModelInfo(**model_info)
