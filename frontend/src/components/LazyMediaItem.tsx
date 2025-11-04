import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Tooltip,
  Box,
  Skeleton,
  TextField,
  CircularProgress,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { CachedMediaImage } from './CachedMediaImage';
import { VideoPreview } from './VideoPreview';
import { AnnotationStatusChip } from './AnnotationStatusChip';
import { useTranslation } from '@/contexts/LanguageContext';
import api from '@/services/api';

interface LazyMediaItemProps {
  media: MediaSummary;
  studyId: string;
  onView: (media: MediaSummary) => void;
  onDelete: (mediaId: string) => void;
  onDownload: (mediaId: string, filename: string) => void;
  onRename: (mediaId: string, newFilename: string) => Promise<void>;
  rootMargin?: string; // For intersection observer
  threshold?: number;
  refreshTrigger?: number; // Increment this to force refetch of annotation status
}

export const LazyMediaItem: React.FC<LazyMediaItemProps> = ({
  media,
  studyId,
  onView,
  onDelete,
  onDownload,
  onRename,
  rootMargin = '50px',
  threshold = 0.1,
  refreshTrigger = 0,
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  // Initialize from media prop if available, otherwise null (loading)
  const [hasAnnotations, setHasAnnotations] = useState<boolean | null>(
    media.has_annotations !== undefined ? media.has_annotations : null
  );
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Rename state
  const [isEditing, setIsEditing] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasLoaded) {
          setIsVisible(true);
          setHasLoaded(true);
          // Once loaded, we can disconnect the observer
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [hasLoaded, rootMargin, threshold]);

  // Fetch annotation status when component becomes visible or refreshTrigger changes
  // Only fetch if not already provided in media prop
  useEffect(() => {
    if (!isVisible) return;
    
    // If has_annotations is provided in media prop, use it and don't fetch
    if (media.has_annotations !== undefined) {
      setHasAnnotations(media.has_annotations);
      return;
    }

    let isMounted = true;

    const fetchAnnotationStatus = async () => {
      try {
        const response = await api.get(`/media/${media.id}/has-annotations`);
        if (isMounted) {
          setHasAnnotations(response.data.has_annotations);
        }
      } catch (error) {
        console.error('Failed to fetch annotation status:', error);
        // On error, assume no annotations
        if (isMounted) {
          setHasAnnotations(false);
        }
      }
    };

    fetchAnnotationStatus();

    return () => {
      isMounted = false;
    };
  }, [isVisible, media.id, media.has_annotations, refreshTrigger]);

  // Helper functions for filename manipulation
  const getFileExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.slice(lastDot) : '';
  };

  const getFilenameWithoutExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.slice(0, lastDot) : filename;
  };

  const handleStartEdit = () => {
    setEditedFilename(getFilenameWithoutExtension(media.filename));
    setIsEditing(true);
    setRenameError(null);
    // Focus input after state update
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedFilename('');
    setRenameError(null);
  };

  const handleSaveEdit = async () => {
    const trimmedName = editedFilename.trim();
    
    // Validation
    if (!trimmedName) {
      setRenameError(t('components.mediaGallery.filenameRequired'));
      return;
    }
    
    if (trimmedName.length > 450) { // Leave room for extension
      setRenameError(t('components.mediaGallery.filenameTooLong'));
      return;
    }

    const extension = getFileExtension(media.filename);
    const newFilename = trimmedName + extension;

    // Check if unchanged
    if (newFilename === media.filename) {
      setIsEditing(false);
      return;
    }

    setIsRenaming(true);
    setRenameError(null);
    
    try {
      await onRename(media.id, newFilename);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to rename media:', error);
      setRenameError(t('components.mediaGallery.renameError'));
    } finally {
      setIsRenaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

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

  const renderMediaContent = () => {
    if (!isVisible) {
      // Show skeleton while not visible
      return (
        <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Skeleton variant="rectangular" width="100%" height="100%" />
        </Box>
      );
    }

    if (media.media_type === 'video') {
      // Use VideoPreview component for async preview loading
      return (
        <VideoPreview
          studyId={studyId}
          videoId={media.id}
          alt={media.filename}
          onClick={() => onView(media)}
        />
      );
    }

    return (
      <Box sx={{ height: 200, cursor: 'pointer' }} onClick={() => onView(media)}>
        <CachedMediaImage
          studyId={studyId}
          mediaId={media.id}
          alt={media.filename}
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'cover' 
          }}
        />
      </Box>
    );
  };

  return (
    <Card 
      ref={elementRef}
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        }
      }}
    >
      {renderMediaContent()}
      
      {/* Annotation Status Chip - below preview */}
      <Box sx={{ px: 1, pt: 1 }}>
        <AnnotationStatusChip hasAnnotations={hasAnnotations} size="small" />
      </Box>
      
      <CardContent sx={{ flexGrow: 1, pb: 1, pt: 1 }}>
        {isEditing ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TextField
              inputRef={inputRef}
              value={editedFilename}
              onChange={(e) => setEditedFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              fullWidth
              disabled={isRenaming}
              error={!!renameError}
              helperText={renameError}
              placeholder={t('components.mediaGallery.newFilename')}
              InputProps={{
                endAdornment: getFileExtension(media.filename),
              }}
              sx={{ mb: renameError ? 0 : 1 }}
            />
            <Tooltip title={t('common.save')}>
              <span>
                <IconButton 
                  size="small" 
                  onClick={handleSaveEdit}
                  disabled={isRenaming}
                  color="primary"
                >
                  {isRenaming ? <CircularProgress size={20} /> : <CheckIcon />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t('common.cancel')}>
              <IconButton 
                size="small" 
                onClick={handleCancelEdit}
                disabled={isRenaming}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" noWrap title={media.filename} sx={{ flexGrow: 1 }}>
                {media.filename}
              </Typography>
              <Tooltip title={t('components.mediaGallery.rename')}>
                <IconButton 
                  size="small" 
                  onClick={handleStartEdit}
                  sx={{ padding: '2px' }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {formatFileSize(media.file_size)} • {formatDate(media.created_at)}
            </Typography>
          </>
        )}
      </CardContent>

      <CardActions sx={{ pt: 0 }}>
        <Tooltip title={t('common.view')}>
          <IconButton 
            size="small" 
            onClick={() => onView(media)}
            color="primary"
          >
            <ViewIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title={t('common.download')}>
          <IconButton 
            size="small" 
            onClick={() => onDownload(media.id, media.filename)}
            color="secondary"
          >
            <DownloadIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title={t('common.delete')}>
          <IconButton 
            size="small" 
            onClick={() => onDelete(media.id)}
            color="error"
          >
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
};