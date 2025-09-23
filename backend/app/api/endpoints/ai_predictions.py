"""
AI prediction endpoints for media files.
"""

import logging
from typing import cast
from uuid import UUID
import io
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


@router.get("/ai/models/classifier/info", response_model=ModelInfo)
async def get_classifier_model_info(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get classifier model information"""
    logger.info("📊 Doctor %s requesting classifier model info", current_user.email)
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
    logger.info("📊 Doctor %s requesting BB model info", current_user.email)
    ai_service = AIPredictionService(db)
    
    model_info = await ai_service.get_model_info("bb_regressor")
    if not model_info:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BB regressor service unavailable"
        )
    
    return model_info


@router.post("/media/{media_id}/predictions/generate", response_model=MediaPredictionsResponse)
async def generate_predictions(
    media_id: UUID,
    request: PredictionRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Generate AI predictions for a media file"""
    logger.info("🤖 Doctor %s generating predictions for media %s", current_user.email, media_id)
    
    # Verify media exists and belongs to doctor's study
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    
    # Check if doctor owns the study containing this media
    study_id = cast(UUID, media.study_id)
    if not media_service.check_study_ownership(study_id, doctor_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You don't have permission to access this media"
        )
    
    # Check if media is an image
    if media.media_type.value != "image":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI predictions are currently only supported for images"
        )
    
    try:
        # Get media file and convert to grayscale array
        media_file_data = media_service.get_media_file(media_id, doctor_id)
        if not media_file_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media file not found"
            )
        
        file_data, mime_type, filename = media_file_data
        
        # Convert image to grayscale array
        image = PILImage.open(io.BytesIO(file_data))
        if image.mode != 'L':
            image = image.convert('L')
        image_array = np.array(image).tolist()
        
        # Generate predictions using AI service
        ai_service = AIPredictionService(db)
        
        # Generate classification prediction
        classification_prediction = await ai_service.predict_classification(
            media_id, image_array, request.force_refresh
        )
        
        # Generate bounding box predictions
        bb_predictions = await ai_service.predict_bounding_boxes(
            media_id, image_array, request.force_refresh
        )
        
        # Create initial annotations from predictions if they don't exist
        if classification_prediction:
            # Check if classification annotation exists
            from app.models.picture_classification_annotation import PictureClassificationAnnotation
            existing_classification = db.query(PictureClassificationAnnotation).filter(
                PictureClassificationAnnotation.media_id == media_id
            ).first()
            
            if not existing_classification:
                # Create classification annotation with default useful value (1)
                ai_service.save_classification_annotation(media_id, 1)
        
        # Create BB annotations from predictions if they don't exist
        if bb_predictions:
            from app.models.picture_bb_annotation import PictureBBAnnotation
            existing_bb_annotations = db.query(PictureBBAnnotation).filter(
                PictureBBAnnotation.media_id == media_id
            ).all()
            
            if not existing_bb_annotations:
                bb_annotation_data = []
                for pred in bb_predictions:
                    bb_annotation_data.append({
                        "bb_class": pred.bb_class,
                        "usefulness": 1,
                        "x_min": pred.x_min,
                        "y_min": pred.y_min,
                        "width": pred.width,
                        "height": pred.height,
                        "is_hidden": False
                    })
                ai_service.save_bb_annotations(media_id, bb_annotation_data)
        
        # Return complete predictions and annotations
        return ai_service.get_media_predictions(media_id)
        
    except Exception as e:
        logger.error(f"Error generating predictions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate predictions"
        )


@router.get("/media/{media_id}/predictions", response_model=MediaPredictionsResponse)
async def get_media_predictions(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_doctor_role)
):
    """Get all predictions and annotations for a media file"""
    logger.info("📋 Doctor %s requesting predictions for media %s", current_user.email, media_id)
    
    # Verify media exists and belongs to doctor's study
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    
    # Check if doctor owns the study containing this media
    study_id = cast(UUID, media.study_id)
    if not media_service.check_study_ownership(study_id, doctor_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You don't have permission to access this media"
        )
    
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
    logger.info("💾 Doctor %s saving annotations for media %s", current_user.email, media_id)
    
    # Verify media exists and belongs to doctor's study
    media_service = MediaService(db)
    doctor_id = cast(UUID, current_user.id)
    
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    
    # Check if doctor owns the study containing this media
    study_id = cast(UUID, media.study_id)
    if not media_service.check_study_ownership(study_id, doctor_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You don't have permission to access this media"
        )
    
    try:
        ai_service = AIPredictionService(db)
        saved_count = 0
        
        # Save classification annotation if provided
        if request.classification_annotation:
            result = ai_service.save_classification_annotation(
                media_id, request.classification_annotation.usefulness
            )
            if result:
                saved_count += 1
        
        # Save bounding box annotations if provided
        if request.bb_annotations:
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