"""
Authentication endpoints for Google OAuth integration.
"""


import logging
from datetime import timedelta
from typing import Optional

from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request#, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError

from app.core.database import get_db
from app.core.security import create_access_token
from app.core.config import settings
from app.core.deps import get_current_active_user, get_optional_current_user
from app.services.user_service import UserService
from app.services.auth_service import GoogleOAuthService
from app.services.session_service import SessionService
from app.schemas.user import (
    GoogleAuthURL,
    LoginResponse,
    User,
    UserWithRoles,
    UserCreate
)
from app.models.user import User as UserModel
from app.models.user_role import UserRole as UserRoleModel


logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/status")
# pylint: disable=unused-argument
async def auth_status(
    request: Request,
    current_user: Optional[UserModel] = Depends(get_optional_current_user)
):
    """Check authentication status without requiring authentication"""
    if current_user:
        has_refresh_token = bool(getattr(current_user, "refresh_token", None))
        logger.info("📊 Auth status check: user=%s, has_refresh_token=%s",
                   current_user.email, has_refresh_token)
        return {
            "authenticated": True,
            "email": current_user.email,
            "has_refresh_token": has_refresh_token,
            "needs_consent": not has_refresh_token
        }
    else:
        logger.info("📊 Auth status check: not authenticated")
        return {
            "authenticated": False,
            "needs_consent": True
        }


@router.get("/google", response_model=GoogleAuthURL)
# pylint: disable=unused-argument
async def get_google_auth_url(
    request: Request,
    force_consent: bool = False,
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user)
):
    """Get Google OAuth authorization URL
    
    Args:
        force_consent: Whether to force the consent screen (useful for first-time users)
    """
    try:
        if current_user and not force_consent:
            r_token = getattr(current_user, "refresh_token", None)
            if r_token:
                logger.debug("🔐 User already has valid tokens, generating OAuth URL without consent")
                force_consent = False
            else:
                logger.debug("🔐 User authenticated but no refresh token, forcing consent")
                force_consent = True
        else:
            logger.debug("🔐 Generating Google OAuth URL (force_consent=%s)", force_consent)
        oauth_service = GoogleOAuthService()
        auth_url, _ = oauth_service.get_authorization_url(force_consent=force_consent)
        logger.debug("✅ Successfully generated OAuth URL")
        return GoogleAuthURL(auth_url=auth_url)
    except Exception as e:
        logger.error("❌ Failed to generate Google auth URL: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate authentication URL"
        ) from e


@router.get("/google/callback")
async def google_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db)
):
    """Handle Google OAuth callback"""
    try:
        logger.debug("🔄 Processing OAuth callback with state: %s", state)
        oauth_service = GoogleOAuthService()
        token_data = oauth_service.exchange_code_for_tokens(code, state)
        user_service = UserService(db)
        user_info = token_data['user_info']
        logger.debug("👤 OAuth user info received: email=%s, name=%s",
                   user_info['email'], user_info.get('name', 'N/A'))
        user = user_service.get_by_email(user_info['email'])
        if not user:
            user_create = UserCreate(
                email=user_info['email'],
                name=user_info['name'],
                google_id=user_info['google_id']
            )
            user = user_service.create(user_create)
            logger.info("🆕 Created new user: %s", user_info['email'])
        else:
            logger.debug("🔄 Existing user login: %s", user_info['email'])
        user_service.update_tokens(
            str(user.id),
            access_token=token_data['access_token'],
            refresh_token=token_data['refresh_token'],
            token_expires_at=token_data['expires_at']
        )
        logger.debug("🔑 Updated OAuth tokens for user: %s", user.email)
        access_token = create_access_token(
            data={"sub": user.email, "user_id": str(user.id)},
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
        )
        logger.debug("🎫 Generated JWT token for user: %s", user.email)
        # Create session tracking
        session_service = SessionService()
        session_service.create_session(str(user.id), str(user.email))
        # Create redirect response with httpOnly cookie
        frontend_url = settings.frontend_url
        redirect_url = f"{frontend_url}/auth/callback?success=true"
        response = RedirectResponse(url=redirect_url, status_code=302)
        # Set httpOnly cookie with token
        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            max_age=settings.access_token_expire_minutes * 60,
            domain=settings.cookie_domain if settings.cookie_domain != "localhost" else None
        )
        logger.debug("🔄 Redirecting user %s to frontend with httpOnly cookie", user.email)
        return response
    except ValueError as e:
        logger.error("❌ OAuth callback validation error: %s", e, exc_info=True)
        frontend_url = "http://localhost:3000"
        error_params = {"error": str(e)}
        redirect_url = f"{frontend_url}/auth/callback?{urlencode(error_params)}"
        return RedirectResponse(url=redirect_url, status_code=302)
    except Exception as e: # pylint: disable=broad-except
        logger.error("❌ OAuth callback error: %s", e, exc_info=True)
        frontend_url = "http://localhost:3000"
        error_params = {"error": str(e)}
        redirect_url = f"{frontend_url}/auth/callback?{urlencode(error_params)}"
        return RedirectResponse(url=redirect_url, status_code=302)


@router.get("/me", response_model=UserWithRoles)
async def get_current_user_info(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current user information with roles"""
    logger.debug("👤 User info requested for: %s", current_user.email)
    user_roles = db.query(UserRoleModel).filter(
        UserRoleModel.user_id == current_user.id
    ).all()
    user_dict = {
        'id': str(current_user.id),
        'email': current_user.email,
        'name': current_user.name,
        'google_id': current_user.google_id,
        'is_active': current_user.is_active,
        'createdAt': current_user.created_at.isoformat(),
        'updatedAt': current_user.updated_at.isoformat(),
        'roles': [role.role for role in user_roles]
    }
    return UserWithRoles(**user_dict)


@router.post("/logout")
async def logout(
    current_user: UserModel = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Logout user (clear tokens and cookies)"""
    try:
        logger.debug("🚪 User logout initiated: %s", current_user.email)
        # Clear Google tokens from database
        user_service = UserService(db)
        user_service.update_tokens(
            str(current_user.id),
            access_token=None,
            refresh_token=None,
            token_expires_at=None
        )
        # Invalidate session in Redis
        session_service = SessionService()
        session_service.invalidate_session(str(current_user.id))
        # Create response and clear cookies
        response = Response(
            content='{"message": "Successfully logged out"}',
            media_type="application/json"
        )
        # Clear httpOnly cookie
        response.delete_cookie(
            key="access_token",
            domain=settings.cookie_domain if settings.cookie_domain != "localhost" else None
        )        
        logger.debug("✅ User successfully logged out: %s", current_user.email)
        return response        
    except Exception as e:
        logger.error("❌ Logout error for user %s: %s", current_user.email, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        ) from e


@router.post("/refresh")
async def refresh_token(
    request: Request,
    db: Session = Depends(get_db)
):
    """Refresh access token using stored refresh token"""
    try:
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        token = auth_header.split(" ")[1]
        try:
            # ✅ SECURITY FIX: Properly verify JWT signature
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
            email = payload.get("sub")
            if not email:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token format"
                )
        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token format"
            )
        logger.info("🔄 Token refresh requested for user: %s", email)
        user_service = UserService(db)
        user = user_service.get_by_email(email)
        if not user or user.is_active is False:
            logger.warning("⚠️ User not found or inactive: %s", email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive"
            )
        r_token: Optional[str] = getattr(user, "refresh_token", None)
        if not r_token:
            logger.warning("⚠️ No refresh token available for user: %s", email)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No refresh token available. Please log in again."
            )
        oauth_service = GoogleOAuthService()
        token_data = oauth_service.refresh_access_token(r_token)
        user_service.update_tokens(
            str(user.id),
            access_token=token_data['access_token'],
            token_expires_at=token_data['expires_at']
        )
        access_token = create_access_token(
            data={"sub": user.email},
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
        )
        logger.info("✅ Token successfully refreshed for user: %s", email)
        return LoginResponse(
            user=User.model_validate(user),
            access_token=access_token,
            token_type="bearer"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Token refresh error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token refresh failed"
        ) from e


@router.get("/verify")
async def verify_auth(current_user: UserModel = Depends(get_current_active_user)): # pylint: disable=unused-argument
    """
    Verify authentication for nginx auth_request.
    Returns 200 if authenticated, 401/403 if not.
    Used by nginx to control access to protected resources.
    """
    logger.debug("🔍 Auth verification for user: %s", current_user.email)
    return Response(status_code=200)
