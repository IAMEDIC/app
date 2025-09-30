"""
Application configuration settings.
"""


from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


# pylint: disable=line-too-long
class Settings(BaseSettings):
    """Application configuration settings."""
    # App settings
    app_name: str = "IAMEDIC Backend"
    debug: bool = False
    version: str = "1.0.0"
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours
    session_inactivity_timeout_hours: int = 4  # Redis session timeout
    cookie_secure: bool = True  # HTTPS only in production
    cookie_domain: str = "localhost"  # Configure for your domain
    # Database
    postgres_user: str = "iamedic"
    postgres_password: str = "iamedic"
    postgres_db: str = "iamedic"
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    @property
    def database_url(self) -> str:
        """PostgreSQL database connection URL."""
        return f"postgresql://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
    # Redis
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_db: int = 0
    @property
    def redis_url(self) -> str:
        """Redis database connection URL."""
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"
    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    # Frontend URL
    frontend_url: str = "http://localhost:3000"
    # CORS
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://frontend:3000",
    ]
    @field_validator('allowed_origins', mode='before')
    @classmethod
    def parse_allowed_origins(cls, v):
        """Parse allowed origins from comma-separated string or list."""
        if isinstance(v, str):
            # Handle comma-separated string
            return [origin.strip() for origin in v.split(',') if origin.strip()]
        return v
    # MLFlow
    mlflow_uri: str = "http://host.docker.internal:8080"
    # Admin configuration
    init_admin_email: str = "iamedicsa@gmail.com"
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False
    )


settings = Settings()
