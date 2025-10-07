import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  CircularProgress,
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
import { mediaService } from '@/services/api';
import { useTranslation } from '@/contexts/LanguageContext';

interface ZoomCropModalProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  originalFilename: string;
  studyId: string;
  onCropSaved?: (newMediaId: string) => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ZoomCropModal: React.FC<ZoomCropModalProps> = ({
  open,
  onClose,
  imageSrc,
  originalFilename,
  studyId,
  onCropSaved
}) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // State management
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [cropStartPoint, setCropStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropFilename, setCropFilename] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate suggested filename
  const generateCropFilename = useCallback(() => {
    const baseName = originalFilename.replace(/\.[^/.]+$/, ''); // Remove extension
    let index = 1;
    let suggestion = `${baseName} - ${t('media.zoomCrop.cropNameSuffix')} ${index}`;
    
    // Note: In a real application, you might want to check existing filenames
    // For now, we'll just use a simple incrementing number
    return suggestion;
  }, [originalFilename, t]);

  // Handle keyboard events to prevent browser zoom
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Prevent browser zoom shortcuts
      if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0') {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, []);

  // Reset modal state when opening/closing
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPanX(0);
      setPanY(0);
      setCropArea(null);
      setCropStartPoint(null);
      setIsCropMode(false);
      setIsSelecting(false);
      setCropFilename(generateCropFilename());
      setError(null);
    }
  }, [open, generateCropFilename]);

  // Add keyboard event listener to prevent browser zoom when modal is open
  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [open, handleKeyDown]);

  // Draw canvas with zoom and pan
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.complete) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context for transformations
    ctx.save();

    // Apply transformations
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);
    
    // Draw image centered
    const imgWidth = image.naturalWidth;
    const imgHeight = image.naturalHeight;
    ctx.drawImage(image, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);

    // Restore context
    ctx.restore();

    // Draw crop area if in crop mode and area is selected
    if (isCropMode && cropArea) {
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      // Convert crop area from image coordinates to canvas coordinates
      const canvasCropArea = imageToCanvasCoordinates(cropArea);
      
      ctx.strokeRect(canvasCropArea.x, canvasCropArea.y, canvasCropArea.width, canvasCropArea.height);
      
      // Semi-transparent overlay outside crop area
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(canvasCropArea.x, canvasCropArea.y, canvasCropArea.width, canvasCropArea.height);
      ctx.restore();
    }
  }, [zoom, panX, panY, isCropMode, cropArea]);

  // Convert canvas coordinates to image coordinates
  const canvasToImageCoordinates = useCallback((canvasX: number, canvasY: number) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return { x: 0, y: 0 };

    // Transform to image coordinates
    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    
    const imageX = (canvasX - centerX) / zoom + image.naturalWidth / 2;
    const imageY = (canvasY - centerY) / zoom + image.naturalHeight / 2;
    
    return { x: imageX, y: imageY };
  }, [zoom, panX, panY]);

  // Convert image coordinates to canvas coordinates
  const imageToCanvasCoordinates = useCallback((imageArea: CropArea) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return { x: 0, y: 0, width: 0, height: 0 };

    const centerX = canvas.width / 2 + panX;
    const centerY = canvas.height / 2 + panY;
    
    const canvasX = (imageArea.x - image.naturalWidth / 2) * zoom + centerX;
    const canvasY = (imageArea.y - image.naturalHeight / 2) * zoom + centerY;
    const canvasWidth = imageArea.width * zoom;
    const canvasHeight = imageArea.height * zoom;
    
    return { x: canvasX, y: canvasY, width: canvasWidth, height: canvasHeight };
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
    const canvasPos = getCanvasMousePos(e);
    
    if (!isCropMode) {
      // Pan mode
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    } else {
      // Crop selection mode
      setIsSelecting(true);
      const startPoint = canvasToImageCoordinates(canvasPos.x, canvasPos.y);
      setCropStartPoint(startPoint);
      setCropArea({ x: startPoint.x, y: startPoint.y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && !isCropMode) {
      // Pan
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    } else if (isSelecting && isCropMode && cropStartPoint) {
      // Crop selection - handle reflections properly
      const canvasPos = getCanvasMousePos(e);
      const currentPoint = canvasToImageCoordinates(canvasPos.x, canvasPos.y);
      
      // Calculate proper rectangle regardless of drag direction
      const left = Math.min(cropStartPoint.x, currentPoint.x);
      const top = Math.min(cropStartPoint.y, currentPoint.y);
      const right = Math.max(cropStartPoint.x, currentPoint.x);
      const bottom = Math.max(cropStartPoint.y, currentPoint.y);
      
      setCropArea({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsSelecting(false);
    setCropStartPoint(null);
  };

  // Handle wheel zoom - prevent browser zoom conflicts
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow our custom zoom, ignore if Ctrl is pressed to prevent browser zoom conflicts
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    
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
  };

  // Toggle crop mode
  const handleToggleCropMode = () => {
    setIsCropMode(!isCropMode);
    setCropArea(null);
    setError(null);
  };

  // Save crop
  const handleSaveCrop = async () => {
    if (!cropArea || !imageRef.current || !cropFilename.trim()) {
      setError('Please select a crop area and provide a filename.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Create a new canvas for the cropped image
      const cropCanvas = document.createElement('canvas');
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) throw new Error(t('media.zoomCrop.failedToCreateCropCanvas'));

      // Set crop canvas size
      cropCanvas.width = Math.round(cropArea.width);
      cropCanvas.height = Math.round(cropArea.height);

      // Draw the cropped portion
      cropCtx.drawImage(
        imageRef.current,
        Math.round(cropArea.x),
        Math.round(cropArea.y),
        Math.round(cropArea.width),
        Math.round(cropArea.height),
        0,
        0,
        Math.round(cropArea.width),
        Math.round(cropArea.height)
      );

      // Convert to blob (PNG format)
      const blob = await new Promise<Blob>((resolve, reject) => {
        cropCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error(t('media.zoomCrop.failedToCreateCropBlob')));
        }, 'image/png');
      });

      // Create file from blob
      const file = new File([blob], `${cropFilename}.png`, { type: 'image/png' });

      // Upload via media service
      const response = await mediaService.uploadMedia(studyId, file);
      
      // Notify parent component
      onCropSaved?.(response.media.id);
      
      // Close modal
      onClose();
    } catch (error) {
      console.error('Failed to save crop:', error);
      setError(t('media.zoomCrop.failedToSaveCrop'));
    } finally {
      setIsSaving(false);
    }
  };

  // Redraw canvas when state changes
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

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
            {isCropMode ? t('media.zoomCrop.cropImage') : t('media.zoomCrop.zoomAndPan')}
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
              variant={isCropMode ? 'outlined' : 'contained'}
              onClick={handleToggleCropMode}
              startIcon={<CropIcon />}
              size="small"
            >
              {isCropMode ? t('media.zoomCrop.exitCropMode') : t('media.zoomCrop.cropMode')}
            </Button>
            
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
              {t('media.zoomCrop.zoom')}: {(zoom * 100).toFixed(0)}%
            </Typography>

            {isCropMode && (
              <TextField
                size="small"
                label={t('media.zoomCrop.cropFilename')}
                value={cropFilename}
                onChange={(e) => setCropFilename(e.target.value)}
                sx={{ ml: 'auto', minWidth: 200 }}
                disabled={isSaving}
              />
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
        </Box>

        {/* Canvas Container */}
        <Box 
          ref={containerRef}
          flex={1} 
          sx={{ 
            position: 'relative', 
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: '#f5f5f5',
            userSelect: 'none', // Prevent text selection during drag
            touchAction: 'none' // Prevent touchpad gestures from interfering
          }}
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Source"
            style={{ display: 'none' }}
            onLoad={drawCanvas}
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
          
          {isCropMode && (
            <Typography 
              variant="caption" 
              sx={{ 
                position: 'absolute', 
                top: 8, 
                left: 8, 
                bgcolor: 'rgba(0,0,0,0.7)', 
                color: 'white', 
                p: 1, 
                borderRadius: 1 
              }}
            >
              {t('media.zoomCrop.selectCropArea')}
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          {t('common.cancel')}
        </Button>
        {isCropMode && cropArea && (
          <Button
            variant="contained"
            onClick={handleSaveCrop}
            disabled={isSaving || !cropFilename.trim()}
            startIcon={isSaving ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {isSaving ? t('media.zoomCrop.saving') : t('media.zoomCrop.saveCrop')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};