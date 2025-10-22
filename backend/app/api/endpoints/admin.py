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
from app.schemas.admin_statistics import (
    ModelVersionInfo,
    ClassificationStatisticsResponse, 
    BoundingBoxStatisticsResponse,
    StatisticsRequest
)
from app.schemas.csv_export import CSVExportRequest
from app.schemas.file_management import (
    FileManagementStats,
    HardDeleteRequest,
    HardDeleteResponse,
    HardDeleteProgress
)
from app.services.admin_service import AdminService
from app.services.admin_statistics_service import AdminStatisticsService
from app.services.csv_export_service import CSVExportService
from app.services.zip_export_service import ZipExportService
from app.services.file_management_service import FileManagementService
from app.core.task_manager import task_manager


logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/users", response_model=list[UserWithRoles])
async def get_all_users(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get all users with their roles and doctor profiles (admin only)"""
    logger.debug("📊 Admin %s requesting all users", current_user.email)
    admin_service = AdminService(db)
    return admin_service.get_all_users_with_roles()


@router.get("/users/{user_id}", response_model=UserWithRoles)
async def get_user_by_id(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get a specific user by ID with roles and doctor profile (admin only)"""
    logger.debug("📊 Admin %s requesting user %s", current_user.email, user_id)
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
    logger.debug("📊 Admin %s assigning role %s to user %s",
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
    logger.debug("📊 Admin %s removing role %s from user %s",
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
    logger.debug("📊 Admin %s requesting doctor registrations with status %s",
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
    logger.debug("📊 Admin %s updating doctor profile %s to status %s",
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
        logger.debug("📊 Automatically assigned doctor role to user %s", profile.user_id)
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
    logger.debug("📊 Admin %s deleting user %s", current_user.email, user_id)
    admin_service = AdminService(db)
    user = admin_service.get_user_with_roles(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    admin_service.delete_user(user_id)
    return {"message": "User deleted successfully"}


@router.api_route("/mlflow", methods=["GET"])
@router.api_route("/mlflow/", methods=["GET"])
async def mlflow_root(
    request: Request,
    current_user: UserModel = Depends(require_admin_role)
):
    """Handle root MLflow requests"""
    logger.info("📊 Admin %s accessing MLflow root", current_user.email)
    return await mlflow_proxy("", request, current_user)


@router.api_route("/mlflow/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
# pylint: disable=line-too-long
async def mlflow_proxy(
    path: str,
    request: Request,
    current_user: UserModel = Depends(require_admin_role)
):
    """Proxy MLflow requests for admin users only"""
    logger.info("📊 Admin %s accessing MLflow path: %s", current_user.email, path)
    mlflow_url = f"{settings.mlflow_uri.rstrip('/')}/{path}"
    query_params = str(request.url.query)
    if query_params:
        mlflow_url += f"?{query_params}"
    
    logger.info("🔗 Proxying request to MLflow URL: %s", mlflow_url)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Prepare headers for forwarding
            forward_headers = {k: v for k, v in request.headers.items()
                             if k.lower() not in ['host', 'authorization', 'content-length']}
            
            response = await client.request(
                method=request.method,
                url=mlflow_url,
                headers=forward_headers,
                content=await request.body() if request.method in ["POST", "PUT", "PATCH"] else None
            )
            
            logger.info("✅ MLflow response status: %s, content-type: %s", 
                       response.status_code, response.headers.get('content-type'))
            
            # Prepare response headers
            response_headers = {k: v for k, v in response.headers.items()
                              if k.lower() not in ['content-encoding', 'transfer-encoding', 'connection']}
            
            # For HTML responses, rewrite relative static asset paths to work with the proxy
            content = response.content
            if response.headers.get('content-type', '').startswith('text/html'):
                content_str = response.content.decode('utf-8')
                # Rewrite relative paths to absolute paths that work through the proxy
                content_str = content_str.replace('href="./static-files/', 'href="/mlflow/static-files/')
                content_str = content_str.replace('src="static-files/', 'src="/mlflow/static-files/')
                content_str = content_str.replace('href="static-files/', 'href="/mlflow/static-files/')
                content = content_str.encode('utf-8')
                response_headers['content-length'] = str(len(content))
            
            return StreamingResponse(
                iter([content]),
                status_code=response.status_code,
                headers=response_headers,
                media_type=response.headers.get('content-type', 'application/octet-stream')
            )
        except httpx.RequestError as e:
            logger.error("❌ MLflow proxy error for path %s: %s", path, str(e))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="MLflow service unavailable"
            ) from e
        except Exception as e: # pylint: disable=broad-except
            logger.error("❌ Unexpected MLflow proxy error for path %s: %s", path, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Internal server error"
            ) from e


# Statistics endpoints

@router.get("/model-versions/{model_type}", response_model=ModelVersionInfo)
async def get_model_versions(
    model_type: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get available model versions for a model type (admin only)"""
    if model_type not in ["classifier", "bounding_box"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model type. Must be 'classifier' or 'bounding_box'"
        )
    
    logger.debug("📊 Admin %s requesting model versions for %s", current_user.email, model_type)
    stats_service = AdminStatisticsService(db)
    
    try:
        return stats_service.get_available_model_versions(model_type)
    except Exception as e:
        logger.error("❌ Error getting model versions: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve model versions"
        ) from e


@router.post("/statistics/classifier", response_model=ClassificationStatisticsResponse)
async def get_classification_statistics(
    request: StatisticsRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get classification model statistics for given parameters (admin only)"""
    logger.debug("📊 Admin %s requesting classification statistics for version %s, "
                "dates %s to %s, include_soft_deleted=%s", current_user.email, request.model_version, 
                request.start_date, request.end_date, request.include_soft_deleted)
    
    stats_service = AdminStatisticsService(db)
    
    try:
        return stats_service.compute_classification_statistics(request)
    except ValueError as e:
        logger.error("❌ Invalid parameters for classification statistics: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("❌ Error computing classification statistics: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute classification statistics"
        ) from e


@router.post("/statistics/bounding-box", response_model=BoundingBoxStatisticsResponse)
async def get_bounding_box_statistics(
    request: StatisticsRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get bounding box model statistics for given parameters (admin only)"""
    logger.debug("📊 Admin %s requesting bounding box statistics for version %s, "
                "dates %s to %s, IoU=%.2f, Conf=%.2f, include_soft_deleted=%s, include_hidden=%s", 
                current_user.email, request.model_version, request.start_date, 
                request.end_date, request.iou_threshold or 0.5, request.confidence_threshold or 0.5,
                request.include_soft_deleted, request.include_hidden_annotations)
    
    stats_service = AdminStatisticsService(db)
    
    try:
        return stats_service.compute_bounding_box_statistics(request)
    except ValueError as e:
        logger.error("❌ Invalid parameters for bounding box statistics: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    except Exception as e:
        logger.error("❌ Error computing bounding box statistics: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute bounding box statistics"
        ) from e


# CSV Export endpoints

@router.post("/export/annotations/classification")
async def export_classification_annotations(
    request: CSVExportRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Export classification annotations to CSV (admin only)"""
    logger.debug("📊 Admin %s exporting classification annotations from %s to %s, "
                "include_soft_deleted=%s", current_user.email, request.start_date, 
                request.end_date, request.include_soft_deleted)
    
    csv_service = CSVExportService(db)
    
    try:
        csv_generator, export_info = csv_service.export_classification_annotations(request)
        
        # Create streaming response
        def generate():
            for chunk in csv_generator:
                yield chunk
        
        # Set headers for file download
        headers = {
            "Content-Disposition": f"attachment; filename={export_info.filename}",
            "Content-Type": "text/csv",
            "X-Export-Info": f"Records: {export_info.total_records}",
            "X-Date-Range": f"{export_info.date_range['start_date']} to {export_info.date_range['end_date']}"
        }
        
        logger.debug("📊 Classification annotations export started: %s records", export_info.total_records)
        return StreamingResponse(
            generate(),
            media_type="text/csv",
            headers=headers
        )
        
    except Exception as e:
        logger.error("❌ Error exporting classification annotations: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export classification annotations"
        ) from e


@router.post("/export/annotations/bounding-boxes")
async def export_bounding_box_annotations(
    request: CSVExportRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Export bounding box annotations to CSV (admin only)"""
    logger.debug("📊 Admin %s exporting bounding box annotations from %s to %s, "
                "include_soft_deleted=%s, include_hidden=%s", current_user.email, 
                request.start_date, request.end_date, request.include_soft_deleted,
                request.include_hidden_annotations)
    
    csv_service = CSVExportService(db)
    
    try:
        csv_generator, export_info = csv_service.export_bounding_box_annotations(request)
        
        # Create streaming response
        def generate():
            for chunk in csv_generator:
                yield chunk
        
        # Set headers for file download
        headers = {
            "Content-Disposition": f"attachment; filename={export_info.filename}",
            "Content-Type": "text/csv",
            "X-Export-Info": f"Records: {export_info.total_records}",
            "X-Date-Range": f"{export_info.date_range['start_date']} to {export_info.date_range['end_date']}"
        }
        
        logger.debug("📊 Bounding box annotations export started: %s records", export_info.total_records)
        return StreamingResponse(
            generate(),
            media_type="text/csv",
            headers=headers
        )
        
    except Exception as e:
        logger.error("❌ Error exporting bounding box annotations: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export bounding box annotations"
        ) from e


# ZIP Export endpoints (CSV + Media files)

@router.post("/export/zip/classification")
async def export_classification_annotations_with_media(
    request: CSVExportRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Export classification annotations with associated media files as ZIP (admin only)"""
    logger.debug("📦 Admin %s exporting classification annotations with media from %s to %s, "
                "include_soft_deleted=%s", current_user.email, request.start_date, 
                request.end_date, request.include_soft_deleted)
    
    zip_service = ZipExportService(db)
    
    try:
        zip_generator, export_info = zip_service.export_classification_annotations_with_media(request)
        
        # Create streaming response
        def generate():
            for chunk in zip_generator:
                yield chunk
        
        # Set headers for file download
        headers = {
            "Content-Disposition": f"attachment; filename={export_info.filename}",
            "Content-Type": "application/zip",
            "X-Export-Info": f"Records: {export_info.total_records}",
            "X-Date-Range": f"{export_info.date_range['start_date']} to {export_info.date_range['end_date']}"
        }
        
        logger.debug("📦 Classification ZIP export started: %s media files", export_info.total_records)
        return StreamingResponse(
            generate(),
            media_type="application/zip",
            headers=headers
        )
        
    except Exception as e:
        logger.error("❌ Error exporting classification ZIP: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export classification annotations with media"
        ) from e


@router.post("/export/zip/bounding-boxes")
async def export_bounding_box_annotations_with_media(
    request: CSVExportRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Export bounding box annotations with associated media files as ZIP (admin only)"""
    logger.debug("📦 Admin %s exporting bounding box annotations with media from %s to %s, "
                "include_soft_deleted=%s, include_hidden=%s", current_user.email, 
                request.start_date, request.end_date, request.include_soft_deleted,
                request.include_hidden_annotations)
    
    zip_service = ZipExportService(db)
    
    try:
        zip_generator, export_info = zip_service.export_bounding_box_annotations_with_media(request)
        
        # Create streaming response
        def generate():
            for chunk in zip_generator:
                yield chunk
        
        # Set headers for file download
        headers = {
            "Content-Disposition": f"attachment; filename={export_info.filename}",
            "Content-Type": "application/zip",
            "X-Export-Info": f"Records: {export_info.total_records}",
            "X-Date-Range": f"{export_info.date_range['start_date']} to {export_info.date_range['end_date']}"
        }
        
        logger.debug("📦 Bounding box ZIP export started: %s media files", export_info.total_records)
        return StreamingResponse(
            generate(),
            media_type="application/zip",
            headers=headers
        )
        
    except Exception as e:
        logger.error("❌ Error exporting bounding box ZIP: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export bounding box annotations with media"
        ) from e


@router.get("/files/statistics", response_model=FileManagementStats)
async def get_file_statistics(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Get system-wide file storage statistics (admin only)"""
    logger.debug("📊 Admin %s requesting file storage statistics", current_user.email)
    
    try:
        file_management_service = FileManagementService(db)
        stats = file_management_service.get_storage_statistics()
        
        logger.info(
            "📊 File statistics provided to admin %s: %.1fMB total, %d active files, %d soft-deleted files",
            current_user.email, stats.total_storage_mb, stats.active_files_count, stats.soft_deleted_files_count
        )
        
        return stats
        
    except Exception as e:
        logger.error("❌ Error getting file statistics: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve file statistics"
        ) from e


@router.post("/files/hard-delete", response_model=HardDeleteResponse)
async def start_hard_delete(
    request: HardDeleteRequest,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(require_admin_role)
):
    """Start hard delete operation for all soft-deleted files (admin only)"""
    logger.debug("🗑️ Admin %s requesting hard delete operation", current_user.email)
    
    try:
        file_management_service = FileManagementService(db)
        
        # Validate confirmation text
        if not file_management_service.validate_hard_delete_request(request.confirmation_text):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid confirmation text. Must be exactly 'DELETE'"
            )
        
        # Check if there are any active hard delete tasks
        active_tasks = task_manager.get_active_tasks_count()
        if active_tasks > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another hard delete operation is already in progress"
            )
        
        # Get analysis of what will be deleted
        analysis = file_management_service.get_soft_deleted_items()
        total_items = (
            analysis["soft_deleted_studies"] + 
            analysis["soft_deleted_media"] + 
            analysis["media_in_deleted_studies"]
        )
        
        if total_items == 0:
            logger.info("✅ No soft-deleted items found for admin %s", current_user.email)
            return HardDeleteResponse(
                task_id="no-op",
                message="No soft-deleted items found to delete"
            )
        
        # Create a new session for the background task
        def hard_delete_task(progress_callback):
            from app.core.database import SessionLocal
            with SessionLocal() as task_db:
                task_service = FileManagementService(task_db)
                return task_service.hard_delete_soft_deleted_items(progress_callback)
        
        # Start background task
        task_id = task_manager.create_task(hard_delete_task)
        
        logger.info(
            "🚀 Started hard delete task %s for admin %s: %d items to process",
            task_id, current_user.email, total_items
        )
        
        return HardDeleteResponse(
            task_id=task_id,
            message=f"Hard delete operation started. Processing {total_items} items."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error starting hard delete operation: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start hard delete operation"
        ) from e


@router.get("/files/hard-delete/{task_id}", response_model=HardDeleteProgress)
async def get_hard_delete_progress(
    task_id: str,
    current_user: UserModel = Depends(require_admin_role)
):
    """Get progress of hard delete operation (admin only)"""
    logger.debug("📊 Admin %s checking progress of task %s", current_user.email, task_id)
    
    try:
        # Handle special case for no-op tasks
        if task_id == "no-op":
            return HardDeleteProgress(
                status="completed",
                progress=1.0,
                processed_items=0,
                total_items=0,
                current_operation="No items to delete",
                errors=[]
            )
        
        progress = task_manager.get_task_progress(task_id)
        if not progress:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        
        return progress
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Error getting task progress: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve task progress"
        ) from e
