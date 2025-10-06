import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  RadioButtonChecked as RecordIcon,
  Stop as StopIcon,
  Warning as WarningIcon,
  Videocam as VideocamIcon,
  Close as CloseIcon,
  Info as InfoIcon,
  LinkOff as DisconnectIcon,
} from '@mui/icons-material';
import { CameraSelector } from './CameraSelector';
import { useTranslation } from '@/contexts/LanguageContext';
import { Frame } from '@/types/frame';
import { AnnotationsTab } from './AnnotationsTab';
import { streamingService } from '@/services/streamingService';
import RealtimeConfidencePlot from './RealtimeConfidencePlot';

interface ConfidenceDataPoint {
  timestamp: number; // Relative time in seconds (-10 to 0)
  confidence: number; // 0 to 1
  absoluteTime: number; // Absolute timestamp for internal use
}

interface StreamingTabProps {
  studyId: string;
  onNewVideo?: (videoId: string) => void;
  isActive?: boolean;  // Whether this tab is currently active
}

interface StreamingStats {
  duration: number;
  fileSize: number;
  framesExtracted: number;
  isRecording: boolean;
}

const MAX_RECORDING_TIME = 30 * 60; // 30 minutes in seconds
const WARNING_TIME = 29 * 60; // Show warning 1 minute before

export const StreamingTab: React.FC<StreamingTabProps> = ({
  studyId,
  onNewVideo,
  isActive = true,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<number | null>(null);
  const frameProcessingRef = useRef<number | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Stream and recording state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Recording state
  const [stats, setStats] = useState<StreamingStats>({
    duration: 0,
    fileSize: 0,
    framesExtracted: 0,
    isRecording: false,
  });
  
  // Video processing state

  const [streamingSessionId, setStreamingSessionId] = useState<string | null>(null);
  
  // Frames state
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [processingFrame, setProcessingFrame] = useState(false);
  
  // Confidence data for real-time plotting
  const [confidenceData, setConfidenceData] = useState<ConfidenceDataPoint[]>([]);
  
  // Batching mechanism for efficient chart updates
  const confidenceBufferRef = useRef<number[]>([]);
  const batchUpdateIntervalRef = useRef<number | null>(null);
  
  // Dialogs and warnings
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);



  // Function to buffer confidence data (batching for performance)
  const updateConfidenceData = (confidence: number) => {
    // Add to buffer instead of immediately updating state
    confidenceBufferRef.current.push(confidence);
  };

  // Batch update function to process buffered confidence data
  const flushConfidenceBuffer = () => {
    if (confidenceBufferRef.current.length === 0) return;

    // Get the latest confidence value from buffer (most recent)
    const latestConfidence = confidenceBufferRef.current[confidenceBufferRef.current.length - 1];
    
    // Clear buffer
    confidenceBufferRef.current = [];

    // Update chart data with the latest confidence value
    setConfidenceData(prev => {
      // Create a copy of the current array (100 elements)
      const updated = [...prev];
      
      // Remove first element and add new element at the end
      updated.shift();
      updated.push({
        timestamp: 0, // Will be recalculated below
        confidence: latestConfidence,
        absoluteTime: Date.now()
      });
      
      // Recalculate timestamps: -10 to 0 seconds (100 points = 0.1 second intervals)
      return updated.map((point, index) => ({
        ...point,
        timestamp: -10 + (index * 0.1) // -10 to 0 in 0.1 second steps
      }));
    });
  };
  
  // Initialize confidence data with 100 null points
  useEffect(() => {
    const initialData: ConfidenceDataPoint[] = Array.from({ length: 100 }, (_, index) => ({
      timestamp: -10 + (index * 0.1), // -10 to 0 in 0.1 second steps
      confidence: NaN, // Use NaN so recharts won't plot these points
      absoluteTime: 0
    }));
    setConfidenceData(initialData);
  }, []);

  // Start/stop batch update timer based on recording state
  useEffect(() => {
    if (stats.isRecording) {
      // Start batch update timer (500ms intervals)
      batchUpdateIntervalRef.current = setInterval(() => {
        flushConfidenceBuffer();
      }, 500);
    } else {
      // Stop batch update timer
      if (batchUpdateIntervalRef.current) {
        clearInterval(batchUpdateIntervalRef.current);
        batchUpdateIntervalRef.current = null;
      }
      // Clear any remaining buffer
      confidenceBufferRef.current = [];
    }

    // Cleanup on unmount
    return () => {
      if (batchUpdateIntervalRef.current) {
        clearInterval(batchUpdateIntervalRef.current);
        batchUpdateIntervalRef.current = null;
      }
    };
  }, [stats.isRecording]);



  // Update video source when camera stream changes
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Handle duration warnings
  useEffect(() => {
    if (stats.isRecording && stats.duration >= WARNING_TIME && !showWarningDialog) {
      setShowWarningDialog(true);
    }
    
    if (stats.isRecording && stats.duration >= MAX_RECORDING_TIME) {
      handleStopRecording();
    }
  }, [stats.duration, stats.isRecording, showWarningDialog]);

  // Use a ref to track the current camera stream to avoid dependency issues
  const cameraStreamRef = useRef<MediaStream | null>(null);
  
  // Update ref whenever cameraStream changes
  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  const cleanup = useCallback(async () => {
    
    // If recording is active and this isn't a forced cleanup, don't reset session info
    // The recording completion will handle session cleanup
    const isRecordingActive = mediaRecorderRef.current?.state === 'recording';
    const currentSessionId = streamingSessionId || currentSessionIdRef.current;
    
    // Stop intervals
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (frameProcessingRef.current) {
      clearTimeout(frameProcessingRef.current);
      frameProcessingRef.current = null;
    }
    
    // Clear batch update timer
    if (batchUpdateIntervalRef.current) {
      clearInterval(batchUpdateIntervalRef.current);
      batchUpdateIntervalRef.current = null;
    }
    
    // Clear confidence data and buffer
    confidenceBufferRef.current = [];
    setConfidenceData([]);

    // Stop media recorder if it's recording, but let it complete naturally
    if (isRecordingActive && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    
    // Reset recording state in UI
    setStats(prev => ({
      ...prev,
      isRecording: false,
    }));

    // Stop camera stream using ref to avoid dependency issues
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    // Reset setup state
    setIsSetupComplete(false);
    
    // Handle session cleanup - NEVER reset session info if recording is active
    if (isRecordingActive) {
      // Don't reset session info - let the recording completion handle it
    } else {
      
      // If there's an active session and no recording, cancel it
      if (currentSessionId) {
        try {
          await streamingService.cancelSession(currentSessionId);
        } catch (err) {
          console.warn('Failed to cancel streaming session:', err);
          // Don't throw - cleanup should always complete
        }
      }
      
      setStreamingSessionId(null);
      currentSessionIdRef.current = null;
    }
  }, []); // No dependencies to avoid infinite loops

  // Cleanup when tab becomes inactive  
  useEffect(() => {
    const handleInactive = async () => {
      if (!isActive) {
        await cleanup(); // Cleanup function will preserve session if recording is active
      }
    };
    
    handleInactive().catch(err => console.warn('Cleanup error:', err));
  }, [isActive, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Note: cleanup is async but unmount cleanup is sync
      // The async cleanup will run but we can't wait for it
      cleanup().catch(err => console.warn('Unmount cleanup error:', err)); 
    };
  }, [cleanup]);

  // Listen for page visibility changes (tab switching)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && cameraStreamRef.current) {
        await cleanup(); // Cleanup function will preserve session if recording is active
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cleanup]);

  const handleCameraSelected = async (_deviceId: string, stream: MediaStream) => {
    try {
      setCameraStream(stream);
      setIsSetupComplete(true);
      setError(null);
      
    } catch (err: any) {
      console.error('Failed to setup camera:', err);
      setError(t('streaming.sessionSetupError'));
    }
  };

  const handleCameraError = (error: string) => {
    setError(error);
    setIsSetupComplete(false);
  };

  const startRecording = async () => {
    if (!cameraStream || !isSetupComplete) {
      setError(t('streaming.cameraNotReady'));
      return;
    }

    try {
      setError(null);
      
      // Create streaming session on backend when recording starts
      let currentSessionId = streamingSessionId;
      if (!currentSessionId) {
        const response = await streamingService.createSession(studyId);
        currentSessionId = response.session_id;
        setStreamingSessionId(currentSessionId);
        currentSessionIdRef.current = currentSessionId;
      } else {
        // Also update ref if session already exists
        currentSessionIdRef.current = currentSessionId;
      }
      
      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(cameraStream, {
        mimeType: 'video/webm;codecs=vp8,opus', // Fallback to widely supported format
      });
      
      mediaRecorderRef.current = mediaRecorder;

      // Handle data availability
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && currentSessionId) {

          
          // Upload chunk to backend
          try {
            const response = await streamingService.uploadVideoChunk(currentSessionId, event.data);
            
            // Update file size with actual response size
            setStats(prev => ({
              ...prev,
              fileSize: prev.fileSize + response.size,
            }));
            
            // Check if we've hit the 1GB limit (backend will stop accepting chunks)
            const newFileSize = stats.fileSize + response.size;
            if (newFileSize >= 1024 * 1024 * 1024) {
              setError(t('streaming.fileSizeLimitReached'));
              handleStopRecording();
            }
            
          } catch (err: any) {
            console.error('Failed to upload video chunk:', err);
            
            // Handle different error scenarios
            if (err.response?.status === 400) {
              // Bad request - likely session issue, stop recording
              setError(t('streaming.chunkUploadError'));
              handleStopRecording();
            } else if (err.response?.status === 500) {
              // Server error - might be final chunk after finalization
              // Don't stop recording, just log the error
              console.warn('Server error on chunk upload (possibly final chunk after finalization)');
            } else if (err.code === 'ERR_NETWORK') {
              // Network error - show warning but continue recording
              console.warn('Network error on chunk upload, will retry on next chunk');
            } else {
              // Other errors - continue recording but show warning
              console.warn('Chunk upload error, continuing recording:', err.message);
            }
          }
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        handleRecordingComplete();
      };

      // Start recording
      mediaRecorder.start(1000); // Request chunks every 1 second
      
      setStats(prev => ({
        ...prev,
        isRecording: true,
        duration: 0,
        fileSize: 0,
      }));

      // Start duration timer
      intervalRef.current = setInterval(() => {
        setStats(prev => ({
          ...prev,
          duration: prev.duration + 1,
        }));
      }, 1000);

      // Start frame processing for AI (with delay to ensure state updates)
      setTimeout(() => {
        startFrameProcessing();
      }, 100);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      setError(t('streaming.recordingStartError'));
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (frameProcessingRef.current) {
      clearTimeout(frameProcessingRef.current);
      frameProcessingRef.current = null;
    }

    // Clear batch update timer
    if (batchUpdateIntervalRef.current) {
      clearInterval(batchUpdateIntervalRef.current);
      batchUpdateIntervalRef.current = null;
    }

    setStats(prev => ({
      ...prev,
      isRecording: false,
    }));
    
    // Reset confidence data to initial state when recording stops
    confidenceBufferRef.current = [];
    const initialData: ConfidenceDataPoint[] = Array.from({ length: 100 }, (_, index) => ({
      timestamp: -10 + (index * 0.1),
      confidence: NaN,
      absoluteTime: 0
    }));
    setConfidenceData(initialData);

    setShowWarningDialog(false);
  };

  const handleDisconnectCamera = async () => {
    // Stop any ongoing recording first
    if (stats.isRecording) {
      handleStopRecording();
    }
    
    // Clean up camera stream and session
    await cleanup(); // Force cleanup
    
    // Reset setup state to allow camera reselection  
    setIsSetupComplete(false);
  };

  const startFrameProcessing = () => {
    const processFrame = async () => {
      const isActuallyRecording = mediaRecorderRef.current?.state === 'recording';
      
      if (!canvasRef.current || !videoRef.current || !isActuallyRecording || !currentSessionIdRef.current) {
        return;
      }

      const video = videoRef.current;

      // Check if video has loaded and has dimensions
      if (video.readyState < 2) {
        return;
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      try {
        setProcessingFrame(true);
        
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;

        // Set canvas size to match video (downscaled for AI processing)
        const maxSize = 640;
        const aspectRatio = video.videoWidth / video.videoHeight;
        
        if (video.videoWidth > video.videoHeight) {
          canvas.width = maxSize;
          canvas.height = maxSize / aspectRatio;
        } else {
          canvas.width = maxSize * aspectRatio;
          canvas.height = maxSize;
        }

        // Draw current frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to blob for AI processing
        canvas.toBlob(async (blob) => {
          const sessionId = currentSessionIdRef.current;
          
          if (blob && sessionId) {
            try {
              const result = await streamingService.processFrame(
                sessionId, 
                blob, 
                stats.duration
              );
              
              // Update confidence data for real-time plotting
              if (result.confidence !== undefined) {
                updateConfidenceData(result.confidence);
              }
              
              if (result.frame_extracted && result.frame_id) {
                // Create a mock Frame object for display
                const newFrame: Frame = {
                  id: result.frame_id,
                  frame_media_id: result.frame_media_id || result.frame_id, // Use actual frame_media_id from backend
                  timestamp_seconds: stats.duration,
                  frame_number: stats.framesExtracted + 1,
                  width: canvas.width,
                  height: canvas.height,
                  is_active: true,
                  created_at: new Date().toISOString(),
                };
                
                setFrames(prev => [...prev, newFrame]);
                setStats(prev => ({ 
                  ...prev, 
                  framesExtracted: prev.framesExtracted + 1 
                }));
              }
            } catch (err) {
              console.error('🚨 Frame processing error:', err);
            }
          }
        }, 'image/jpeg', 0.8);
        
      } catch (err) {
        console.error('Error capturing frame:', err);
      } finally {
        setProcessingFrame(false);
      }
    };

    const scheduleNext = () => {
      // Check if we're actually recording using MediaRecorder state
      const isActuallyRecording = mediaRecorderRef.current?.state === 'recording';
      
      if (isActuallyRecording && currentSessionIdRef.current) {
        frameProcessingRef.current = setTimeout(() => {
          processFrame().then(scheduleNext);
        }, 100); // Process every 100ms as requested
      }
    };
    
    // Wait for recording to actually start, then begin processing
    const waitForRecording = () => {
      if (mediaRecorderRef.current?.state === 'recording' && currentSessionIdRef.current) {
        scheduleNext();
      } else {
        setTimeout(waitForRecording, 200);
      }
    };
    
    setTimeout(waitForRecording, 500); // Initial delay to let MediaRecorder start
  };

  const handleRecordingComplete = async () => {
    try {
      // Use ref to get session ID - should be more reliable than state
      const currentSessionId = streamingSessionId || currentSessionIdRef.current;
      
      if (!currentSessionId) {
        console.error('No active streaming session found. StreamingSessionId:', streamingSessionId);
        console.error('CurrentSessionIdRef value:', currentSessionIdRef.current);
        console.warn('Recording completed but session was already cleaned up. This might happen if tab was switched during recording.');
        return; // Gracefully handle missing session instead of throwing
      }

      // Add a small delay to allow final chunks to be uploaded
      // MediaRecorder can fire ondataavailable after onstop
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Finalize the streaming session
      const result = await streamingService.finalizeSession(currentSessionId);
      
      // Notify parent component about new video
      if (onNewVideo) {
        onNewVideo(result.video_media_id);
      }
      setStreamingSessionId(null);
      currentSessionIdRef.current = null;
      
    } catch (err: any) {
      console.error('Failed to complete recording:', err);
      setError(t('streaming.recordingCompleteError'));
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getRemainingTime = (): number => {
    return Math.max(0, MAX_RECORDING_TIME - stats.duration);
  };

  const getTimeColor = (): 'success' | 'warning' | 'error' => {
    const remaining = getRemainingTime();
    if (remaining > 5 * 60) return 'success'; // > 5 minutes
    if (remaining > 60) return 'warning'; // > 1 minute
    return 'error'; // <= 1 minute
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!isSetupComplete ? (
        <CameraSelector
          onCameraSelected={handleCameraSelected}
          onError={handleCameraError}
          disabled={stats.isRecording}
        />
      ) : (
        <Grid container spacing={3}>
          {/* Video Preview and Controls */}
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 2 }}>
              <Box display="flex" justifyContent="between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  {t('streaming.livePreview')}
                </Typography>
                <Box display="flex" gap={1}>
                  {stats.isRecording && (
                    <Chip
                      icon={<RecordIcon />}
                      label={t('streaming.recording')}
                      color="error"
                      variant="filled"
                    />
                  )}
                  <Chip
                    label={formatDuration(stats.duration)}
                    color={getTimeColor()}
                    variant="outlined"
                  />
                </Box>
              </Box>

              {/* Video Preview */}
              <Box position="relative" mb={2}>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  style={{
                    width: '100%',
                    maxHeight: '400px',
                    backgroundColor: '#000',
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{ display: 'none' }}
                />
                {processingFrame && (
                  <Box
                    position="absolute"
                    top={8}
                    right={8}
                    display="flex"
                    alignItems="center"
                    gap={1}
                    bgcolor="rgba(0,0,0,0.7)"
                    px={1}
                    py={0.5}
                    borderRadius={1}
                  >
                    <CircularProgress size={16} color="secondary" />
                    <Typography variant="caption" color="white">
                      {t('streaming.processingFrame')}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Recording Controls */}
              <Box display="flex" gap={2} alignItems="center">
                {stats.isRecording ? (
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => setShowStopDialog(true)}
                    startIcon={<StopIcon />}
                    size="large"
                  >
                    {t('streaming.stopRecording')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={startRecording}
                      startIcon={<RecordIcon />}
                      size="large"
                    >
                      {t('streaming.startRecording')}
                    </Button>
                    <Button
                      variant="outlined"
                      color="secondary"
                      onClick={handleDisconnectCamera}
                      startIcon={<DisconnectIcon />}
                      size="large"
                    >
                      {t('streaming.disconnectCamera')}
                    </Button>
                  </>
                )}

                <Box flexGrow={1} />

                <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
                  {t('streaming.fileSize')}: {formatFileSize(stats.fileSize)}
                </Typography>

                {/* Disconnect camera button moved next to Start Recording */}
              </Box>

              {/* Recording Progress */}
              {stats.isRecording && (
                <Box mt={2}>
                  <LinearProgress
                    variant="determinate"
                    value={(stats.duration / MAX_RECORDING_TIME) * 100}
                    color={getTimeColor()}
                  />
                  <Box display="flex" justifyContent="between" mt={1}>
                    <Typography variant="caption" color="text.secondary">
                      {t('streaming.timeRemaining')}: {formatDuration(getRemainingTime())}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('streaming.maxDuration')}: {formatDuration(MAX_RECORDING_TIME)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Frame Gallery */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>
              <Box display="flex" justifyContent="between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  {t('streaming.extractedFrames')} ({frames.length})
                </Typography>
                <Tooltip title={t('streaming.framesInfo')}>
                  <IconButton size="small">
                    <InfoIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              {frames.length === 0 ? (
                <Box textAlign="center" py={4}>
                  <VideocamIcon color="disabled" sx={{ fontSize: 48, mb: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    {stats.isRecording 
                      ? t('streaming.waitingForFrames')
                      : t('streaming.noFramesYet')
                    }
                  </Typography>
                </Box>
              ) : (
                <Grid container spacing={1}>
                  {frames.map((frame) => (
                    <Grid item xs={6} key={frame.id}>
                      <Card
                        sx={{ cursor: 'pointer' }}
                        onClick={() => setSelectedFrame(frame)}
                      >
                        <Box
                          component="img"
                          src={`/api/frames/${frame.id}/file`}
                          alt={`Frame ${frame.frame_number}`}
                          sx={{
                            width: '100%',
                            height: 80,
                            objectFit: 'cover',
                          }}
                        />
                        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                          <Typography variant="caption" display="block">
                            {formatDuration(Math.floor(frame.timestamp_seconds))}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Real-time Confidence Plot */}
      <RealtimeConfidencePlot 
        data={confidenceData}
        isRecording={stats.isRecording}
      />

      {/* Frame Annotation Dialog */}
      {selectedFrame && (
        <Dialog
          open={true}
          onClose={() => setSelectedFrame(null)}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>
            <Box display="flex" justifyContent="between" alignItems="center">
              <Typography variant="h6">
                {t('streaming.frameAnnotations')} - {t('streaming.frame')} {selectedFrame.frame_number}
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
                filename: `frame_${selectedFrame.frame_number}.jpg`,
                media_type: 'image' as const,
                file_size: 0,
                mime_type: 'image/jpeg',
                upload_status: 'uploaded' as const,
                created_at: new Date().toISOString(),
              }}
              studyId={studyId}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Warning Dialog */}
      <Dialog
        open={showWarningDialog}
        onClose={() => setShowWarningDialog(false)}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <WarningIcon color="warning" />
            {t('streaming.recordingTimeWarning')}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>
            {t('streaming.recordingTimeWarningMessage', { 
              timeRemaining: formatDuration(getRemainingTime()) 
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowWarningDialog(false)}>
            {t('common.continue')}
          </Button>
          <Button onClick={handleStopRecording} color="primary" variant="contained">
            {t('streaming.stopNow')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Stop Confirmation Dialog */}
      <Dialog
        open={showStopDialog}
        onClose={() => setShowStopDialog(false)}
      >
        <DialogTitle>{t('streaming.confirmStopRecording')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('streaming.confirmStopRecordingMessage', {
              duration: formatDuration(stats.duration),
              fileSize: formatFileSize(stats.fileSize),
              frames: stats.framesExtracted,
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowStopDialog(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleStopRecording} color="error" variant="contained">
            {t('streaming.stopRecording')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};