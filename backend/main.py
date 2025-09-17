from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from app.api.api import api_router
from app.core.config import settings
from app.core.database import engine
from app.models import user  # Import to register models
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="AI Medical Ultrasound Analysis Backend",
    openapi_url="/api/openapi.json" if settings.debug else None,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
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


@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logger.info(f"Starting {settings.app_name} v{settings.version}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"Database URL: {settings.database_url}")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logger.info("Shutting down IAMEDIC Backend")


@app.middleware("http")
async def redirect_middleware(request: Request, call_next):
    """Middleware to handle API health check redirect"""
    path = request.url.path
    
    # Health check for Docker
    if path == "/health":
        return RedirectResponse(url="/api/health")
    
    # Let all other requests through normally
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