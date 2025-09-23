# Import all the models here to make them available
from .user import User
from .user_role import UserRole, UserRoleType
from .doctor_profile import DoctorProfile, DoctorProfileStatus
from .study import Study
from .media import Media, MediaType, UploadStatus
from .picture_classification_prediction import PictureClassificationPrediction
from .picture_classification_annotation import PictureClassificationAnnotation
from .picture_bb_prediction import PictureBBPrediction
from .picture_bb_annotation import PictureBBAnnotation

__all__ = [
    "User", "UserRole", "UserRoleType", 
    "DoctorProfile", "DoctorProfileStatus",
    "Study", "Media", "MediaType", "UploadStatus",
    "PictureClassificationPrediction", "PictureClassificationAnnotation",
    "PictureBBPrediction", "PictureBBAnnotation"
]