"""
AI prediction service for business logic operations.
"""


import logging
from typing import Optional, Any, cast
from uuid import UUID

import httpx
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.media import Media
from app.models.picture_classification_prediction import PictureClassificationPrediction
from app.models.picture_classification_annotation import PictureClassificationAnnotation
from app.models.picture_bb_prediction import PictureBBPrediction
from app.models.picture_bb_annotation import PictureBBAnnotation
from app.schemas.picture_classification_prediction import PictureClassificationPredictionCreate
from app.schemas.picture_classification_annotation import PictureClassificationAnnotationCreate
from app.schemas.picture_bb_prediction import PictureBBPredictionCreate
from app.schemas.picture_bb_prediction import PictureBBPrediction as PictureBBPredictionSchema
from app.schemas.picture_bb_annotation import PictureBBAnnotationCreate
from app.schemas.picture_bb_annotation import PictureBBAnnotation as PictureBBAnnotationSchema
from app.schemas.ai_predictions import (
    ModelInfo, ClassificationPredictionResponse, BBPredictionResponse, 
    MediaPredictionsResponse
)


logger = logging.getLogger(__name__)


class AIPredictionService:
    """Service class for AI prediction and annotation operations"""

    def __init__(self, db: Session):
        self.db = db
        self.classifier_service_url = "http://frame-classifier-service:8000"
        self.bb_service_url = "http://bb-reg-service:8000"

    async def get_model_info(self, model_type: str) -> Optional[ModelInfo]:
        """Get model information from the specified service"""
        try:
            service_url = self.classifier_service_url if model_type == "classifier" else self.bb_service_url
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{service_url}/model-info")
                if response.status_code == 200:
                    data = response.json()
                    return ModelInfo(**data)
                else:
                    logger.error(f"Failed to get {model_type} model info: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"Error getting {model_type} model info: {e}")
            return None
        
    def get_existing_classification_prediction(self, media_id: UUID, model_version: str) -> Optional[PictureClassificationPrediction]:
        """Check for existing classification prediction"""
        existing = self.db.query(PictureClassificationPrediction).filter(
            PictureClassificationPrediction.media_id == media_id,
            PictureClassificationPrediction.model_version == model_version
        ).first()
        return existing

    async def predict_classification(self, media_id: UUID, image_data_b64: str, width: int, height: int, force_refresh: bool = False) -> Optional[PictureClassificationPrediction]:
        """Get classification prediction for a media file"""
        try:
            logger.debug(f"🔍 Starting classification prediction for media {media_id}, force_refresh={force_refresh}")
            media = self.db.query(Media).filter(Media.id == media_id).first()
            if not media:
                logger.error(f"Media not found: {media_id}")
                return None
            model_info = await self.get_model_info("classifier")
            if not model_info:
                logger.error("Model info not available, cannot proceed with prediction")
                return None
            model_version = model_info.version
            if not force_refresh:
                existing = self.get_existing_classification_prediction(media_id, model_version)
                if existing:
                    logger.debug(f"📋 Found existing, updated classification prediction for media {media_id}, returning cached result")
                    return existing
            logger.debug(f"🚀 Making HTTP request to frame-classifier-service for media {media_id}")
            async with httpx.AsyncClient() as client:
                logger.debug(f"📡 Calling {self.classifier_service_url}/predict with image data: {width}x{height} base64 encoded")
                response = await client.post(
                    f"{self.classifier_service_url}/predict",
                    json={"data": image_data_b64, "width": width, "height": height}
                )
                logger.debug(f"✅ Received response from frame-classifier-service: status={response.status_code}")
                if response.status_code == 200:
                    result = response.json()
                    logger.debug(f"🎯 Classification result: {result}")
                    prediction_value = result.get("prediction", 0.0)
                    model_version = result.get("model_version", "unknown")
                    prediction_data = PictureClassificationPredictionCreate(
                        media_id=media_id,
                        media_type=media.media_type.value,
                        prediction=prediction_value,
                        model_version=model_version
                    )
                    return self.save_classification_prediction(prediction_data, force_refresh)
                else:
                    logger.error(f"❌ Classification prediction failed: status={response.status_code}, response={response.text}")
                    return None
        except httpx.RequestError as e:
            logger.error(f"🌐 Network error calling frame-classifier-service: {e}")
            return None
        except httpx.HTTPStatusError as e:
            logger.error(f"🚨 HTTP error from frame-classifier-service: {e.response.status_code} - {e.response.text}")
            return None
        except Exception as e:
            logger.error(f"💥 Unexpected error in classification prediction: {e}")
            return None

    async def predict_bounding_boxes(self, media_id: UUID, image_data_b64: str, width: int, height: int, force_refresh: bool = False) -> list[PictureBBPrediction]:
        """Get bounding box predictions for a media file"""
        try:
            media = self.db.query(Media).filter(Media.id == media_id).first()
            if not media:
                logger.error(f"Media not found: {media_id}")
                return []
            model_info = await self.get_model_info("bounding_box")
            if not model_info:
                logger.error("Model info not available, cannot proceed with prediction")
                return []
            model_version = model_info.version
            if not force_refresh:
                existing = self.db.query(PictureBBPrediction).filter(
                    PictureBBPrediction.media_id == media_id,
                    PictureBBPrediction.model_version == model_version
                ).all()
                if existing:
                    logger.debug(f"📋 Found existing, updated bounding box predictions for media {media_id}, returning cached results")
                    return existing
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.bb_service_url}/predict",
                    json={"data": image_data_b64, "width": width, "height": height}
                )
                if response.status_code == 200:
                    result = response.json()
                    predictions = result.get("predictions", [])
                    model_version = result.get("model_version", "unknown")
                    if force_refresh:
                        self.db.query(PictureBBPrediction).filter(
                            PictureBBPrediction.media_id == media_id,
                            PictureBBPrediction.model_version == model_version
                        ).delete()
                    bb_predictions = []
                    for pred in predictions:
                        prediction_data = PictureBBPredictionCreate(
                            media_id=media_id,
                            media_type=media.media_type.value,
                            bb_class=pred["class_name"],
                            confidence=pred.get("confidence", 0.0),
                            x_min=pred["x_min"],
                            y_min=pred["y_min"],
                            width=pred["width"],
                            height=pred["height"],
                            model_version=model_version
                        )
                        bb_prediction = self._save_bb_prediction(prediction_data)
                        if bb_prediction:
                            bb_predictions.append(bb_prediction)
                    self.db.commit()
                    return bb_predictions
                else:
                    logger.error(f"BB prediction failed: {response.status_code}")
                    return []
        except Exception as e:
            logger.error(f"Error in BB prediction: {e}")
            return []

    def get_media_predictions(self, media_id: UUID) -> MediaPredictionsResponse:
        """Get all predictions and annotations for a media file"""
        classification_prediction = self.db.query(PictureClassificationPrediction).filter(
            PictureClassificationPrediction.media_id == media_id
        ).first()
        classification_annotation = self.db.query(PictureClassificationAnnotation).filter(
            PictureClassificationAnnotation.media_id == media_id
        ).first()
        bb_predictions = self.db.query(PictureBBPrediction).filter(
            PictureBBPrediction.media_id == media_id
        ).all()
        bb_annotations = self.db.query(PictureBBAnnotation).filter(
            PictureBBAnnotation.media_id == media_id
        ).all()
        return MediaPredictionsResponse(
            media_id=media_id,
            classification=ClassificationPredictionResponse(
                prediction=classification_prediction,
                annotation=classification_annotation
            ),
            bounding_boxes=BBPredictionResponse(
                predictions=cast(list[PictureBBPredictionSchema], bb_predictions),
                annotations=cast(list[PictureBBAnnotationSchema], bb_annotations)
            )
        )

    def save_classification_annotation(self, media_id: UUID, usefulness: int) -> Optional[PictureClassificationAnnotation]:
        """Save or update classification annotation"""
        try:
            media = self.db.query(Media).filter(Media.id == media_id).first()
            if not media:
                return None
            existing = self.db.query(PictureClassificationAnnotation).filter(
                PictureClassificationAnnotation.media_id == media_id
            ).first()
            if existing:
                for key, value in {"usefulness": usefulness}.items():
                    setattr(existing, key, value)
                self.db.commit()
                self.db.refresh(existing)
                return existing
            else:
                annotation_data = PictureClassificationAnnotationCreate(
                    media_id=media_id,
                    media_type=media.media_type.value,  # Convert enum to string
                    usefulness=usefulness
                )
                return self._save_classification_annotation(annotation_data)
        except Exception as e:
            logger.error(f"Error saving classification annotation: {e}")
            self.db.rollback()
            return None

    def save_bb_annotations(self, media_id: UUID, annotations: list[dict[str, Any]]) -> list[PictureBBAnnotation]:
        """Save or update bounding box annotations"""
        try:
            media = self.db.query(Media).filter(Media.id == media_id).first()
            if not media:
                return []
            self.db.query(PictureBBAnnotation).filter(
                PictureBBAnnotation.media_id == media_id
            ).delete()
            saved_annotations = []
            for ann in annotations:
                annotation_data = PictureBBAnnotationCreate(
                    media_id=media_id,
                    media_type=media.media_type.value,  # Convert enum to string
                    bb_class=ann["bb_class"],
                    usefulness=ann.get("usefulness", 1),
                    x_min=ann["x_min"],
                    y_min=ann["y_min"],
                    width=ann["width"],
                    height=ann["height"],
                    is_hidden=ann.get("is_hidden", False)
                )
                bb_annotation = self._save_bb_annotation(annotation_data)
                if bb_annotation:
                    saved_annotations.append(bb_annotation)
            self.db.commit()
            return saved_annotations
        except Exception as e:
            logger.error(f"Error saving BB annotations: {e}")
            self.db.rollback()
            return []

    def save_classification_prediction(self, prediction_data: PictureClassificationPredictionCreate, force_refresh: bool = False) -> Optional[PictureClassificationPrediction]:
        """Save classification prediction to database"""
        try:
            if force_refresh:
                self.db.query(PictureClassificationPrediction).filter(
                    PictureClassificationPrediction.media_id == prediction_data.media_id,
                    PictureClassificationPrediction.model_version == prediction_data.model_version
                ).delete()
            prediction = PictureClassificationPrediction(**prediction_data.model_dump())
            self.db.add(prediction)
            self.db.commit()
            self.db.refresh(prediction)
            return prediction
        except IntegrityError as e:
            self.db.rollback()
            logger.error(f"Integrity error saving classification prediction: {e}")
            return None
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving classification prediction: {e}")
            return None

    def _save_classification_annotation(self, annotation_data: PictureClassificationAnnotationCreate) -> Optional[PictureClassificationAnnotation]:
        """Save classification annotation to database"""
        try:
            annotation = PictureClassificationAnnotation(**annotation_data.model_dump())
            self.db.add(annotation)
            self.db.commit()
            self.db.refresh(annotation)
            return annotation
        except IntegrityError as e:
            self.db.rollback()
            logger.error(f"Integrity error saving classification annotation: {e}")
            return None
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving classification annotation: {e}")
            return None

    def _save_bb_prediction(self, prediction_data: PictureBBPredictionCreate) -> Optional[PictureBBPrediction]:
        """Save bounding box prediction to database"""
        try:
            prediction = PictureBBPrediction(**prediction_data.model_dump())
            self.db.add(prediction)
            return prediction
        except Exception as e:
            logger.error(f"Error creating BB prediction: {e}")
            return None

    def _save_bb_annotation(self, annotation_data: PictureBBAnnotationCreate) -> Optional[PictureBBAnnotation]:
        """Save bounding box annotation to database"""
        try:
            annotation = PictureBBAnnotation(**annotation_data.model_dump())
            self.db.add(annotation)
            return annotation
        except Exception as e:
            logger.error(f"Error creating BB annotation: {e}")
            return None