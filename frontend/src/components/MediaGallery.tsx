import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  VideoFile as VideoIcon,
  Close as CloseIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { AnnotationsTab } from './AnnotationsTab';
import { VideoPlayerWithFrames } from './VideoPlayerWithFrames';
import { LazyMediaItem } from './LazyMediaItem';
import { useMediaCacheStore } from '@/store/mediaCacheStore';
import { useMediaCacheManager } from '@/utils/mediaCacheUtils';
import { useTranslation } from '@/contexts/LanguageContext';

// Container component for video player with frame extraction
const VideoPlayerContainer: React.FC<{
  studyId: string;
  videoId: string;
  selectedMedia: MediaSummary | null;
  onAnnotationsSaved: () => void;
}> = ({ studyId, videoId, selectedMedia, onAnnotationsSaved }) => {
  const { t } = useTranslation();
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const getCachedMedia = useMediaCacheStore((state) => state.getCachedMedia);

  useEffect(() => {
    let isMounted = true;
    
    const loadVideo = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const blobUrl = await getCachedMedia(studyId, videoId);
        
        if (isMounted) {
          setVideoSrc(blobUrl);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load video');
        console.error('Failed to load cached video:', error);
        
        if (isMounted) {
          setError(error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadVideo();
    
    return () => {
      isMounted = false;
    };
  }, [videoId, studyId, getCachedMedia]);

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography color="error">{t('components.mediaGallery.videoLoadError')}</Typography>
      </Box>
    );
  }

  if (!videoSrc) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography color="text.secondary">No video data</Typography>
      </Box>
    );
  }

  return (
    <VideoPlayerWithFrames
      videoSrc={videoSrc}
      studyId={studyId}
      videoId={videoId}
      filename={selectedMedia?.filename}
      fileSize={selectedMedia?.file_size}
      mimeType={selectedMedia?.mime_type}
      createdAt={selectedMedia?.created_at}
      onAnnotationsSaved={onAnnotationsSaved}
    />
  );
};

interface MediaGalleryProps {
  media: MediaSummary[];
  studyId: string;
  onDeleteMedia: (mediaId: string) => Promise<void>;
  onDownloadMedia: (mediaId: string, filename: string) => Promise<void>;
  onMediaAdded?: (newMedia: MediaSummary) => void;
  onAnnotationsSaved?: (mediaId: string) => void;
  onMediaRenamed?: (mediaId: string, newFilename: string) => void;
  loading?: boolean;
  error?: string | null;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  media,
  studyId,
  onDeleteMedia,
  onDownloadMedia,
  onMediaAdded,
  onAnnotationsSaved,
  onMediaRenamed,
  loading = false,
  error = null,
}) => {
  const { t } = useTranslation();
  const [selectedMedia, setSelectedMedia] = useState<MediaSummary | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<MediaSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [annotationsChanged, setAnnotationsChanged] = useState(false);
  
  // Local state to track media list updates without parent refresh
  const [localMedia, setLocalMedia] = useState<MediaSummary[]>(media);
  
  // Sync local media with parent media prop
  useEffect(() => {
    setLocalMedia(media);
  }, [media]);
  
  // Keep selectedMedia in sync with localMedia changes (e.g., after rename)
  useEffect(() => {
    if (selectedMedia) {
      const updatedMedia = localMedia.find(m => m.id === selectedMedia.id);
      if (updatedMedia && updatedMedia.filename !== selectedMedia.filename) {
        setSelectedMedia(updatedMedia);
      }
    }
  }, [localMedia, selectedMedia]);
  
  // Media cache management
  const { handleMediaDeleted } = useMediaCacheManager();

  // Handle annotations saved - just track that changes occurred, don't refresh yet
  const handleAnnotationsSaved = useCallback(() => {
    setAnnotationsChanged(true);
    // Don't call onAnnotationsSaved yet - wait until dialog closes
  }, []);
  
  // Stable callback for AnnotationsTab that doesn't change on re-render
  const handleAnnotationsSavedStable = useCallback(() => {
    handleAnnotationsSaved();
  }, [handleAnnotationsSaved]);

  const handleViewMedia = (mediaItem: MediaSummary) => {
    setSelectedMedia(mediaItem);
    setHasUnsavedChanges(false);
    setAnnotationsChanged(false); // Reset flag when opening new media
  };

  const handleCloseDialog = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      // Trigger refresh if annotations were changed during this session
      if (annotationsChanged) {
        setRefreshTrigger(prev => prev + 1);
        onAnnotationsSaved?.(selectedMedia?.id || '');
        setAnnotationsChanged(false);
      }
      setSelectedMedia(null);
      setHasUnsavedChanges(false);
    }
  };

  const handleForceClose = () => {
    // Trigger refresh if annotations were changed during this session
    if (annotationsChanged) {
      setRefreshTrigger(prev => prev + 1);
      onAnnotationsSaved?.(selectedMedia?.id || '');
      setAnnotationsChanged(false);
    }
    setSelectedMedia(null);
    setHasUnsavedChanges(false);
    setShowUnsavedWarning(false);
  };

  const handleDeleteMedia = async (mediaItem: MediaSummary) => {
    try {
      setActionLoading(`delete-${mediaItem.id}`);
      await onDeleteMedia(mediaItem.id);
      
      // Clear the deleted media from cache
      handleMediaDeleted(mediaItem.id);
      
      setDeleteDialog(null);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadMedia = async (mediaItem: MediaSummary) => {
    try {
      setActionLoading(`download-${mediaItem.id}`);
      await onDownloadMedia(mediaItem.id, mediaItem.filename);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRenameMedia = async (mediaId: string, newFilename: string) => {
    try {
      setActionLoading(`rename-${mediaId}`);
      
      // Import mediaService
      const { mediaService } = await import('@/services/api');
      await mediaService.updateMedia(mediaId, { filename: newFilename });
      
      // Update local media state immediately (no parent refresh needed)
      setLocalMedia(prevMedia => 
        prevMedia.map(m => 
          m.id === mediaId ? { ...m, filename: newFilename } : m
        )
      );
      
      // If the renamed media is currently selected, update its state
      if (selectedMedia && selectedMedia.id === mediaId) {
        setSelectedMedia({ ...selectedMedia, filename: newFilename });
      }
      
      // Notify parent component about the rename
      onMediaRenamed?.(mediaId, newFilename);
    } catch (error) {
      console.error('Rename failed:', error);
      throw error; // Re-throw to let LazyMediaItem handle the error
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (localMedia.length === 0) {
    return (
      <Box textAlign="center" p={4}>
        <VideoIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {t('components.mediaGallery.noMediaFiles')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('components.mediaGallery.getStarted')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Grid container spacing={2}>
        {localMedia.map((mediaItem) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={mediaItem.id}>
            <LazyMediaItem
              media={mediaItem}
              studyId={studyId}
              onView={handleViewMedia}
              onDelete={(mediaId) => {
                const mediaToDelete = localMedia.find(m => m.id === mediaId);
                if (mediaToDelete) {
                  setDeleteDialog(mediaToDelete);
                }
              }}
              onDownload={(mediaId, _filename) => {
                const mediaToDownload = localMedia.find(m => m.id === mediaId);
                if (mediaToDownload) {
                  handleDownloadMedia(mediaToDownload);
                }
              }}
              onRename={handleRenameMedia}
              rootMargin="100px" // Start loading when 100px away from viewport
              threshold={0.1}
              refreshTrigger={refreshTrigger}
            />
          </Grid>
        ))}
      </Grid>

      {/* Media Viewer Dialog */}
      <Dialog
        open={!!selectedMedia}
        onClose={handleCloseDialog}
        maxWidth={selectedMedia?.media_type === 'video' ? "xl" : "xl"}
        fullWidth
      >
        {selectedMedia && (
          <>
            <DialogTitle>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box display="flex" alignItems="center" flexGrow={1} gap={1}>
                  <Typography variant="h6">{selectedMedia.filename}</Typography>
                  <Tooltip title={t('components.mediaGallery.rename')}>
                    <IconButton 
                      size="small" 
                      onClick={async () => {
                        const getFileExtension = (filename: string): string => {
                          const lastDot = filename.lastIndexOf('.');
                          return lastDot > 0 ? filename.slice(lastDot) : '';
                        };
                        
                        const getFilenameWithoutExtension = (filename: string): string => {
                          const lastDot = filename.lastIndexOf('.');
                          return lastDot > 0 ? filename.slice(0, lastDot) : filename;
                        };
                        
                        const nameWithoutExt = getFilenameWithoutExtension(selectedMedia.filename);
                        const extension = getFileExtension(selectedMedia.filename);
                        
                        const newName = prompt(
                          t('components.mediaGallery.renamePrompt'),
                          nameWithoutExt
                        );
                        
                        if (newName && newName.trim() && newName !== nameWithoutExt) {
                          try {
                            const newFilename = newName.trim() + extension;
                            await handleRenameMedia(selectedMedia.id, newFilename);
                          } catch (error) {
                            console.error('Failed to rename:', error);
                            alert(t('components.mediaGallery.renameError'));
                          }
                        }
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {hasUnsavedChanges && (
                    <Chip 
                      label={t('components.mediaGallery.unsavedChanges')} 
                      size="small" 
                      color="warning"
                    />
                  )}
                </Box>
                <IconButton onClick={handleCloseDialog}>
                  <CloseIcon />
                </IconButton>
              </Box>

              {/* No tabs - always show annotations for images */}
            </DialogTitle>
            <DialogContent>
              {selectedMedia.media_type === 'image' ? (
                <AnnotationsTab 
                  media={selectedMedia}
                  studyId={studyId}
                  onMediaAdded={onMediaAdded}
                  onAnnotationsSaved={handleAnnotationsSavedStable}
                />
              ) : (
                <VideoPlayerContainer 
                  studyId={studyId}
                  videoId={selectedMedia.id}
                  selectedMedia={selectedMedia}
                  onAnnotationsSaved={handleAnnotationsSavedStable}
                />
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteDialog}
        onClose={() => setDeleteDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        {deleteDialog && (
          <>
            <DialogTitle>{t('components.mediaGallery.deleteMedia')}</DialogTitle>
            <DialogContent>
              <Typography>
                {t('components.mediaGallery.deleteMediaConfirm', { filename: deleteDialog.filename })}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteDialog(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() => handleDeleteMedia(deleteDialog)}
                color="error"
                variant="contained"
                disabled={actionLoading === `delete-${deleteDialog.id}`}
              >
                {actionLoading === `delete-${deleteDialog.id}` ? t('studyView.deleting') : t('common.delete')}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Unsaved Changes Warning Dialog */}
      <Dialog
        open={showUnsavedWarning}
        onClose={() => setShowUnsavedWarning(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{t('components.mediaGallery.unsavedChanges')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('components.mediaGallery.unsavedChangesMessage')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowUnsavedWarning(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleForceClose} color="error" variant="contained">
            {t('components.mediaGallery.discardChanges')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};