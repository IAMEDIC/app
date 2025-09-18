# Import all schemas here
from .user import (
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
from .user_role import (
    UserRole,
    UserRoleCreate,
    UserRoleUpdate,
    UserRoleInDB,
)
from .doctor_profile import (
    DoctorProfile,
    DoctorProfileCreate,
    DoctorProfileUpdate,
    DoctorProfileInDB,
    DoctorProfileApproval,
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
]