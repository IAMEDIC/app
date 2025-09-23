import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  VideoFile as VideoIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { mediaService } from '@/services/api';

interface MediaGalleryProps {
  media: MediaSummary[];
  studyId: string;
  onDeleteMedia: (mediaId: string) => Promise<void>;
  onDownloadMedia: (mediaId: string, filename: string) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({
  media,
  studyId,
  onDeleteMedia,
  onDownloadMedia,
  loading = false,
  error = null,
}) => {
  const [selectedMedia, setSelectedMedia] = useState<MediaSummary | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<MediaSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'success';
      case 'processing':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const handleViewMedia = (mediaItem: MediaSummary) => {
    setSelectedMedia(mediaItem);
  };

  const handleDeleteMedia = async (mediaItem: MediaSummary) => {
    try {
      setActionLoading(`delete-${mediaItem.id}`);
      await onDeleteMedia(mediaItem.id);
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

  // Component for displaying authenticated images
  const AuthenticatedImage: React.FC<{ mediaId: string; alt: string; className?: string }> = ({ 
    mediaId, 
    alt, 
    className 
  }) => {
    const [imageSrc, setImageSrc] = useState<string>('');
    const [imageLoading, setImageLoading] = useState(true);
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
      let isMounted = true;
      let blobUrl: string | null = null;
      
      const loadImage = async () => {
        try {
          setImageLoading(true);
          setImageError(false);
          
          // Fetch the media file using authenticated request
          const blob = await mediaService.downloadMedia(studyId, mediaId);
          
          if (isMounted) {
            blobUrl = URL.createObjectURL(blob);
            setImageSrc(blobUrl);
          }
        } catch (error) {
          console.error('Failed to load image:', error);
          if (isMounted) {
            setImageError(true);
          }
        } finally {
          if (isMounted) {
            setImageLoading(false);
          }
        }
      };

      loadImage();
      
      // Cleanup function
      return () => {
        isMounted = false;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      };
    }, [mediaId, studyId]);

    if (imageLoading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
          <CircularProgress size={24} />
        </Box>
      );
    }

    if (imageError) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
          <Typography color="error">Failed to load image</Typography>
        </Box>
      );
    }

    return <img src={imageSrc} alt={alt} className={className} style={{ maxWidth: '100%', height: 'auto' }} />;
  };

  // Component for displaying authenticated videos
  const AuthenticatedVideo: React.FC<{ mediaId: string; mimeType: string }> = ({ 
    mediaId, 
    mimeType 
  }) => {
    const [videoSrc, setVideoSrc] = useState<string>('');
    const [videoLoading, setVideoLoading] = useState(true);
    const [videoError, setVideoError] = useState(false);

    useEffect(() => {
      let isMounted = true;
      let blobUrl: string | null = null;
      
      const loadVideo = async () => {
        try {
          setVideoLoading(true);
          setVideoError(false);
          
          // Fetch the media file using authenticated request
          const blob = await mediaService.downloadMedia(studyId, mediaId);
          
          if (isMounted) {
            blobUrl = URL.createObjectURL(blob);
            setVideoSrc(blobUrl);
          }
        } catch (error) {
          console.error('Failed to load video:', error);
          if (isMounted) {
            setVideoError(true);
          }
        } finally {
          if (isMounted) {
            setVideoLoading(false);
          }
        }
      };

      loadVideo();
      
      // Cleanup function
      return () => {
        isMounted = false;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      };
    }, [mediaId, studyId]);

    if (videoLoading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
          <CircularProgress size={24} />
        </Box>
      );
    }

    if (videoError) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" height="200px">
          <Typography color="error">Failed to load video</Typography>
        </Box>
      );
    }

    return (
      <video
        controls
        style={{ 
          maxWidth: '100%', 
          maxHeight: '70vh' 
        }}
      >
        <source src={videoSrc} type={mimeType} />
        Your browser does not support the video tag.
      </video>
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
          No Media Files
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Upload images or videos to get started with your analysis.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Grid container spacing={2}>
        {media.map((mediaItem) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={mediaItem.id}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Media Preview */}
              <Box sx={{ position: 'relative', height: 200, bgcolor: 'grey.100' }}>
                {mediaItem.media_type === 'image' ? (
                  <Box sx={{ height: 200, overflow: 'hidden' }}>
                    <AuthenticatedImage 
                      mediaId={mediaItem.id}
                      alt={mediaItem.filename}
                    />
                  </Box>
                ) : (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    height="100%"
                    sx={{ bgcolor: 'grey.200' }}
                  >
                    <VideoIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
                  </Box>
                )}
                
                {/* Status Badge */}
                <Chip
                  label={mediaItem.upload_status}
                  color={getStatusColor(mediaItem.upload_status) as any}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                  }}
                />
              </Box>

              {/* Media Info */}
              <CardContent sx={{ flexGrow: 1 }}>
                <Typography variant="subtitle2" noWrap title={mediaItem.filename}>
                  {mediaItem.filename}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(mediaItem.file_size)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(mediaItem.created_at)}
                </Typography>
              </CardContent>

              {/* Actions */}
              <CardActions>
                <Tooltip title="View">
                  <IconButton 
                    size="small" 
                    onClick={() => handleViewMedia(mediaItem)}
                    disabled={mediaItem.upload_status !== 'uploaded'}
                  >
                    <ViewIcon />
                  </IconButton>
                </Tooltip>
                
                <Tooltip title="Download">
                  <IconButton 
                    size="small" 
                    onClick={() => handleDownloadMedia(mediaItem)}
                    disabled={
                      mediaItem.upload_status !== 'uploaded' || 
                      actionLoading === `download-${mediaItem.id}`
                    }
                  >
                    {actionLoading === `download-${mediaItem.id}` ? (
                      <CircularProgress size={20} />
                    ) : (
                      <DownloadIcon />
                    )}
                  </IconButton>
                </Tooltip>
                
                <Tooltip title="Delete">
                  <IconButton 
                    size="small" 
                    onClick={() => setDeleteDialog(mediaItem)}
                    disabled={actionLoading === `delete-${mediaItem.id}`}
                    color="error"
                  >
                    {actionLoading === `delete-${mediaItem.id}` ? (
                      <CircularProgress size={20} />
                    ) : (
                      <DeleteIcon />
                    )}
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Media Viewer Dialog */}
      <Dialog
        open={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
        maxWidth="md"
        fullWidth
      >
        {selectedMedia && (
          <>
            <DialogTitle>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                {selectedMedia.filename}
                <IconButton onClick={() => setSelectedMedia(null)}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent>
              <Box textAlign="center">
                {selectedMedia.media_type === 'image' ? (
                  <AuthenticatedImage 
                    mediaId={selectedMedia.id}
                    alt={selectedMedia.filename}
                  />
                ) : (
                  <AuthenticatedVideo 
                    mediaId={selectedMedia.id}
                    mimeType={selectedMedia.mime_type}
                  />
                )}
              </Box>
              <Box mt={2}>
                <Typography variant="body2" color="text.secondary">
                  Size: {formatFileSize(selectedMedia.file_size)} |
                  Type: {selectedMedia.mime_type} |
                  Uploaded: {formatDate(selectedMedia.created_at)}
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
            <DialogTitle>Delete Media File</DialogTitle>
            <DialogContent>
              <Typography>
                Are you sure you want to delete "{deleteDialog.filename}"? 
                This action cannot be undone.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => handleDeleteMedia(deleteDialog)}
                color="error"
                variant="contained"
                disabled={actionLoading === `delete-${deleteDialog.id}`}
              >
                {actionLoading === `delete-${deleteDialog.id}` ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};