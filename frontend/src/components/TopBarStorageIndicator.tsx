import React from 'react';
import {
  Box,
  Typography,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { StorageInfo } from '@/types';
import { useTranslation } from '@/contexts/LanguageContext';

interface TopBarStorageIndicatorProps {
  storageInfo: StorageInfo;
}

export const TopBarStorageIndicator: React.FC<TopBarStorageIndicatorProps> = ({
  storageInfo,
}) => {
  const { t } = useTranslation();
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('storage.bytes')}`;
    const k = 1024;
    const sizes = [t('storage.bytes'), t('storage.kb'), t('storage.mb'), t('storage.gb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStorageColor = (percentage: number): 'success' | 'warning' | 'error' => {
    if (percentage >= 95) return 'error';
    if (percentage >= 80) return 'warning';
    return 'success';
  };

  const getStorageStatus = (percentage: number): string => {
    if (percentage >= 95) return t('storage.storageFull');
    if (percentage >= 80) return t('storage.storageLow');
    return t('storage.storageOk');
  };

  const status = getStorageStatus(storageInfo.used_percentage);
  const color = getStorageColor(storageInfo.used_percentage);
  
  const tooltipContent = (
    <Box>
      <Typography variant="body2" fontWeight="bold" gutterBottom>
        {t('storage.storageUsage')}
      </Typography>
      <Typography variant="body2" gutterBottom>
        <strong>{t('storage.status')}:</strong> {status}
      </Typography>
      <Typography variant="body2" gutterBottom>
        <strong>{t('storage.used')}:</strong> {formatBytes(storageInfo.used_bytes)} of {formatBytes(storageInfo.total_bytes)}
      </Typography>
      <Typography variant="body2" gutterBottom>
        <strong>{t('storage.usage')}:</strong> {storageInfo.used_percentage.toFixed(1)}%
      </Typography>
      <Typography variant="body2" gutterBottom>
        <strong>{t('storage.available')}:</strong> {formatBytes(storageInfo.available_bytes)}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="bottom">
      <Box display="flex" alignItems="center" gap={1} sx={{ cursor: 'pointer' }}>
        <StorageIcon fontSize="small" sx={{ color: 'rgba(255, 255, 255, 0.8)' }} />
        <Box display="flex" alignItems="center" gap={0.5}>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            {formatBytes(storageInfo.used_bytes)} / {formatBytes(storageInfo.total_bytes)}
          </Typography>
          <Chip 
            label={status}
            color={color}
            size="small"
            variant="outlined"
            icon={storageInfo.used_percentage >= 80 ? <WarningIcon fontSize="small" /> : undefined}
            sx={{
              height: 20,
              fontSize: '0.65rem',
              bgcolor: color === 'error' ? 'error.main' : 
                      color === 'warning' ? 'warning.main' : 'success.main',
              color: 'white',
              border: 'none',
              '& .MuiChip-label': {
                px: 1,
              },
              '& .MuiChip-icon': {
                color: 'white',
                marginLeft: 0.5,
                marginRight: -0.5,
              }
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
};