from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        return self.db.query(User).filter(User.email == email).first()

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
            logger.info(f"Created new user: {user_data.email}")
            return db_user
        except IntegrityError as e:
            self.db.rollback()
            logger.error(f"Failed to create user {user_data.email}: {e}")
            raise ValueError("User with this email or Google ID already exists")

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
        logger.info(f"Updated user: {db_user.email}")
        return db_user

    def update_tokens(
        self, 
        user_id: str, 
        access_token: str = None, 
        refresh_token: str = None,
        token_expires_at = None
    ) -> Optional[User]:
        """Update user OAuth tokens"""
        db_user = self.get_by_id(user_id)
        if not db_user:
            return None

        if access_token is not None:
            db_user.access_token = access_token
        if refresh_token is not None:
            db_user.refresh_token = refresh_token
        if token_expires_at is not None:
            db_user.token_expires_at = token_expires_at

        self.db.commit()
        self.db.refresh(db_user)
        return db_user

    def deactivate(self, user_id: str) -> Optional[User]:
        """Deactivate a user"""
        return self.update(user_id, UserUpdate(is_active=False))

    def list_users(self, skip: int = 0, limit: int = 100):
        """List users with pagination"""
        return self.db.query(User).offset(skip).limit(limit).all()