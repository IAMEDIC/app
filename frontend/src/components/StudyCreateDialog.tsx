import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Box,
} from '@mui/material';
import { StudyCreate } from '@/types';
import { useTranslation } from '@/contexts/LanguageContext';

interface StudyCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onStudyCreated: (alias: string) => void;
  onCreateStudy: (studyData: StudyCreate) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export const StudyCreateDialog: React.FC<StudyCreateDialogProps> = ({
  open,
  onClose,
  onStudyCreated,
  onCreateStudy,
  loading = false,
  error = null,
}) => {
  const { t } = useTranslation();
  const [alias, setAlias] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateAlias = (value: string): string | null => {
    if (!value.trim()) {
      return t('components.studyCreateDialog.studyAliasRequired');
    }
    if (value.length < 1) {
      return t('components.studyCreateDialog.studyAliasMinLength');
    }
    if (value.length > 255) {
      return t('components.studyCreateDialog.studyAliasMaxLength');
    }
    return null;
  };

  const handleAliasChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setAlias(value);
    setValidationError(validateAlias(value));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    const error = validateAlias(alias);
    if (error) {
      setValidationError(error);
      return;
    }

    try {
      await onCreateStudy({ alias: alias.trim() });
      onStudyCreated(alias.trim());
      handleClose();
    } catch (err) {
      // Error will be handled by parent component
    }
  };

  const handleClose = () => {
    setAlias('');
    setValidationError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('components.studyCreateDialog.createNewStudy')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <TextField
              autoFocus
              label={t('components.studyCreateDialog.studyAlias')}
              type="text"
              fullWidth
              variant="outlined"
              value={alias}
              onChange={handleAliasChange}
              error={!!validationError}
              helperText={validationError || t('components.studyCreateDialog.studyAliasHelper')}
              disabled={loading}
              placeholder={t('components.studyCreateDialog.studyAliasPlaceholder')}
            />
          </Box>
          
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !!validationError || !alias.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? t('components.studyCreateDialog.creating') : t('components.studyCreateDialog.createStudy')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};