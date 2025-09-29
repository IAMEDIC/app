import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { DoctorProfile, DoctorProfileCreate } from '@/types';
import api from '@/services/api';
import { useTranslation } from '@/contexts/LanguageContext';

interface DoctorRegistrationFormProps {
  onRegistrationComplete?: () => void;
}

export const DoctorRegistrationForm: React.FC<DoctorRegistrationFormProps> = ({
  onRegistrationComplete,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<DoctorProfileCreate>({
    matriculationId: '',
    legalName: '',
    specialization: '',
  });
  const [existingProfile, setExistingProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadExistingProfile();
  }, []);

  const loadExistingProfile = async () => {
    try {
      setInitialLoading(true);
      const response = await api.get('/doctor/profile');
      
      if (response.data) {
        setExistingProfile(response.data);
        setFormData({
          matriculationId: response.data.matriculationId,
          legalName: response.data.legalName,
          specialization: response.data.specialization,
        });
      }
    } catch (err: any) {
      // 404 is expected if no profile exists yet
      if (err.response?.status !== 404) {
        setError(t('errors.failedToLoadProfile'));
      }
    } finally {
      setInitialLoading(false);
    }
  };

  const handleInputChange = (field: keyof DoctorProfileCreate) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value,
    }));
    
    // Clear messages when user starts typing
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Basic validation
    if (!formData.matriculationId.trim() || !formData.legalName.trim() || !formData.specialization.trim()) {
      setError(t('components.doctorRegistration.allFieldsRequired'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (existingProfile) {
        // Update existing profile
        await api.put('/doctor/profile', formData);
        setSuccess(t('components.doctorRegistration.profileUpdated'));
      } else {
        // Create new profile
        await api.post('/doctor/register', formData);
        setSuccess(t('components.doctorRegistration.profileSubmitted'));
      }

      // Reload profile to get updated data
      await loadExistingProfile();
      
      if (onRegistrationComplete) {
        onRegistrationComplete();
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      
      // Handle different error response structures
      let errorMessage = t('components.doctorRegistration.registrationFailed');
      
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.detail) {
          if (typeof err.response.data.detail === 'string') {
            errorMessage = err.response.data.detail;
          } else if (Array.isArray(err.response.data.detail)) {
            // Handle Pydantic validation errors
            errorMessage = err.response.data.detail
              .map((error: any) => `${error.loc?.join(' → ') || 'Field'}: ${error.msg}`)
              .join('; ');
          } else {
            errorMessage = JSON.stringify(err.response.data.detail);
          }
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        } else {
          errorMessage = JSON.stringify(err.response.data);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getStatusChip = (status: string) => {
    const color = status === 'pending' ? 'warning' : 
                  status === 'approved' ? 'success' : 'error';
    return <Chip label={status.toUpperCase()} color={color} size="small" />;
  };

  const canEdit = !existingProfile || existingProfile.status === 'pending';

  if (initialLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 4, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" component="h2" gutterBottom>
        {t('components.doctorRegistration.doctorRegistration')}
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('components.doctorRegistration.fillInformation')}
      </Typography>

      {existingProfile && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('components.doctorRegistration.registrationStatus')}: {getStatusChip(existingProfile.status)}
          </Typography>
          {existingProfile.status === 'denied' && existingProfile.notes && (
            <Alert severity="error" sx={{ mt: 1 }}>
              <Typography variant="body2">
                {t('components.doctorRegistration.registrationDenied', { reason: existingProfile.notes })}
              </Typography>
            </Alert>
          )}
          {existingProfile.status === 'approved' && (
            <Alert severity="success" sx={{ mt: 1 }}>
              {t('components.doctorRegistration.registrationApproved')}
            </Alert>
          )}
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          label={t('components.doctorRegistration.matriculationId')}
          value={formData.matriculationId}
          onChange={handleInputChange('matriculationId')}
          fullWidth
          required
          disabled={!canEdit || loading}
          sx={{ mb: 3 }}
          helperText={t('components.doctorRegistration.matriculationIdHelper')}
        />

        <TextField
          label={t('components.doctorRegistration.legalName')}
          value={formData.legalName}
          onChange={handleInputChange('legalName')}
          fullWidth
          required
          disabled={!canEdit || loading}
          sx={{ mb: 3 }}
          helperText={t('components.doctorRegistration.legalNameHelper')}
        />

        <TextField
          label={t('components.doctorRegistration.specialization')}
          value={formData.specialization}
          onChange={handleInputChange('specialization')}
          fullWidth
          required
          disabled={!canEdit || loading}
          sx={{ mb: 3 }}
          helperText={t('components.doctorRegistration.specializationHelper')}
        />

        {canEdit && (
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{ minWidth: 120 }}
            >
              {loading ? (
                <CircularProgress size={20} />
              ) : existingProfile ? (
                t('components.doctorRegistration.updateProfile')
              ) : (
                t('components.doctorRegistration.submitRegistration')
              )}
            </Button>
          </Box>
        )}

        {!canEdit && existingProfile?.status === 'approved' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {t('components.doctorRegistration.registrationApprovedContactAdmin')}
          </Alert>
        )}
      </Box>
    </Paper>
  );
};