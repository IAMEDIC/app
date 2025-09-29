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
  Dialog,
  DialogContent,
  DialogTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Slider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  CameraAlt as ExtractIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
  SmartButton as AutoIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { frameService } from '@/services/frameService';
import { Frame } from '@/types/frame';
import { AnnotationsTab } from './AnnotationsTab';
import { 
  AutoExtractionParams, 
  AutoExtractionRequest,
  DEFAULT_AUTO_EXTRACTION_PARAMS,
  PARAMETER_DESCRIPTIONS 
} from '@/types/autoExtraction';

interface VideoPlayerWithFramesProps {
  videoSrc: string;
  studyId: string;
  videoId: string;
}

export const VideoPlayerWithFrames: React.FC<VideoPlayerWithFramesProps> = ({
  videoSrc,
  studyId,
  videoId,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  
  // Auto extraction state
  const [autoExtracting, setAutoExtracting] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [autoParams, setAutoParams] = useState<AutoExtractionParams>(DEFAULT_AUTO_EXTRACTION_PARAMS);

  // Load video metadata and existing frames
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load existing frames
        const framesResponse = await frameService.listVideoFrames(studyId, videoId);
        setFrames(framesResponse.frames);
        
      } catch (err) {
        console.error('Failed to load video data:', err);
        setError('Failed to load video information.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [studyId, videoId]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle video metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Toggle play/pause
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
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
        timestamp_seconds: Math.round(currentTime * 1000) / 1000, // Round to milliseconds
      });
      
      // Show appropriate message based on the response
      if (response.message.includes('already exists')) {
        setError('Frame already exists at this timestamp');
        // Don't update the list - frame already exists
        return;
      } else if (response.message.includes('reactivated')) {
        setError('Frame reactivated (previous annotations were cleared)');
        // For reactivated frames, update the existing frame in the list
        setFrames(prev => {
          const existingIndex = prev.findIndex(f => f.id === response.frame.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = response.frame;
            return updated.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
          } else {
            // If somehow the frame is not in the list, add it
            return [...prev, response.frame].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
          }
        });
      } else {
        // New frame extracted successfully
        setFrames(prev => [...prev, response.frame].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
        console.log('Frame extracted successfully:', response.message);
      }
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
      setError('Failed to delete frame. Please try again.');
    }
  };

  // Auto extract frames using AI
  const autoExtractFrames = async () => {
    try {
      setAutoExtracting(true);
      setError(null);
      
      const request: AutoExtractionRequest = {
        params: autoParams,
        force_reprocess: false
      };
      
      const response = await frameService.autoExtractFrames(studyId, videoId, request);
      
      // Add new frames to the list, avoiding duplicates
      setFrames(prev => {
        const existingIds = new Set(prev.map(f => f.id));
        const newFrames = response.frames.filter(f => !existingIds.has(f.id));
        const combined = [...prev, ...newFrames];
        return combined.sort((a, b) => a.timestamp_seconds - b.timestamp_seconds);
      });
      
      // Show success message with statistics
      const message = `${response.message}. Analyzed ${response.total_frames_analyzed} frames, found ${response.runs_found} runs, extracted ${response.compliant_frames} compliant frames.`;
      console.log('Auto extraction completed:', message);
      
    } catch (err) {
      console.error('Failed to auto extract frames:', err);
      setError('Failed to auto extract frames. Please try again.');
    } finally {
      setAutoExtracting(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="500px">
        <CircularProgress size={40} />
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

      <Grid container spacing={3}>
        {/* Auto Extraction Controls - Left Side */}
        <Grid item xs={12} lg={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                AI Frame Extraction
              </Typography>
              
              <Button
                variant="contained"
                color="primary"
                onClick={autoExtractFrames}
                disabled={autoExtracting}
                startIcon={autoExtracting ? <CircularProgress size={20} /> : <AutoIcon />}
                fullWidth
                sx={{ mb: 2 }}
              >
                {autoExtracting ? 'Extracting...' : 'Auto Extract Frames'}
              </Button>
              
              <Accordion expanded={showAdvancedSettings} onChange={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">Advanced Settings</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box display="flex" flexDirection="column" gap={2}>
                    {/* Run Threshold */}
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">Run Threshold: {autoParams.run_threshold}</Typography>
                        <Tooltip title={PARAMETER_DESCRIPTIONS.run_threshold}>
                          <InfoIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                      <Slider
                        value={autoParams.run_threshold}
                        onChange={(_, value) => setAutoParams(prev => ({ ...prev, run_threshold: value as number }))}
                        min={0}
                        max={1}
                        step={0.05}
                        size="small"
                      />
                    </Box>
                    
                    {/* Min Run Length */}
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">Min Run Length</Typography>
                        <Tooltip title={PARAMETER_DESCRIPTIONS.min_run_length}>
                          <InfoIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                      <TextField
                        type="number"
                        value={autoParams.min_run_length}
                        onChange={(e) => setAutoParams(prev => ({ ...prev, min_run_length: parseInt(e.target.value) || 1 }))}
                        size="small"
                        fullWidth
                        inputProps={{ min: 1, max: 50 }}
                      />
                    </Box>
                    
                    {/* Prediction Threshold */}
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">Prediction Threshold: {autoParams.prediction_threshold}</Typography>
                        <Tooltip title={PARAMETER_DESCRIPTIONS.prediction_threshold}>
                          <InfoIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                      <Slider
                        value={autoParams.prediction_threshold}
                        onChange={(_, value) => setAutoParams(prev => ({ ...prev, prediction_threshold: value as number }))}
                        min={0}
                        max={1}
                        step={0.05}
                        size="small"
                      />
                    </Box>
                    
                    {/* Patience */}
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2">Patience</Typography>
                        <Tooltip title={PARAMETER_DESCRIPTIONS.patience}>
                          <InfoIcon fontSize="small" color="action" />
                        </Tooltip>
                      </Box>
                      <TextField
                        type="number"
                        value={autoParams.patience}
                        onChange={(e) => setAutoParams(prev => ({ ...prev, patience: parseInt(e.target.value) || 0 }))}
                        size="small"
                        fullWidth
                        inputProps={{ min: 0, max: 20 }}
                      />
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </CardContent>
          </Card>
        </Grid>

        {/* Video Player - Center */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <video
                ref={videoRef}
                src={videoSrc}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                style={{ 
                  width: '100%', 
                  height: 'auto',
                  maxHeight: '500px',
                  objectFit: 'contain',
                  backgroundColor: '#000'
                }}
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
        </Grid>

        {/* Extracted Frames - Right Side */}
        <Grid item xs={12} lg={3}>
          <Card sx={{ height: 'fit-content' }}>
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
                    <Grid item xs={12} sm={6} key={frame.id}>
                      <FrameCard
                        frame={frame}
                        onView={() => setSelectedFrame(frame)}
                        onDelete={() => deleteFrame(frame.id)}
                        onSeek={() => seekToTime(frame.timestamp_seconds)}
                      />
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Frame Annotation Modal */}
      <Dialog
        open={!!selectedFrame}
        onClose={() => setSelectedFrame(null)}
        maxWidth="xl"
        fullWidth
      >
        {selectedFrame && (
          <>
            <DialogTitle>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">
                  Frame Annotations - {selectedFrame.timestamp_seconds.toFixed(3)}s
                </Typography>
                <IconButton onClick={() => setSelectedFrame(null)}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent>
              <AnnotationsTab 
                media={{
                  id: selectedFrame.frame_media_id,
                  filename: `Frame at ${selectedFrame.timestamp_seconds}s`,
                  media_type: 'image',
                  mime_type: 'image/jpeg',
                  file_size: 0,
                  created_at: selectedFrame.created_at,
                  upload_status: 'uploaded',
                  study_id: studyId,
                  is_active: true
                } as any}
                studyId={studyId}
              />
            </DialogContent>
          </>
        )}
      </Dialog>
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
              cursor: 'pointer',
              backgroundColor: '#000',
              overflow: 'hidden'
            }}
            onClick={onSeek}
          >
            <img 
              src={imageSrc} 
              alt={`Frame ${frame.frame_number}`}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
            />
          </Box>
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