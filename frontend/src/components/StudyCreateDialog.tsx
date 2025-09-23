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
  const [alias, setAlias] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateAlias = (value: string): string | null => {
    if (!value.trim()) {
      return 'Study alias is required';
    }
    if (value.length < 1) {
      return 'Study alias must be at least 1 character';
    }
    if (value.length > 255) {
      return 'Study alias must be less than 255 characters';
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
      <DialogTitle>Create New Study</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <TextField
              autoFocus
              label="Study Alias"
              type="text"
              fullWidth
              variant="outlined"
              value={alias}
              onChange={handleAliasChange}
              error={!!validationError}
              helperText={validationError || 'Enter a unique name for your study'}
              disabled={loading}
              placeholder="e.g., Cardiac Analysis #1"
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
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !!validationError || !alias.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? 'Creating...' : 'Create Study'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};