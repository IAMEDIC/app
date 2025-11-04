import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  SkipPrevious as SkipPreviousIcon,
  SkipNext as SkipNextIcon,
  FastRewind as FastRewindIcon,
  FastForward as FastForwardIcon,
} from '@mui/icons-material';
import { frameService } from '@/services/frameService';
import { useTranslation } from '@/contexts/LanguageContext';
import { Frame, VideoMetadata } from '@/types/frame';
import { AnnotationsTab } from './AnnotationsTab';
import { AnnotationStatusChip } from './AnnotationStatusChip';
import api from '@/services/api';
import { 
  AutoExtractionParams, 
  AutoExtractionRequest,
  DEFAULT_AUTO_EXTRACTION_PARAMS
} from '@/types/autoExtraction';

interface VideoPlayerWithFramesProps {
  videoSrc: string;
  studyId: string;
  videoId: string;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt?: string;
  onAnnotationsSaved?: () => void;
}

export const VideoPlayerWithFrames: React.FC<VideoPlayerWithFramesProps> = ({
  videoSrc,
  studyId,
  videoId,
  fileSize,
  mimeType,
  createdAt,
  onAnnotationsSaved,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [frameAnnotationRefresh, setFrameAnnotationRefresh] = useState(0);
  const [frameAnnotationsChanged, setFrameAnnotationsChanged] = useState(false);
  
  // Auto extraction state
  const [autoExtracting, setAutoExtracting] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [autoParams, setAutoParams] = useState<AutoExtractionParams>(DEFAULT_AUTO_EXTRACTION_PARAMS);

  // Callback to track when frame annotations are saved
  const handleFrameAnnotationsSaved = useCallback(() => {
    console.log('🎯 Frame annotations saved, setting flag');
    setFrameAnnotationsChanged(true);
  }, []);

  // Handle closing frame annotation dialog
  const handleCloseFrameDialog = useCallback(() => {
    console.log('🚪 Closing frame dialog, frameAnnotationsChanged:', frameAnnotationsChanged);
    setSelectedFrame(null);
    // Trigger refresh of frame annotation statuses
    setFrameAnnotationRefresh(prev => prev + 1);
    // Notify parent to reload study only if annotations were changed
    if (frameAnnotationsChanged) {
      console.log('✅ Calling parent onAnnotationsSaved');
      onAnnotationsSaved?.();
      setFrameAnnotationsChanged(false);
    } else {
      console.log('⏭️ Skipping parent callback (no changes)');
    }
  }, [frameAnnotationsChanged, onAnnotationsSaved]);

  // Load video metadata and existing frames
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load video metadata (including FPS)
        const metadata = await frameService.getVideoMetadata(studyId, videoId);
        setVideoMetadata(metadata);
        
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

  // Frame advancement functions
  const advanceOneFrame = () => {
    if (videoRef.current && duration > 0 && videoMetadata) {
      // Use actual FPS from video metadata
      const frameTime = 1 / videoMetadata.fps;
      const newTime = Math.min(currentTime + frameTime, duration);
      seekToTime(newTime);
    }
  };

  const rewindOneFrame = () => {
    if (videoRef.current && videoMetadata) {
      // Use actual FPS from video metadata
      const frameTime = 1 / videoMetadata.fps;
      const newTime = Math.max(currentTime - frameTime, 0);
      seekToTime(newTime);
    }
  };

  const advanceLargeStep = () => {
    if (videoRef.current && duration > 0) {
      // Large step: 5 seconds
      const stepSize = 5;
      const newTime = Math.min(currentTime + stepSize, duration);
      seekToTime(newTime);
    }
  };

  const rewindLargeStep = () => {
    if (videoRef.current) {
      // Large step: 5 seconds
      const stepSize = 5;
      const newTime = Math.max(currentTime - stepSize, 0);
      seekToTime(newTime);
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
      // Trigger parent reload to update video annotation status
      onAnnotationsSaved?.();
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
        {/* Left Container: Video Player and Info */}
        <Grid size={{ xs: 12, lg: 7 }}>
          {/* Video Player */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Video Player
              </Typography>
              <video
                ref={videoRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                preload="metadata"
                style={{ 
                  width: '100%', 
                  height: 'auto',
                  maxHeight: '500px',
                  objectFit: 'contain',
                  backgroundColor: '#000'
                }}
              >
                {/* Progressive streaming source (preferred) */}
                <source src={`/api/studies/${studyId}/media/${videoId}/video-stream`} type="video/mp4" />
                {/* Fallback to cached blob */}
                <source src={videoSrc} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              
              {/* Video Controls */}
              <Box sx={{ mt: 2 }}>
                <Box display="flex" alignItems="center" gap={1} mb={1} flexWrap="wrap">
                  <IconButton onClick={togglePlayPause} color="primary">
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </IconButton>
                  
                  {/* Frame Advancement Controls */}
                  <Box display="flex" alignItems="center" gap={0.5} sx={{ mx: 1 }}>
                    <Tooltip title={t('components.videoPlayer.rewindLarge')}>
                      <IconButton onClick={rewindLargeStep} size="small" color="primary">
                        <FastRewindIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('components.videoPlayer.rewindFrame')}>
                      <IconButton onClick={rewindOneFrame} size="small" color="primary">
                        <SkipPreviousIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('components.videoPlayer.advanceFrame')}>
                      <IconButton onClick={advanceOneFrame} size="small" color="primary">
                        <SkipNextIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('components.videoPlayer.advanceLarge')}>
                      <IconButton onClick={advanceLargeStep} size="small" color="primary">
                        <FastForwardIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  
                  <Typography variant="body2" sx={{ mx: 1 }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </Typography>
                  
                  <Button
                    variant="contained"
                    startIcon={<ExtractIcon />}
                    onClick={extractCurrentFrame}
                    disabled={extracting}
                    color="secondary"
                    size="small"
                  >
                    {extracting ? t('components.videoPlayer.extracting') : t('components.videoPlayer.extractFrame')}
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

              {/* Video Metadata */}
              {(fileSize || mimeType || createdAt) && (
                <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">
                    {fileSize && `${t('storage.used')}: ${formatFileSize(fileSize)}`}
                    {mimeType && ` | ${t('media.type', { defaultValue: 'Tipo' })}: ${mimeType}`}
                    {createdAt && ` | ${t('studyView.created', { defaultValue: 'Creado' })}: ${formatDate(createdAt)}`}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Container: Frame Extraction and Frame List (Scrollable) */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Box 
            sx={{ 
              maxHeight: 'calc(100vh - 200px)', 
              overflowY: 'auto',
              pr: 1,
              '&::-webkit-scrollbar': {
                width: '8px',
              },
              '&::-webkit-scrollbar-track': {
                backgroundColor: 'grey.100',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: 'grey.400',
                borderRadius: '4px',
                '&:hover': {
                  backgroundColor: 'grey.500',
                },
              },
            }}
          >
            {/* Automatic Frame Extraction */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('components.videoPlayer.aiFrameExtraction')}
                </Typography>
                
                <Button
                  variant="contained"
                  color="primary"
                  onClick={autoExtractFrames}
                  disabled={autoExtracting}
                  startIcon={autoExtracting ? <CircularProgress size={20} /> : <AutoIcon />}
                  sx={{ mb: 2 }}
                  fullWidth
                >
                  {autoExtracting ? t('components.videoPlayer.extracting') : t('components.videoPlayer.autoExtractFrames')}
                </Button>
                
                <Accordion expanded={showAdvancedSettings} onChange={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="subtitle2">{t('components.videoPlayer.advancedSettings')}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
                      {/* Prediction Threshold */}
                      <Grid size={{ xs: 12 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Typography variant="body2">{t('components.videoPlayer.predictionThreshold')}: {autoParams.prediction_threshold}</Typography>
                          <Tooltip title={t('components.videoPlayer.predictionThresholdDesc')}>
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
                      </Grid>

                      {/* Run Threshold */}
                      <Grid size={{ xs: 12 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Typography variant="body2">{t('components.videoPlayer.runThreshold')}: {autoParams.run_threshold}</Typography>
                          <Tooltip title={t('components.videoPlayer.runThresholdDesc')}>
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
                      </Grid>
                      
                      {/* Min Run Length */}
                      <Grid size={{ xs: 12 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Typography variant="body2">{t('components.videoPlayer.minRunLength')}</Typography>
                          <Tooltip title={t('components.videoPlayer.minRunLengthDesc')}>
                            <InfoIcon fontSize="small" color="action" />
                          </Tooltip>
                        </Box>
                        <TextField
                          type="number"
                          value={autoParams.min_run_length}
                          onChange={(e) => setAutoParams(prev => ({ ...prev, min_run_length: parseInt(e.target.value) || 1 }))}
                          size="small"
                          fullWidth
                          slotProps={{htmlInput: { min: 1, max: 50 }}}
                        />
                      </Grid>
                      
                      {/* Patience */}
                      <Grid size={{ xs: 12 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                          <Typography variant="body2">{t('components.videoPlayer.patience')}</Typography>
                          <Tooltip title={t('components.videoPlayer.patienceDesc')}>
                            <InfoIcon fontSize="small" color="action" />
                          </Tooltip>
                        </Box>
                        <TextField
                          type="number"
                          value={autoParams.patience}
                          onChange={(e) => setAutoParams(prev => ({ ...prev, patience: parseInt(e.target.value) || 0 }))}
                          size="small"
                          fullWidth
                          slotProps={{htmlInput: { min: 1, max: 20 }}}
                        />
                      </Grid>
                    </Grid>
                  </AccordionDetails>
                </Accordion>
              </CardContent>
            </Card>

            {/* Frame List */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('components.videoPlayer.extractedFrames')} ({frames.length})
                </Typography>
                
                {frames.length === 0 ? (
                  <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                    {t('components.videoPlayer.noFramesExtracted')}
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    {frames.map((frame) => (
                      <Grid size={{ xs: 12, sm: 6 }} key={frame.id}>
                        <FrameCard
                          frame={frame}
                          onView={() => setSelectedFrame(frame)}
                          onDelete={() => deleteFrame(frame.id)}
                          onSeek={() => seekToTime(frame.timestamp_seconds)}
                          refreshTrigger={frameAnnotationRefresh}
                        />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>

      {/* Frame Annotation Modal */}
      <Dialog
        open={!!selectedFrame}
        onClose={handleCloseFrameDialog}
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
                <IconButton onClick={handleCloseFrameDialog}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent sx={{ height: '80vh', overflow: 'hidden', p: 0 }}>
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
                onAnnotationsSaved={handleFrameAnnotationsSaved}
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
  refreshTrigger: number;
}

const FrameCard: React.FC<FrameCardProps> = ({ frame, onView, onDelete, onSeek, refreshTrigger }) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(true);
  const [hasAnnotations, setHasAnnotations] = useState<boolean | null>(null);

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

  useEffect(() => {
    const fetchAnnotationStatus = async () => {
      try {
        const response = await api.get<{ media_id: string; has_annotations: boolean }>(
          `/media/${frame.frame_media_id}/has-annotations`
        );
        setHasAnnotations(response.data.has_annotations);
      } catch (error) {
        console.error('Failed to fetch annotation status:', error);
        setHasAnnotations(false);
      }
    };

    fetchAnnotationStatus();
  }, [frame.frame_media_id, refreshTrigger]);

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
        
        <Box sx={{ px: 1, pt: 1 }}>
          <AnnotationStatusChip hasAnnotations={hasAnnotations} size="small" />
        </Box>
        
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