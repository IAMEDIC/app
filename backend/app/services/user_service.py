"""
User service for managing user data and operations.
"""


from typing import Optional
import logging
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


logger = logging.getLogger(__name__)


class UserService:
    """Service for user-related operations."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        logger.debug("🔍 Looking up user by email: %s", email)
        user = self.db.query(User).filter(User.email == email).first()
        if user:
            logger.debug("✅ User found: %s", email)
        else:
            logger.debug("❌ User not found: %s", email)
        return user

    def get_by_google_id(self, google_id: str) -> Optional[User]:
        """Get user by Google ID"""
        return self.db.query(User).filter(User.google_id == google_id).first()

    def get_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        return self.db.query(User).filter(User.id == user_id).first()

    def create(self, user_data: UserCreate) -> User:
        """Create a new user"""
        try:
            db_user = User(
                email=user_data.email,
                name=user_data.name,
                google_id=user_data.google_id,
            )
            self.db.add(db_user)
            self.db.commit()
            self.db.refresh(db_user)
            logger.info("Created new user: %s", db_user.email)
            return db_user
        except IntegrityError as e:
            self.db.rollback()
            logger.error("Failed to create user %s: %s", user_data.email, e)
            raise ValueError("User with this email or Google ID already exists") from e

    def update(self, user_id: str, user_update: UserUpdate) -> Optional[User]:
        """Update user information"""
        db_user = self.get_by_id(user_id)
        if not db_user:
            return None
        update_data = user_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_user, field, value)
        self.db.commit()
        self.db.refresh(db_user)
        logger.info("Updated user: %s", db_user.email)
        return db_user

    def update_tokens(
        self,
        user_id: str,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        token_expires_at: Optional[datetime] = None
    ) -> Optional[User]:
        """Update user OAuth tokens"""
        logger.debug("🔑 Updating tokens for user ID: %s", user_id)
        db_user = self.get_by_id(user_id)
        if not db_user:
            logger.warning("⚠️ User not found for token update: %s", user_id)
            return None
        token_updates = []
        if access_token is not None:
            setattr(db_user, "access_token", access_token)
            token_updates.append("access_token")
        if refresh_token is not None:
            setattr(db_user, "refresh_token", refresh_token)
            token_updates.append("refresh_token")
        if token_expires_at is not None:
            setattr(db_user, "token_expires_at", token_expires_at)
            token_updates.append("expires_at")
        self.db.commit()
        self.db.refresh(db_user)
        logger.debug("✅ Updated tokens for user %s: %s", db_user.email, ", ".join(token_updates))
        return db_user

    def deactivate(self, user_id: str) -> Optional[User]:
        """Deactivate a user"""
        return self.update(user_id, UserUpdate(is_active=False))

    def list_users(self, skip: int = 0, limit: int = 100):
        """List users with pagination"""
        return self.db.query(User).offset(skip).limit(limit).all()
