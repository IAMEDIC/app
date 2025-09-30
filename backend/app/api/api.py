"""
API router configuration.
"""


from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from app.api.endpoints import auth, health, admin, doctor, study, media, ai_predictions_v2, frames


api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(health.router, tags=["health"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(doctor.router, prefix="/doctor", tags=["doctor"])
api_router.include_router(study.router, prefix="/studies", tags=["studies"])
api_router.include_router(media.router, prefix="", tags=["media"])
# api_router.include_router(ai_predictions.router, prefix="", tags=["ai-predictions"])  # Old endpoints
api_router.include_router(ai_predictions_v2.router, prefix="", tags=["ai-predictions-v2"])
api_router.include_router(frames.router, prefix="", tags=["frames"])

# MLflow redirect
@api_router.get("/mlflow")
@api_router.get("/mlflow/{path:path}")
async def mlflow_redirect(path: str = ""):
    """Redirect MLflow requests to admin-protected endpoint"""
    redirect_path = f"/api/admin/mlflow/{path}" if path else "/api/admin/mlflow/"
    return RedirectResponse(url=redirect_path, status_code=307)
