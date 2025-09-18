import React, { useEffect, useState } from 'react';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { useAuthStore } from '@/store/authStore';
import { AdminDashboard } from '@/components/AdminDashboard';
import TopBar from '@/components/TopBar';

const AdminPage: React.FC = () => {
  const { user } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user has admin role
    if (user?.roles) {
      setIsAdmin(user.roles.includes('admin'));
    } else {
      setIsAdmin(false);
    }
  }, [user]);

  if (isAdmin === null) {
    return (
      <>
        <TopBar />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <TopBar />
        <Box sx={{ p: 3 }}>
          <Alert severity="error">
            <Typography variant="h6">Access Denied</Typography>
            <Typography>You do not have administrator privileges to access this page.</Typography>
          </Alert>
        </Box>
      </>
    );
  }

  return (
    <>
      <TopBar />
      <AdminDashboard />
    </>
  );
};

export default AdminPage;