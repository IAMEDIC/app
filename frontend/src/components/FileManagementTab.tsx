import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Button,
  Divider,
  Card,
  CardContent,
} from '@mui/material';
import { Refresh as RefreshIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { FileManagementStats, ChartData } from '@/types/fileManagement';
import { fileManagementService } from '@/services/api';
import { StorageUsageCard } from './StorageUsageCard';
import { FileCountChart } from './FileCountChart';
import { FileSizeChart } from './FileSizeChart';
import HardDeleteDialog from './HardDeleteDialog';
import { useTranslation } from '@/contexts/LanguageContext';

/**
 * File Management Tab for Admin Dashboard
 * Displays storage statistics and provides file cleanup functionality
 */
export const FileManagementTab: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<FileManagementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fileManagementService.getStatistics();
      setStats(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.fileManagement.failedToLoadStats'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatistics();
  }, []);

  const handleRefresh = () => {
    loadStatistics();
  };

  const handleHardDelete = async (confirmationText: string) => {
    return await fileManagementService.startHardDelete(confirmationText);
  };

  const handleHardDeleteProgress = async (taskId: string) => {
    return await fileManagementService.getDeleteProgress(taskId);
  };

  if (loading) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: 400 
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert 
        severity="error" 
        sx={{ mb: 3 }}
        action={
          <Button 
            color="inherit" 
            size="small" 
            onClick={handleRefresh}
            startIcon={<RefreshIcon />}
          >
            {t('common.retry')}
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!stats) {
    return (
      <Alert severity="info">
        {t('admin.fileManagement.noStatsAvailable')}
      </Alert>
    );
  }

  // Prepare chart data
  const fileCountData = {
    activeFiles: {
      label: t('admin.fileManagement.activeFiles'),
      value: stats.active_files_count,
      percentage: stats.active_files_percentage,
      color: '#4caf50', // Green
    } as ChartData,
    softDeletedFiles: {
      label: t('admin.fileManagement.softDeletedFiles'),
      value: stats.soft_deleted_files_count,
      percentage: stats.soft_deleted_files_percentage,
      color: '#f44336', // Red
    } as ChartData,
    title: t('admin.fileManagement.filesByCount'),
    totalLabel: t('admin.fileManagement.totalFiles'),
    totalValue: (stats.active_files_count + stats.soft_deleted_files_count).toLocaleString(),
  };

  const fileSizeData = {
    activeFiles: {
      label: t('admin.fileManagement.activeFiles'),
      value: stats.active_files_mb,
      percentage: stats.active_storage_percentage,
      color: '#4caf50', // Green
    } as ChartData,
    softDeletedFiles: {
      label: t('admin.fileManagement.softDeletedFiles'),
      value: stats.soft_deleted_files_mb,
      percentage: stats.soft_deleted_storage_percentage,
      color: '#f44336', // Red
    } as ChartData,
    title: t('admin.fileManagement.storageBySize'),
    totalLabel: t('admin.fileManagement.totalStorage'),
    totalValue: `${stats.total_storage_mb.toFixed(1)} MB`,
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h2">
          {t('admin.fileManagement.title')}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          {t('admin.fileManagement.refreshStatistics')}
        </Button>
      </Box>

      {/* Statistics Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          {t('admin.fileManagement.storageStatistics')}
        </Typography>
        
        <Grid container spacing={3}>
          {/* Total Storage Usage */}
          <Grid item xs={12} md={4}>
            <StorageUsageCard
              totalStorageMb={stats.total_storage_mb}
              totalFiles={stats.active_files_count + stats.soft_deleted_files_count}
            />
          </Grid>

          {/* File Count Chart */}
          <Grid item xs={12} md={4}>
            <FileCountChart {...fileCountData} />
          </Grid>

          {/* File Size Chart */}
          <Grid item xs={12} md={4}>
            <FileSizeChart {...fileSizeData} />
          </Grid>
        </Grid>
      </Paper>

      {/* Cleanup Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('admin.fileManagement.fileCleanup')}
        </Typography>
        
        {stats.soft_deleted_files_count > 0 ? (
          <Card sx={{ mb: 2, bgcolor: '#fff3e0' }}>
            <CardContent>
              <Typography variant="body1" gutterBottom>
                <strong>{t('admin.fileManagement.softDeletedFilesFound')}</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                • {t('admin.fileManagement.softDeletedFilesDetails', { 
                  count: stats.soft_deleted_files_count, 
                  size: stats.soft_deleted_files_mb.toFixed(1) 
                })}
                <br />
                • {t('admin.fileManagement.hiddenFilesInfo')}
                <br />
                • {t('admin.fileManagement.hardDeleteInfo')}
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  ⚠️ <strong>{t('admin.fileManagement.warningTitle')}</strong> {t('admin.fileManagement.warningMessage')}
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setHardDeleteDialogOpen(true)}
                >
                  {t('admin.fileManagement.hardDeleteButton')}
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {t('admin.fileManagement.willFreeStorage', { size: stats.soft_deleted_files_mb.toFixed(1) })}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Alert severity="success" sx={{ mb: 2 }}>
            {t('admin.fileManagement.noSoftDeletedFiles')}
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />
        
        <Typography variant="body2" color="text.secondary">
          <strong>{t('admin.fileManagement.noteLabel')}</strong> {t('admin.fileManagement.softDeletedFilesNote')}
        </Typography>
      </Paper>

      {/* Hard Delete Dialog */}
      <HardDeleteDialog
        open={hardDeleteDialogOpen}
        onClose={() => setHardDeleteDialogOpen(false)}
        onConfirm={handleHardDelete}
        onProgress={handleHardDeleteProgress}
      />
    </Box>
  );
};