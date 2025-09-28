import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  CameraAlt as ExtractIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { frameService } from '@/services/frameService';
import { Frame, VideoMetadata } from '@/types/frame';

interface VideoPlayerWithFramesProps {
  videoSrc: string;
  studyId: string;
  videoId: string;
  onFrameAnnotate?: (frame: Frame) => void;
}

export const VideoPlayerWithFrames: React.FC<VideoPlayerWithFramesProps> = ({
  videoSrc,
  studyId,
  videoId,
  onFrameAnnotate,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Load video metadata and existing frames
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [metadataResponse, framesResponse] = await Promise.all([
          frameService.getVideoMetadata(studyId, videoId),
          frameService.listVideoFrames(studyId, videoId),
        ]);
        setMetadata(metadataResponse);
        setFrames(framesResponse.frames);
      } catch (err) {
        console.error('Failed to load video data:', err);
        setError('Failed to load video information');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [studyId, videoId]);

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle video loaded metadata
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Play/pause video
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Seek to specific time
  const seekToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // Extract frame at current timestamp
  const extractCurrentFrame = async () => {
    try {
      setExtracting(true);
      setError(null);
      
      const response = await frameService.extractFrame(studyId, videoId, {
        timestamp_seconds: currentTime,
      });
      
      // Add new frame to list
      setFrames(prev => [...prev, response.frame].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
      
      // Show success message
      console.log('Frame extracted successfully:', response.message);
    } catch (err) {
      console.error('Failed to extract frame:', err);
      setError('Failed to extract frame. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  // Delete frame
  const deleteFrame = async (frameId: string) => {
    try {
      await frameService.deleteFrame(frameId);
      setFrames(prev => prev.filter(f => f.id !== frameId));
    } catch (err) {
      console.error('Failed to delete frame:', err);
      setError('Failed to delete frame');
    }
  };

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="500px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Video Player */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <video
            ref={videoRef}
            src={videoSrc}
            width="100%"
            height="auto"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            style={{ maxHeight: '600px', maxWidth: '100%' }}
          />
          
          {/* Video Controls */}
          <Box sx={{ mt: 2 }}>
            <Box display="flex" alignItems="center" gap={2} mb={1}>
              <IconButton onClick={togglePlayPause} color="primary">
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </IconButton>
              
              <Typography variant="body2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </Typography>
              
              <Button
                variant="contained"
                startIcon={<ExtractIcon />}
                onClick={extractCurrentFrame}
                disabled={extracting}
                color="secondary"
              >
                {extracting ? 'Extracting...' : 'Extract Frame'}
              </Button>
            </Box>
            
            {/* Timeline/Scrubber */}
            <LinearProgress
              variant="determinate"
              value={(currentTime / duration) * 100}
              sx={{ 
                height: 8, 
                borderRadius: 4,
                cursor: 'pointer',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                }
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                seekToTime(percent * duration);
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Extracted Frames */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Extracted Frames ({frames.length})
          </Typography>
          
          {frames.length === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No frames extracted yet. Click "Extract Frame" while watching the video.
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {frames.map((frame) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={frame.id}>
                  <FrameCard
                    frame={frame}
                    onView={() => onFrameAnnotate?.(frame)}
                    onDelete={() => deleteFrame(frame.id)}
                    onSeek={() => seekToTime(frame.timestamp_seconds)}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

// Individual frame card component
interface FrameCardProps {
  frame: Frame;
  onView: () => void;
  onDelete: () => void;
  onSeek: () => void;
}

const FrameCard: React.FC<FrameCardProps> = ({ frame, onView, onDelete, onSeek }) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    let blobUrl: string | null = null;
    
    const loadImage = async () => {
      try {
        const blob = await frameService.getFrameFile(frame.id);
        blobUrl = URL.createObjectURL(blob);
        setImageSrc(blobUrl);
      } catch (error) {
        console.error('Failed to load frame image:', error);
      } finally {
        setImageLoading(false);
      }
    };

    loadImage();
    
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [frame.id]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 1 }}>
        {imageLoading ? (
          <Box 
            display="flex" 
            justifyContent="center" 
            alignItems="center" 
            height="120px"
            bgcolor="grey.100"
          >
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box 
            sx={{ 
              height: '120px', 
              backgroundImage: `url(${imageSrc})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: 1,
              cursor: 'pointer'
            }}
            onClick={onSeek}
          />
        )}
        
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" display="block">
            Frame #{frame.frame_number}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {formatTime(frame.timestamp_seconds)}
          </Typography>
          
          <Box display="flex" justifyContent="space-between" mt={1}>
            <Tooltip title="Annotate Frame">
              <IconButton size="small" onClick={onView} color="primary">
                <ViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Frame">
              <IconButton size="small" onClick={onDelete} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};