import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';

const CallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, setError } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const token = searchParams.get('token');
        const error = searchParams.get('error');
        const userId = searchParams.get('user_id');
        const email = searchParams.get('email');
        const name = searchParams.get('name');

        if (error) {
          throw new Error(`Authentication failed: ${error}`);
        }

        if (!token || !userId || !email || !name) {
          throw new Error('Missing authentication data. Please try logging in again.');
        }

        // Store token first
        localStorage.setItem('access_token', token);

        // Fetch complete user data with roles
        const completeUser = await authService.getCurrentUser();

        // Store user data and token
        login(completeUser, token);
        
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
            Authentication Failed
          </Typography>
          <Typography variant="body2">
            {errorMessage}
          </Typography>
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Redirecting to login page...
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
        Completing authentication...
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Please wait while we complete your login.
      </Typography>
    </Box>
  );
};

export default CallbackPage;