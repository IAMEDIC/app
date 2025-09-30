import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useMediaCacheStore } from '@/store/mediaCacheStore';

interface CachedMediaVideoProps {
  studyId: string;
  mediaId: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  children?: React.ReactNode;
}

export const CachedMediaVideo: React.FC<CachedMediaVideoProps> = ({
  studyId,
  mediaId,
  controls = true,
  autoPlay = false,
  muted = false,
  loop = false,
  style = { maxWidth: '100%', height: 'auto' },
  onLoad,
  onError,
  children,
}) => {
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
        
        const blobUrl = await getCachedMedia(studyId, mediaId);
        
        if (isMounted) {
          setVideoSrc(blobUrl);
          onLoad?.();
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load video');
        console.error('Failed to load cached video:', error);
        
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

    loadVideo();
    
    return () => {
      isMounted = false;
    };
  }, [studyId, mediaId, getCachedMedia, onLoad, onError]);

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
        <Typography color="error" variant="body1">
          Failed to load video
        </Typography>
      </Box>
    );
  }

  if (!videoSrc) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Typography color="text.secondary" variant="body1">
          No video data
        </Typography>
      </Box>
    );
  }

  return (
    <video 
      src={videoSrc}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      loop={loop}
      style={style}
    >
      {children}
    </video>
  );
};