"""
Schemas package
"""


from app.schemas.user import (
    User,
    UserCreate,
    UserUpdate,
    UserInDB,
    UserWithRoles,
    Token,
    TokenData,
    GoogleAuthURL,
    GoogleCallback,
    LoginResponse,
)
from app.schemas.user_role import (
    UserRole,
    UserRoleCreate,
    UserRoleUpdate,
    UserRoleInDB,
)
from app.schemas.doctor_profile import (
    DoctorProfile,
    DoctorProfileCreate,
    DoctorProfileUpdate,
    DoctorProfileInDB,
    DoctorProfileApproval,
)
from app.schemas.study import (
    Study,
    StudyCreate,
    StudyUpdate,
    StudyInDB,
    StudyWithMedia,
    StudyListResponse,
    StudySummary,
)
from app.schemas.media import (
    Media,
    MediaCreate,
    MediaUpdate,
    MediaInDB,
    MediaSummary,
    MediaListResponse,
    MediaUploadResponse,
    StorageInfo,
)
from app.schemas.frame import (
    Frame,
    FrameCreate,
    FrameUpdate,
    FrameInDB,
    FrameSummary,
    FrameListResponse,
    FrameCreateRequest,
    FrameCreateResponse,
    VideoMetadata,
    AutoExtractionParams,
    AutoExtractionRequest,
    AutoExtractionResponse,
)
from app.schemas.picture_classification_prediction import (
    PictureClassificationPrediction,
    PictureClassificationPredictionCreate,
    PictureClassificationPredictionUpdate,
    PictureClassificationPredictionInDB,
)
from app.schemas.picture_classification_annotation import (
    PictureClassificationAnnotation,
    PictureClassificationAnnotationCreate,
    PictureClassificationAnnotationUpdate,
    PictureClassificationAnnotationInDB,
)
from app.schemas.picture_bb_prediction import (
    PictureBBPrediction,
    PictureBBPredictionCreate,
    PictureBBPredictionUpdate,
    PictureBBPredictionInDB,
)
from app.schemas.picture_bb_annotation import (
    PictureBBAnnotation,
    PictureBBAnnotationCreate,
    PictureBBAnnotationUpdate,
    PictureBBAnnotationInDB,
)
from app.schemas.ai_responses import (
    ModelInfo,
    ClassificationPredictionResponse,
    BoundingBoxPrediction,
    BoundingBoxPredictionsResponse,
    ClassificationAnnotationResponse,
    BoundingBoxAnnotation,
    BoundingBoxAnnotationsResponse,
    SaveClassificationAnnotationRequest,
    SaveAnnotationResponse,
    SaveBoundingBoxAnnotationItem,
    SaveBoundingBoxAnnotationsRequest,
    GeneratePredictionRequest
)
from app.schemas.admin_statistics import (
    ModelVersionInfo,
    ClassificationStatisticsResponse,
    BoundingBoxStatisticsResponse,
    ClassificationMetrics,
    BoundingBoxMetrics,
    ClassificationConfusionMatrix,
    StatisticsRequest
)
from app.schemas.csv_export import (
    CSVExportRequest,
    CSVExportInfo
)

__all__ = [
    "User",
    "UserCreate",
    "UserUpdate",
    "UserInDB",
    "UserWithRoles",
    "Token",
    "TokenData",
    "GoogleAuthURL",
    "GoogleCallback",
    "LoginResponse",
    "UserRole",
    "UserRoleCreate",
    "UserRoleUpdate",
    "UserRoleInDB",
    "DoctorProfile",
    "DoctorProfileCreate",
    "DoctorProfileUpdate",
    "DoctorProfileInDB",
    "DoctorProfileApproval",
    "Study",
    "StudyCreate",
    "StudyUpdate",
    "StudyInDB",
    "StudyWithMedia",
    "StudyListResponse",
    "StudySummary",
    "Media",
    "MediaCreate",
    "MediaUpdate",
    "MediaInDB",
    "MediaSummary",
    "MediaListResponse",
    "MediaUploadResponse",
    "StorageInfo",
    "Frame",
    "FrameCreate",
    "FrameUpdate",
    "FrameInDB",
    "FrameSummary",
    "FrameListResponse",
    "FrameCreateRequest",
    "FrameCreateResponse",
    "VideoMetadata",
    "AutoExtractionParams",
    "AutoExtractionRequest",
    "AutoExtractionResponse",
    "PictureClassificationPrediction",
    "PictureClassificationPredictionCreate",
    "PictureClassificationPredictionUpdate",
    "PictureClassificationPredictionInDB",
    "PictureClassificationAnnotation",
    "PictureClassificationAnnotationCreate",
    "PictureClassificationAnnotationUpdate",
    "PictureClassificationAnnotationInDB",
    "PictureBBPrediction",
    "PictureBBPredictionCreate",
    "PictureBBPredictionUpdate",
    "PictureBBPredictionInDB",
    "PictureBBAnnotation",
    "PictureBBAnnotationCreate",
    "PictureBBAnnotationUpdate",
    "PictureBBAnnotationInDB",
    "ModelInfo",
    "ClassificationPredictionResponse",
    "BoundingBoxPrediction",
    "BoundingBoxPredictionsResponse",
    "ClassificationAnnotationResponse",
    "BoundingBoxAnnotation",
    "BoundingBoxAnnotationsResponse",
    "SaveClassificationAnnotationRequest",
    "SaveAnnotationResponse",
    "SaveBoundingBoxAnnotationItem",
    "SaveBoundingBoxAnnotationsRequest",
    "SaveClassificationAnnotationRequest",
    "GeneratePredictionRequest",
    # Admin statistics
    "ModelVersionInfo",
    "ClassificationStatisticsResponse",
    "BoundingBoxStatisticsResponse",
    "ClassificationMetrics",
    "BoundingBoxMetrics",
    "ClassificationConfusionMatrix",
    "StatisticsRequest",
    # CSV export
    "CSVExportRequest",
    "CSVExportInfo"
]
