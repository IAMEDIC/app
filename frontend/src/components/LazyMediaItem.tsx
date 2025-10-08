import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  Box,
  Skeleton,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  VideoFile as VideoIcon,
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { CachedMediaImage } from './CachedMediaImage';
import { useTranslation } from '@/contexts/LanguageContext';

interface LazyMediaItemProps {
  media: MediaSummary;
  studyId: string;
  onView: (media: MediaSummary) => void;
  onDelete: (mediaId: string) => void;
  onDownload: (mediaId: string, filename: string) => void;
  rootMargin?: string; // For intersection observer
  threshold?: number;
}

export const LazyMediaItem: React.FC<LazyMediaItemProps> = ({
  media,
  studyId,
  onView,
  onDelete,
  onDownload,
  rootMargin = '50px',
  threshold = 0.1,
}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

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

  const getStatusText = (status: string) => {
    return t(`media.${status}`, { defaultValue: status });
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
      return (
        <Box 
          sx={{ 
            height: 200, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'grey.100',
            cursor: 'pointer',
            position: 'relative',
            '&:hover': {
              backgroundColor: 'grey.200'
            }
          }}
          onClick={() => onView(media)}
        >
          <VideoIcon sx={{ fontSize: 60, color: 'grey.600' }} />
          
          {/* Video badge */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              typography: 'caption',
              fontWeight: 500
            }}
          >
            VIDEO
          </Box>
        </Box>
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
      
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        <Typography variant="body2" noWrap title={media.filename}>
          {media.filename}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatFileSize(media.file_size)} • {formatDate(media.created_at)}
        </Typography>
        <Box sx={{ mt: 1 }}>
          <Chip
            label={getStatusText(media.upload_status)}
            color={getStatusColor(media.upload_status)}
            size="small"
          />
        </Box>
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