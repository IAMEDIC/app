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
  CircularProgress
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Close as CloseIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { MediaSummary } from '@/types';
import { aiService, mediaService } from '@/services/api';
import { useTranslation } from '@/contexts/LanguageContext';

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
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

export const AnnotationsTab: React.FC<AnnotationsTabProps> = ({ media, studyId }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // State management
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageLoading, setImageLoading] = useState(true);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [classificationPrediction, setClassificationPrediction] = useState<number | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  
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
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [newBoxStart, setNewBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);
  const [canvasCursor, setCanvasCursor] = useState<string>('default');

  // Load image
  useEffect(() => {
    const loadImage = async () => {
      try {
        setImageLoading(true);
        const blob = await mediaService.downloadMedia(studyId, media.id);
        const url = URL.createObjectURL(blob);
        setImageSrc(url);
      } catch (error) {
        console.error('Failed to load image:', error);
      } finally {
        setImageLoading(false);
      }
    };

    loadImage();
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [media.id, studyId]);

  // Load existing saved annotations and display existing predictions (without generating new ones)
  useEffect(() => {
    const loadExistingData = async () => {
      try {
        const data = await aiService.getMediaPredictions(media.id);
        
        // Load existing classification prediction if available (but don't generate new ones)
        if (data.classification.prediction?.prediction !== undefined) {
          setClassificationPrediction(data.classification.prediction.prediction > 0.5 ? 1 : 0);
        }
        
        // Load saved classification annotations
        if (data.classification.annotation?.usefulness !== undefined) {
          setUsefulness(data.classification.annotation.usefulness);
        }
        
        // Load saved bounding box annotations only
        const boxes: BoundingBox[] = [];
        let colorIndex = 0;
        
        data.bounding_boxes.annotations?.forEach(ann => {
          boxes.push({
            id: ann.id,
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
        const modelInfo = await aiService.getBBModelInfo();
        // Store available classes for creating new bounding boxes
        if (modelInfo.classes) {
          setAvailableClasses(modelInfo.classes);
          // Set first class as default selection
          if (modelInfo.classes.length > 0 && !selectedClass) {
            setSelectedClass(modelInfo.classes[0]);
          }
        }
      } catch (error) {
        console.error('Failed to get model info:', error);
      }
    };

    getModelInfo();
  }, []);

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

  const getCanvasDimensions = (): { width: number; height: number } => {
    const canvas = canvasRef.current;
    return canvas ? { width: canvas.width, height: canvas.height } : { width: 0, height: 0 };
  };



  const handleResize = (x: number, y: number) => {
    if (!selectedBoxId || !resizeHandle || !resizeAnchor) return;
    
    const selectedBox = boundingBoxes.find(box => box.id === selectedBoxId);
    if (!selectedBox) return;
    
    let newBox = { ...selectedBox };
    
    // Calculate new bounds based on mouse position and which handle is being dragged
    // Use anchor points to ensure opposite corners/edges stay completely static
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
    
    // Apply canvas boundary constraints without changing anchor behavior
    const canvasDims = getCanvasDimensions();
    newBox.x = Math.max(0, Math.min(newBox.x, canvasDims.width - newBox.width));
    newBox.y = Math.max(0, Math.min(newBox.y, canvasDims.height - newBox.height));
    
    // Ensure minimum size
    if (newBox.width < 10) newBox.width = 10;
    if (newBox.height < 10) newBox.height = 10;
    
    setBoundingBoxes(prev => prev.map(box => 
      box.id === selectedBoxId ? { ...box, ...newBox } : box
    ));
    setHasUnsavedChanges(true);
  };

  const getCursorStyle = (x: number, y: number): string => {
    if (isCreatingBox) return 'crosshair';
    
    // Check if hovering over any box first
    const hoveredBox = getBoxAtPoint(x, y);
    
    if (hoveredBox) {
      // Check if hovering over control buttons (only if box is large enough to show them)
      const buttonSize = 16;
      const margin = 4;
      const minButtonSpace = 2 * buttonSize + 2 + 2 * margin;
      
      if (hoveredBox.width >= minButtonSpace && hoveredBox.height >= buttonSize + 2 * margin) {
        // Hide/Show button area
        if (x >= hoveredBox.x + margin && x <= hoveredBox.x + margin + buttonSize &&
            y >= hoveredBox.y + margin && y <= hoveredBox.y + margin + buttonSize) {
          return 'pointer';
        }
        
        // Delete button area
        if (x >= hoveredBox.x + margin + buttonSize + 2 && x <= hoveredBox.x + margin + buttonSize + 2 + buttonSize &&
            y >= hoveredBox.y + margin && y <= hoveredBox.y + margin + buttonSize) {
          return 'pointer';
        }
      }
      
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
        // Check if clicking on control buttons (only if box is large enough to show them)
        const buttonSize = 16;
        const margin = 4;
        const minButtonSpace = 2 * buttonSize + 2 + 2 * margin; // Space needed for both buttons plus margins
        
        if (clickedBox.width >= minButtonSpace && clickedBox.height >= buttonSize + 2 * margin) {
          // Hide/Show button area (top-left inside box)
          if (x >= clickedBox.x + margin && x <= clickedBox.x + margin + buttonSize &&
              y >= clickedBox.y + margin && y <= clickedBox.y + margin + buttonSize) {
            handleToggleVisibility(clickedBox.id);
            return;
          }
          
          // Delete button area (next to hide button)
          if (x >= clickedBox.x + margin + buttonSize + 2 && x <= clickedBox.x + margin + buttonSize + 2 + buttonSize &&
              y >= clickedBox.y + margin && y <= clickedBox.y + margin + buttonSize) {
            handleDeleteBox(clickedBox.id);
            return;
          }
        }
        
        // Start dragging the box
        setIsDragging(true);
        setDragStart({ x: x - clickedBox.x, y: y - clickedBox.y });
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
      // Drag the selected box
      setBoundingBoxes(prev => prev.map(box => 
        box.id === selectedBoxId 
          ? { 
              ...box, 
              x: Math.max(0, x - dragStart.x), 
              y: Math.max(0, y - dragStart.y) 
            }
          : box
      ));
      setHasUnsavedChanges(true);
    } else if (isResizing && selectedBoxId && resizeHandle) {
      // Use the new resize handler that properly tracks anchors
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
          id: `new-${Date.now()}`,
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
        setHasUnsavedChanges(true);
        
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
      const isHovered = hoveredBoxId === box.id;
      
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
      
      // Draw control buttons inside box if hovered or selected and box is large enough
      if (isHovered || isSelected) {
        const buttonSize = 16;
        const margin = 4;
        const minButtonSpace = 2 * buttonSize + 2 + 2 * margin; // Space needed for both buttons plus margins
        
        // Only show buttons if box is large enough to accommodate them
        if (canvasWidth >= minButtonSpace && canvasHeight >= buttonSize + 2 * margin) {
          // Hide/Show button (top-left)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(canvasBox.x + margin, canvasBox.y + margin, buttonSize, buttonSize);
          ctx.fillStyle = 'white';
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('👁', canvasBox.x + margin + buttonSize/2, canvasBox.y + margin + 11);
          
          // Delete button (next to hide button)
          ctx.fillStyle = 'rgba(220, 53, 69, 0.8)';
          ctx.fillRect(canvasBox.x + margin + buttonSize + 2, canvasBox.y + margin, buttonSize, buttonSize);
          ctx.fillStyle = 'white';
          ctx.fillText('✕', canvasBox.x + margin + buttonSize + 2 + buttonSize/2, canvasBox.y + margin + 11);
          
          ctx.textAlign = 'left'; // Reset text align
        }
      }
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

    // Set canvas to a fixed display size that will be scaled by CSS
    const displayWidth = 800;
    const displayHeight = 600;
    
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
      const result = await aiService.generateClassificationPrediction(media.id, false);
      if (result.classification.prediction?.prediction !== undefined) {
        const prediction = result.classification.prediction.prediction > 0.5 ? 1 : 0;
        setClassificationPrediction(prediction);
        
        // Set usefulness if not already set
        if (usefulness === null) {
          setUsefulness(prediction);
          setHasUnsavedChanges(true);
        }
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
      const result = await aiService.generateBBPredictions(media.id, false);
      const newBoxes: BoundingBox[] = [];
      let colorIndex = boundingBoxes.length;

      result.bounding_boxes.predictions?.forEach(pred => {
        if (pred.confidence > 0.5 && !boundingBoxes.find(box => box.class === pred.bb_class)) {
          newBoxes.push({
            id: pred.id,
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
        setBoundingBoxes(prev => [...prev, ...newBoxes]);
        setHasUnsavedChanges(true);
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
    if (value === 0) {
      setBoundingBoxes([]);
    }
    
    setHasUnsavedChanges(true);
  };

  // Handle bounding box visibility toggle
  const handleToggleVisibility = (boxId: string) => {
    setBoundingBoxes(prev => prev.map(box =>
      box.id === boxId ? { ...box, isHidden: !box.isHidden } : box
    ));
    setHasUnsavedChanges(true);
  };

  // Handle bounding box deletion
  const handleDeleteBox = (boxId: string) => {
    setBoundingBoxes(prev => prev.filter(box => box.id !== boxId));
    setHasUnsavedChanges(true);
  };

  // Handle save annotations
  const handleSaveAnnotations = async () => {
    setSaving(true);
    try {
      const annotationsData = {
        media_id: media.id,
        classification_annotation: usefulness !== null ? { 
          usefulness 
        } : undefined,
        bb_annotations: boundingBoxes.map(box => ({
          bb_class: box.class,
          usefulness: box.usefulness,
          x_min: box.x,
          y_min: box.y,
          width: box.width,
          height: box.height,
          is_hidden: box.isHidden
        }))
      };

      await aiService.saveAnnotations(media.id, annotationsData);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save annotations:', error);
    } finally {
      setSaving(false);
    }
  };

  if (imageLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={2}>
      {/* Header with Save Button */}
      <Box display="flex" justifyContent="flex-start" mb={2}>
        <Button
          variant="contained"
          color="primary"
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          onClick={handleSaveAnnotations}
          disabled={saving || !hasUnsavedChanges}
        >
          {saving ? t('components.annotations.saving') : hasUnsavedChanges ? t('components.annotations.saveAnnotations') : t('components.annotations.noChangesToSave')}
        </Button>
      </Box>
      
      <Box display="flex" gap={2} height="80vh">
        {/* Left Panel - Classification */}
        <Box width="250px">
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
        <Box flex={1} position="relative">
          <Box 
            border="1px solid #ccc" 
            borderRadius={1} 
            overflow="hidden"
            height="100%"
            display="flex"
            justifyContent="center"
            alignItems="center"
          >
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
              <img
                ref={imageRef}
                src={imageSrc}
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
                  border: '1px solid #ddd',
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
          <Box width="300px">
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

                <Box display="flex" flexDirection="column" gap={1}>
                  {boundingBoxes.map(box => (
                    <Card key={box.id} variant="outlined">
                      <CardContent sx={{ p: 1 }}>
                        <Box display="flex" alignItems="center" justifyContent="between" gap={1}>
                          <Chip 
                            label={box.class} 
                            size="small" 
                            style={{ backgroundColor: box.color, color: 'white' }}
                          />
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

    </Box>
  );
};