import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  VideoFile as VideoIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { AnnotationsTab } from './AnnotationsTab';
import { VideoPlayerWithFrames } from './VideoPlayerWithFrames';
import { CachedMediaImage } from './CachedMediaImage';
import { LazyMediaItem } from './LazyMediaItem';
import { useMediaCacheStore } from '@/store/mediaCacheStore';
import { useMediaCacheManager } from '@/utils/mediaCacheUtils';
import { useTranslation } from '@/contexts/LanguageContext';

interface MediaGalleryProps {
  media: MediaSummary[];
  studyId: string;
  onDeleteMedia: (mediaId: string) => Promise<void>;
  onDownloadMedia: (mediaId: string, filename: string) => Promise<void>;
  onMediaAdded?: (newMedia: MediaSummary) => void;
  loading?: boolean;
  error?: string | null;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  media,
  studyId,
  onDeleteMedia,
  onDownloadMedia,
  onMediaAdded,
  loading = false,
  error = null,
}) => {
  const { t } = useTranslation();
  const [selectedMedia, setSelectedMedia] = useState<MediaSummary | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<MediaSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  
  // Media cache management
  const { handleMediaDeleted } = useMediaCacheManager();

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('storage.bytes')}`;
    const k = 1024;
    const sizes = [t('storage.bytes'), t('storage.kb'), t('storage.mb'), t('storage.gb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };



  const handleViewMedia = (mediaItem: MediaSummary) => {
    setSelectedMedia(mediaItem);
    setHasUnsavedChanges(false);
  };

  const handleCloseDialog = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      setSelectedMedia(null);
      setHasUnsavedChanges(false);
    }
  };

  const handleForceClose = () => {
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

  // Component for displaying authenticated images with AI support
  const AuthenticatedImageWithAI: React.FC<{ 
    mediaId: string; 
    alt: string; 
    showAI?: boolean;
  }> = ({ 
    mediaId, 
    alt,
    showAI = false
  }) => {
    if (showAI) {
      return (
        <AnnotationsTab 
          media={{ ...selectedMedia!, id: mediaId } as MediaSummary}
          studyId={studyId}
          onMediaAdded={onMediaAdded}
        />
      );
    }

    return (
      <CachedMediaImage
        studyId={studyId}
        mediaId={mediaId}
        alt={alt}
        style={{ maxWidth: '100%', height: 'auto' }}
      />
);
  };




  // Container component for video player with frame extraction
  const VideoPlayerContainer: React.FC<{
    studyId: string;
    videoId: string;
  }> = ({ studyId, videoId }) => {
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
      />
    );
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

  if (media.length === 0) {
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
        {media.map((mediaItem) => (
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={mediaItem.id}>
            <LazyMediaItem
              media={mediaItem}
              studyId={studyId}
              onView={handleViewMedia}
              onDelete={(mediaId) => {
                const mediaToDelete = media.find(m => m.id === mediaId);
                if (mediaToDelete) {
                  setDeleteDialog(mediaToDelete);
                }
              }}
              onDownload={(mediaId, _filename) => {
                const mediaToDownload = media.find(m => m.id === mediaId);
                if (mediaToDownload) {
                  handleDownloadMedia(mediaToDownload);
                }
              }}
              rootMargin="100px" // Start loading when 100px away from viewport
              threshold={0.1}
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
                <Box>
                  <Typography variant="h6">{selectedMedia.filename}</Typography>
                  {hasUnsavedChanges && (
                    <Chip 
                      label={t('components.mediaGallery.unsavedChanges')} 
                      size="small" 
                      color="warning" 
                      sx={{ ml: 1 }}
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
                <AuthenticatedImageWithAI
                  mediaId={selectedMedia.id}
                  alt={selectedMedia.filename}
                  showAI={true}
                />
              ) : (
                <VideoPlayerContainer 
                  studyId={studyId}
                  videoId={selectedMedia.id}
                />
              )}
              
              <Box mt={2}>
                <Typography variant="body2" color="text.secondary">
                  {t('storage.used')}: {formatFileSize(selectedMedia.file_size)} |
                  {t('media.type', { defaultValue: 'Type' })}: {selectedMedia.mime_type} |
                  {t('studyView.created')}: {formatDate(selectedMedia.created_at)}
                </Typography>
              </Box>
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