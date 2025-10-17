import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Alert,
  CircularProgress,
  LinearProgress
} from '@mui/material';
import { Warning, Delete } from '@mui/icons-material';
import { HardDeleteProgress, HardDeleteResponse } from '../types/fileManagement';

interface HardDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (confirmationText: string) => Promise<HardDeleteResponse>;
  onProgress?: (taskId: string) => Promise<HardDeleteProgress>;
}

const HardDeleteDialog: React.FC<HardDeleteDialogProps> = ({
  open,
  onClose,
  onConfirm,
  onProgress
}) => {
  const [confirmationText, setConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState<HardDeleteProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmationText('');
      setError(null);
      setProgress(null);
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (confirmationText !== 'DELETE') {
      setError('Please type "DELETE" exactly to confirm');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await onConfirm(confirmationText);

      // If it's a no-op task, we're done
      if (response.task_id === 'no-op') {
        setProgress({
          status: 'completed',
          progress: 1.0,
          processed_items: 0,
          total_items: 0,
          current_operation: 'No items to delete',
          errors: []
        });
        setIsDeleting(false);
        return;
      }

      // Start polling for progress
      if (onProgress) {
        const pollProgress = async () => {
          try {
            const currentProgress = await onProgress(response.task_id);
            setProgress(currentProgress);

            if (currentProgress.status === 'completed' || currentProgress.status === 'failed') {
              setIsDeleting(false);
            } else {
              setTimeout(pollProgress, 1000); // Poll every second
            }
          } catch (err) {
            console.error('Error polling progress:', err);
            setError('Failed to get progress updates');
            setIsDeleting(false);
          }
        };

        setTimeout(pollProgress, 500); // Start polling after 500ms
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start hard delete operation');
      setIsDeleting(false);
    }
  };

  const getProgressColor = () => {
    if (!progress) return 'primary';
    if (progress.status === 'failed') return 'error';
    if (progress.status === 'completed') return 'success';
    return 'primary';
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isDeleting}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Warning color="error" />
        Hard Delete Confirmation
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              ⚠️ WARNING: This action is PERMANENT and IRREVERSIBLE!
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              This will permanently delete all soft-deleted studies and media files from both 
              the database and file system. This includes:
            </Typography>
            <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
              <li>All studies marked as deleted</li>
              <li>All media files in deleted studies</li>
              <li>All individually deleted media files</li>
              <li>Associated frames, annotations, and predictions</li>
            </ul>
          </Alert>

          {!isDeleting && !progress && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                To proceed, type <strong>DELETE</strong> in the field below:
              </Typography>
              <TextField
                fullWidth
                label="Type DELETE to confirm"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                error={!!error}
                helperText={error}
                placeholder="DELETE"
                autoFocus
              />
            </Box>
          )}

          {(isDeleting || progress) && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {progress?.status === 'completed' ? 'Completed!' : 
                 progress?.status === 'failed' ? 'Failed' :
                 'Deleting files...'}
              </Typography>
              
              {progress && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">
                      {progress.processed_items} / {progress.total_items} items
                    </Typography>
                    <Typography variant="body2">
                      {Math.round(progress.progress * 100)}%
                    </Typography>
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={progress.progress * 100}
                    color={getProgressColor()}
                  />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    {progress.current_operation}
                  </Typography>
                  
                  {progress.errors.length > 0 && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        Errors encountered:
                      </Typography>
                      {progress.errors.slice(0, 5).map((error, index) => (
                        <Typography key={index} variant="body2" sx={{ fontSize: '0.8rem' }}>
                          • {error}
                        </Typography>
                      ))}
                      {progress.errors.length > 5 && (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          ... and {progress.errors.length - 5} more errors
                        </Typography>
                      )}
                    </Alert>
                  )}
                </Box>
              )}

              {isDeleting && !progress && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CircularProgress size={24} />
                  <Typography variant="body2">
                    Starting deletion process...
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={handleClose}
          disabled={isDeleting}
        >
          {progress?.status === 'completed' ? 'Close' : 'Cancel'}
        </Button>
        {!isDeleting && !progress && (
          <Button
            onClick={handleConfirm}
            color="error"
            variant="contained"
            disabled={confirmationText !== 'DELETE'}
            startIcon={<Delete />}
          >
            Delete Permanently
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default HardDeleteDialog;