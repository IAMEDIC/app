import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
} from '@mui/icons-material';

interface DoctorDashboardProps {}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = () => {
  // Placeholder data - these would come from API calls
  const savedStudies = [
    {
      id: '1',
      name: 'Cardiac Analysis Study #1',
      createdAt: '2025-09-15',
      lastModified: '2025-09-16',
      status: 'In Progress',
    },
    {
      id: '2', 
      name: 'Retinal Blood Flow Analysis',
      createdAt: '2025-09-10',
      lastModified: '2025-09-12',
      status: 'Completed',
    },
  ];

  const handleCreateNewStudy = () => {
    // TODO: Navigate to study creation form
    console.log('Create new study');
  };

  const handleViewStudy = (studyId: string) => {
    // TODO: Navigate to study viewer
    console.log('View study:', studyId);
  };

  const handleEditStudy = (studyId: string) => {
    // TODO: Navigate to study editor
    console.log('Edit study:', studyId);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Doctor Dashboard
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome to your medical analysis workspace. Create new studies or manage your existing work.
      </Typography>

      <Grid container spacing={3}>
        {/* Create New Study Section */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Create New Study
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Start a new medical imaging analysis study. Upload videos or images for 
              blood flow analysis and AI-powered diagnostics.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleCreateNewStudy}
              fullWidth
              sx={{ mt: 2 }}
            >
              Create New Study
            </Button>
          </Paper>
        </Grid>

        {/* Quick Actions Section */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Access frequently used tools and features for your medical analysis workflow.
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={() => console.log('View templates')}
                disabled
              >
                Study Templates (Coming Soon)
              </Button>
              <Button
                variant="outlined"
                onClick={() => console.log('Export data')}
                disabled
              >
                Export Data (Coming Soon)
              </Button>
              <Button
                variant="outlined"
                onClick={() => console.log('Analytics')}
                disabled
              >
                Analytics Dashboard (Coming Soon)
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Saved Studies Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Your Studies ({savedStudies.length})
            </Typography>
            
            {savedStudies.length === 0 ? (
              <Alert severity="info">
                You haven't created any studies yet. Click "Create New Study" to get started.
              </Alert>
            ) : (
              <Grid container spacing={2} sx={{ mt: 1 }}>
                {savedStudies.map((study) => (
                  <Grid item xs={12} sm={6} md={4} key={study.id}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" component="h3" gutterBottom>
                          {study.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Created: {new Date(study.createdAt).toLocaleDateString()}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Modified: {new Date(study.lastModified).toLocaleDateString()}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color={study.status === 'Completed' ? 'success.main' : 'warning.main'}
                        >
                          Status: {study.status}
                        </Typography>
                      </CardContent>
                      <CardActions>
                        <Button
                          size="small"
                          startIcon={<ViewIcon />}
                          onClick={() => handleViewStudy(study.id)}
                          disabled
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditStudy(study.id)}
                          disabled
                        >
                          Edit
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};