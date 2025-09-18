"""
Doctor profile schemas for request and response models.
"""


from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.doctor_profile import DoctorProfileStatus


class DoctorProfileBase(BaseModel):
    """Base doctor profile schema"""
    matriculation_id: str = Field(alias="matriculationId")
    legal_name: str = Field(alias="legalName")
    specialization: str


class DoctorProfileCreate(DoctorProfileBase):
    """Schema for creating a new doctor profile"""
    model_config = ConfigDict(populate_by_name=True)


class DoctorProfileUpdate(BaseModel):
    """Schema for updating doctor profile information"""
    matriculation_id: Optional[str] = Field(default=None, alias="matriculationId")
    legal_name: Optional[str] = Field(default=None, alias="legalName") 
    specialization: Optional[str] = None
    status: Optional[DoctorProfileStatus] = None
    notes: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)


class DoctorProfileInDB(DoctorProfileBase):
    """Schema representing a doctor profile in the database"""
    id: UUID
    user_id: UUID = Field(alias="userId")
    status: DoctorProfileStatus
    notes: Optional[str] = None
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class DoctorProfile(DoctorProfileInDB):
    """Schema for doctor profile responses"""


class DoctorProfileApproval(BaseModel):
    """Schema for approving/denying doctor profiles"""
    status: DoctorProfileStatus
    notes: Optional[str] = None
