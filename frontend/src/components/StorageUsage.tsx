import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Paper,
  Chip,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { StorageInfo } from '@/types';
import { useTranslation } from '@/contexts/LanguageContext';

interface StorageUsageProps {
  storageInfo: StorageInfo;
  showDetails?: boolean;
  variant?: 'full' | 'compact';
}

export const StorageUsage: React.FC<StorageUsageProps> = ({
  storageInfo,
  showDetails = true,
  variant = 'full',
}) => {
  const { t } = useTranslation();
  
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('storage.bytes')}`;
    const k = 1024;
    const sizes = [t('storage.bytes'), t('storage.kb'), t('storage.mb'), t('storage.gb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStorageColor = (percentage: number): 'primary' | 'warning' | 'error' => {
    if (percentage >= 95) return 'error';
    if (percentage >= 80) return 'warning';
    return 'primary';
  };

  const getStorageStatus = (percentage: number): { label: string; color: 'success' | 'warning' | 'error' } => {
    if (percentage >= 95) return { label: t('storage.storageFull'), color: 'error' };
    if (percentage >= 80) return { label: t('storage.storageLow'), color: 'warning' };
    return { label: t('storage.storageOk'), color: 'success' };
  };

  const status = getStorageStatus(storageInfo.used_percentage);

  if (variant === 'compact') {
    return (
      <Box sx={{ minWidth: 200 }}>
        <Box display="flex" alignItems="center" gap={1} sx={{ mb: 1 }}>
          <StorageIcon fontSize="small" />
          <Typography variant="body2">
            {formatBytes(storageInfo.used_bytes)} / {formatBytes(storageInfo.total_bytes)}
          </Typography>
          <Chip 
            label={status.label} 
            color={status.color} 
            size="small" 
            variant="outlined"
          />
        </Box>
        <LinearProgress
          variant="determinate"
          value={storageInfo.used_percentage}
          color={getStorageColor(storageInfo.used_percentage)}
          sx={{ height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" color="text.secondary">
          {t('components.storageUsage.usedPercent', { percent: storageInfo.used_percentage.toFixed(1) })}
        </Typography>
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <StorageIcon />
        <Typography variant="h6">{t('components.storageUsage.storageUsage')}</Typography>
        <Chip 
          label={status.label} 
          color={status.color} 
          size="small"
          icon={storageInfo.used_percentage >= 80 ? <WarningIcon /> : undefined}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {formatBytes(storageInfo.used_bytes)} of {formatBytes(storageInfo.total_bytes)} used
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {storageInfo.used_percentage.toFixed(1)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={storageInfo.used_percentage}
          color={getStorageColor(storageInfo.used_percentage)}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      {showDetails && (
        <Box display="flex" gap={4} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('components.storageUsage.used')}
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {storageInfo.used_mb.toFixed(1)} MB
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('components.storageUsage.available')}
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {storageInfo.available_mb.toFixed(1)} MB
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('components.storageUsage.total')}
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {storageInfo.total_mb.toFixed(1)} MB
            </Typography>
          </Box>
        </Box>
      )}

      {storageInfo.used_percentage >= 95 && (
        <Box 
          sx={{ 
            mt: 2, 
            p: 1, 
            borderRadius: 1, 
            bgcolor: 'error.light', 
            color: 'error.contrastText' 
          }}
        >
          <Typography variant="body2">
            <WarningIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle' }} />
            {t('components.storageUsage.storageAlmostFull')}
          </Typography>
        </Box>
      )}

      {storageInfo.used_percentage >= 80 && storageInfo.used_percentage < 95 && (
        <Box 
          sx={{ 
            mt: 2, 
            p: 1, 
            borderRadius: 1, 
            bgcolor: 'warning.light', 
            color: 'warning.contrastText' 
          }}
        >
          <Typography variant="body2">
            <WarningIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle' }} />
            {t('components.storageUsage.storageRunningLow')}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};