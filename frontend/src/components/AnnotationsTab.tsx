import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  IconButton,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  Chip,
  FormControlLabel,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { aiServiceV2 } from '@/services/ai_v2';
import { useCachedMedia } from '@/hooks/useCachedMedia';
import { useTranslation } from '@/contexts/LanguageContext';
import { ZoomCropModal } from './ZoomCropModal';
import { SavingStatus, SavingStatusType } from './SavingStatus';

interface BoundingBox {
  id: string;
  class: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  isHidden: boolean;
  usefulness: number;
  color: string;
}

interface AnnotationsTabProps {
  media: MediaSummary;
  studyId: string;
  onMediaAdded?: (newMedia: MediaSummary) => void;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

// Utility function to generate unique IDs
const generateUniqueId = (prefix: string): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const AnnotationsTab: React.FC<AnnotationsTabProps> = ({ media, studyId, onMediaAdded }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // State management
  // Image state is now managed by useCachedMedia hook
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [classificationPrediction, setClassificationPrediction] = useState<number | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState<SavingStatusType>('idle');
  
  // Loading states
  const [loadingClassification, setLoadingClassification] = useState(false);
  const [loadingBoundingBoxes, setLoadingBoundingBoxes] = useState(false);

  // Canvas interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
  const [resizeAnchor, setResizeAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // New box creation state
  const [isCreatingBox, setIsCreatingBox] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [classTitles, setClassTitles] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [newBoxStart, setNewBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
  const [canvasCursor, setCanvasCursor] = useState<string>('default');

  // Zoom & Crop modal state
  const [showZoomCropModal, setShowZoomCropModal] = useState(false);

  // Load image using cache
  const { src: imageSrc, isLoading: imageLoading } = useCachedMedia(studyId, media.id);

  // Helper function to get class title for tooltip
  const getClassTitle = (className: string): string | null => {
    if (!availableClasses.length || !classTitles.length) return null;
    const classIndex = availableClasses.indexOf(className);
    return classIndex >= 0 && classIndex < classTitles.length ? classTitles[classIndex] : null;
  };

  // Load existing saved annotations and display existing predictions (without generating new ones)
  useEffect(() => {
    const loadExistingData = async () => {
      
      try {
        // Load existing annotations only (no predictions)
        const { classificationAnnotation, boundingBoxAnnotations } = await aiServiceV2.loadAnnotationsOnly(media.id);
        
        // Load saved classification annotations
        if (classificationAnnotation) {
          
          setUsefulness(classificationAnnotation.usefulness);
        } else {
          
        }

        // Load existing classification prediction for display only (without generating new ones)
        try {
          const existingPrediction = await aiServiceV2.getExistingClassificationPrediction(media.id);
          if (existingPrediction) {
            const prediction = existingPrediction.prediction > 0.5 ? 1 : 0;
            setClassificationPrediction(prediction);
          }
        } catch (predictionError) {
          console.error('❌ Failed to load classification prediction for media ID:', media.id, predictionError);
        }
        
        // Load saved bounding box annotations only
        const boxes: BoundingBox[] = [];
        let colorIndex = 0;
        
        
        
        boundingBoxAnnotations.annotations?.forEach(ann => {
          
          boxes.push({
            id: generateUniqueId('ann'), // Generate unique frontend ID
            class: ann.bb_class,
            x: ann.x_min,
            y: ann.y_min,
            width: ann.width,
            height: ann.height,
            isHidden: ann.is_hidden,
            usefulness: ann.usefulness,
            color: COLORS[colorIndex % COLORS.length]
          });
          colorIndex++;
        });
        
        
        setBoundingBoxes(boxes);
      } catch (error) {
        console.error('Failed to load existing data:', error);
      }
    };

    loadExistingData();
  }, [media.id]);

  // Get BB model info for available classes
  useEffect(() => {
    const getModelInfo = async () => {
      try {
        const modelInfo = await aiServiceV2.getBBModelInfo();
        // Store available classes for creating new bounding boxes
        if (modelInfo.classes) {
          setAvailableClasses(modelInfo.classes);
          // Set first class as default selection
          if (modelInfo.classes.length > 0 && !selectedClass) {
            setSelectedClass(modelInfo.classes[0]);
          }
        }
        // Store class titles for hover tooltips
        if (modelInfo.class_titles) {
          setClassTitles(modelInfo.class_titles);
        }
      } catch (error) {
        console.error('Failed to get model info:', error);
      }
    };

    getModelInfo();
  }, []);

  // Auto-adjust selectedClass when it becomes unavailable due to new bounding boxes
  useEffect(() => {
    if (selectedClass && availableClasses.length > 0) {
      const availableUniqueClasses = availableClasses.filter(
        className => !boundingBoxes.some(box => box.class === className)
      );
      
      // If current selectedClass is no longer available, switch to first available or empty
      if (!availableUniqueClasses.includes(selectedClass)) {
        setSelectedClass(availableUniqueClasses[0] || '');
      }
    }
  }, [boundingBoxes, selectedClass, availableClasses]);

  // Global mouse tracking for resize operations that go outside canvas
  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!isResizing || !selectedBoxId || !resizeHandle || !resizeAnchor) return;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      
      // Continue resize operation with new mouse position
      handleResize(x, y);
    };

    const handleGlobalMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        setResizeHandle(null);
        setResizeAnchor(null);
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isResizing, selectedBoxId, resizeHandle, resizeAnchor]);

  // Utility functions for canvas interaction
  const getCanvasCoordinates = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const getBoxAtPoint = (x: number, y: number): BoundingBox | null => {
    // Check in reverse order to prioritize top boxes
    for (let i = boundingBoxes.length - 1; i >= 0; i--) {
      const box = boundingBoxes[i];
      if (!box.isHidden) {
        // Transform box coordinates to canvas space for hit testing
        const canvasBox = imageToCanvas(box.x, box.y);
        const canvasBoxEnd = imageToCanvas(box.x + box.width, box.y + box.height);
        const canvasWidth = canvasBoxEnd.x - canvasBox.x;
        const canvasHeight = canvasBoxEnd.y - canvasBox.y;
        
        if (x >= canvasBox.x && x <= canvasBox.x + canvasWidth &&
            y >= canvasBox.y && y <= canvasBox.y + canvasHeight) {
          return box;
        }
      }
    }
    return null;
  };

  const getResizeHandle = (x: number, y: number, box: BoundingBox): string | null => {
    const handleSize = 8;
    const tolerance = handleSize / 2;
    
    // Transform box coordinates to canvas space
    const canvasBox = imageToCanvas(box.x, box.y);
    const canvasBoxEnd = imageToCanvas(box.x + box.width, box.y + box.height);
    const canvasWidth = canvasBoxEnd.x - canvasBox.x;
    const canvasHeight = canvasBoxEnd.y - canvasBox.y;
    
    const handles = [
      { name: 'nw', x: canvasBox.x, y: canvasBox.y },
      { name: 'ne', x: canvasBox.x + canvasWidth, y: canvasBox.y },
      { name: 'sw', x: canvasBox.x, y: canvasBox.y + canvasHeight },
      { name: 'se', x: canvasBox.x + canvasWidth, y: canvasBox.y + canvasHeight },
      { name: 'n', x: canvasBox.x + canvasWidth / 2, y: canvasBox.y },
      { name: 's', x: canvasBox.x + canvasWidth / 2, y: canvasBox.y + canvasHeight },
      { name: 'w', x: canvasBox.x, y: canvasBox.y + canvasHeight / 2 },
      { name: 'e', x: canvasBox.x + canvasWidth, y: canvasBox.y + canvasHeight / 2 }
    ];

    for (const handle of handles) {
      if (Math.abs(x - handle.x) <= tolerance && Math.abs(y - handle.y) <= tolerance) {
        return handle.name;
      }
    }
    return null;
  };

  const handleResize = (canvasX: number, canvasY: number) => {
    if (!selectedBoxId || !resizeHandle || !resizeAnchor) return;
    
    const selectedBox = boundingBoxes.find(box => box.id === selectedBoxId);
    if (!selectedBox) return;
    
    // Convert canvas coordinates to image coordinates for calculations
    const imageCoords = canvasToImage(canvasX, canvasY);
    const x = imageCoords.x;
    const y = imageCoords.y;
    
    let newBox = { ...selectedBox };
    
    // Calculate new bounds based on mouse position and which handle is being dragged
    // All calculations are done in image coordinate space
    switch (resizeHandle) {
      case 'nw':
        // Top-left corner follows mouse, bottom-right stays fixed at anchor
        newBox.x = Math.min(x, resizeAnchor.x + resizeAnchor.width - 10);
        newBox.y = Math.min(y, resizeAnchor.y + resizeAnchor.height - 10);
        newBox.width = (resizeAnchor.x + resizeAnchor.width) - newBox.x;
        newBox.height = (resizeAnchor.y + resizeAnchor.height) - newBox.y;
        break;
      case 'ne':
        // Top-right corner follows mouse, bottom-left stays fixed at anchor
        newBox.x = resizeAnchor.x; // Keep left edge fixed
        newBox.y = Math.min(y, resizeAnchor.y + resizeAnchor.height - 10);
        newBox.width = Math.max(10, x - resizeAnchor.x);
        newBox.height = (resizeAnchor.y + resizeAnchor.height) - newBox.y;
        break;
      case 'sw':
        // Bottom-left corner follows mouse, top-right stays fixed at anchor
        newBox.x = Math.min(x, resizeAnchor.x + resizeAnchor.width - 10);
        newBox.y = resizeAnchor.y; // Keep top edge fixed
        newBox.width = (resizeAnchor.x + resizeAnchor.width) - newBox.x;
        newBox.height = Math.max(10, y - resizeAnchor.y);
        break;
      case 'se':
        // Bottom-right corner follows mouse, top-left stays fixed at anchor
        newBox.x = resizeAnchor.x; // Keep left edge fixed
        newBox.y = resizeAnchor.y; // Keep top edge fixed
        newBox.width = Math.max(10, x - resizeAnchor.x);
        newBox.height = Math.max(10, y - resizeAnchor.y);
        break;
      case 'n':
        // Top edge follows mouse, bottom edge stays fixed
        newBox.x = resizeAnchor.x; // Keep x fixed
        newBox.y = Math.min(y, resizeAnchor.y + resizeAnchor.height - 10);
        newBox.width = resizeAnchor.width; // Keep width fixed
        newBox.height = (resizeAnchor.y + resizeAnchor.height) - newBox.y;
        break;
      case 's':
        // Bottom edge follows mouse, top edge stays fixed
        newBox.x = resizeAnchor.x; // Keep x fixed
        newBox.y = resizeAnchor.y; // Keep y fixed
        newBox.width = resizeAnchor.width; // Keep width fixed
        newBox.height = Math.max(10, y - resizeAnchor.y);
        break;
      case 'w':
        // Left edge follows mouse, right edge stays fixed
        newBox.x = Math.min(x, resizeAnchor.x + resizeAnchor.width - 10);
        newBox.y = resizeAnchor.y; // Keep y fixed
        newBox.width = (resizeAnchor.x + resizeAnchor.width) - newBox.x;
        newBox.height = resizeAnchor.height; // Keep height fixed
        break;
      case 'e':
        // Right edge follows mouse, left edge stays fixed
        newBox.x = resizeAnchor.x; // Keep x fixed
        newBox.y = resizeAnchor.y; // Keep y fixed
        newBox.width = Math.max(10, x - resizeAnchor.x);
        newBox.height = resizeAnchor.height; // Keep height fixed
        break;
    }
    
    // Apply image boundary constraints (in image coordinate space)
    const image = imageRef.current;
    if (image) {
      newBox.x = Math.max(0, Math.min(newBox.x, image.naturalWidth - newBox.width));
      newBox.y = Math.max(0, Math.min(newBox.y, image.naturalHeight - newBox.height));
    }
    
    // Ensure minimum size
    if (newBox.width < 10) newBox.width = 10;
    if (newBox.height < 10) newBox.height = 10;
    
    setBoundingBoxes(prev => prev.map(box => 
      box.id === selectedBoxId ? { ...box, ...newBox } : box
    ));
    triggerAutoSave();
  };

  const getCursorStyle = (x: number, y: number): string => {
    if (isCreatingBox) return 'crosshair';
    
    // Check if hovering over any box first
    const hoveredBox = getBoxAtPoint(x, y);
    
    if (hoveredBox) {
      
      // Check for resize handles on selected box
      if (selectedBoxId && hoveredBox.id === selectedBoxId) {
        const handle = getResizeHandle(x, y, hoveredBox);
        switch (handle) {
          case 'nw':
          case 'se':
            return 'nw-resize';
          case 'ne':
          case 'sw':
            return 'ne-resize';
          case 'n':
          case 's':
            return 'ns-resize';
          case 'w':
          case 'e':
            return 'ew-resize';
          default:
            return 'move';
        }
      }
      
      return 'move';
    }
    
    return 'default';
  };

  // Mouse event handlers
  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(event);
    
    if (isCreatingBox && selectedClass) {
      // Start creating a new bounding box
      setNewBoxStart({ x, y });
      return;
    }
    
    const clickedBox = getBoxAtPoint(x, y);
    
    if (clickedBox) {
      setSelectedBoxId(clickedBox.id);
      
      // Check if clicking on a resize handle
      const handle = getResizeHandle(x, y, clickedBox);
      if (handle) {
        setIsResizing(true);
        setResizeHandle(handle);
        setDragStart({ x, y });
        // Set anchor point to preserve static corners/edges
        setResizeAnchor({
          x: clickedBox.x,
          y: clickedBox.y,
          width: clickedBox.width,
          height: clickedBox.height
        });
      } else {
        // Start dragging the box - convert to image coordinates
        const imageCoords = canvasToImage(x, y);
        setIsDragging(true);
        setDragStart({ x: imageCoords.x - clickedBox.x, y: imageCoords.y - clickedBox.y });
      }
    } else {
      setSelectedBoxId(null);
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(event);
    
    // Update cursor style based on position
    setCanvasCursor(getCursorStyle(x, y));
    
    // Update current mouse position for drawing preview
    if (isCreatingBox && newBoxStart) {
      setCurrentMousePos({ x, y });
    }
    
    // Update hover state (only if not in creation mode)
    if (!isCreatingBox) {
      const hoveredBox = getBoxAtPoint(x, y);
      setHoveredBoxId(hoveredBox ? hoveredBox.id : null);
    }
    
    if (isDragging && selectedBoxId && dragStart) {
      // Convert canvas coordinates to image coordinates for dragging
      const imageCoords = canvasToImage(x, y);
      const newX = imageCoords.x - dragStart.x;
      const newY = imageCoords.y - dragStart.y;
      
      // Apply boundaries in image coordinate space
      const image = imageRef.current;
      if (image) {
        const selectedBox = boundingBoxes.find(box => box.id === selectedBoxId);
        if (selectedBox) {
          const clampedX = Math.max(0, Math.min(newX, image.naturalWidth - selectedBox.width));
          const clampedY = Math.max(0, Math.min(newY, image.naturalHeight - selectedBox.height));
          
          setBoundingBoxes(prev => prev.map(box => 
            box.id === selectedBoxId 
              ? { ...box, x: clampedX, y: clampedY }
              : box
          ));
          triggerAutoSave();
        }
      }
    } else if (isResizing && selectedBoxId && resizeHandle) {
      // Pass canvas coordinates to resize handler which will convert them
      handleResize(x, y);
    }
  };

  const handleMouseUp = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isCreatingBox && newBoxStart && selectedClass) {
      const { x, y } = getCanvasCoordinates(event);
      
      // Create new bounding box if drag distance is sufficient
      const width = Math.abs(x - newBoxStart.x);
      const height = Math.abs(y - newBoxStart.y);
      
      if (width > 10 && height > 10) {
        // Convert canvas coordinates to image coordinates for storage
        const canvasTopLeft = { x: Math.min(newBoxStart.x, x), y: Math.min(newBoxStart.y, y) };
        const imageTopLeft = canvasToImage(canvasTopLeft.x, canvasTopLeft.y);
        const imageBottomRight = canvasToImage(canvasTopLeft.x + width, canvasTopLeft.y + height);
        
        const newBox: BoundingBox = {
          id: generateUniqueId('new'),
          class: selectedClass,
          x: imageTopLeft.x,
          y: imageTopLeft.y,
          width: imageBottomRight.x - imageTopLeft.x,
          height: imageBottomRight.y - imageTopLeft.y,
          isHidden: false,
          usefulness: 1,
          color: COLORS[boundingBoxes.length % COLORS.length]
        };
        
        setBoundingBoxes(prev => [...prev, newBox]);
        triggerAutoSave();
        
        // Auto-cancel creation mode after placing a box
        setIsCreatingBox(false);
        setSelectedClass('');
        setCurrentMousePos(null);
      }
      
      setNewBoxStart(null);
      return;
    }
    
    setIsDragging(false);
    setIsResizing(false);
    setDragStart(null);
    setResizeHandle(null);
    setResizeAnchor(null);
  };

  const handleMouseLeave = () => {
    setHoveredBoxId(null);
    setIsDragging(false);
    setIsResizing(false);
    setDragStart(null);
    setResizeHandle(null);
    setResizeAnchor(null);
    setNewBoxStart(null);
    setCurrentMousePos(null);
  };

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with a background color
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate proper scaling to maintain aspect ratio
    const canvasAspectRatio = canvas.width / canvas.height;
    const imageAspectRatio = image.naturalWidth / image.naturalHeight;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imageAspectRatio > canvasAspectRatio) {
      // Image is wider than canvas - fit to canvas width
      drawWidth = canvas.width;
      drawHeight = canvas.width / imageAspectRatio;
      offsetX = 0;
      offsetY = (canvas.height - drawHeight) / 2;
    } else {
      // Image is taller than canvas - fit to canvas height  
      drawHeight = canvas.height;
      drawWidth = canvas.height * imageAspectRatio;
      offsetX = (canvas.width - drawWidth) / 2;
      offsetY = 0;
    }
    
    // Draw image with proper aspect ratio
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    
    // Calculate and store scaling factors based on actual draw size
    const scaleX = image.naturalWidth / drawWidth;
    const scaleY = image.naturalHeight / drawHeight;
    
    setImageScale({
      scaleX,
      scaleY
    });
    
    // Store the actual image drawing area for coordinate transformations
    setImageDrawArea({
      offsetX,
      offsetY,
      drawWidth,
      drawHeight
    });
    
    // Draw bounding boxes
    boundingBoxes.forEach(box => {
      if (box.isHidden) return;
      
      const isSelected = selectedBoxId === box.id;
      
      // Transform box coordinates from image space to canvas space
      const canvasBox = imageToCanvas(box.x, box.y);
      const canvasBoxEnd = imageToCanvas(box.x + box.width, box.y + box.height);
      const canvasWidth = canvasBoxEnd.x - canvasBox.x;
      const canvasHeight = canvasBoxEnd.y - canvasBox.y;
      
      // Draw bounding box with thicker stroke if selected
      ctx.strokeStyle = box.color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(canvasBox.x, canvasBox.y, canvasWidth, canvasHeight);
      
      // Draw label
      ctx.fillStyle = box.color;
      ctx.font = '12px Arial';
      const labelText = `${box.class} ${box.confidence ? `(${(box.confidence * 100).toFixed(1)}%)` : ''}`;
      const textWidth = ctx.measureText(labelText).width;
      
      ctx.fillRect(canvasBox.x, canvasBox.y - 20, textWidth + 4, 20);
      ctx.fillStyle = 'white';
      ctx.fillText(labelText, canvasBox.x + 2, canvasBox.y - 6);
      
      // Draw resize handles if selected
      if (isSelected) {
        const handleSize = 8;
        const handles = [
          { x: canvasBox.x, y: canvasBox.y }, // nw
          { x: canvasBox.x + canvasWidth, y: canvasBox.y }, // ne
          { x: canvasBox.x, y: canvasBox.y + canvasHeight }, // sw
          { x: canvasBox.x + canvasWidth, y: canvasBox.y + canvasHeight }, // se
          { x: canvasBox.x + canvasWidth / 2, y: canvasBox.y }, // n
          { x: canvasBox.x + canvasWidth / 2, y: canvasBox.y + canvasHeight }, // s
          { x: canvasBox.x, y: canvasBox.y + canvasHeight / 2 }, // w
          { x: canvasBox.x + canvasWidth, y: canvasBox.y + canvasHeight / 2 } // e
        ];
        
        ctx.fillStyle = box.color;
        handles.forEach(handle => {
          ctx.fillRect(
            handle.x - handleSize / 2,
            handle.y - handleSize / 2,
            handleSize,
            handleSize
          );
        });
      }
      
      // Buttons removed - actions available from right panel bounding box list
    });
    
    // Draw preview box while creating
    if (isCreatingBox && newBoxStart && currentMousePos && selectedClass) {
      ctx.strokeStyle = COLORS[boundingBoxes.length % COLORS.length];
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // Dashed line for preview
      ctx.globalAlpha = 0.7;
      
      const previewX = Math.min(newBoxStart.x, currentMousePos.x);
      const previewY = Math.min(newBoxStart.y, currentMousePos.y);
      const previewWidth = Math.abs(currentMousePos.x - newBoxStart.x);
      const previewHeight = Math.abs(currentMousePos.y - newBoxStart.y);
      
      ctx.strokeRect(previewX, previewY, previewWidth, previewHeight);
      
      // Draw preview label
      ctx.fillStyle = COLORS[boundingBoxes.length % COLORS.length];
      ctx.font = '12px Arial';
      const labelText = selectedClass;
      const textWidth = ctx.measureText(labelText).width;
      
      ctx.fillRect(previewX, previewY - 20, textWidth + 4, 20);
      ctx.fillStyle = 'white';
      ctx.fillText(labelText, previewX + 2, previewY - 6);
      
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }, [boundingBoxes, selectedBoxId, hoveredBoxId, isCreatingBox, newBoxStart, currentMousePos, selectedClass]);

  // Update canvas when bounding boxes change
  useEffect(() => {
    if (imageSrc) {
      drawCanvas();
    }
  }, [imageSrc, boundingBoxes, drawCanvas]);

  // Store image scaling and drawing area information for coordinate transformations
  const [imageScale, setImageScale] = useState<{
    scaleX: number;
    scaleY: number;
  }>({
    scaleX: 1,
    scaleY: 1
  });

  const [imageDrawArea, setImageDrawArea] = useState<{
    offsetX: number;
    offsetY: number;
    drawWidth: number;
    drawHeight: number;
  }>({
    offsetX: 0,
    offsetY: 0,
    drawWidth: 0,
    drawHeight: 0
  });

  // Transform coordinates from image space to canvas display space
  const imageToCanvas = useCallback((x: number, y: number) => ({
    x: imageDrawArea.offsetX + (x / imageScale.scaleX),
    y: imageDrawArea.offsetY + (y / imageScale.scaleY)
  }), [imageScale, imageDrawArea]);

  // Transform coordinates from canvas display space to image space
  const canvasToImage = useCallback((x: number, y: number) => ({
    x: (x - imageDrawArea.offsetX) * imageScale.scaleX,
    y: (y - imageDrawArea.offsetY) * imageScale.scaleY
  }), [imageScale, imageDrawArea]);

  // Handle image load
  const handleImageLoad = () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    // Calculate responsive canvas size based on container and image aspect ratio
    const container = canvas.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const maxWidth = Math.min(containerRect.width - 40, 1000); // Leave some margin, max 1000px
    const maxHeight = Math.min(containerRect.height - 40, 700); // Leave some margin, max 700px
    
    const imageAspectRatio = image.naturalWidth / image.naturalHeight;
    
    let displayWidth, displayHeight;
    
    if (imageAspectRatio > maxWidth / maxHeight) {
      // Image is wider relative to container - fit to width
      displayWidth = maxWidth;
      displayHeight = maxWidth / imageAspectRatio;
    } else {
      // Image is taller relative to container - fit to height  
      displayHeight = maxHeight;
      displayWidth = maxHeight * imageAspectRatio;
    }
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Initial scaling factors (will be updated when image is drawn)
    setImageScale({
      scaleX: 1,
      scaleY: 1
    });

    drawCanvas();
  };

  // Handle usefulness prediction
  const handleGetUsefulnessPrediction = async () => {
    setLoadingClassification(true);
    try {
      const result = await aiServiceV2.generateClassificationPrediction(media.id, false);
      const prediction = result.prediction > 0.5 ? 1 : 0;
      setClassificationPrediction(prediction);
      
      // Set usefulness if not already set (auto-assignment only on first prediction)
      if (usefulness === null) {
        setUsefulness(prediction);
        triggerAutoSave();
      }
    } catch (error) {
      console.error('Failed to get classification prediction:', error);
    } finally {
      setLoadingClassification(false);
    }
  };

  // Handle get bounding boxes
  const handleGetBoundingBoxes = async () => {
    setLoadingBoundingBoxes(true);
    try {
      const result = await aiServiceV2.generateBoundingBoxPredictions(media.id, false);
      const newBoxes: BoundingBox[] = [];
      let colorIndex = boundingBoxes.length;

      result.predictions?.forEach(pred => {
        if (pred.confidence > 0.5 && !boundingBoxes.find(box => box.class === pred.bb_class)) {
          newBoxes.push({
            id: generateUniqueId('pred'), // Generate unique frontend ID
            class: pred.bb_class,
            x: pred.x_min,
            y: pred.y_min,
            width: pred.width,
            height: pred.height,
            confidence: pred.confidence,
            isHidden: false,
            usefulness: 1,
            color: COLORS[colorIndex % COLORS.length]
          });
          colorIndex++;
        }
      });

      if (newBoxes.length > 0) {
        const updatedBoxes = [...boundingBoxes, ...newBoxes];
        setBoundingBoxes(updatedBoxes);
        // Save immediately when adding predicted boxes, passing the new state directly
        triggerAutoSave(true, usefulness ?? undefined, updatedBoxes);
      }
    } catch (error) {
      console.error('Failed to get bounding box predictions:', error);
    } finally {
      setLoadingBoundingBoxes(false);
    }
  };

  // Handle usefulness change
  const handleUsefulnessChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value);
    
    setUsefulness(value);
    
    // If marked as not useful (0), delete all bounding boxes
    let updatedBoxes = boundingBoxes;
    if (value === 0) {
      
      updatedBoxes = [];
      setBoundingBoxes(updatedBoxes);
    }
    
    // Save immediately for usefulness changes as they're critical
    
    triggerAutoSave(true, value, updatedBoxes);
  };

  // Handle bounding box visibility toggle
  const handleToggleVisibility = (boxId: string) => {
    setBoundingBoxes(prev => {
      const updatedBoxes = prev.map(box =>
        box.id === boxId ? { ...box, isHidden: !box.isHidden } : box
      );
      return updatedBoxes;
    });
    triggerAutoSave();
  };

  // Handle bounding box deletion
  const handleDeleteBox = (boxId: string) => {
    setBoundingBoxes(prev => {
      const remainingBoxes = prev.filter(box => box.id !== boxId);
      return remainingBoxes;
    });
    triggerAutoSave();
  };

  // Handle crop saved - notify parent about new media
  const handleCropSaved = (newMedia: MediaSummary) => {
    onMediaAdded?.(newMedia);
  };

  // Auto-save function with optional override parameters
  const autoSave = useCallback(async (overrideUsefulness?: number, overrideBoundingBoxes?: BoundingBox[]) => {
    if (isSaving) return; // Prevent concurrent saves
    
    const currentUsefulness = overrideUsefulness !== undefined ? overrideUsefulness : usefulness;
    const currentBoundingBoxes = overrideBoundingBoxes || boundingBoxes;
    
    setIsSaving(true);
    setSavingStatus('saving');
    try {
      // Save classification annotation separately
      if (currentUsefulness !== null) {
        await aiServiceV2.saveClassificationAnnotation(media.id, {
          usefulness: currentUsefulness
        });
        
      }

      // Save bounding box annotations separately (always call, even with empty list to clear existing annotations)
      const bbAnnotations = currentBoundingBoxes.map(box => ({
        bb_class: box.class,
        usefulness: box.usefulness,
        x_min: box.x,
        y_min: box.y,
        width: box.width,
        height: box.height,
        is_hidden: box.isHidden
      }));

      await aiServiceV2.saveBoundingBoxAnnotations(media.id, {
        annotations: bbAnnotations
      });
      
      // Save completed successfully
      setSavingStatus('saved');
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
      // On error, clear the saving status
      setSavingStatus('idle');
    } finally {
      setIsSaving(false);
    }
  }, [media.id, usefulness, boundingBoxes, isSaving]);

  // Ref for debounced auto-save timeout
  const autoSaveTimeoutRef = useRef<number>(0);

  // Trigger debounced auto-save
  const triggerAutoSave = useCallback((immediate = false, overrideUsefulness?: number, overrideBoundingBoxes?: BoundingBox[]) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    if (immediate) {
      // Save immediately for critical changes
      autoSave(overrideUsefulness, overrideBoundingBoxes);
    } else {
      // Set new timeout for auto-save
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSave(overrideUsefulness, overrideBoundingBoxes);
      }, 1000);
    }
  }, [autoSave]);

  // Cleanup timeout on unmount and save any pending changes
  useEffect(() => {
    return () => {
      
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        // Save immediately on unmount if there was a pending save
        autoSave();
      }
    };
  }, [autoSave]);

  if (imageLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={2}>
      
      <Box display="flex" gap={2} maxHeight="calc(100vh - 200px)" minHeight="600px">
        {/* Left Panel - Classification */}
        <Box width="250px" sx={{ maxHeight: '100%', overflowY: 'auto' }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {t('components.annotations.classification')}
              </Typography>
              
              <Button
                variant="outlined"
                onClick={handleGetUsefulnessPrediction}
                disabled={loadingClassification}
                fullWidth
                sx={{ mb: 2 }}
              >
                {loadingClassification ? (
                  <CircularProgress size={20} />
                ) : (
                  t('components.annotations.getPrediction')
                )}
              </Button>

              {/* Classification Prediction Display - Always Visible */}
              <Box
                sx={{
                  p: 2,
                  mb: 2,
                  border: '1px solid #ddd',
                  borderRadius: 1,
                  backgroundColor: classificationPrediction === 1 ? '#e8f5e8' : 
                                 classificationPrediction === 0 ? '#fff3cd' : '#f8f9fa',
                  borderColor: classificationPrediction === 1 ? '#4caf50' : 
                              classificationPrediction === 0 ? '#ff9800' : '#ddd'
                }}
              >
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('components.annotations.aiPrediction')}:
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {classificationPrediction === null 
                    ? t('components.annotations.noPredictionAvailable')
                    : classificationPrediction === 1 
                      ? t('components.annotations.modelPredictsUseful')
                      : t('components.annotations.modelPredictsNotUseful')
                  }
                </Typography>
              </Box>

              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend">{t('components.annotations.usefulnessScore')}</FormLabel>
                <RadioGroup
                  value={usefulness?.toString() || ''}
                  onChange={handleUsefulnessChange}
                >
                  <FormControlLabel value="1" control={<Radio />} label={t('components.annotations.useful')} />
                  <FormControlLabel value="0" control={<Radio />} label={t('components.annotations.notUseful')} />
                </RadioGroup>
              </FormControl>
            </CardContent>
          </Card>
        </Box>

        {/* Center Panel - Canvas */}
        <Box flex={1} position="relative" sx={{ minWidth: '400px', maxHeight: '100%' }}>
          {/* Zoom/Crop Button */}
          <Box 
            position="absolute" 
            top={16} 
            left={16} 
            zIndex={1}
            display="flex"
            alignItems="center"
            gap={1}
          >
            <Button
              variant="contained"
              size="small"
              onClick={() => setShowZoomCropModal(true)}
              startIcon={<ZoomInIcon />}
              sx={{ 
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' }
              }}
            >
              {t('media.zoomCrop.zoomAndCrop')}
            </Button>
            
            {/* Saving Status Feedback */}
            <SavingStatus 
              status={savingStatus} 
              renderContainer={(children) => (
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    minHeight: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  {children}
                </Box>
              )}
            />
          </Box>

          <Box 
            borderRadius={1} 
            overflow="hidden"
            height="100%"
            display="flex"
            justifyContent="center"
            alignItems="center"
            sx={{ maxHeight: '100%', bgcolor: '#f5f5f5' }}
          >
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img
                ref={imageRef}
                src={imageSrc || ''}
                alt={media.filename}
                onLoad={handleImageLoad}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'none'
                }}
              />
              <canvas
                ref={canvasRef}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '100%',
                  display: 'block',
                  cursor: canvasCursor
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
              />
            </div>
          </Box>
        </Box>

        {/* Right Panel - Detected Structures */}
        {usefulness === 1 && (
          <Box width="300px" sx={{ maxHeight: '100%', overflowY: 'auto' }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {t('components.annotations.boundingBoxes')}
                </Typography>
                
                <Button
                  variant="outlined"
                  onClick={handleGetBoundingBoxes}
                  disabled={loadingBoundingBoxes}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  {loadingBoundingBoxes ? (
                    <CircularProgress size={20} />
                  ) : (
                    t('components.annotations.getBoundingBoxes')
                  )}
                </Button>

                {/* New Bounding Box Creation */}
                {availableClasses.length > 0 && (
                  (() => {
                    const availableUniqueClasses = availableClasses.filter(
                      className => !boundingBoxes.some(box => box.class === className)
                    );
                    
                    if (availableUniqueClasses.length === 0) {
                      return (
                        <Box sx={{ mb: 2, p: 2, border: '1px solid #eee', borderRadius: 1, bgcolor: '#f9f9f9' }}>
                          <Typography variant="subtitle2" color="text.secondary">
                            {t('components.annotations.allClassesPresent')}
                          </Typography>
                        </Box>
                      );
                    }
                    
                    return (
                      <Box sx={{ mb: 2, p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          {t('components.annotations.createNewBox')}
                        </Typography>
                        
                        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
                          <Select
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            displayEmpty
                          >
                            <MenuItem value="" disabled>
                              {t('components.annotations.selectClass')}
                            </MenuItem>
                            {availableUniqueClasses.map(className => (
                              <MenuItem key={className} value={className}>
                                {className}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        
                        <Button
                          variant={isCreatingBox ? 'contained' : 'outlined'}
                          onClick={() => setIsCreatingBox(!isCreatingBox)}
                          disabled={!selectedClass}
                          fullWidth
                          size="small"
                        >
                          {isCreatingBox ? t('common.cancel') : t('components.annotations.startDrawing')}
                        </Button>
                        
                        {isCreatingBox && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            {t('components.annotations.clickAndDrag')}
                          </Typography>
                        )}
                      </Box>
                    );
                  })()
                )}

                <Box display="flex" flexDirection="column" gap={1} sx={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {boundingBoxes.map(box => (
                    <Card key={box.id} variant="outlined">
                      <CardContent sx={{ p: 1 }}>
                        <Box display="flex" alignItems="center" justifyContent="between" gap={1}>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Chip 
                              label={box.class} 
                              size="small" 
                              style={{ backgroundColor: box.color, color: 'white' }}
                            />
                            {getClassTitle(box.class) && (
                              <Tooltip title={getClassTitle(box.class)} arrow>
                                <InfoIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
                              </Tooltip>
                            )}
                          </Box>
                          {box.confidence && (
                            <Typography variant="caption">
                              {(box.confidence * 100).toFixed(1)}%
                            </Typography>
                          )}
                          <Box>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleVisibility(box.id)}
                            >
                              {box.isHidden ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteBox(box.id)}
                            >
                              <CloseIcon />
                            </IconButton>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      {/* Zoom & Crop Modal */}
      <ZoomCropModal
        open={showZoomCropModal}
        onClose={() => setShowZoomCropModal(false)}
        imageSrc={imageSrc || ''}
        originalFilename={media.filename}
        studyId={studyId}
        onCropSaved={handleCropSaved}
      />

    </Box>
  );
};