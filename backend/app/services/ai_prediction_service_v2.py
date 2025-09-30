"""
Refactored AI prediction service with clean separation of concerns.
Separates prediction generation from annotation management.
"""


import logging
from typing import Optional, List, cast
from uuid import UUID
import io

import httpx
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import Column
from PIL import Image as PILImage
import numpy as np
import base64

from app.services.media_service import MediaService
from app.models.media import Media
from app.models.picture_classification_prediction import PictureClassificationPrediction
from app.models.picture_classification_annotation import PictureClassificationAnnotation
from app.models.picture_bb_prediction import PictureBBPrediction
from app.models.picture_bb_annotation import PictureBBAnnotation
from app.schemas.picture_classification_prediction import PictureClassificationPredictionCreate
from app.schemas.picture_classification_annotation import PictureClassificationAnnotationCreate
from app.schemas.picture_bb_prediction import PictureBBPredictionCreate
from app.schemas.picture_bb_annotation import PictureBBAnnotationCreate
from app.schemas.ai_responses import (
    ClassificationPredictionResponse,
    BoundingBoxPredictionsResponse, BoundingBoxPrediction,
    ClassificationAnnotationResponse,
    BoundingBoxAnnotationsResponse, BoundingBoxAnnotation,
    SaveClassificationAnnotationRequest,
    SaveBoundingBoxAnnotationsRequest,
    SaveAnnotationResponse
)


logger = logging.getLogger(__name__)


def convert_image_to_base64_bytes(image: PILImage.Image) -> str:
    """Convert PIL Image to base64 encoded bytes"""
    if image.mode != 'L':
        image = image.convert('L')
    image_array = np.array(image, dtype=np.uint8)
    image_bytes = image_array.tobytes()
    return base64.b64encode(image_bytes).decode('ascii')


class AIPredictionService:
    """Service class for AI prediction and annotation operations with clean separation"""

    def __init__(self, db: Session):
        self.db = db
        self.media_service = MediaService(db)
        self.classifier_service_url = "http://frame-classifier-service:8000"
        self.bb_service_url = "http://bb-reg-service:8000"

    async def generate_classification_prediction(
        self, 
        media_id: UUID, 
        doctor_id: UUID, 
        force_refresh: bool = False
    ) -> Optional[ClassificationPredictionResponse]:
        """Generate classification prediction for a media file (raw prediction only)"""
        try:
            logger.debug(f"🔍 Generating classification prediction for media {media_id}, force_refresh={force_refresh}")
            # Check if media exists and is accessible
            media = self._get_accessible_media(media_id, doctor_id)
            if not media:
                return None
            # Get model info
            model_info = await self.get_model_info("classifier")
            if not model_info:
                logger.error("Classifier model info not available")
                return None
            model_version = model_info.get("version", "unknown")
            # Check cache if not forcing refresh
            if not force_refresh:
                cached_prediction = self.get_cached_classification_prediction(media_id, model_version)
                if cached_prediction:
                    logger.debug(f"📋 Found cached classification prediction for media {media_id}")
                    return ClassificationPredictionResponse(
                        prediction=cast(float, cached_prediction.prediction),
                        model_version=cast(str, cached_prediction.model_version)
                    )
            # Load and process image
            image_data = self._load_media_image(media_id, doctor_id)
            if not image_data:
                return None
            # Call ML service
            prediction_result = await self._call_classification_service(image_data)
            if not prediction_result:
                return None
            # Cache the prediction in database
            self._cache_classification_prediction(
                media_id, 
                media.media_type.value,
                prediction_result["prediction"], 
                prediction_result["model_version"],
                force_refresh
            )
            return ClassificationPredictionResponse(
                prediction=prediction_result["prediction"],
                model_version=prediction_result["model_version"]
            )
        except Exception as e:
            logger.error(f"💥 Error generating classification prediction: {e}")
            return None

    async def generate_bounding_box_predictions(
        self, 
        media_id: UUID, 
        doctor_id: UUID, 
        force_refresh: bool = False
    ) -> Optional[BoundingBoxPredictionsResponse]:
        """Generate bounding box predictions for a media file (raw predictions only)"""
        try:
            logger.debug(f"🔍 Generating bounding box predictions for media {media_id}, force_refresh={force_refresh}")
            # Check if media exists and is accessible
            media = self._get_accessible_media(media_id, doctor_id)
            if not media:
                return None
            # Get model info
            model_info = await self.get_model_info("bounding_box")
            if not model_info:
                logger.error("BB model info not available")
                return None
            model_version = model_info.get("version", "unknown")
            # Check cache if not forcing refresh
            if not force_refresh:
                cached_predictions = self.get_cached_bb_predictions(media_id, model_version)
                if cached_predictions:
                    logger.debug(f"📋 Found cached bounding box predictions for media {media_id}")
                    return BoundingBoxPredictionsResponse(
                        predictions=[
                            BoundingBoxPrediction(
                                bb_class=cast(str, pred.bb_class),
                                confidence=cast(float, pred.confidence),
                                x_min=cast(int, pred.x_min),
                                y_min=cast(int, pred.y_min),
                                width=cast(int, pred.width),
                                height=cast(int, pred.height)
                            ) for pred in cached_predictions
                        ],
                        model_version=model_version
                    )
            # Load and process image
            image_data = self._load_media_image(media_id, doctor_id)
            if not image_data:
                return None
            # Call ML service
            prediction_results = await self._call_bb_service(image_data)
            if not prediction_results:
                return None
            # Cache the predictions in database
            logger.debug("Results: %s", prediction_results)
            self._cache_bb_predictions(
                media_id,
                media.media_type.value,
                prediction_results["predictions"],
                prediction_results["model_version"],
                force_refresh
            )
            return BoundingBoxPredictionsResponse(
                predictions=[
                    BoundingBoxPrediction(
                        bb_class=pred["class_name"],
                        confidence=pred.get("confidence", 0.0),
                        x_min=pred["x_min"],
                        y_min=pred["y_min"],
                        width=pred["width"],
                        height=pred["height"]
                    ) for pred in prediction_results["predictions"]
                ],
                model_version=prediction_results["model_version"]
            )
        except Exception as e:
            logger.error(f"💥 Error generating bounding box predictions: {e}")
            return None

    def get_classification_annotation(self, media_id: UUID) -> Optional[ClassificationAnnotationResponse]:
        """Get user's classification annotation for a media file"""
        try:
            annotation = self.db.query(PictureClassificationAnnotation).filter(
                PictureClassificationAnnotation.media_id == media_id
            ).first()
            if annotation:
                return ClassificationAnnotationResponse(usefulness=cast(int, annotation.usefulness))
            return None
        except Exception as e:
            logger.error(f"Error retrieving classification annotation: {e}")
            return None

    def get_bounding_box_annotations(self, media_id: UUID) -> Optional[BoundingBoxAnnotationsResponse]:
        """Get user's bounding box annotations for a media file"""
        try:
            annotations = self.db.query(PictureBBAnnotation).filter(
                PictureBBAnnotation.media_id == media_id
            ).all()
            return BoundingBoxAnnotationsResponse(
                annotations=[
                    BoundingBoxAnnotation(
                        bb_class=cast(str, ann.bb_class),
                        usefulness=cast(int, ann.usefulness),
                        x_min=cast(float, ann.x_min),
                        y_min=cast(float, ann.y_min),
                        width=cast(float, ann.width),
                        height=cast(float, ann.height),
                        is_hidden=cast(bool, ann.is_hidden)
                    ) for ann in annotations
                ]
            )
        except Exception as e:
            logger.error(f"Error retrieving bounding box annotations: {e}")
            return None
    
    def save_classification_annotation(
        self, 
        media_id: UUID, 
        request: SaveClassificationAnnotationRequest
    ) -> SaveAnnotationResponse:
        """Save user's classification annotation"""
        try:
            # Check if media exists
            media = self.db.query(Media).filter(Media.id == media_id).first()
            if not media:
                return SaveAnnotationResponse(
                    success=False,
                    message="Media not found"
                )
            # Check for existing annotation
            existing = self.db.query(PictureClassificationAnnotation).filter(
                PictureClassificationAnnotation.media_id == media_id
            ).first()
            if existing:
                # Update existing
                existing.usefulness = cast(Column[int], request.usefulness)
                self.db.commit()
                self.db.refresh(existing)
            else:
                # Create new
                annotation_data = PictureClassificationAnnotationCreate(
                    media_id=media_id,
                    media_type=media.media_type.value,
                    usefulness=request.usefulness
                )
                annotation = PictureClassificationAnnotation(**annotation_data.model_dump())
                self.db.add(annotation)
                self.db.commit()
            return SaveAnnotationResponse(
                success=True,
                message="Classification annotation saved successfully"
            )
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving classification annotation: {e}")
            return SaveAnnotationResponse(
                success=False,
                message=f"Failed to save classification annotation: {str(e)}"
            )

    def save_bounding_box_annotations(
        self, 
        media_id: UUID, 
        request: SaveBoundingBoxAnnotationsRequest
    ) -> SaveAnnotationResponse:
        """Save user's bounding box annotations"""
        try:
            # Check if media exists
            media = self.db.query(Media).filter(Media.id == media_id).first()
            if not media:
                logger.warning(f"❌ Media {media_id} not found")
                return SaveAnnotationResponse(
                    success=False,
                    message="Media not found"
                )
            deleted = self.db.query(PictureBBAnnotation).filter(
                PictureBBAnnotation.media_id == media_id
            ).delete()
            logger.debug(f"🗑️ Deleted {deleted} existing bounding box annotations for media {media_id}")
            self.db.commit()
            # Create new annotations
            saved_count = 0
            total_annotations = len(request.annotations)
            logger.info(f"📝 Processing {total_annotations} new bounding box annotations for media {media_id}")
            if total_annotations == 0:
                logger.info(f"📭 No new annotations to save for media {media_id} (empty list)")
            else:
                for i, ann_request in enumerate(request.annotations):
                    annotation_data = PictureBBAnnotationCreate(
                        media_id=media_id,
                        media_type=media.media_type.value,
                        bb_class=ann_request.bb_class,
                        usefulness=ann_request.usefulness,
                        x_min=ann_request.x_min,
                        y_min=ann_request.y_min,
                        width=ann_request.width,
                        height=ann_request.height,
                        is_hidden=ann_request.is_hidden
                    )
                    annotation = PictureBBAnnotation(**annotation_data.model_dump())
                    self.db.add(annotation)
                    saved_count += 1
                logger.debug(f"✅ Processed all {saved_count} annotations, preparing to commit")
            # Commit new annotations
            self.db.commit()
            return SaveAnnotationResponse(
                success=True,
                message=f"Successfully saved {saved_count} bounding box annotations"
            )
        except Exception as e:
            logger.error(f"💥 Exception in save_bounding_box_annotations for media {media_id}: {e}", exc_info=True)
            try:
                self.db.rollback()
            except Exception as rollback_error:
                logger.error(f"💥 Failed to rollback database: {rollback_error}")
            return SaveAnnotationResponse(
                success=False,
                message=f"Failed to save bounding box annotations: {str(e)}"
            )
    
    def _get_accessible_media(self, media_id: UUID, doctor_id: UUID) -> Optional[Media]:
        """Check if media exists and is accessible by doctor"""
        media = self.db.query(Media).filter(Media.id == media_id).first()
        if not media:
            logger.error(f"Media not found: {media_id}")
            return None
        # Verify ownership
        study_id = cast(UUID, media.study_id)
        if not self.media_service.check_study_ownership(study_id, doctor_id):
            logger.error(f"Access denied to media {media_id} for doctor {doctor_id}")
            return None
        return media

    def _load_media_image(self, media_id: UUID, doctor_id: UUID) -> Optional[dict]:
        """Load and process media image for ML services"""
        try:
            media_file_data = self.media_service.get_media_file(media_id, doctor_id)
            if not media_file_data:
                logger.error(f"Media file not found: {media_id}")
                return None
            file_data, _, _ = media_file_data
            image = PILImage.open(io.BytesIO(file_data)).convert('L')
            image_data_b64 = convert_image_to_base64_bytes(image)
            width, height = image.size
            return {
                "data": image_data_b64,
                "width": width,
                "height": height
            }
        except Exception as e:
            logger.error(f"Error loading media image: {e}")
            return None

    async def get_model_info(self, model_type: str) -> Optional[dict]:
        """Get model information from ML services"""
        try:
            service_url = self.classifier_service_url if model_type == "classifier" else self.bb_service_url
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{service_url}/model-info")
                if response.status_code == 200:
                    return response.json()
                else:
                    logger.error(f"Failed to get {model_type} model info: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Error getting {model_type} model info: {e}")
            return None

    async def _call_classification_service(self, image_data: dict) -> Optional[dict]:
        """Call classification ML service"""
        try:
            async with httpx.AsyncClient() as client:
                logger.debug(f"📡 Calling {self.classifier_service_url}/predict")
                response = await client.post(
                    f"{self.classifier_service_url}/predict",
                    json=image_data
                )
                if response.status_code == 200:
                    result = response.json()
                    logger.debug(f"🎯 Classification result: {result}")
                    return result
                else:
                    logger.error(f"❌ Classification prediction failed: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"🌐 Error calling classification service: {e}")
            return None

    async def _call_bb_service(self, image_data: dict) -> Optional[dict]:
        """Call bounding box ML service"""
        try:
            async with httpx.AsyncClient() as client:
                logger.debug(f"📡 Calling {self.bb_service_url}/predict")
                response = await client.post(
                    f"{self.bb_service_url}/predict",
                    json=image_data
                )
                if response.status_code == 200:
                    result = response.json()
                    logger.debug(f"🎯 Bounding box result: {len(result.get('predictions', []))} boxes")
                    return result
                else:
                    logger.error(f"❌ Bounding box prediction failed: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"🌐 Error calling bounding box service: {e}")
            return None

    def get_cached_classification_prediction(self, media_id: UUID, model_version: str) -> Optional[PictureClassificationPrediction]:
        """Get cached classification prediction"""
        return self.db.query(PictureClassificationPrediction).filter(
            PictureClassificationPrediction.media_id == media_id,
            PictureClassificationPrediction.model_version == model_version
        ).first()

    def get_cached_bb_predictions(self, media_id: UUID, model_version: str) -> List[PictureBBPrediction]:
        """Get cached bounding box predictions"""
        return self.db.query(PictureBBPrediction).filter(
            PictureBBPrediction.media_id == media_id,
            PictureBBPrediction.model_version == model_version
        ).all()

    def _cache_classification_prediction(
        self, 
        media_id: UUID, 
        media_type: str, 
        prediction: float, 
        model_version: str,
        force_refresh: bool = False
    ):
        """Cache classification prediction in database"""
        try:
            if force_refresh:
                # Delete existing cache
                self.db.query(PictureClassificationPrediction).filter(
                    PictureClassificationPrediction.media_id == media_id,
                    PictureClassificationPrediction.model_version == model_version
                ).delete()
            prediction_data = PictureClassificationPredictionCreate(
                media_id=media_id,
                media_type=media_type, # type: ignore
                prediction=prediction,
                model_version=model_version
            )
            cached_prediction = PictureClassificationPrediction(**prediction_data.model_dump())
            self.db.add(cached_prediction)
            self.db.commit()
        except IntegrityError:
            # Prediction already exists, ignore
            self.db.rollback()
        except Exception as e:
            logger.error(f"Error caching classification prediction: {e}")
            self.db.rollback()

    def _cache_bb_predictions(
        self, 
        media_id: UUID, 
        media_type: str, 
        predictions: List[dict], 
        model_version: str,
        force_refresh: bool = False
    ):
        """Cache bounding box predictions in database"""
        try:
            if force_refresh:
                # Delete existing cache
                self.db.query(PictureBBPrediction).filter(
                    PictureBBPrediction.media_id == media_id,
                    PictureBBPrediction.model_version == model_version
                ).delete()
            for pred in predictions:
                prediction_data = PictureBBPredictionCreate(
                    media_id=media_id,
                    media_type=media_type, # type: ignore
                    bb_class=pred["class_name"],
                    confidence=pred.get("confidence", 0.0),
                    x_min=pred["x_min"],
                    y_min=pred["y_min"],
                    width=pred["width"],
                    height=pred["height"],
                    model_version=model_version
                )
                cached_prediction = PictureBBPrediction(**prediction_data.model_dump())
                self.db.add(cached_prediction)
            self.db.commit()
        except IntegrityError:
            # Predictions already exist, ignore
            self.db.rollback()
        except Exception as e:
            logger.error(f"Error caching bounding box predictions: {e}")
            self.db.rollback()
