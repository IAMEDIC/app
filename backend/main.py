"""
Backend main application file for IAMEDIC.
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request#, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.api import api_router
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User as UserModel
from app.models.user_role import UserRole as UserRoleModel, UserRoleType


# Configure comprehensive logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),  # Console output for Docker
    ]
)

# Set up loggers for different components
logger = logging.getLogger(__name__)
uvicorn_logger = logging.getLogger("uvicorn")
access_logger = logging.getLogger("uvicorn.access")

# Ensure uvicorn access logs are visible
access_logger.setLevel(logging.INFO)


@asynccontextmanager
# pylint: disable=unused-argument
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("🚀 Starting IAMEDIC Backend application v%s", settings.version)
    logger.info("🔧 Environment: %s", "development" if settings.debug else "production")
    logger.info("🌐 Server: %s:%d", settings.host, settings.port)
    logger.info("🔑 OAuth redirect URI: %s", settings.google_redirect_uri)
    logger.info("🎯 Frontend URL: %s", settings.frontend_url)
    logger.info("📊 Database: %s", settings.database_url.split('@')[1] if '@' in settings.database_url else "Not configured")
    # Initialize admin user
    await initialize_admin_user()
    yield
    # Shutdown
    logger.info("🛑 Shutting down IAMEDIC Backend application")


async def initialize_admin_user():
    """Initialize admin user role if not exists"""
    try:
        # Get database session
        db_gen = get_db()
        db: Session = next(db_gen)
        try:
            # Check if admin user exists
            admin_user = db.query(UserModel).filter(
                UserModel.email == settings.init_admin_email
            ).first()
            if admin_user:
                # Check if admin role exists
                admin_role = db.query(UserRoleModel).filter(
                    UserRoleModel.user_id == admin_user.id,
                    UserRoleModel.role == UserRoleType.ADMIN.value
                ).first()
                if not admin_role:
                    # Create admin role
                    new_admin_role = UserRoleModel(
                        user_id=admin_user.id,
                        role=UserRoleType.ADMIN.value
                    )
                    db.add(new_admin_role)
                    db.commit()
                    logger.info("👑 Admin role assigned to %s", settings.init_admin_email)
                else:
                    logger.info("👑 Admin role already exists for %s", settings.init_admin_email)
            else:
                logger.info("⚠️ Admin user %s not found. Please register first.", settings.init_admin_email)
        finally:
            db.close()
    except Exception as e: # pylint: disable=broad-except
        logger.error("❌ Failed to initialize admin user: %s", str(e))

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="AI Medical Ultrasound Analysis Backend",
    openapi_url="/api/openapi.json" if settings.debug else None,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix="/api")


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Middleware to log requests and responses"""
    start_time = time.time()
    # Log incoming request
    logger.info(
        "📥 Incoming request: %s %s from %s:%s",
        request.method,
        request.url.path,
        request.client.host if request.client else "unknown",
        request.client.port if request.client else "unknown"
    )
    response = await call_next(request)
    # Calculate processing time
    process_time = time.time() - start_time
    # Log response
    logger.info(
        "📤 Response: %s %s -> %d (%dms)",
        request.method,
        request.url.path,
        response.status_code,
        int(process_time * 1000)
    )
    return response


@app.middleware("http")
async def redirect_middleware(request: Request, call_next):
    """Middleware to handle API health check redirect"""
    path = request.url.path
    if path == "/health":
        return RedirectResponse(url="/api/health")
    response = await call_next(request)
    return response


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "IAMEDIC Backend API", "version": settings.version}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info"
    )
