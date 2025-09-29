# IAMEDIC Backend Copilot Instructions

## Architecture Overview

This is a **FastAPI-based medical AI application** for ultrasound analysis with a layered architecture:
- **Models** (`app/models/`) - SQLAlchemy ORM models with UUID primary keys and PostgreSQL enums
- **Schemas** (`app/schemas/`) - Pydantic models for request/response validation
- **Services** (`app/services/`) - Business logic layer with database operations
- **Endpoints** (`app/api/endpoints/`) - FastAPI route handlers with authentication middleware

## Core Patterns

### Authentication & Authorization
- **OAuth2 + JWT**: Google OAuth via `GoogleOAuthService` with Redis session caching
- **Role-based access**: `UserRoleType` enum (ADMIN, DOCTOR) with dependency injection decorators
- **Permission checks**: Use `require_doctor_role()`, `require_admin_role()` from `app.core.deps`
- **Study ownership**: Always verify doctor owns study via `check_study_ownership()` before operations

### Database Patterns
- **UUIDs everywhere**: All entities use `UUID(as_uuid=True)` primary keys, never auto-incrementing IDs
- **Enum columns**: Use `SQLEnum(YourEnum, name='enum_name', values_callable=lambda x: [e.value for e in x])`
- **Timestamps**: Standard `created_at`, `updated_at` with `func.now()` and `onupdate=func.now()`
- **Unique constraints**: Multi-column constraints like `unique_doctor_study_alias`

### Service Layer Pattern
Services encapsulate all business logic and database operations:
```python
class MediaService:
    def __init__(self, db: Session):
        self.db = db
    
    def create_media(self, request: MediaCreateRequest, doctor_id: UUID) -> Media:
        # Always validate ownership/permissions first
        # Then perform business logic
```

### Medical AI Specifics
- **Media types**: `IMAGE`, `VIDEO`, `FRAME` with specialized processing pipelines
- **AI predictions**: Separate models for bounding boxes (`PictureBBPrediction`) and classifications (`PictureClassificationPrediction`)
- **Model versioning**: All predictions store `model_version` for ML experiment tracking
- **Video frame extraction**: Automated frame extraction service with OpenCV and FFmpeg

## Development Workflows

### Database Migrations
```bash
# Auto-generate migration from model changes
alembic revision --autogenerate -m "description"
# Apply migrations
alembic upgrade head
```

### Environment Setup
- Configuration via `Settings` class with `.env` file support
- Docker Compose with PostgreSQL, Redis, and MLflow
- Multi-stage Dockerfile with development/production targets

### Key Dependencies
- **Media processing**: `python-magic`, `pillow`, `opencv-python-headless`, `ffmpeg-python`
- **ML integration**: MLflow at `http://host.docker.internal:8080` (Docker internal networking)
- **Authentication**: `google-auth-oauthlib` for OAuth2 flow

## Critical Integration Points

### MLflow Integration
- Admin-protected endpoint at `/api/admin/mlflow/` 
- Redirect from `/api/mlflow` to admin endpoint for security
- Model versioning tracked in prediction tables

### File Storage
- Media files handled via `MediaService` with upload status tracking
- Frame extraction creates child `Media` records with `FRAME` type
- Orphaned media cleanup on application startup

### Error Handling
- Comprehensive logging with emoji prefixes (🚀, 🔧, ❌) for easy log parsing
- HTTPException with specific status codes and error details
- Database transaction rollback on service layer errors

## Testing Considerations
- Services are unit testable with mock database sessions
- Authentication can be bypassed in tests by mocking `get_current_user` dependency
- Use factory pattern for creating test data with proper UUID relationships