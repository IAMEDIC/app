import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import { Study, StudyCreate, StudyUpdate, StorageInfo } from '@/types';
import { studyService } from '@/services/api';
import { StudyCreateDialog } from '@/components/StudyCreateDialog';
import { StorageUsage } from '@/components/StorageUsage';

interface DoctorDashboardProps {}

export const DoctorDashboard: React.FC<DoctorDashboardProps> = () => {
  const navigate = useNavigate();
  
  // State
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create study dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  // Edit study dialog
  const [editStudy, setEditStudy] = useState<Study | null>(null);
  const [editAlias, setEditAlias] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  
  // Delete study dialog
  const [deleteStudy, setDeleteStudy] = useState<Study | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);

  // Storage state
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  useEffect(() => {
    loadStudies();
  }, []);

  const loadStudies = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await studyService.getStudies();
      setStudies(response.studies);
      
      // Load storage info
      const storage = await studyService.getStorageInfo();
      setStorageInfo(storage);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load studies');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewStudy = () => {
    setCreateDialogOpen(true);
    setCreateError(null);
  };

  const handleCreateStudy = async (studyData: StudyCreate) => {
    try {
      setCreateLoading(true);
      setCreateError(null);
      const newStudy = await studyService.createStudy(studyData);
      setStudies([newStudy, ...studies]);
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Failed to create study');
      throw err; // Re-throw to prevent dialog from closing
    } finally {
      setCreateLoading(false);
    }
  };

  const handleStudyCreated = (alias: string) => {
    // Additional actions after study creation
    console.log('Study created:', alias);
  };

  const handleViewStudy = (studyId: string) => {
    navigate(`/doctor/study/${studyId}`);
  };

  const handleEditStudy = (study: Study) => {
    setEditStudy(study);
    setEditAlias(study.alias);
    setEditError(null);
    setMenuAnchor(null);
  };

  const handleEditSave = async () => {
    if (!editStudy || !editAlias.trim()) {
      setEditError('Alias is required');
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);
      
      const updateData: StudyUpdate = { alias: editAlias.trim() };
      const updatedStudy = await studyService.updateStudy(editStudy.id, updateData);
      
      setStudies(studies.map(s => s.id === editStudy.id ? updatedStudy : s));
      setEditStudy(null);
    } catch (err: any) {
      setEditError(err.response?.data?.detail || 'Failed to update study');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteStudy = (study: Study) => {
    setDeleteStudy(study);
    setMenuAnchor(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteStudy) return;

    try {
      setDeleteLoading(true);
      await studyService.deleteStudy(deleteStudy.id);
      setStudies(studies.filter(s => s.id !== deleteStudy.id));
      setDeleteStudy(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete study');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, study: Study) => {
    setMenuAnchor(event.currentTarget);
    setSelectedStudy(study);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedStudy(null);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Doctor Dashboard
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Welcome to your medical analysis workspace. Create new studies or manage your existing work.
      </Typography>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

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

        {/* Storage Usage Section */}
        {storageInfo && (
          <Grid item xs={12}>
            <StorageUsage storageInfo={storageInfo} />
          </Grid>
        )}

        {/* Saved Studies Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Your Studies ({studies.length})
            </Typography>
            
            {loading ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : studies.length === 0 ? (
              <Alert severity="info">
                You haven't created any studies yet. Click "Create New Study" to get started.
              </Alert>
            ) : (
              <Grid container spacing={2} sx={{ mt: 1 }}>
                {studies.map((study) => (
                  <Grid item xs={12} sm={6} md={4} key={study.id}>
                    <Card>
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                          <Typography variant="h6" component="h3" gutterBottom noWrap>
                            {study.alias}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, study)}
                          >
                            <MoreIcon />
                          </IconButton>
                        </Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Created: {formatDate(study.created_at)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Modified: {formatDate(study.updated_at)}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color={study.is_active ? 'success.main' : 'text.secondary'}
                        >
                          Status: {study.is_active ? 'Active' : 'Inactive'}
                        </Typography>
                      </CardContent>
                      <CardActions>
                        <Button
                          size="small"
                          startIcon={<ViewIcon />}
                          onClick={() => handleViewStudy(study.id)}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditStudy(study)}
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

      {/* Study Actions Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedStudy && handleViewStudy(selectedStudy.id)}>
          <ListItemIcon>
            <ViewIcon />
          </ListItemIcon>
          <ListItemText>View Study</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => selectedStudy && handleEditStudy(selectedStudy)}>
          <ListItemIcon>
            <EditIcon />
          </ListItemIcon>
          <ListItemText>Edit Alias</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => selectedStudy && handleDeleteStudy(selectedStudy)}>
          <ListItemIcon>
            <DeleteIcon />
          </ListItemIcon>
          <ListItemText>Delete Study</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create Study Dialog */}
      <StudyCreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onStudyCreated={handleStudyCreated}
        onCreateStudy={handleCreateStudy}
        loading={createLoading}
        error={createError}
      />

      {/* Edit Study Dialog */}
      <Dialog
        open={!!editStudy}
        onClose={() => setEditStudy(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Study Alias</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Study Alias"
            type="text"
            fullWidth
            variant="outlined"
            value={editAlias}
            onChange={(e) => setEditAlias(e.target.value)}
            error={!!editError}
            helperText={editError}
            disabled={editLoading}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditStudy(null)} disabled={editLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleEditSave}
            variant="contained"
            disabled={editLoading || !editAlias.trim()}
          >
            {editLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Study Dialog */}
      <Dialog
        open={!!deleteStudy}
        onClose={() => setDeleteStudy(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Study</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the study "{deleteStudy?.alias}"? 
            This action will permanently remove the study and all its media files. 
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteStudy(null)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? 'Deleting...' : 'Delete Study'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};