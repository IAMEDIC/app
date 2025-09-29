"""
AI prediction endpoints for media files.
"""


import logging
from typing import cast
from uuid import UUID
import io
import base64

import numpy as np
from PIL import Image as PILImage
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_doctor_role
from app.models.user import User as UserModel
from app.models.media import Media
from app.services.ai_prediction_service import AIPredictionService
from app.services.media_service import MediaService
from app.schemas.ai_predictions import (
    PredictionRequest, MediaPredictionsResponse, ModelInfo,
    SaveAnnotationsRequest, SaveAnnotationsResponse
)


logger = logging.getLogger(__name__)

router = APIRouter()


def convert_image_to_base64_bytes(image: PILImage.Image) -> str:
    """Convert PIL Image to base64 encoded bytes"""
    if image.mode != 'L':
        image = image.convert('L')
    image_array = np.array(image, dtype=np.uint8)
    image_bytes = image_array.tobytes()
    return base64.b64encode(image_bytes).decode('ascii')


def check_media_access(
    current_user: UserModel,
    db: Session,
    media_service: MediaService,
    media_id: UUID
) -> Media:
    """Check if media can be accessed by the current user"""
    doctor_id = cast(UUID, current_user.id)
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    study_id = cast(UUID, media.study_id)
    if not media_service.check_study_ownership(study_id, doctor_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You don't have permission to access this media"
        )
    return media


def check_ai_media(
    current_user: UserModel,
    db: Session,
    media_service: MediaService,
    media_id: UUID
):
    """Check if media can be used for AI predictions"""
    media = check_media_access(current_user, db, media_service, media_id)
    if media.media_type.value not in ["image", "frame"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI predictions are supported for images and frames only"
        )


@router.get("/ai/models/classifier/info", response_model=ModelInfo)
async def get_classifier_model_info(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get classifier model information"""
    logger.debug("📊 Doctor %s requesting classifier model info", current_user.email)
    ai_service = AIPredictionService(db)
    model_info = await ai_service.get_model_info("classifier")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Classifier service unavailable"
        )
    return model_info


@router.get("/ai/models/bb-regressor/info", response_model=ModelInfo)
async def get_bb_model_info(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get bounding box model information"""
    logger.debug("📊 Doctor %s requesting BB model info", current_user.email)
    ai_service = AIPredictionService(db)
    model_info = await ai_service.get_model_info("bb_regressor")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BB regressor service unavailable"
        )
    return model_info


@router.post("/media/{media_id}/predictions/classification", response_model=MediaPredictionsResponse)
async def generate_classification_prediction(
    media_id: UUID,
    request: PredictionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Generate classification prediction for a media file"""
    logger.debug("🤖 Doctor %s generating classification prediction for media %s", current_user.email, media_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    check_ai_media(current_user, db, media_service, media_id)
    try:
        media_file_data = media_service.get_media_file(media_id, doctor_id)
        if not media_file_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media file not found"
            )
        file_data, _, _ = media_file_data
        image = PILImage.open(io.BytesIO(file_data)).convert('L')
        image_data_b64 = convert_image_to_base64_bytes(image)
        width, height = image.size
        ai_service = AIPredictionService(db)
        classification_prediction = await ai_service.predict_classification(
            media_id, image_data_b64, width, height, request.force_refresh
        )
        if classification_prediction:
            from app.models.picture_classification_annotation import PictureClassificationAnnotation
            existing_classification = db.query(PictureClassificationAnnotation).filter(
                PictureClassificationAnnotation.media_id == media_id
            ).first()
            if not existing_classification:
                usefulness = 1 if classification_prediction.prediction > 0.5 else 0 # type: ignore
                ai_service.save_classification_annotation(media_id, usefulness)
        return ai_service.get_media_predictions(media_id)
    except Exception as e:
        logger.error(f"Error generating classification prediction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate classification prediction"
        )


@router.post("/media/{media_id}/predictions/bounding-boxes", response_model=MediaPredictionsResponse)
async def generate_bounding_box_predictions(
    media_id: UUID,
    request: PredictionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Generate bounding box predictions for a media file"""
    logger.debug("🤖 Doctor %s generating bounding box predictions for media %s", current_user.email, media_id)
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    check_ai_media(current_user, db, media_service, media_id)
    try:
        media_file_data = media_service.get_media_file(media_id, doctor_id)
        if not media_file_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media file not found"
            )
        file_data, _, _ = media_file_data
        image = PILImage.open(io.BytesIO(file_data)).convert('L')
        image_data_b64 = convert_image_to_base64_bytes(image)
        width, height = image.size
        ai_service = AIPredictionService(db)
        bb_predictions = await ai_service.predict_bounding_boxes(
            media_id, image_data_b64, width, height, request.force_refresh
        )
        if bb_predictions:
            from app.models.picture_bb_annotation import PictureBBAnnotation
            existing_bb_annotations = db.query(PictureBBAnnotation).filter(
                PictureBBAnnotation.media_id == media_id
            ).all()
            existing_classes = {ann.bb_class for ann in existing_bb_annotations}
            bb_annotation_data = []
            for pred in bb_predictions:
                if pred.bb_class not in existing_classes and pred.confidence > 0.5: # type: ignore
                    bb_annotation_data.append({
                        "bb_class": pred.bb_class,
                        "usefulness": 1,
                        "x_min": pred.x_min,
                        "y_min": pred.y_min,
                        "width": pred.width,
                        "height": pred.height,
                        "is_hidden": False
                    })
            if bb_annotation_data:
                ai_service.save_bb_annotations(media_id, bb_annotation_data)
        return ai_service.get_media_predictions(media_id)
    except Exception as e:
        logger.error(f"Error generating bounding box predictions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate bounding box predictions"
        )


@router.get("/media/{media_id}/predictions", response_model=MediaPredictionsResponse)
async def get_media_predictions(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get all predictions and annotations for a media file"""
    logger.debug("📋 Doctor %s requesting predictions for media %s", current_user.email, media_id)
    media_service = MediaService(db)
    check_media_access(current_user, db, media_service, media_id)
    ai_service = AIPredictionService(db)
    return ai_service.get_media_predictions(media_id)


@router.post("/media/{media_id}/annotations/save", response_model=SaveAnnotationsResponse)
async def save_annotations(
    media_id: UUID,
    request: SaveAnnotationsRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Save clinician annotations for a media file"""
    logger.debug("💾 Doctor %s saving annotations for media %s", current_user.email, media_id)
    media_service = MediaService(db)
    check_media_access(current_user, db, media_service, media_id)
    try:
        ai_service = AIPredictionService(db)
        saved_count = 0
        if request.classification_annotation:
            result = ai_service.save_classification_annotation(
                media_id, request.classification_annotation.usefulness
            )
            if result:
                saved_count += 1
        if request.bb_annotations is not None:
            bb_annotation_data = []
            for ann in request.bb_annotations:
                bb_annotation_data.append({
                    "bb_class": ann.bb_class,
                    "usefulness": ann.usefulness,
                    "x_min": ann.x_min,
                    "y_min": ann.y_min,
                    "width": ann.width,
                    "height": ann.height,
                    "is_hidden": ann.is_hidden
                })
            saved_bb_annotations = ai_service.save_bb_annotations(media_id, bb_annotation_data)
            saved_count += len(saved_bb_annotations)
        return SaveAnnotationsResponse(
            success=True,
            message=f"Successfully saved {saved_count} annotations",
            saved_count=saved_count
        )
    except Exception as e:
        logger.error(f"Error saving annotations: {e}")
        return SaveAnnotationsResponse(
            success=False,
            message=f"Failed to save annotations: {str(e)}",
            saved_count=0
        )
