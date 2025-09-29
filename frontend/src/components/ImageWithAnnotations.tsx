import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from '@/contexts/LanguageContext';

interface BoundingBox {
  id: string;
  bb_class: string;
  usefulness: number;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  is_hidden: boolean;
  isPrediction?: boolean;
}

interface ImageWithAnnotationsProps {
  imageSrc: string;
  alt: string;
  boundingBoxes: BoundingBox[];
  selectedBox?: string | null;
  onBoxSelect?: (boxId: string | null) => void;
  showPredictions?: boolean;
  showAnnotations?: boolean;
  onBoxUpdate?: (boxId: string, updates: Partial<BoundingBox>) => void;
  className?: string;
}

const RESIZE_HANDLE_SIZE = 8;
const MIN_BOX_SIZE = 10;

export const ImageWithAnnotations: React.FC<ImageWithAnnotationsProps> = ({
  imageSrc,
  alt,
  boundingBoxes,
  selectedBox,
  onBoxSelect,
  showPredictions = true,
  showAnnotations = true,
  onBoxUpdate,
  className,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; boxState: BoundingBox } | null>(null);

  // Convert normalized coordinates to pixel coordinates
  const normalizedToPixels = useCallback((box: BoundingBox) => {
    return {
      x: box.x_min * containerDimensions.width,
      y: box.y_min * containerDimensions.height,
      width: box.width * containerDimensions.width,
      height: box.height * containerDimensions.height,
    };
  }, [containerDimensions]);

  // Convert pixel coordinates to normalized coordinates
  const pixelsToNormalized = useCallback((pixelBox: { x: number; y: number; width: number; height: number }) => {
    if (containerDimensions.width === 0 || containerDimensions.height === 0) {
      return { x_min: 0, y_min: 0, width: 0, height: 0 };
    }
    
    return {
      x_min: pixelBox.x / containerDimensions.width,
      y_min: pixelBox.y / containerDimensions.height,
      width: pixelBox.width / containerDimensions.width,
      height: pixelBox.height / containerDimensions.height,
    };
  }, [containerDimensions]);

  // Handle image load
  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setContainerDimensions({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      });
      setImageLoaded(true);
    }
  }, []);

  // Handle container resize
  useEffect(() => {
    const handleResize = () => {
      if (imageRef.current) {
        setContainerDimensions({
          width: imageRef.current.clientWidth,
          height: imageRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Get color for bounding box class
  const getClassColor = (className: string, isPrediction: boolean = false): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const index = className.charCodeAt(0) % colors.length;
    return isPrediction ? `${colors[index]}80` : colors[index];
  };

  // Handle mouse events for dragging
  const handleMouseDown = (e: React.MouseEvent, box: BoundingBox, type: 'move' | 'resize') => {
    if (!onBoxUpdate || box.isPrediction) return;

    e.preventDefault();
    e.stopPropagation();
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    setDragType(type);
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      boxState: { ...box },
    });

    if (onBoxSelect) {
      onBoxSelect(box.id);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStart || !onBoxUpdate || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    const deltaX = currentX - dragStart.x;
    const deltaY = currentY - dragStart.y;

    const originalPixels = normalizedToPixels(dragStart.boxState);

    let newPixelBox = { ...originalPixels };

    if (dragType === 'move') {
      newPixelBox.x = Math.max(0, Math.min(containerDimensions.width - newPixelBox.width, originalPixels.x + deltaX));
      newPixelBox.y = Math.max(0, Math.min(containerDimensions.height - newPixelBox.height, originalPixels.y + deltaY));
    } else if (dragType === 'resize') {
      newPixelBox.width = Math.max(MIN_BOX_SIZE, originalPixels.width + deltaX);
      newPixelBox.height = Math.max(MIN_BOX_SIZE, originalPixels.height + deltaY);
      
      // Ensure the box doesn't go outside the image
      if (newPixelBox.x + newPixelBox.width > containerDimensions.width) {
        newPixelBox.width = containerDimensions.width - newPixelBox.x;
      }
      if (newPixelBox.y + newPixelBox.height > containerDimensions.height) {
        newPixelBox.height = containerDimensions.height - newPixelBox.y;
      }
    }

    const normalizedBox = pixelsToNormalized(newPixelBox);
    onBoxUpdate(dragStart.boxState.id, normalizedBox);
  }, [isDragging, dragStart, dragType, onBoxUpdate, normalizedToPixels, pixelsToNormalized, containerDimensions]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
    setDragStart(null);
  }, []);

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Filter visible boxes
  const visibleBoxes = boundingBoxes.filter(box => {
    if (box.is_hidden) return false;
    if (box.isPrediction && !showPredictions) return false;
    if (!box.isPrediction && !showAnnotations) return false;
    return true;
  });

  return (
    <Box 
      ref={containerRef}
      position="relative" 
      display="inline-block"
      className={className}
      sx={{ 
        cursor: isDragging ? (dragType === 'move' ? 'grabbing' : 'se-resize') : 'default',
        userSelect: 'none',
      }}
    >
      <img
        ref={imageRef}
        src={imageSrc}
        alt={alt}
        onLoad={handleImageLoad}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          display: 'block',
        }}
        draggable={false}
      />
      
      {/* Render bounding boxes */}
      {imageLoaded && visibleBoxes.map((box) => {
        const pixelBox = normalizedToPixels(box);
        const isSelected = selectedBox === box.id;
        const color = getClassColor(box.bb_class, box.isPrediction);
        
        return (
          <Box
            key={box.id}
            position="absolute"
            sx={{
              left: pixelBox.x,
              top: pixelBox.y,
              width: pixelBox.width,
              height: pixelBox.height,
              border: `2px ${box.isPrediction ? 'dashed' : 'solid'} ${color}`,
              backgroundColor: isSelected ? `${color}20` : 'transparent',
              pointerEvents: box.isPrediction ? 'none' : 'auto',
              cursor: box.isPrediction ? 'default' : 'grab',
              '&:hover': {
                backgroundColor: !box.isPrediction ? `${color}10` : 'transparent',
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onBoxSelect && !box.isPrediction) {
                onBoxSelect(isSelected ? null : box.id);
              }
            }}
            onMouseDown={(e) => handleMouseDown(e, box, 'move')}
          >
            {/* Class label */}
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                top: -20,
                left: 0,
                backgroundColor: color,
                color: 'white',
                px: 0.5,
                borderRadius: 0.5,
                fontSize: '0.7rem',
                whiteSpace: 'nowrap',
                opacity: box.isPrediction ? 0.7 : 1,
              }}
            >
              {box.bb_class}
              {box.isPrediction && ` ${t('components.imageAnnotations.predictionLabel')}`}
            </Typography>

            {/* Resize handle (only for annotations) */}
            {isSelected && !box.isPrediction && (
              <Box
                position="absolute"
                right={-RESIZE_HANDLE_SIZE / 2}
                bottom={-RESIZE_HANDLE_SIZE / 2}
                width={RESIZE_HANDLE_SIZE}
                height={RESIZE_HANDLE_SIZE}
                sx={{
                  backgroundColor: color,
                  border: '1px solid white',
                  cursor: 'se-resize',
                  borderRadius: '50%',
                }}
                onMouseDown={(e) => handleMouseDown(e, box, 'resize')}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default ImageWithAnnotations;