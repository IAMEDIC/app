import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  IconButton,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Psychology as AIIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { 
  MediaPredictionsResponse, 
  ModelInfo,
  SaveAnnotationsRequest 
} from '@/types';
import { aiService } from '@/services/api';

interface BoundingBox {
  id: string;
  bb_class: string;
  usefulness: number;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  is_hidden: boolean;
  isPrediction?: boolean; // To distinguish predictions from annotations
}

interface AIAnnotationViewerProps {
  mediaId: string;
  onUnsavedChanges: (hasChanges: boolean) => void;
}

export const AIAnnotationViewer: React.FC<AIAnnotationViewerProps> = ({
  mediaId,
  onUnsavedChanges,
}) => {
  const [predictions, setPredictions] = useState<MediaPredictionsResponse | null>(null);
  const [classifierModel, setClassifierModel] = useState<ModelInfo | null>(null);
  const [bbModel, setBBModel] = useState<ModelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Current annotation state (modified by user)
  const [classificationUsefulness, setClassificationUsefulness] = useState<number>(1);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<string | null>(null);
  const [showPredictions, setShowPredictions] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);

  // Load model info on mount
  useEffect(() => {
    const loadModelInfo = async () => {
      try {
        const [classifierInfo, bbInfo] = await Promise.all([
          aiService.getClassifierModelInfo(),
          aiService.getBBModelInfo(),
        ]);
        setClassifierModel(classifierInfo);
        setBBModel(bbInfo);
      } catch (error) {
        console.error('Failed to load model info:', error);
      }
    };
    loadModelInfo();
  }, []);

  // Load existing predictions/annotations
  useEffect(() => {
    loadPredictions();
  }, [mediaId]);

  // Notify parent of unsaved changes
  useEffect(() => {
    onUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChanges]);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await aiService.getMediaPredictions(mediaId);
      setPredictions(data);
      
      // Initialize state from loaded data
      if (data.classification.annotation) {
        setClassificationUsefulness(data.classification.annotation.usefulness);
      }
      
      // Convert predictions and annotations to unified format
      const allBoxes: BoundingBox[] = [
        // Add predictions
        ...data.bounding_boxes.predictions.map(pred => ({
          id: `pred-${pred.id}`,
          bb_class: pred.bb_class,
          usefulness: 1, // Default for predictions
          x_min: pred.x_min,
          y_min: pred.y_min,
          width: pred.width,
          height: pred.height,
          is_hidden: false,
          isPrediction: true,
        })),
        // Add annotations
        ...data.bounding_boxes.annotations.map(ann => ({
          id: `ann-${ann.id}`,
          bb_class: ann.bb_class,
          usefulness: ann.usefulness,
          x_min: ann.x_min,
          y_min: ann.y_min,
          width: ann.width,
          height: ann.height,
          is_hidden: ann.is_hidden,
          isPrediction: false,
        })),
      ];
      
      setBoundingBoxes(allBoxes);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to load predictions:', error);
      setError('Failed to load AI predictions');
    } finally {
      setLoading(false);
    }
  };

  const generatePredictions = async (forceRefresh: boolean = false) => {
    try {
      setGenerating(true);
      setError(null);
      const data = await aiService.generatePredictions(mediaId, forceRefresh);
      setPredictions(data);
      
      // Update state from new predictions
      if (data.classification.annotation) {
        setClassificationUsefulness(data.classification.annotation.usefulness);
      }
      
      // Reload bounding boxes
      const allBoxes: BoundingBox[] = [
        ...data.bounding_boxes.predictions.map(pred => ({
          id: `pred-${pred.id}`,
          bb_class: pred.bb_class,
          usefulness: 1,
          x_min: pred.x_min,
          y_min: pred.y_min,
          width: pred.width,
          height: pred.height,
          is_hidden: false,
          isPrediction: true,
        })),
        ...data.bounding_boxes.annotations.map(ann => ({
          id: `ann-${ann.id}`,
          bb_class: ann.bb_class,
          usefulness: ann.usefulness,
          x_min: ann.x_min,
          y_min: ann.y_min,
          width: ann.width,
          height: ann.height,
          is_hidden: ann.is_hidden,
          isPrediction: false,
        })),
      ];
      
      setBoundingBoxes(allBoxes);
      setHasUnsavedChanges(true); // Mark as changed since predictions create initial annotations
    } catch (error) {
      console.error('Failed to generate predictions:', error);
      setError('Failed to generate AI predictions');
    } finally {
      setGenerating(false);
    }
  };

  const saveAnnotations = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Prepare annotations data (only non-prediction boxes)
      const annotationBoxes = boundingBoxes
        .filter(box => !box.isPrediction)
        .map(box => ({
          bb_class: box.bb_class,
          usefulness: box.usefulness,
          x_min: box.x_min,
          y_min: box.y_min,
          width: box.width,
          height: box.height,
          is_hidden: box.is_hidden,
        }));

      const saveData: SaveAnnotationsRequest = {
        media_id: mediaId,
        classification_annotation: {
          usefulness: classificationUsefulness,
        },
        bb_annotations: annotationBoxes,
      };

      const result = await aiService.saveAnnotations(mediaId, saveData);
      
      if (result.success) {
        setHasUnsavedChanges(false);
        // Reload to get updated IDs and timestamps
        await loadPredictions();
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error('Failed to save annotations:', error);
      setError('Failed to save annotations');
    } finally {
      setSaving(false);
    }
  };

  const handleClassificationChange = (newUsefulness: number) => {
    setClassificationUsefulness(newUsefulness);
    setHasUnsavedChanges(true);
  };

  const updateBoundingBox = (boxId: string, updates: Partial<BoundingBox>) => {
    setBoundingBoxes(prev => 
      prev.map(box => 
        box.id === boxId ? { ...box, ...updates } : box
      )
    );
    setHasUnsavedChanges(true);
  };

  const deleteBoundingBox = (boxId: string) => {
    setBoundingBoxes(prev => prev.filter(box => box.id !== boxId));
    setHasUnsavedChanges(true);
    if (selectedBox === boxId) {
      setSelectedBox(null);
    }
  };

  const getClassColor = (className: string, isPrediction: boolean = false): string => {
    // Simple color mapping - you can expand this
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const index = className.charCodeAt(0) % colors.length;
    return isPrediction ? `${colors[index]}80` : colors[index]; // Transparent for predictions
  };

  return (
    <Box>
      {/* Control Panel */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Typography variant="h6" display="flex" alignItems="center" gap={1}>
            <AIIcon color="primary" />
            AI Predictions & Annotations
          </Typography>
          
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => generatePredictions(false)}
              disabled={generating || loading}
              startIcon={generating ? <CircularProgress size={16} /> : <AIIcon />}
            >
              {generating ? 'Generating...' : 'Generate Predictions'}
            </Button>
            
            <Button
              variant="outlined"
              size="small"
              onClick={() => generatePredictions(true)}
              disabled={generating || loading}
              startIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
            
            <Button
              variant="contained"
              size="small"
              onClick={saveAnnotations}
              disabled={saving || !hasUnsavedChanges}
              startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
              color={hasUnsavedChanges ? "warning" : "primary"}
            >
              {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
            </Button>
          </Box>
        </Box>

        {/* Display toggles */}
        <Box display="flex" gap={2} mb={2}>
          <FormControlLabel
            control={
              <Switch
                checked={showPredictions}
                onChange={(e) => setShowPredictions(e.target.checked)}
                size="small"
              />
            }
            label="Show Predictions"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showAnnotations}
                onChange={(e) => setShowAnnotations(e.target.checked)}
                size="small"
              />
            }
            label="Show Annotations"
          />
        </Box>

        {/* Model Information */}
        {(classifierModel || bbModel) && (
          <Box display="flex" gap={2} mb={2}>
            {classifierModel && (
              <Chip
                label={`Classifier: ${classifierModel.name} v${classifierModel.version}`}
                size="small"
                variant="outlined"
              />
            )}
            {bbModel && (
              <Chip
                label={`BB Detector: ${bbModel.name} v${bbModel.version}`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        )}

        {/* Error display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Unsaved changes warning */}
        {hasUnsavedChanges && (
          <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
            You have unsaved changes. Don't forget to save your annotations!
          </Alert>
        )}
      </Paper>

      {/* Classification Results */}
      {predictions?.classification && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Classification Results
          </Typography>
          
          {predictions.classification.prediction && (
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Model Confidence: {(predictions.classification.prediction.prediction * 100).toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Model Version: {predictions.classification.prediction.model_version}
              </Typography>
            </Box>
          )}

          <Box>
            <Typography variant="body2" gutterBottom>
              Clinical Assessment:
            </Typography>
            <Box display="flex" gap={1}>
              <Button
                variant={classificationUsefulness === 1 ? "contained" : "outlined"}
                size="small"
                color="success"
                onClick={() => handleClassificationChange(1)}
              >
                Useful
              </Button>
              <Button
                variant={classificationUsefulness === 0 ? "contained" : "outlined"}
                size="small"
                color="error"
                onClick={() => handleClassificationChange(0)}
              >
                Not Useful
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Bounding Box List */}
      {boundingBoxes.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Detected Structures ({boundingBoxes.length})
          </Typography>
          
          <Box display="flex" flexDirection="column" gap={1}>
            {boundingBoxes.map((box) => (
              <Box
                key={box.id}
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                p={1}
                sx={{
                  border: 1,
                  borderColor: selectedBox === box.id ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  backgroundColor: selectedBox === box.id ? 'action.selected' : 'transparent',
                  cursor: 'pointer',
                  opacity: (box.isPrediction && !showPredictions) || (!box.isPrediction && !showAnnotations) ? 0.3 : 1,
                }}
                onClick={() => setSelectedBox(selectedBox === box.id ? null : box.id)}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      backgroundColor: getClassColor(box.bb_class, box.isPrediction),
                      borderRadius: 1,
                    }}
                  />
                  <Typography variant="body2">
                    {box.bb_class}
                  </Typography>
                  {box.isPrediction && (
                    <Chip label="Prediction" size="small" variant="outlined" />
                  )}
                  {box.is_hidden && (
                    <Chip label="Hidden" size="small" color="warning" />
                  )}
                </Box>

                <Box display="flex" alignItems="center" gap={1}>
                  {!box.isPrediction && (
                    <>
                      <Button
                        size="small"
                        variant={box.usefulness === 1 ? "contained" : "outlined"}
                        color="success"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBoundingBox(box.id, { usefulness: 1 });
                        }}
                      >
                        ✓
                      </Button>
                      <Button
                        size="small"
                        variant={box.usefulness === 0 ? "contained" : "outlined"}
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBoundingBox(box.id, { usefulness: 0 });
                        }}
                      >
                        ✗
                      </Button>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBoundingBox(box.id, { is_hidden: !box.is_hidden });
                        }}
                      >
                        {box.is_hidden ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBoundingBox(box.id);
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onClose={() => setShowConfirmDialog(false)}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <Typography>
            You have unsaved changes to your annotations. Do you want to save them before continuing?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirmDialog(false)}>
            Cancel
          </Button>
          <Button onClick={() => setShowConfirmDialog(false)} color="error">
            Discard Changes
          </Button>
          <Button onClick={saveAnnotations} variant="contained">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AIAnnotationViewer;