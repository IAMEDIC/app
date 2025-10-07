import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Typography,
  Alert
} from '@mui/material';
import {
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Crop as CropIcon,
  Save as SaveIcon,
  RestartAlt as ResetIcon
} from '@mui/icons-material';
import { useTranslation } from '@/contexts/LanguageContext';

interface StreamCropModalProps {
  open: boolean;
  onClose: () => void;
  videoStream: MediaStream;
  onCropApplied: (cropArea: CropArea | null) => void;
  initialCropArea?: CropArea | null;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const StreamCropModal: React.FC<StreamCropModalProps> = ({
  open,
  onClose,
  videoStream,
  onCropApplied,
  initialCropArea
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // State management
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropArea, setCropArea] = useState<CropArea | null>(initialCropArea || null);
  const [cropStartPoint, setCropStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // Reset modal state when opening/closing
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setCropArea(initialCropArea || null);
      setCropStartPoint(null);
      // Auto-enable crop mode if there's an existing crop area to allow modification
      setIsCropMode(!!initialCropArea);
      setIsSelecting(false);
      setError(null);
      setVideoReady(false);
    } else {
      // Clean up when modal closes
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    }
  }, [open, initialCropArea]);

  // Setup video stream when modal opens
  useEffect(() => {
    if (open && videoRef.current && videoStream) {
      const video = videoRef.current;
      
      // Reset video ready state
      setVideoReady(false);
      setError(null);
      
      // Clean up any existing stream first
      if (video.srcObject) {
        video.pause();
        video.srcObject = null;
      }
      
      // Set the video source
      video.srcObject = videoStream;
      
      // Attempt to play with better error handling
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Only log errors that aren't AbortError (which is normal)
          if (err.name !== 'AbortError') {
            console.error('Failed to play video:', err);
            setError(`Failed to display video stream: ${err.message}`);
          }
        });
      }
      
      // Use a timer-based approach to check video readiness
      // This works better than events when MediaStream is shared
      const checkVideoReady = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          setVideoReady(true);
          return true;
        }
        return false;
      };
      
      // Check immediately
      if (!checkVideoReady()) {
        // If not ready, check every 100ms for up to 10 seconds
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds
        
        const checkInterval = setInterval(() => {
          attempts++;
          
          if (checkVideoReady() || attempts >= maxAttempts) {
            clearInterval(checkInterval);
            if (attempts >= maxAttempts) {
              setError('Video dimensions not detected, but video may still work');
            }
          }
        }, 100);
        
        // Cleanup interval on unmount
        return () => {
          clearInterval(checkInterval);
        };
      }
    }
  }, [open, videoStream]);

  // Draw canvas with video, zoom, pan, and crop overlay
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Check video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    // Clear canvas regardless
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If video has no dimensions, show placeholder
    if (videoWidth === 0 || videoHeight === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        videoReady ? 'Video ready but no dimensions' : 'Loading video...', 
        canvas.width / 2, 
        canvas.height / 2
      );
      return;
    }
    
    // Video has dimensions, try to draw it even if videoReady is false
    // Save context for transformations
    ctx.save();

    // Apply transformations
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);
    
    // Draw video centered
    try {
      ctx.drawImage(video, -videoWidth / 2, -videoHeight / 2, videoWidth, videoHeight);
    } catch (err) {
      // Fallback: try to draw a placeholder if video fails
      ctx.fillStyle = '#333';
      ctx.fillRect(-videoWidth / 2, -videoHeight / 2, videoWidth, videoHeight);
      ctx.fillStyle = 'white';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Video Error', 0, 0);
    }

    // Restore context
    ctx.restore();

    // Draw crop area if in crop mode and area is selected
    if (isCropMode && cropArea) {
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      // Convert crop area from video coordinates to canvas coordinates inline
      const centerX = canvas.width / 2 + panX;
      const centerY = canvas.height / 2 + panY;
      const canvasX = (cropArea.x - videoWidth / 2) * zoom + centerX;
      const canvasY = (cropArea.y - videoHeight / 2) * zoom + centerY;
      const canvasWidth = cropArea.width * zoom;
      const canvasHeight = cropArea.height * zoom;
      
      ctx.strokeRect(canvasX, canvasY, canvasWidth, canvasHeight);
      
      // Semi-transparent overlay outside crop area
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(canvasX, canvasY, canvasWidth, canvasHeight);
      ctx.restore();
    }
  }, [zoom, panX, panY, isCropMode, cropArea, videoReady]);

  // Start continuous video rendering to canvas
  const startVideoRendering = useCallback(() => {
    const renderFrame = () => {
      if (!open) {
        return;
      }
      
      // Always try to draw canvas (it handles its own state)
      drawCanvas();
      
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(renderFrame);
  }, [open, drawCanvas]);

  // Start rendering when modal opens
  useEffect(() => {
    if (open) {
      startVideoRendering();
    }
  }, [open, startVideoRendering]);

  // Stop video rendering
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Convert canvas coordinates to video coordinates
  const canvasToVideoCoordinates = useCallback((canvasX: number, canvasY: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return { x: 0, y: 0 };

    // Use video dimensions even if videoReady is false, as long as we have dimensions
    const videoWidth = video.videoWidth || 640; // fallback dimensions
    const videoHeight = video.videoHeight || 480;
    
    if (videoWidth === 0 || videoHeight === 0) return { x: 0, y: 0 };

    // Transform to video coordinates
    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    
    const videoX = (canvasX - centerX) / zoom + videoWidth / 2;
    const videoY = (canvasY - centerY) / zoom + videoHeight / 2;
    
    return { x: videoX, y: videoY };
  }, [zoom, panX, panY]);



  // Get mouse position relative to canvas
  const getCanvasMousePos = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Handle mouse events for pan and crop selection
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const canvasPos = getCanvasMousePos(e);
    
    if (!isCropMode) {
      // Pan mode
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    } else {
      // Crop selection mode - always start a new selection, replacing existing crop
      setIsSelecting(true);
      const startPoint = canvasToVideoCoordinates(canvasPos.x, canvasPos.y);
      setCropStartPoint(startPoint);
      // Start with a fresh crop area - this will replace any existing one
      setCropArea({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (isDragging && !isCropMode) {
      // Pan
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    } else if (isSelecting && isCropMode && cropStartPoint) {
      // Crop selection - handle reflections properly
      const canvasPos = getCanvasMousePos(e);
      const currentPoint = canvasToVideoCoordinates(canvasPos.x, canvasPos.y);
      
      // Calculate proper rectangle regardless of drag direction
      const left = Math.min(cropStartPoint.x, currentPoint.x);
      const top = Math.min(cropStartPoint.y, currentPoint.y);
      const right = Math.max(cropStartPoint.x, currentPoint.x);
      const bottom = Math.max(cropStartPoint.y, currentPoint.y);
      
      // Ensure the crop area is within video bounds
      const video = videoRef.current;
      if (video && (video.videoWidth > 0 && video.videoHeight > 0)) {
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        const clampedLeft = Math.max(0, Math.min(left, videoWidth));
        const clampedTop = Math.max(0, Math.min(top, videoHeight));
        const clampedRight = Math.max(clampedLeft, Math.min(right, videoWidth));
        const clampedBottom = Math.max(clampedTop, Math.min(bottom, videoHeight));
        
        setCropArea({
          x: clampedLeft,
          y: clampedTop,
          width: clampedRight - clampedLeft,
          height: clampedBottom - clampedTop
        });
      } else {
        // Fallback when video dimensions aren't available yet
        setCropArea({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top
        });
      }
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsDragging(false);
    setIsSelecting(false);
    setCropStartPoint(null);
  };

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));
    setZoom(newZoom);
  };

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(5, prev * 1.2));
  const handleZoomOut = () => setZoom(prev => Math.max(0.1, prev / 1.2));
  const handleReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setCropArea(null);
    setCropStartPoint(null);
    setIsSelecting(false);
  };

  // Clear crop area without closing modal
  const handleClearCrop = () => {
    setCropArea(null);
    setCropStartPoint(null);
    setIsSelecting(false);
    setError(null);
  };

  // Toggle crop mode
  const handleToggleCropMode = () => {
    const newCropMode = !isCropMode;
    setIsCropMode(newCropMode);
    
    // Reset selection state when toggling crop mode
    setIsSelecting(false);
    setCropStartPoint(null);
    
    // Only clear crop area when exiting crop mode (not when entering)
    if (!newCropMode) {
      setCropArea(null);
    }
    
    setError(null);
  };

  // Apply crop settings
  const handleApplyCrop = () => {
    const video = videoRef.current;
    if (!video) {
      setError('Video element not found');
      return;
    }

    if (!videoReady || video.videoWidth === 0 || video.videoHeight === 0) {
      setError(`Video not ready. Ready: ${videoReady}, Dimensions: ${video.videoWidth}x${video.videoHeight}`);
      return;
    }

    let finalCropArea = cropArea;

    // Validate crop area if it exists
    if (finalCropArea) {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // Ensure crop area is within video bounds
      finalCropArea = {
        x: Math.max(0, Math.min(finalCropArea.x, videoWidth)),
        y: Math.max(0, Math.min(finalCropArea.y, videoHeight)),
        width: Math.min(finalCropArea.width, videoWidth - finalCropArea.x),
        height: Math.min(finalCropArea.height, videoHeight - finalCropArea.y)
      };

      // Ensure minimum crop size
      if (finalCropArea.width < 50 || finalCropArea.height < 50) {
        setError('Crop area must be at least 50x50 pixels');
        return;
      }
    }

    onCropApplied(finalCropArea);
    onClose();
  };

  // Remove crop
  const handleRemoveCrop = () => {
    setCropArea(null);
    setCropStartPoint(null);
    setIsSelecting(false);
    setIsCropMode(false);
    onCropApplied(null);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { height: '90vh', maxHeight: '90vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="between" alignItems="center">
          <Typography variant="h6">
            {t('streaming.cropVideo')}
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
            <Button
              variant={isCropMode ? 'contained' : 'outlined'}
              onClick={handleToggleCropMode}
              startIcon={<CropIcon />}
              size="small"
            >
              {isCropMode ? t('streaming.exitCropMode') : t('streaming.cropMode')}
            </Button>
            
            {cropArea && (
              <Button
                variant="outlined"
                onClick={handleClearCrop}
                color="warning"
                size="small"
              >
                Clear Crop
              </Button>
            )}
            
            <Box display="flex" gap={0.5}>
              <IconButton onClick={handleZoomOut} disabled={zoom <= 0.1}>
                <ZoomOutIcon />
              </IconButton>
              <IconButton onClick={handleZoomIn} disabled={zoom >= 5}>
                <ZoomInIcon />
              </IconButton>
              <IconButton onClick={handleReset}>
                <ResetIcon />
              </IconButton>
            </Box>

            <Typography variant="body2" sx={{ ml: 1 }}>
              {t('streaming.zoom')}: {(zoom * 100).toFixed(0)}%
            </Typography>
            
            {/* Debug info */}
            <Typography variant="caption" sx={{ ml: 2, color: 'text.secondary' }}>
              Ready: {videoReady ? 'Yes' : 'No'} | 
              {videoRef.current ? `${videoRef.current.videoWidth}x${videoRef.current.videoHeight}` : 'No video'}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </Box>

        {/* Canvas Container */}
        <Box 
          flex={1} 
          sx={{ 
            position: 'relative', 
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: '#f5f5f5',
            userSelect: 'none',
            touchAction: 'none'
          }}
        >
          <video
            ref={videoRef}
            style={{ display: 'none' }}
            autoPlay
            muted
            playsInline
          />

                    {/* Hidden helper video for stream detection - keeps functionality working */}
          <video
            autoPlay
            muted
            playsInline
            style={{
              position: 'absolute',
              top: -1000,
              left: -1000,
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
              zIndex: -1
            }}
            ref={(debugVideoRef) => {
              if (debugVideoRef && videoStream) {
                // Clean up any existing stream first
                if (debugVideoRef.srcObject) {
                  debugVideoRef.pause();
                  debugVideoRef.srcObject = null;
                }
                
                debugVideoRef.srcObject = videoStream;
                
                // Use debug video to help detect when video is ready
                const checkDebugVideo = () => {
                  if (debugVideoRef.videoWidth > 0 && debugVideoRef.videoHeight > 0) {
                    
                    // If main video doesn't have dimensions but debug video does, force it
                    if (videoRef.current && videoRef.current.videoWidth === 0) {
                      
                      // Try to clone the stream to the main video
                      try {
                        if (videoRef.current.srcObject !== videoStream) {
                          videoRef.current.srcObject = videoStream;
                        }
                        const playPromise = videoRef.current.play();
                        if (playPromise !== undefined) {
                          playPromise.catch(err => {
                            if (err.name !== 'AbortError') {
                              console.error('Error playing main video:', err);
                            }
                          });
                        }
                        
                        // Force videoReady after a short delay
                        setTimeout(() => {
                          setVideoReady(true);
                        }, 500);
                      } catch (err) {
                        console.error('Error re-assigning stream to main video:', err);
                      }
                    }
                  }
                };
                
                debugVideoRef.addEventListener('loadedmetadata', checkDebugVideo);
                debugVideoRef.addEventListener('loadeddata', checkDebugVideo);
                debugVideoRef.addEventListener('canplay', checkDebugVideo);
                
                // Start checking with a delay to allow stream to stabilize
                setTimeout(checkDebugVideo, 200);
                const interval = setInterval(checkDebugVideo, 2000);
                setTimeout(() => clearInterval(interval), 10000); // Stop after 10 seconds
              }
            }}
          />
          

          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{
              cursor: isCropMode ? 'crosshair' : isDragging ? 'grabbing' : 'grab',
              maxWidth: '100%',
              maxHeight: '100%'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {t('common.cancel')}
        </Button>
        {cropArea && (
          <Button
            variant="outlined"
            onClick={handleRemoveCrop}
            color="error"
          >
            {t('streaming.removeCrop')}
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleApplyCrop}
          startIcon={<SaveIcon />}
        >
          {t('streaming.applyCrop')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export type { CropArea };