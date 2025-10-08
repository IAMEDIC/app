import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useMediaCacheStore } from '@/store/mediaCacheStore';

interface CachedMediaImageProps {
  studyId: string;
  mediaId: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export const CachedMediaImage: React.FC<CachedMediaImageProps> = ({
  studyId,
  mediaId,
  alt,
  className,
  style = { maxWidth: '100%', height: 'auto' },
  onLoad,
  onError,
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  const getCachedMedia = useMediaCacheStore((state) => state.getCachedMedia);

  useEffect(() => {
    let isMounted = true;

    const loadImage = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setDownloadProgress(0);
        
        const blobUrl = await getCachedMedia(studyId, mediaId, (progress) => {
          if (isMounted) {
            setDownloadProgress(progress);
          }
        });
        
        if (isMounted) {
          setImageSrc(blobUrl);
          onLoad?.();
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load image');
        console.error('Failed to load cached image:', error);
        
        if (isMounted) {
          setError(error);
          onError?.(error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadImage();
    
    return () => {
      isMounted = false;
    };
  }, [studyId, mediaId, getCachedMedia, onLoad, onError]);

  if (isLoading) {
    return (
      <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="200px">
        <CircularProgress variant="determinate" value={downloadProgress} size={40} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          {downloadProgress}% loaded
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="200px">
        <Typography color="error" variant="body2">
          Failed to load image
        </Typography>
      </Box>
    );
  }

  if (!imageSrc && !isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="200px">
        <Typography color="text.secondary" variant="body2">
          No image data
        </Typography>
      </Box>
    );
  }
  
  if (!imageSrc) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="200px">
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt} 
      className={className}
      style={style}
    />
  );
};