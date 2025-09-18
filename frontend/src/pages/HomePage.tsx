import React, { useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Card,
  Button,
  Grid,
} from '@mui/material';
import {
  AdminPanelSettings as AdminIcon,
  LocalHospital as DoctorIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';

const HomePage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Auto-redirect based on user role
  useEffect(() => {
    if (user?.roles && user.roles.length > 0) {
      if (user.roles.includes('admin')) {
        navigate('/admin');
        return;
      } else if (user.roles.includes('doctor')) {
        navigate('/doctor');
        return;
      }
    } else if (user) {
      // If user is authenticated but has no roles, redirect to doctor registration
      navigate('/doctor');
      return;
    }
  }, [user, navigate]);

  const handleNavigateToAdmin = () => {
    navigate('/admin');
  };

  const handleNavigateToDoctor = () => {
    navigate('/doctor');
  };

  const isAdmin = user?.roles?.includes('admin');
  const isDoctor = user?.roles?.includes('doctor');

  // If user has roles, they should be redirected by useEffect
  // This page should rarely be seen as users are auto-redirected
  return (
    <>
      <TopBar />
      <Container maxWidth="md">
        <Box py={4} textAlign="center">
          {/* Loading state while redirect happens */}
          <Card sx={{ p: 4, mb: 4 }}>
            <Typography variant="h5" gutterBottom>
              Redirecting...
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Setting up your account access...
            </Typography>
          </Card>

          {/* Quick Actions for users with roles (in case redirection fails) */}
          {(isAdmin || isDoctor) && (
            <Grid container spacing={2} justifyContent="center">
              {isAdmin && (
                <Grid item>
                  <Button 
                    variant="contained" 
                    startIcon={<AdminIcon />}
                    onClick={handleNavigateToAdmin}
                    size="large"
                  >
                    Admin Dashboard
                  </Button>
                </Grid>
              )}
              {isDoctor && (
                <Grid item>
                  <Button 
                    variant="contained" 
                    startIcon={<DoctorIcon />}
                    onClick={handleNavigateToDoctor}
                    size="large"
                  >
                    Doctor Dashboard
                  </Button>
                </Grid>
              )}
            </Grid>
          )}
        </Box>
      </Container>
    </>
  );
};

export default HomePage;