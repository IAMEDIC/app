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
import { useTranslation } from '@/contexts/LanguageContext';

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
  const { t } = useTranslation();
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
      setError(t('admin.hardDelete.confirmationError'));
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
          current_operation: t('admin.hardDelete.noItemsToDelete'),
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
            setError(t('admin.hardDelete.failedToGetUpdates'));
            setIsDeleting(false);
          }
        };

        setTimeout(pollProgress, 500); // Start polling after 500ms
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.hardDelete.failedToStart'));
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
        {t('admin.hardDelete.title')}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              ⚠️ {t('admin.hardDelete.warningTitle')}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('admin.hardDelete.warningDescription')}
            </Typography>
            <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
              <li>{t('admin.hardDelete.warningItems.deletedStudies')}</li>
              <li>{t('admin.hardDelete.warningItems.mediaFiles')}</li>
              <li>{t('admin.hardDelete.warningItems.individualMedia')}</li>
              <li>{t('admin.hardDelete.warningItems.associatedData')}</li>
            </ul>
          </Alert>

          {!isDeleting && !progress && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {t('admin.hardDelete.confirmationPrompt')}
              </Typography>
              <TextField
                fullWidth
                label={t('admin.hardDelete.confirmationLabel')}
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                error={!!error}
                helperText={error}
                placeholder={t('admin.hardDelete.confirmationPlaceholder')}
                autoFocus
              />
            </Box>
          )}

          {(isDeleting || progress) && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6" gutterBottom>
                {progress?.status === 'completed' ? t('admin.hardDelete.completed') : 
                 progress?.status === 'failed' ? t('admin.hardDelete.failed') :
                 t('admin.hardDelete.deletingFiles')}
              </Typography>
              
              {progress && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">
                      {t('admin.hardDelete.itemsProgress', { 
                        processed: progress.processed_items, 
                        total: progress.total_items 
                      })}
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
                        {t('admin.hardDelete.errorsEncountered')}
                      </Typography>
                      {progress.errors.slice(0, 5).map((error, index) => (
                        <Typography key={index} variant="body2" sx={{ fontSize: '0.8rem' }}>
                          • {error}
                        </Typography>
                      ))}
                      {progress.errors.length > 5 && (
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {t('admin.hardDelete.andMoreErrors', { count: progress.errors.length - 5 })}
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
                    {t('admin.hardDelete.startingDeletion')}
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
          {progress?.status === 'completed' ? t('common.close') : t('common.cancel')}
        </Button>
        {!isDeleting && !progress && (
          <Button
            onClick={handleConfirm}
            color="error"
            variant="contained"
            disabled={confirmationText !== 'DELETE'}
            startIcon={<Delete />}
          >
            {t('admin.hardDelete.deletePermanently')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default HardDeleteDialog;