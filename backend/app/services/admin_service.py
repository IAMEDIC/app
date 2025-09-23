"""
Admin service for user and role management operations.
"""


import logging
import os
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.models.user import User as UserModel
from app.models.user_role import UserRole as UserRoleModel, UserRoleType
from app.models.doctor_profile import DoctorProfile as DoctorProfileModel, DoctorProfileStatus
from app.models.media import Media as MediaModel
from app.schemas.user import UserWithRoles
from app.schemas.user_role import UserRoleCreate
from app.schemas.doctor_profile import DoctorProfile as DoctorProfileSchema
from app.core.file_storage import FileStorageService


logger = logging.getLogger(__name__)


class AdminService:
    """Service class for admin operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_all_users_with_roles(self) -> list[UserWithRoles]:
        """Get all users with their roles and doctor profiles"""
        users = self.db.query(UserModel).options(
            joinedload(UserModel.roles)
        ).all()
        
        result = []
        for user in users:
            # Create user dict with camelCase keys to match frontend expectations
            user_dict = {
                'id': user.id,
                'email': user.email,
                'name': user.name,
                'google_id': user.google_id,
                'is_active': user.is_active,
                'createdAt': user.created_at.isoformat(),
                'updatedAt': user.updated_at.isoformat(),
                'roles': [role.role for role in user.roles]
            }
            # Use model_validate with the corrected dict
            result.append(UserWithRoles.model_validate(user_dict))
        return result

    def get_user_with_roles(self, user_id: UUID) -> Optional[UserWithRoles]:
        """Get a specific user with roles and doctor profile"""
        user = self.db.query(UserModel).options(
            joinedload(UserModel.roles)
        ).filter(UserModel.id == user_id).first()
        
        if not user:
            return None
            
        # Create user dict with camelCase keys to match frontend expectations
        user_dict = {
            'id': user.id,
            'email': user.email,
            'name': user.name,
            'google_id': user.google_id,
            'is_active': user.is_active,
            'createdAt': user.created_at.isoformat(),
            'updatedAt': user.updated_at.isoformat(),
            'roles': [role.role for role in user.roles]
        }
        # Use model_validate with the corrected dict
        return UserWithRoles.model_validate(user_dict)

    def assign_role_to_user(self, role_data: UserRoleCreate) -> UserRoleModel:
        """Assign a role to a user"""
        # Check if role already exists
        existing_role = self.db.query(UserRoleModel).filter(
            UserRoleModel.user_id == role_data.user_id,
            UserRoleModel.role == role_data.role.value
        ).first()
        if existing_role:
            raise ValueError(f"User already has role {role_data.role.value}")
        # Create new role
        db_role = UserRoleModel(
            user_id=role_data.user_id,
            role=role_data.role.value
        )
        self.db.add(db_role)
        self.db.commit()
        self.db.refresh(db_role)
        logger.info("📊 Role %s assigned to user %s", role_data.role.value, role_data.user_id)
        return db_role

    def remove_role_from_user(self, user_id: UUID, role: UserRoleType):
        """Remove a role from a user"""
        db_role = self.db.query(UserRoleModel).filter(
            UserRoleModel.user_id == user_id,
            UserRoleModel.role == role.value
        ).first()
        if db_role:
            self.db.delete(db_role)
            self.db.commit()
            logger.info("📊 Role %s removed from user %s", role.value, user_id)

    def get_doctor_profiles_by_status(self, status: DoctorProfileStatus) -> list[DoctorProfileSchema]:
        """Get doctor profiles by status"""
        profiles = self.db.query(DoctorProfileModel).filter(
            DoctorProfileModel.status == status.value
        ).all()
        return [DoctorProfileSchema.model_validate(profile) for profile in profiles]

    def update_doctor_profile_status(
        self, 
        profile_id: UUID, 
        status: DoctorProfileStatus, 
        notes: Optional[str] = None
    ) -> Optional[DoctorProfileSchema]:
        """Update doctor profile status and notes"""
        profile = self.db.query(DoctorProfileModel).filter(
            DoctorProfileModel.id == profile_id
        ).first()
        if not profile:
            return None
        # Type ignore comments to suppress false positive SQLAlchemy type errors
        profile.status = status.value  # type: ignore
        if notes:
            profile.notes = notes  # type: ignore
        self.db.commit()
        self.db.refresh(profile)
        logger.info("📊 Doctor profile %s status updated to %s", profile_id, status.value)
        return DoctorProfileSchema.model_validate(profile)

    def delete_user(self, user_id: UUID) -> bool:
        """Delete a user and all associated data"""
        user = self.db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            return False
        self.db.delete(user)
        self.db.commit()
        logger.info("📊 User %s deleted", user_id)
        return True

    def get_user_roles(self, user_id: UUID) -> list[str]:
        """Get all roles for a specific user"""
        roles = self.db.query(UserRoleModel).filter(
            UserRoleModel.user_id == user_id
        ).all()
        # Type ignore to suppress false positive SQLAlchemy type error
        return [role.role for role in roles]  # type: ignore
    
    def is_admin(self, user_id: UUID) -> bool:
        """Check if user has admin role"""
        admin_role = self.db.query(UserRoleModel).filter(
            UserRoleModel.user_id == user_id,
            UserRoleModel.role == UserRoleType.ADMIN.value
        ).first()
        return admin_role is not None

    def cleanup_orphaned_media(self) -> dict:
        """Remove orphaned media records that don't have corresponding files on disk"""
        file_storage = FileStorageService()
        media_records = self.db.query(MediaModel).all()
        
        orphaned_count = 0
        total_count = len(media_records)
        
        for media in media_records:
            # Check if the file exists on disk using the private method
            file_path = file_storage._get_file_path(str(media.file_path))
            if not os.path.exists(file_path):
                logger.info("🗑️ Removing orphaned media record: %s (file not found: %s)", 
                           media.id, file_path)
                self.db.delete(media)
                orphaned_count += 1
        
        if orphaned_count > 0:
            self.db.commit()
            logger.info("🧹 Cleanup completed: %d orphaned media records removed out of %d total", 
                       orphaned_count, total_count)
        else:
            logger.info("✅ No orphaned media records found (checked %d records)", total_count)
        
        return {
            "total_checked": total_count,
            "orphaned_removed": orphaned_count,
            "remaining_records": total_count - orphaned_count
        }
