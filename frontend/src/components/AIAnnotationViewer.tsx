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
  ModelInfo,

  ClassificationPredictionResponse,
  BoundingBoxPredictionsResponse,
  ClassificationAnnotationResponse,
  BoundingBoxAnnotationsResponse,

} from '@/types/ai_v2';
import { aiServiceV2 } from '@/services/ai_v2';

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
  // Separate state for predictions and annotations
  const [classificationPrediction, setClassificationPrediction] = useState<ClassificationPredictionResponse | null>(null);
  const [, setBoundingBoxPredictions] = useState<BoundingBoxPredictionsResponse | null>(null);
  const [classificationAnnotation, setClassificationAnnotation] = useState<ClassificationAnnotationResponse | null>(null);
  const [, setBoundingBoxAnnotations] = useState<BoundingBoxAnnotationsResponse | null>(null);
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
          aiServiceV2.getClassifierModelInfo(),
          aiServiceV2.getBBModelInfo(),
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
    console.log('DEBUG: hasUnsavedChanges changed to:', hasUnsavedChanges);
    onUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChanges]);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load all data using v2 API loadAllData convenience method
      const data = await aiServiceV2.loadAllData(mediaId);
      
      // Set separate state for predictions and annotations
      setClassificationPrediction(data.existingClassificationPrediction);
      setBoundingBoxPredictions(data.existingBoundingBoxPredictions);
      setClassificationAnnotation(data.classificationAnnotation);
      setBoundingBoxAnnotations(data.boundingBoxAnnotations);
      
      // Initialize usefulness from annotation if it exists
      if (data.classificationAnnotation) {
        setClassificationUsefulness(data.classificationAnnotation.usefulness);
      }
      
      // Convert predictions and annotations to unified format for UI
      const allBoxes: BoundingBox[] = [];
      
      // Add predictions if they exist
      if (data.existingBoundingBoxPredictions?.predictions) {
        allBoxes.push(
          ...data.existingBoundingBoxPredictions.predictions.map((pred, index) => ({
            id: `pred-${index}`,
            bb_class: pred.bb_class,
            usefulness: 1, // Default for predictions
            x_min: pred.x_min,
            y_min: pred.y_min,
            width: pred.width,
            height: pred.height,
            is_hidden: false,
            isPrediction: true,
          }))
        );
      }
      
      // Add annotations if they exist
      if (data.boundingBoxAnnotations?.annotations) {
        allBoxes.push(
          ...data.boundingBoxAnnotations.annotations.map((ann, index) => ({
            id: `ann-${index}`,
            bb_class: ann.bb_class,
            usefulness: ann.usefulness,
            x_min: ann.x_min,
            y_min: ann.y_min,
            width: ann.width,
            height: ann.height,
            is_hidden: ann.is_hidden,
            isPrediction: false,
          }))
        );
      }
      
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
      
      // Generate new predictions using v2 API
      const [newClassificationPred, newBBPreds] = await Promise.all([
        aiServiceV2.generateClassificationPrediction(mediaId, forceRefresh),
        aiServiceV2.generateBoundingBoxPredictions(mediaId, forceRefresh)
      ]);
      
      // Update prediction state
      setClassificationPrediction(newClassificationPred);
      setBoundingBoxPredictions(newBBPreds);
      
      // Update bounding boxes display with new predictions
      const newPredBoxes: BoundingBox[] = [
        // Add new predictions
        ...newBBPreds.predictions.map((pred, index) => ({
          id: `pred-${index}`,
          bb_class: pred.bb_class,
          usefulness: 1, // Default for predictions
          x_min: pred.x_min,
          y_min: pred.y_min,
          width: pred.width,
          height: pred.height,
          is_hidden: false,
          isPrediction: true,
        })),
        // Keep existing annotations (filter from current boundingBoxes)
        ...boundingBoxes.filter(box => !box.isPrediction)
      ];
      
      setBoundingBoxes(newPredBoxes);
      setHasUnsavedChanges(true); // Mark as changed since predictions create initial annotations
    } catch (error) {
      console.error('Failed to generate predictions:', error);
      setError('Failed to generate AI predictions');
    } finally {
      setGenerating(false);
    }
  };

  const saveAnnotations = async () => {
    console.log('DEBUG: saveAnnotations function called!');
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

      // Save using v2 API separate calls
      console.log('DEBUG: About to save annotations', {
        classificationUsefulness,
        annotationBoxesCount: annotationBoxes.length,
        annotationBoxes
      });
      
      console.log('DEBUG: Starting classification save...');
      const classificationResult = await aiServiceV2.saveClassificationAnnotation(mediaId, {
        usefulness: classificationUsefulness
      });
      console.log('DEBUG: Classification save result:', classificationResult);
      
      console.log('DEBUG: Starting bounding box save...');
      const boundingBoxResult = await aiServiceV2.saveBoundingBoxAnnotations(mediaId, {
        annotations: annotationBoxes
      });
      console.log('DEBUG: Bounding box save result:', boundingBoxResult);
      
      const saveResults = [classificationResult, boundingBoxResult];
      console.log('DEBUG: All save results', saveResults);
      
      // Check if both saves were successful
      const allSuccessful = saveResults.every(result => result.success);
      
      if (allSuccessful) {
        setHasUnsavedChanges(false);
        // Reload to get updated IDs and timestamps
        await loadPredictions();
      } else {
        const errorMessages = saveResults
          .filter(result => !result.success)
          .map(result => result.message)
          .join(', ');
        setError(`Failed to save: ${errorMessages}`);
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
    console.log('DEBUG: Deleting bounding box', boxId);
    setBoundingBoxes(prev => {
      const filtered = prev.filter(box => box.id !== boxId);
      console.log('DEBUG: Remaining boxes after deletion:', filtered.length);
      return filtered;
    });
    console.log('DEBUG: Setting hasUnsavedChanges to true after deletion');
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
      {(classificationPrediction || classificationAnnotation) && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            Classification Results
          </Typography>
          
          {classificationPrediction && (
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary">
                Model Confidence: {(classificationPrediction.prediction * 100).toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Model Version: {classificationPrediction.model_version}
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
            {(() => {
              console.log('DEBUG: Rendering bounding boxes, count:', boundingBoxes.length, 'boxes:', boundingBoxes);
              return null;
            })()}
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