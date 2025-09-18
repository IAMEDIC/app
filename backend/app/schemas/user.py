"""
User schemas for request and response models.
"""


from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserBase(BaseModel):
    """Base user schema"""
    email: EmailStr
    name: str


class UserCreate(UserBase):
    """Schema for creating a new user"""
    google_id: str


class UserUpdate(BaseModel):
    """Schema for updating user information"""
    name: Optional[str] = None
    is_active: Optional[bool] = None


class UserInDB(UserBase):
    """Schema representing a user in the database"""
    id: UUID
    google_id: str
    is_active: bool
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class User(UserInDB):
    """Schema for user responses with role information"""
    roles: List[str] = []


class UserWithRoles(UserInDB):
    """Extended user schema with roles"""
    roles: List[str] = []
    
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """Schema for JWT tokens"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Schema for token data"""
    email: Optional[str] = None


class GoogleAuthURL(BaseModel):
    """Schema for Google OAuth URL"""
    auth_url: str


class GoogleCallback(BaseModel):
    """Schema for Google OAuth callback"""
    code: str
    state: str


class LoginResponse(BaseModel):
    """Schema for login response"""
    user: User
    access_token: str
    token_type: str = "bearer"
