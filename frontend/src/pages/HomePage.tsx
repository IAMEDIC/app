import React from 'react';
import {
  Container,
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Avatar,
  Chip,
  Grid,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  MedicalServices as MedicalIcon,
  Analytics as AnalyticsIcon,
} from '@mui/icons-material';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';

const HomePage: React.FC = () => {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
    }
  };

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        {/* Header */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={4}
          flexWrap="wrap"
          gap={2}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <img
              src="/logo.jpg"
              alt="IAMEDIC"
              style={{ width: 48, height: 48 }}
            />
            <Typography variant="h4" component="h1" fontWeight="bold">
              IAMEDIC
            </Typography>
          </Box>
          
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ bgcolor: 'primary.main' }}>
              {user?.name?.charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="body1" fontWeight="medium">
                {user?.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              size="small"
            >
              Logout
            </Button>
          </Box>
        </Box>

        {/* Welcome Message */}
        <Card sx={{ mb: 4, bgcolor: 'primary.main', color: 'white' }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h4" gutterBottom>
              Welcome to IAMEDIC, {user?.name?.split(' ')[0]}!
            </Typography>
            <Typography variant="h6" sx={{ opacity: 0.9 }}>
              AI-powered ultrasound analysis for third trimester pregnancy scans
            </Typography>
            <Box mt={2}>
              <Chip
                icon={<MedicalIcon />}
                label="Medical AI"
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.2)', 
                  color: 'white',
                  mr: 1 
                }}
              />
              <Chip
                icon={<AnalyticsIcon />}
                label="Advanced Analytics"
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.2)', 
                  color: 'white' 
                }}
              />
            </Box>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  🎯 Automatic Bounding Boxes
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Generate precise bounding boxes for fetal structures in third trimester ultrasound scans using advanced AI models.
                </Typography>
                <Button variant="outlined" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  🔍 Frame Classification
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Intelligent classification of ultrasound frames to identify optimal views for analysis.
                </Typography>
                <Button variant="outlined" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  📊 MLFlow Integration
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Access ML experiment tracking and model management through integrated MLFlow dashboard.
                </Typography>
                <Button variant="outlined" disabled>
                  Coming Soon
                </Button>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  🔒 Secure Authentication
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Google OAuth integration ensures secure access to your medical analysis tools.
                </Typography>
                <Chip label="Active" color="success" size="small" />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Footer */}
        <Box mt={6} textAlign="center">
          <Typography variant="body2" color="text.secondary">
            IAMEDIC - Inteligencia Artificial Médica
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Powered by advanced machine learning for medical imaging analysis
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default HomePage;