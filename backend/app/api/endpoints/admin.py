"""
Admin endpoints for user management and MLflow proxy.
"""

import logging
from uuid import UUID
import httpx

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin_role
from app.core.config import settings
from app.models.user import User as UserModel
from app.models.user_role import UserRoleType
from app.models.doctor_profile import DoctorProfileStatus
from app.schemas.user import UserWithRoles
from app.schemas.user_role import UserRoleCreate
from app.schemas.doctor_profile import DoctorProfile, DoctorProfileApproval
from app.services.admin_service import AdminService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/users", response_model=list[UserWithRoles])
async def get_all_users(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get all users with their roles and doctor profiles (admin only)"""
    logger.info("📊 Admin %s requesting all users", current_user.email)
    admin_service = AdminService(db)
    return admin_service.get_all_users_with_roles()


@router.get("/users/{user_id}", response_model=UserWithRoles)
async def get_user_by_id(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get a specific user by ID with roles and doctor profile (admin only)"""
    logger.info("📊 Admin %s requesting user %s", current_user.email, user_id)
    admin_service = AdminService(db)
    user = admin_service.get_user_with_roles(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user


@router.post("/users/{user_id}/roles")
async def assign_user_role(
    user_id: UUID,
    role_data: UserRoleCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Assign a role to a user (admin only)"""
    logger.info("📊 Admin %s assigning role %s to user %s",
               current_user.email, role_data.role, user_id)
    admin_service = AdminService(db)
    user = admin_service.get_user_with_roles(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    if role_data.role.value in user.roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User already has role {role_data.role.value}"
        )
    role_data.user_id = user_id
    new_role = admin_service.assign_role_to_user(role_data)
    return {"message": f"Role {role_data.role.value} assigned successfully", "role": new_role}


@router.delete("/users/{user_id}/roles/{role}")
async def remove_user_role(
    user_id: UUID,
    role: UserRoleType,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Remove a role from a user (admin only)"""
    logger.info("📊 Admin %s removing role %s from user %s",
               current_user.email, role, user_id)
    admin_service = AdminService(db)
    user = admin_service.get_user_with_roles(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    if role.value not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User does not have role {role.value}"
        )
    admin_service.remove_role_from_user(user_id, role)
    return {"message": f"Role {role.value} removed successfully"}


@router.get("/doctor-registrations", response_model=list[DoctorProfile])
async def get_pending_doctor_registrations(
    status_filter: DoctorProfileStatus = DoctorProfileStatus.PENDING,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get doctor registrations by status (admin only)"""
    logger.info("📊 Admin %s requesting doctor registrations with status %s",
               current_user.email, status_filter)
    admin_service = AdminService(db)
    return admin_service.get_doctor_profiles_by_status(status_filter)


@router.put("/doctor-registrations/{profile_id}/approve")
async def approve_doctor_registration(
    profile_id: UUID,
    approval_data: DoctorProfileApproval,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Approve or deny a doctor registration (admin only)"""
    logger.info("📊 Admin %s updating doctor profile %s to status %s",
               current_user.email, profile_id, approval_data.status)
    admin_service = AdminService(db)
    profile = admin_service.update_doctor_profile_status(
        profile_id, approval_data.status, approval_data.notes
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Doctor profile not found"
        )
    if approval_data.status == DoctorProfileStatus.APPROVED:
        role_data = UserRoleCreate(user_id=profile.user_id, role=UserRoleType.DOCTOR)
        admin_service.assign_role_to_user(role_data)
        logger.info("📊 Automatically assigned doctor role to user %s", profile.user_id)
    return {"message": f"Doctor registration {approval_data.status.value} successfully",
            "profile": profile}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Delete a user (admin only)"""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    logger.info("📊 Admin %s deleting user %s", current_user.email, user_id)
    admin_service = AdminService(db)
    user = admin_service.get_user_with_roles(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    admin_service.delete_user(user_id)
    return {"message": "User deleted successfully"}


@router.api_route("/mlflow/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
# pylint: disable=line-too-long
async def mlflow_proxy(
    path: str,
    request: Request,
    current_user: UserModel = Depends(require_admin_role)
):
    """Proxy MLflow requests for admin users only"""
    logger.info("📊 Admin %s accessing MLflow path: %s", current_user.email, path)
    # Construct MLflow URL
    mlflow_url = f"{settings.mlflow_uri.rstrip('/')}/{path}"
    # Get query parameters
    query_params = str(request.url.query)
    if query_params:
        mlflow_url += f"?{query_params}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Forward the request to MLflow
            response = await client.request(
                method=request.method,
                url=mlflow_url,
                headers={k: v for k, v in request.headers.items()
                        if k.lower() not in ['host', 'authorization']},
                content=await request.body() if request.method in ["POST", "PUT", "PATCH"] else None
            )
            # Return response
            return StreamingResponse(
                iter([response.content]),
                status_code=response.status_code,
                headers={k: v for k, v in response.headers.items()
                        if k.lower() not in ['content-encoding', 'transfer-encoding', 'connection']},
                media_type=response.headers.get('content-type', 'application/octet-stream')
            )
        except httpx.RequestError as e:
            logger.error("❌ MLflow proxy error: %s", str(e))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MLflow service unavailable"
            ) from e
        except Exception as e: # pylint: disable=broad-except
            logger.error("❌ Unexpected MLflow proxy error: %s", str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal server error"
            ) from e
