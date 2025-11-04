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
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { StudyWithMedia, StudyUpdate, MediaSummary } from '@/types';
import { studyService, mediaService } from '@/services/api';
import { MediaUpload } from '@/components/MediaUpload';
import { MediaGallery } from '@/components/MediaGallery';
import { StreamingTab } from '@/components/StreamingTab';
import { useStorageInfo } from '@/contexts/StorageContext';
import { useTranslation } from '@/contexts/LanguageContext';
import { useMediaCacheManager } from '@/utils/mediaCacheUtils';

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
  const { t } = useTranslation();
  
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
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  
  // Storage context
  const { storageInfo, refreshStorageInfo } = useStorageInfo();
  
  // Media cache management
  const { handleMediaDeleted, handleStudyDeleted } = useMediaCacheManager();

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
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errors.failedToLoadStudy'));
    } finally {
      setLoading(false);
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
      setEditError(t('errors.aliasRequired'));
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
      setEditError(err.response?.data?.detail || t('errors.failedToUpdateStudy'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!study) return;

    try {
      setDeleteLoading(true);
      await studyService.deleteStudy(study.id);
      
      // Clear all media for this study from cache
      handleStudyDeleted(study.id);
      
      navigate('/doctor');
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errors.failedToDeleteStudy'));
    } finally {
      setDeleteLoading(false);
      setDeleteDialog(false);
    }
  };

  const handleMediaUpload = async (file: File) => {
    if (!study) return;

    // Check storage before upload
    if (storageInfo && (storageInfo.available_bytes < file.size)) {
      setUploadError(t('errors.notEnoughStorage', {
        fileSize: (file.size / (1024 * 1024)).toFixed(1),
        available: storageInfo.available_mb.toFixed(1)
      }));
      return;
    }

    try {
      setUploadLoading(true);
      setUploadError(null);
      
      await mediaService.uploadMedia(study.id, file);
      
      // Refetch study to get complete and fresh data from backend
      await loadStudy();

      // Refresh storage info after upload
      await refreshStorageInfo();
      
      // Show success message
      setUploadSuccess(t('media.uploadSuccess', { filename: file.name }));
      
      // Clear success message after 4 seconds
      setTimeout(() => {
        setUploadSuccess(null);
      }, 4000);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || t('errors.failedToUploadMedia'));
    } finally {
      setUploadLoading(false);
    }
  };

  const handleMediaDelete = async (mediaId: string) => {
    if (!study) return;

    try {
      await mediaService.deleteMedia(study.id, mediaId);
      
      // Clear the deleted media from cache
      handleMediaDeleted(mediaId);
      
      // Remove the media from the study (no refetching needed)
      setStudy({
        ...study,
        media: study.media.filter(m => m.id !== mediaId),
      });

      // Refresh storage info after deletion
      await refreshStorageInfo();
    } catch (err: any) {
      setError(err.response?.data?.detail || t('errors.failedToDeleteMedia'));
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
      setError(err.response?.data?.detail || t('errors.failedToDownloadMedia'));
    }
  };

  const handleMediaAdded = (newMedia: MediaSummary) => {
    if (!study) return;
    
    setStudy({
      ...study,
      media: [...study.media, newMedia],
    });
    
    // Refresh storage info after new media is added
    refreshStorageInfo();
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
        <Alert severity="error">{t('errors.invalidStudyId')}</Alert>
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
            {t('studyView.backToDashboard')}
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
        <Alert severity="error">{t('errors.studyNotFound')}</Alert>
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
            {t('navigation.dashboard')}
          </Link>
          <Typography color="text.primary">{t('studyView.studyDetails')}</Typography>
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
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ width: '100%' }}>
        <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)}>
          <Tab label={t('studyView.studyDetails')} />
          <Tab label={t('studyView.mediaFilesTab', { count: study.media.length })} />
          <Tab label={t('studyView.uploadMediaTab')} />
          <Tab label={t('studyView.streamingTab')} />
        </Tabs>
        
        <TabPanel value={currentTab} index={0}>
          {/* Study Information Tab */}
          <Paper sx={{ p: 3 }}>
            <Box display="flex" gap={4} flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('studyView.created')}
                </Typography>
                <Typography variant="body2">
                  {formatDate(study.created_at)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('studyView.lastModified')}
                </Typography>
                <Typography variant="body2">
                  {formatDate(study.updated_at)}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('studyView.mediaFiles')}
                </Typography>
                <Typography variant="body2">
                  {t('studyView.filesCount', { count: study.media.length })}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </TabPanel>
        
        <TabPanel value={currentTab} index={1}>
          <MediaGallery
            media={study.media}
            studyId={study.id}
            onDeleteMedia={handleMediaDelete}
            onDownloadMedia={handleMediaDownload}
            onMediaAdded={handleMediaAdded}
            onAnnotationsSaved={() => {
              // Refetch study to get updated annotation status
              loadStudy();
            }}
            onMediaRenamed={() => {
              // Refetch study to ensure all data is in sync
              loadStudy();
            }}
          />
        </TabPanel>
        
        <TabPanel value={currentTab} index={2}>
          <MediaUpload
            onUpload={handleMediaUpload}
            uploading={uploadLoading}
            error={uploadError}
            success={uploadSuccess}
            storageInfo={storageInfo}
          />
        </TabPanel>
        
        <TabPanel value={currentTab} index={3}>
          <StreamingTab
            studyId={study.id}
            isActive={currentTab === 3}
            onNewVideo={() => {
              // Refresh the study to show the new video
              loadStudy();
            }}
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
        <DialogTitle>{t('studyView.deleteStudy')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('studyView.deleteStudyConfirm', { alias: study.alias })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)} disabled={deleteLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={deleteLoading}
          >
            {deleteLoading ? t('studyView.deleting') : t('studyView.deleteStudy')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};