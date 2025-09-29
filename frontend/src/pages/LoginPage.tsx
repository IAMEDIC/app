import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Container,
} from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/contexts/LanguageContext';

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  // Check for error from navigation state
  useEffect(() => {
    const state = location.state as { error?: string } | null;
    if (state?.error) {
      setError(state.error);
    }
  }, [location.state]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get Google OAuth URL from backend
      const { auth_url } = await authService.getGoogleAuthUrl();
      
      // Redirect to Google OAuth
      window.location.href = auth_url;
    } catch (err: any) {
      setError(err.response?.data?.detail || t('auth.failedToInitiateLogin'));
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
        py={4}
      >
        {/* Logo */}
        <Box mb={4} textAlign="center">
          <img
            src="/logo.jpg"
            alt="IAMEDIC Logo"
            style={{ maxWidth: 120, height: 'auto' }}
          />
          <Typography variant="h3" component="h1" gutterBottom sx={{ mt: 2 }}>
            {t('app.title')}
          </Typography>
          <Typography variant="h6" color="text.secondary">
            {t('app.subtitle')}
          </Typography>
        </Box>

        {/* Login Card */}
        <Card sx={{ width: '100%', maxWidth: 400 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" component="h2" gutterBottom textAlign="center">
              {t('auth.welcomeBack')}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
              {t('auth.signInWithGoogle')}
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={loading ? <CircularProgress size={20} /> : <GoogleIcon />}
              onClick={handleGoogleLogin}
              disabled={loading}
              sx={{
                py: 1.5,
                backgroundColor: '#4285f4',
                '&:hover': {
                  backgroundColor: '#3367d6',
                },
              }}
            >
              {loading ? t('auth.connecting') : t('auth.continueWithGoogle')}
            </Button>

            <Typography variant="body2" color="text.secondary" textAlign="center" mt={3}>
              {t('auth.termsAndPrivacy')}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default LoginPage;