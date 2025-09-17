import secrets
import json
from typing import Dict, Any, Optional
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from app.core.config import settings
from app.core.redis import get_redis
import logging

logger = logging.getLogger(__name__)


class GoogleOAuthService:
    def __init__(self):
        self.client_config = {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri]
            }
        }
        self.scopes = [
            'openid',
            'email',
            'profile'
        ]

    def get_authorization_url(self) -> tuple[str, str]:
        """Generate Google OAuth authorization URL"""
        flow = Flow.from_client_config(
            self.client_config,
            scopes=self.scopes
        )
        flow.redirect_uri = settings.google_redirect_uri

        # Generate state parameter for security
        state = secrets.token_urlsafe(32)
        
        # Store state in Redis for verification (expires in 10 minutes)
        redis_client = get_redis()
        redis_client.setex(f"oauth_state:{state}", 600, "valid")

        authorization_url, _ = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            state=state,
            prompt='consent'  # Force consent to get refresh token
        )

        logger.info(f"Generated OAuth URL with state: {state}")
        return authorization_url, state

    def verify_state(self, state: str) -> bool:
        """Verify OAuth state parameter"""
        redis_client = get_redis()
        stored_state = redis_client.get(f"oauth_state:{state}")
        if stored_state:
            redis_client.delete(f"oauth_state:{state}")  # Use once
            return True
        return False

    def exchange_code_for_tokens(self, code: str, state: str) -> Dict[str, Any]:
        """Exchange authorization code for tokens and user info"""
        if not self.verify_state(state):
            raise ValueError("Invalid or expired state parameter")

        # Use direct token exchange to avoid scope validation issues
        return self._direct_token_exchange(code, state)

    def _direct_token_exchange(self, code: str, state: str) -> Dict[str, Any]:
        """Direct token exchange without strict scope validation"""
        import requests
        
        # Exchange code for tokens directly
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            'client_id': settings.google_client_id,
            'client_secret': settings.google_client_secret,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': settings.google_redirect_uri,
        }
        
        logger.info(f"Attempting token exchange with redirect_uri: {settings.google_redirect_uri}")
        
        try:
            token_response = requests.post(token_url, data=token_data)
            token_response.raise_for_status()
            tokens = token_response.json()
            
            # Get user info using the access token
            user_info_url = "https://www.googleapis.com/oauth2/v2/userinfo"
            headers = {'Authorization': f"Bearer {tokens['access_token']}"}
            user_response = requests.get(user_info_url, headers=headers)
            user_response.raise_for_status()
            user_info = user_response.json()
            
            logger.info(f"Successfully authenticated user via direct exchange: {user_info.get('email')}")
            
            return {
                'access_token': tokens['access_token'],
                'refresh_token': tokens.get('refresh_token'),
                'expires_at': None,  # We'd need to calculate this from expires_in
                'user_info': {
                    'email': user_info.get('email'),
                    'name': user_info.get('name'),
                    'google_id': user_info.get('id'),
                    'picture': user_info.get('picture'),
                    'verified_email': user_info.get('verified_email', False)
                }
            }
        except requests.RequestException as e:
            logger.error(f"Token exchange request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response content: {e.response.text}")
            raise e

    def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refresh access token using refresh token"""
        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=self.client_config["web"]["token_uri"],
            client_id=self.client_config["web"]["client_id"],
            client_secret=self.client_config["web"]["client_secret"]
        )

        request = Request()
        credentials.refresh(request)

        return {
            'access_token': credentials.token,
            'expires_at': credentials.expiry
        }