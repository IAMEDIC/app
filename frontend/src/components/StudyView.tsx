import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Breadcrumbs,
  Link,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { StudyWithMedia, StudyUpdate, MediaSummary, StorageInfo } from '@/types';
import { studyService, mediaService } from '@/services/api';
import { MediaUpload } from '@/components/MediaUpload';
import { MediaGallery } from '@/components/MediaGallery';
import { StorageUsage } from '@/components/StorageUsage';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`study-tabpanel-${index}`}
      aria-labelledby={`study-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const StudyView: React.FC = () => {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  
  const [study, setStudy] = useState<StudyWithMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState(0);
  
  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editAlias, setEditAlias] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  
  // Delete state
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Media state
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // Storage state
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);

  useEffect(() => {
    if (studyId) {
      loadStudy();
    }
  }, [studyId]);

  const loadStudy = async () => {
    if (!studyId) return;
    
    try {
      setLoading(true);
      setError(null);
      const studyData = await studyService.getStudy(studyId);
      setStudy(studyData);
      setEditAlias(studyData.alias);
      
      // Load storage info
      await loadStorageInfo();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load study');
    } finally {
      setLoading(false);
    }
  };

  const loadStorageInfo = async () => {
    try {
      setStorageLoading(true);
      const storage = await studyService.getStorageInfo();
      setStorageInfo(storage);
    } catch (err: any) {
      console.error('Failed to load storage info:', err);
    } finally {
      setStorageLoading(false);
    }
  };

  const handleEditStart = () => {
    setIsEditing(true);
    setEditError(null);
    if (study) {
      setEditAlias(study.alias);
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditError(null);
    if (study) {
      setEditAlias(study.alias);
    }
  };

  const handleEditSave = async () => {
    if (!study || !editAlias.trim()) {
      setEditError('Alias is required');
      return;
    }

    try {
      setEditLoading(true);
      setEditError(null);
      
      const updateData: StudyUpdate = { alias: editAlias.trim() };
      const updatedStudy = await studyService.updateStudy(study.id, updateData);
      
      setStudy({ ...study, ...updatedStudy });
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err.response?.data?.detail || 'Failed to update study');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!study) return;

    try {
      setDeleteLoading(true);
      await studyService.deleteStudy(study.id);
      navigate('/doctor');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete study');
    } finally {
      setDeleteLoading(false);
      setDeleteDialog(false);
    }
  };

  const handleMediaUpload = async (file: File) => {
    if (!study) return;

    // Check storage before upload
    if (storageInfo && (storageInfo.available_bytes < file.size)) {
      setUploadError(`Not enough storage space. File size: ${(file.size / (1024 * 1024)).toFixed(1)}MB, Available: ${storageInfo.available_mb.toFixed(1)}MB`);
      return;
    }

    try {
      setUploadLoading(true);
      setUploadError(null);
      
      const response = await mediaService.uploadMedia(study.id, file);
      
      // Add the new media to the study
      const newMedia: MediaSummary = {
        id: response.media.id,
        filename: response.media.filename,
        file_size: response.media.file_size,
        mime_type: response.media.mime_type,
        media_type: response.media.media_type,
        upload_status: response.media.upload_status,
        created_at: response.media.created_at,
      };
      
      setStudy({
        ...study,
        media: [...study.media, newMedia],
      });

      // Refresh storage info after upload
      await loadStorageInfo();
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to upload media');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleMediaDelete = async (mediaId: string) => {
    if (!study) return;

    try {
      await mediaService.deleteMedia(study.id, mediaId);
      
      // Remove the media from the study
      setStudy({
        ...study,
        media: study.media.filter(m => m.id !== mediaId),
      });

      // Refresh storage info after deletion
      await loadStorageInfo();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete media');
    }
  };

  const handleMediaDownload = async (mediaId: string, filename: string) => {
    if (!study) return;

    try {
      const blob = await mediaService.downloadMedia(study.id, mediaId);
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download media');
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!studyId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Invalid study ID</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !study) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button onClick={() => navigate('/doctor')}>
            Back to Dashboard
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!study) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Study not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link 
            color="inherit" 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              navigate('/doctor');
            }}
          >
            Dashboard
          </Link>
          <Typography color="text.primary">Study Details</Typography>
        </Breadcrumbs>
        
        <Box display="flex" alignItems="center" gap={2} sx={{ mb: 2 }}>
          <IconButton onClick={() => navigate('/doctor')}>
            <BackIcon />
          </IconButton>
          
          {isEditing ? (
            <Box display="flex" alignItems="center" gap={1} flexGrow={1}>
              <TextField
                value={editAlias}
                onChange={(e) => setEditAlias(e.target.value)}
                variant="outlined"
                size="small"
                error={!!editError}
                helperText={editError}
                disabled={editLoading}
                sx={{ flexGrow: 1 }}
              />
              <IconButton 
                onClick={handleEditSave}
                disabled={editLoading || !editAlias.trim()}
                color="primary"
              >
                <SaveIcon />
              </IconButton>
              <IconButton 
                onClick={handleEditCancel}
                disabled={editLoading}
              >
                <CancelIcon />
              </IconButton>
            </Box>
          ) : (
            <>
              <Typography variant="h4" component="h1" flexGrow={1}>
                {study.alias}
              </Typography>
              <IconButton onClick={handleEditStart} color="primary">
                <EditIcon />
              </IconButton>
              <IconButton onClick={() => setDeleteDialog(true)} color="error">
                <DeleteIcon />
              </IconButton>
            </>
          )}
        </Box>
        
        {/* Study Info */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box display="flex" gap={4} flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary">
                Created
              </Typography>
              <Typography variant="body2">
                {formatDate(study.created_at)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Last Modified
              </Typography>
              <Typography variant="body2">
                {formatDate(study.updated_at)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Media Files
              </Typography>
              <Typography variant="body2">
                {study.media.length} files
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Chip 
                label={study.is_active ? 'Active' : 'Inactive'}
                color={study.is_active ? 'success' : 'default'}
                size="small"
              />
            </Box>
          </Box>
        </Paper>
      </Box>

      {/* Storage Usage */}
      {storageInfo && (
        <Box sx={{ mb: 3 }}>
          <StorageUsage storageInfo={storageInfo} variant="compact" showDetails={false} />
        </Box>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)}>
          <Tab label={`Media Files (${study.media.length})`} />
          <Tab label="Upload Media" />
        </Tabs>
        
        <TabPanel value={currentTab} index={0}>
          <MediaGallery
            media={study.media}
            studyId={study.id}
            onDeleteMedia={handleMediaDelete}
            onDownloadMedia={handleMediaDownload}
          />
        </TabPanel>
        
        <TabPanel value={currentTab} index={1}>
          <MediaUpload
            onUpload={handleMediaUpload}
            uploading={uploadLoading}
            error={uploadError}
            recentUploads={study.media.slice(-5)} // Show last 5 uploads
            onRemoveRecent={handleMediaDelete}
            storageInfo={storageInfo}
          />
        </TabPanel>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Study</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the study "{study.alias}"? 
            This action will permanently remove the study and all its media files. 
            This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
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