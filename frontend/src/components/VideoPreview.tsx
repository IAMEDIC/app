import React, { useState, useEffect } from 'react';
import {
  Box,
  Skeleton,
} from '@mui/material';
import {
  VideoFile as VideoIcon,
} from '@mui/icons-material';
import api from '@/services/api';

interface VideoPreviewProps {
  studyId: string;
  videoId: string;
  alt: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

/**
 * Component that lazily loads video preview frames.
 * Shows a loading skeleton initially, then the preview image, 
 * or silently falls back to a video icon on error.
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({
  studyId,
  videoId,
  alt,
  style,
  onClick,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(false);

        // Fetch preview frame from backend
        const response = await api.get(
          `/studies/${studyId}/media/${videoId}/preview-frame`,
          {
            responseType: 'blob',
            // Browser will cache this due to Cache-Control headers from backend
          }
        );

        if (isMounted) {
          // Create object URL for the blob
          const blobUrl = URL.createObjectURL(response.data);
          setPreviewUrl(blobUrl);
        }
      } catch (err) {
        // Silent failure - just show the icon
        console.debug('Preview frame not available for video:', videoId);
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      isMounted = false;
      // Cleanup blob URL to prevent memory leaks
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [studyId, videoId]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (loading) {
    return (
      <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton variant="rectangular" width="100%" height="100%" />
      </Box>
    );
  }

  if (error || !previewUrl) {
    // Fallback to video icon (silent failure)
    return (
      <Box 
        sx={{ 
          height: 200, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'grey.100',
          cursor: onClick ? 'pointer' : 'default',
          position: 'relative',
          '&:hover': onClick ? {
            backgroundColor: 'grey.200'
          } : {}
        }}
        onClick={onClick}
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

  // Show the preview image
  return (
    <Box 
      sx={{ 
        height: 200, 
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden'
      }}
      onClick={onClick}
    >
      <img
        src={previewUrl}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          ...style
        }}
      />
      
      {/* Video badge overlay */}
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
};
