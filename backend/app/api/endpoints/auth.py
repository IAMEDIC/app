from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import timedelta
from urllib.parse import urlencode
from app.core.database import get_db
from app.core.security import create_access_token
from app.core.config import settings
from app.core.deps import get_current_active_user
from app.services.user_service import UserService
from app.services.auth_service import GoogleOAuthService
from app.schemas.user import (
    GoogleAuthURL, 
    LoginResponse, 
    User, 
    UserCreate
)
from app.models.user import User as UserModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/google", response_model=GoogleAuthURL)
async def get_google_auth_url():
    """Get Google OAuth authorization URL"""
    try:
        oauth_service = GoogleOAuthService()
        auth_url, state = oauth_service.get_authorization_url()
        return GoogleAuthURL(auth_url=auth_url)
    except Exception as e:
        logger.error(f"Failed to generate Google auth URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate authentication URL"
        )


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db)
):
    """Handle Google OAuth callback"""
    try:
        oauth_service = GoogleOAuthService()
        
        # Exchange code for tokens and user info
        token_data = oauth_service.exchange_code_for_tokens(code, state)
        
        user_service = UserService(db)
        user_info = token_data['user_info']
        
        # Check if user exists
        user = user_service.get_by_email(user_info['email'])
        
        if not user:
            # Create new user
            user_create = UserCreate(
                email=user_info['email'],
                name=user_info['name'],
                google_id=user_info['google_id']
            )
            user = user_service.create(user_create)
            logger.info(f"Created new user: {user_info['email']}")
        else:
            logger.info(f"User login: {user_info['email']}")
        
        # Update user tokens
        user_service.update_tokens(
            str(user.id),
            access_token=token_data['access_token'],
            refresh_token=token_data['refresh_token'],
            token_expires_at=token_data['expires_at']
        )
        
        # Create JWT token for the application
        access_token = create_access_token(
            data={"sub": user.email},
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
        )
        
        # Redirect to frontend with token
        frontend_url = "http://localhost:3000"
        callback_params = {
            "token": access_token,
            "user_id": str(user.id),
            "email": user.email,
            "name": user.name
        }
        
        redirect_url = f"{frontend_url}/auth/callback?{urlencode(callback_params)}"
        return RedirectResponse(url=redirect_url, status_code=302)
        
    except ValueError as e:
        logger.error(f"OAuth callback validation error: {e}")
        # Redirect to frontend with error
        frontend_url = "http://localhost:3000"
        error_params = {"error": str(e)}
        redirect_url = f"{frontend_url}/auth/callback?{urlencode(error_params)}"
        return RedirectResponse(url=redirect_url, status_code=302)
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        # Redirect to frontend with error
        frontend_url = "http://localhost:3000"
        error_params = {"error": str(e)}
        redirect_url = f"{frontend_url}/auth/callback?{urlencode(error_params)}"
        return RedirectResponse(url=redirect_url, status_code=302)


@router.get("/me", response_model=User)
async def get_current_user_info(
    current_user: UserModel = Depends(get_current_active_user)
):
    """Get current user information"""
    return User.from_orm(current_user)


@router.post("/logout")
async def logout(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Logout user (clear tokens)"""
    try:
        user_service = UserService(db)
        user_service.update_tokens(
            str(current_user.id),
            access_token=None,
            refresh_token=None,
            token_expires_at=None
        )
        return {"message": "Successfully logged out"}
    except Exception as e:
        logger.error(f"Logout error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )


@router.post("/refresh")
async def refresh_token(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Refresh access token using stored refresh token"""
    try:
        if not current_user.refresh_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No refresh token available"
            )
        
        oauth_service = GoogleOAuthService()
        token_data = oauth_service.refresh_access_token(current_user.refresh_token)
        
        user_service = UserService(db)
        user_service.update_tokens(
            str(current_user.id),
            access_token=token_data['access_token'],
            token_expires_at=token_data['expires_at']
        )
        
        # Create new JWT token
        access_token = create_access_token(
            data={"sub": current_user.email},
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
        )
        
        return LoginResponse(
            user=User.from_orm(current_user),
            access_token=access_token,
            token_type="bearer"
        )
        
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed"
        )


@router.get("/verify")
async def verify_auth(current_user: UserModel = Depends(get_current_active_user)):
    """
    Verify authentication for nginx auth_request.
    Returns 200 if authenticated, 401/403 if not.
    Used by nginx to control access to protected resources.
    """
    # If we reach here, the user is authenticated and active
    # (get_current_active_user would have raised an exception otherwise)
    return Response(status_code=200)