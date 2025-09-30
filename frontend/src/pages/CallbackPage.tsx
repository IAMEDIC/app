import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';
import { useTranslation } from '@/contexts/LanguageContext';

const CallbackPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, setError } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const success = searchParams.get('success');
        const error = searchParams.get('error');

        if (error) {
          throw new Error(`Authentication failed: ${error}`);
        }

        if (!success) {
          throw new Error('Authentication callback failed. Please try logging in again.');
        }

        // With httpOnly cookies, the token is automatically stored by the browser
        // We just need to fetch user data and update the store
        
        // Fetch complete user data with roles from API
        // The httpOnly cookie will be automatically included in the request
        const completeUser = await authService.getCurrentUser();

        // Store user data (no token needed - it's in httpOnly cookie)
        login(completeUser, ''); // Empty token string since it's in httpOnly cookie
        
        // Redirect to home page
        navigate('/', { replace: true });
      } catch (err: any) {
        const message = err.message || 'Authentication failed';
        setErrorMessage(message);
        setError(message);
        
        // Redirect to login after a delay
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate, login, setError]);

  if (errorMessage) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        padding={2}
      >
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            {t('components.callbackPage.authenticationFailed')}
          </Typography>
          <Typography variant="body2">
            {errorMessage}
          </Typography>
        </Alert>
        <Typography variant="body2" color="text.secondary">
          {t('components.callbackPage.redirectingToLogin')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
    >
      <CircularProgress size={60} sx={{ mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        {t('components.callbackPage.completingAuthentication')}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('components.callbackPage.pleaseWaitLogin')}
      </Typography>
    </Box>
  );
};

export default CallbackPage;