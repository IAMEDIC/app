"""
Admin statistics service for computing model performance metrics.
"""

import logging
from typing import List

from sqlalchemy.orm import Session
from sqlalchemy import and_, distinct

from app.models.picture_classification_annotation import PictureClassificationAnnotation
from app.models.picture_classification_prediction import PictureClassificationPrediction
from app.models.picture_bb_annotation import PictureBBAnnotation
from app.models.picture_bb_prediction import PictureBBPrediction
from app.models.media import Media
from app.models.study import Study
from app.schemas.admin_statistics import (
    ModelVersionInfo,
    ClassificationStatisticsResponse,
    BoundingBoxStatisticsResponse,
    ClassificationMetrics,
    BoundingBoxMetrics,
    ClassificationConfusionMatrix,
    StatisticsRequest
)


logger = logging.getLogger(__name__)


class AdminStatisticsService:
    """Service class for computing model performance statistics"""

    def __init__(self, db: Session):
        self.db = db

    def get_available_model_versions(self, model_type: str) -> ModelVersionInfo:
        """Get all available model versions for a given model type"""
        if model_type == "classifier":
            versions = self.db.query(
                distinct(PictureClassificationPrediction.model_version)
            ).all()
        elif model_type == "bounding_box":
            versions = self.db.query(
                distinct(PictureBBPrediction.model_version)
            ).all()
        else:
            raise ValueError(f"Invalid model type: {model_type}")

        version_list = [v[0] for v in versions if v[0] is not None]
        version_list.sort(reverse=True)  # Most recent versions first
        
        logger.debug(f"📊 Found {len(version_list)} versions for {model_type} model")
        return ModelVersionInfo(model_type=model_type, versions=version_list)

    def compute_classification_statistics(self, request: StatisticsRequest) -> ClassificationStatisticsResponse:
        """Compute classification model statistics for given parameters"""
        logger.debug(f"📊 Computing classification statistics for version {request.model_version}, "
                    f"dates {request.start_date} to {request.end_date}")

        # Query annotations with corresponding predictions
        query = self.db.query(
            PictureClassificationAnnotation.usefulness.label('actual'),
            PictureClassificationPrediction.prediction.label('predicted_prob')
        ).join(
            PictureClassificationPrediction,
            and_(
                PictureClassificationAnnotation.media_id == PictureClassificationPrediction.media_id,
                PictureClassificationPrediction.model_version == request.model_version
            )
        ).join(
            Media, 
            PictureClassificationAnnotation.media_id == Media.id
        ).join(
            Study,
            Media.study_id == Study.id
        ).filter(
            and_(
                PictureClassificationAnnotation.created_at >= request.start_date,
                PictureClassificationAnnotation.created_at <= request.end_date
            )
        )
        
        # Apply soft deletion filters if not including soft deleted records
        if not request.include_soft_deleted:
            query = query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )

        results = query.all()
        
        if not results:
            # Return zero metrics if no data found
            return self._create_empty_classification_response(request)

        # Convert predictions to binary using 0.5 threshold
        predictions_data = [(actual, 1 if predicted_prob > 0.5 else 0) for actual, predicted_prob in results]
        
        # Compute confusion matrix
        tp = sum(1 for actual, predicted in predictions_data if actual == 1 and predicted == 1)
        fp = sum(1 for actual, predicted in predictions_data if actual == 0 and predicted == 1)
        tn = sum(1 for actual, predicted in predictions_data if actual == 0 and predicted == 0)
        fn = sum(1 for actual, predicted in predictions_data if actual == 1 and predicted == 0)

        confusion_matrix = ClassificationConfusionMatrix(
            true_positive=tp,
            false_positive=fp,
            true_negative=tn,
            false_negative=fn
        )

        # Compute metrics
        total = tp + fp + tn + fn
        accuracy = (tp + tn) / total if total > 0 else 0.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        metrics = ClassificationMetrics(
            accuracy=accuracy,
            precision=precision,
            recall=recall,
            f1_score=f1_score,
            confusion_matrix=confusion_matrix,
            total_samples=total
        )

        # Sample distribution
        actual_useful = sum(1 for actual, _ in predictions_data if actual == 1)
        actual_not_useful = sum(1 for actual, _ in predictions_data if actual == 0)
        
        sample_distribution = {
            "useful": actual_useful,
            "not_useful": actual_not_useful
        }

        logger.debug(f"📊 Classification metrics computed: Accuracy={accuracy:.3f}, "
                    f"Precision={precision:.3f}, Recall={recall:.3f}, F1={f1_score:.3f}")

        return ClassificationStatisticsResponse(
            model_version=request.model_version,
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            metrics=metrics,
            sample_distribution=sample_distribution,
            included_soft_deleted=request.include_soft_deleted or False
        )

    def compute_bounding_box_statistics(self, request: StatisticsRequest) -> BoundingBoxStatisticsResponse:
        """Compute bounding box model statistics for given parameters"""
        logger.debug(f"📊 Computing bounding box statistics for version {request.model_version}, "
                    f"dates {request.start_date} to {request.end_date}")

        # Get annotations and predictions separately for IoU computation
        annotations_query = self.db.query(PictureBBAnnotation).join(
            Media, 
            PictureBBAnnotation.media_id == Media.id
        ).join(
            Study,
            Media.study_id == Study.id
        ).filter(
            and_(
                PictureBBAnnotation.created_at >= request.start_date,
                PictureBBAnnotation.created_at <= request.end_date,
                PictureBBAnnotation.usefulness == 1  # Only useful annotations
            )
        )
        
        # Exclude hidden annotations unless specifically requested
        if not request.include_hidden_annotations:
            annotations_query = annotations_query.filter(
                PictureBBAnnotation.is_hidden.is_(False)
            )

        predictions_query = self.db.query(PictureBBPrediction).join(
            Media,
            PictureBBPrediction.media_id == Media.id
        ).join(
            Study,
            Media.study_id == Study.id
        ).filter(
            and_(
                PictureBBPrediction.model_version == request.model_version,
                PictureBBPrediction.confidence >= (request.confidence_threshold or 0.5)
            )
        )
        
        # Apply soft deletion filters if not including soft deleted records
        if not request.include_soft_deleted:
            annotations_query = annotations_query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )
            predictions_query = predictions_query.filter(
                and_(
                    Media.is_active.is_(True),
                    Study.is_active.is_(True)
                )
            )

        annotations = annotations_query.all()
        predictions = predictions_query.all()

        if not annotations:
            return self._create_empty_bbox_response(request)

        # Group by media_id and bb_class for mAP computation
        annotations_by_media_class = {}
        for ann in annotations:
            key = (str(ann.media_id), str(ann.bb_class))
            if key not in annotations_by_media_class:
                annotations_by_media_class[key] = []
            annotations_by_media_class[key].append(ann)

        predictions_by_media_class = {}
        for pred in predictions:
            key = (str(pred.media_id), str(pred.bb_class))
            if key not in predictions_by_media_class:
                predictions_by_media_class[key] = []
            predictions_by_media_class[key].append(pred)

        # Compute mAP and per-class AP
        per_class_ap = {}
        all_classes = set(str(ann.bb_class) for ann in annotations)
        
        for bb_class in all_classes:
            class_annotations = [ann for ann in annotations if str(ann.bb_class) == bb_class]
            class_predictions = [pred for pred in predictions if str(pred.bb_class) == bb_class]
            
            ap = self._compute_average_precision(
                class_annotations,
                class_predictions,
                request.iou_threshold or 0.5
            )
            per_class_ap[bb_class] = ap

        # Overall mAP
        map_score = sum(per_class_ap.values()) / len(per_class_ap) if per_class_ap else 0.0

        metrics = BoundingBoxMetrics(
            map_score=map_score,
            iou_threshold=request.iou_threshold or 0.5,
            confidence_threshold=request.confidence_threshold or 0.5,
            per_class_ap=per_class_ap,
            total_annotations=len(annotations),
            total_predictions=len(predictions)
        )

        # Class distribution
        class_distribution = {}
        for bb_class in all_classes:
            class_distribution[bb_class] = sum(1 for ann in annotations if str(ann.bb_class) == bb_class)

        logger.debug(f"📊 Bounding box metrics computed: mAP={map_score:.3f}, "
                    f"Classes={len(all_classes)}, Annotations={len(annotations)}")

        return BoundingBoxStatisticsResponse(
            model_version=request.model_version,
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            metrics=metrics,
            class_distribution=class_distribution,
            included_soft_deleted=request.include_soft_deleted or False,
            included_hidden_annotations=request.include_hidden_annotations or False
        )

    def _compute_average_precision(
        self, 
        annotations: List[PictureBBAnnotation],
        predictions: List[PictureBBPrediction],
        iou_threshold: float
    ) -> float:
        """Compute Average Precision for a single class"""
        if not annotations or not predictions:
            return 0.0

        # Sort predictions by confidence (descending)
        predictions = sorted(predictions, key=lambda x: x.confidence, reverse=True)
        
        # Match predictions to annotations using IoU
        matched_predictions = []
        matched_annotations = set()
        
        for pred in predictions:
            best_iou = 0.0
            best_ann = None
            
            # Find annotations for same media
            media_annotations = [ann for ann in annotations if str(ann.media_id) == str(pred.media_id)]
            
            for ann in media_annotations:
                if ann.id in matched_annotations:
                    continue
                    
                iou = self._compute_iou(pred, ann)
                if iou > best_iou and iou >= iou_threshold:
                    best_iou = iou
                    best_ann = ann
            
            if best_ann:
                matched_predictions.append((pred, True))  # True positive
                matched_annotations.add(best_ann.id)
            else:
                matched_predictions.append((pred, False))  # False positive

        # Compute precision-recall curve
        if not matched_predictions:
            return 0.0

        tp_count = 0
        precision_values = []
        recall_values = []
        total_annotations = len(annotations)

        for i, (pred, is_tp) in enumerate(matched_predictions):
            if is_tp:
                tp_count += 1
            
            precision = tp_count / (i + 1)
            recall = tp_count / total_annotations
            
            precision_values.append(precision)
            recall_values.append(recall)

        # Compute AP using the 11-point interpolation method
        ap = 0.0
        for recall_threshold in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
            max_precision = 0.0
            for precision, recall in zip(precision_values, recall_values):
                if recall >= recall_threshold:
                    max_precision = max(max_precision, precision)
            ap += max_precision / 11.0

        return ap

    def _compute_iou(self, prediction: PictureBBPrediction, annotation: PictureBBAnnotation) -> float:
        """Compute Intersection over Union between prediction and annotation"""
        # Convert to absolute coordinates - these are instance attributes, not column definitions
        pred_x1 = prediction.x_min  # type: ignore
        pred_y1 = prediction.y_min  # type: ignore  
        pred_x2 = prediction.x_min + prediction.width  # type: ignore
        pred_y2 = prediction.y_min + prediction.height  # type: ignore

        ann_x1 = annotation.x_min  # type: ignore
        ann_y1 = annotation.y_min  # type: ignore
        ann_x2 = annotation.x_min + annotation.width  # type: ignore
        ann_y2 = annotation.y_min + annotation.height  # type: ignore

        # Compute intersection
        intersect_x1 = max(pred_x1, ann_x1)
        intersect_y1 = max(pred_y1, ann_y1)
        intersect_x2 = min(pred_x2, ann_x2)
        intersect_y2 = min(pred_y2, ann_y2)

        if intersect_x2 <= intersect_x1 or intersect_y2 <= intersect_y1:  # type: ignore
            return 0.0

        intersection_area = (intersect_x2 - intersect_x1) * (intersect_y2 - intersect_y1)

        # Compute areas
        pred_area = prediction.width * prediction.height  # type: ignore
        ann_area = annotation.width * annotation.height  # type: ignore
        union_area = pred_area + ann_area - intersection_area

        if union_area <= 0:  # type: ignore
            return 0.0

        return intersection_area / union_area  # type: ignore

    def _create_empty_classification_response(self, request: StatisticsRequest) -> ClassificationStatisticsResponse:
        """Create empty response when no data is found"""
        confusion_matrix = ClassificationConfusionMatrix(
            true_positive=0, false_positive=0, true_negative=0, false_negative=0
        )
        
        metrics = ClassificationMetrics(
            accuracy=0.0,
            precision=0.0,
            recall=0.0,
            f1_score=0.0,
            confusion_matrix=confusion_matrix,
            total_samples=0
        )

        return ClassificationStatisticsResponse(
            model_version=request.model_version,
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            metrics=metrics,
            sample_distribution={"useful": 0, "not_useful": 0},
            included_soft_deleted=request.include_soft_deleted or False
        )

    def _create_empty_bbox_response(self, request: StatisticsRequest) -> BoundingBoxStatisticsResponse:
        """Create empty response when no data is found"""
        metrics = BoundingBoxMetrics(
            map_score=0.0,
            iou_threshold=request.iou_threshold or 0.5,
            confidence_threshold=request.confidence_threshold or 0.5,
            per_class_ap={},
            total_annotations=0,
            total_predictions=0
        )

        return BoundingBoxStatisticsResponse(
            model_version=request.model_version,
            date_range={"start_date": str(request.start_date), "end_date": str(request.end_date)},
            metrics=metrics,
            class_distribution={},
            included_soft_deleted=request.include_soft_deleted or False,
            included_hidden_annotations=request.include_hidden_annotations or False
        )