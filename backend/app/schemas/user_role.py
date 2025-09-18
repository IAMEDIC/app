"""
User role schemas for request and response models.
"""


from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.user_role import UserRoleType


class UserRoleBase(BaseModel):
    """Base user role schema"""
    role: UserRoleType


class UserRoleCreate(UserRoleBase):
    """Schema for creating a new user role"""
    user_id: UUID


class UserRoleUpdate(BaseModel):
    """Schema for updating user role information"""
    role: Optional[UserRoleType] = None


class UserRoleInDB(UserRoleBase):
    """Schema representing a user role in the database"""
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserRole(UserRoleInDB):
    """Schema for user role responses"""
