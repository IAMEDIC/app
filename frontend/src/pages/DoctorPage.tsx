import React, { useEffect, useState } from 'react';
import { Box, Typography, Alert, CircularProgress, Button } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { DoctorDashboard } from '@/components/DoctorDashboard';
import { DoctorRegistrationForm } from '@/components/DoctorRegistrationForm';
import { DoctorProfile } from '@/types';
import TopBar from '@/components/TopBar';
import api from '@/services/api';

const DoctorPage: React.FC = () => {
  const { user } = useAuthStore();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDoctorProfile();
  }, []);

  const loadDoctorProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/doctor/profile');
      setDoctorProfile(response.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        // No profile exists yet - this is expected for new doctors
        setDoctorProfile(null);
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        // Authentication issue - will be handled by axios interceptor
        console.log('Authentication error, token refresh should handle this');
        setError('Authentication issue. Please try again.');
      } else {
        console.error('Failed to load doctor profile:', err);
        setError('Failed to load doctor profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrationComplete = () => {
    // Reload the profile after registration
    loadDoctorProfile();
  };

  if (loading) {
    return (
      <>
        <TopBar />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </>
    );
  }

  if (error) {
    return (
      <>
        <TopBar />
        <Box sx={{ p: 3 }}>
          <Alert severity="error">
            <Typography variant="h6">Error</Typography>
            <Typography>{error}</Typography>
            <Button 
              variant="outlined" 
              onClick={loadDoctorProfile} 
              sx={{ mt: 2 }}
            >
              Retry
            </Button>
          </Alert>
        </Box>
      </>
    );
  }

  // If no doctor profile exists or it's pending/denied, show registration form
  if (!doctorProfile || doctorProfile.status === 'pending' || doctorProfile.status === 'denied') {
    return (
      <>
        <TopBar />
        <Box sx={{ p: 3 }}>
          <DoctorRegistrationForm onRegistrationComplete={handleRegistrationComplete} />
        </Box>
      </>
    );
  }

  // If profile is approved, show the doctor dashboard
  if (doctorProfile.status === 'approved') {
    return (
      <>
        <TopBar />
        <DoctorDashboard />
      </>
    );
  }

  // Fallback
  return (
    <>
      <TopBar />
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          <Typography variant="h6">Doctor Registration</Typography>
          <Typography>Please complete your doctor registration to access the dashboard.</Typography>
        </Alert>
      </Box>
    </>
  );
};

export default DoctorPage;