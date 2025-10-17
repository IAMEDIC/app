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

/**
 * File Management Tab for Admin Dashboard
 * Displays storage statistics and provides file cleanup functionality
 */
export const FileManagementTab: React.FC = () => {
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
      setError(err.response?.data?.detail || 'Failed to load file statistics');
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
            Retry
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
        No statistics available.
      </Alert>
    );
  }

  // Prepare chart data
  const fileCountData = {
    activeFiles: {
      label: 'Active Files',
      value: stats.active_files_count,
      percentage: stats.active_files_percentage,
      color: '#4caf50', // Green
    } as ChartData,
    softDeletedFiles: {
      label: 'Soft-deleted Files',
      value: stats.soft_deleted_files_count,
      percentage: stats.soft_deleted_files_percentage,
      color: '#f44336', // Red
    } as ChartData,
    title: 'Files by Count',
    totalLabel: 'Total Files',
    totalValue: (stats.active_files_count + stats.soft_deleted_files_count).toLocaleString(),
  };

  const fileSizeData = {
    activeFiles: {
      label: 'Active Files',
      value: stats.active_files_mb,
      percentage: stats.active_storage_percentage,
      color: '#4caf50', // Green
    } as ChartData,
    softDeletedFiles: {
      label: 'Soft-deleted Files',
      value: stats.soft_deleted_files_mb,
      percentage: stats.soft_deleted_storage_percentage,
      color: '#f44336', // Red
    } as ChartData,
    title: 'Storage by Size',
    totalLabel: 'Total Storage',
    totalValue: `${stats.total_storage_mb.toFixed(1)} MB`,
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" component="h2">
          Files Management
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Statistics Section */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Storage Statistics
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
          File Cleanup
        </Typography>
        
        {stats.soft_deleted_files_count > 0 ? (
          <Card sx={{ mb: 2, bgcolor: '#fff3e0' }}>
            <CardContent>
              <Typography variant="body1" gutterBottom>
                <strong>Soft-deleted Files Found:</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                • {stats.soft_deleted_files_count} soft-deleted files ({stats.soft_deleted_files_mb.toFixed(1)} MB)
                <br />
                • These files are hidden from users but still consuming storage space
                <br />
                • Hard delete will permanently remove them from the database and file system
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  ⚠️ <strong>Warning:</strong> Hard delete is permanent and cannot be undone. 
                  All soft-deleted files and their associated data will be completely removed.
                </Typography>
              </Alert>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setHardDeleteDialogOpen(true)}
                >
                  Hard Delete All Soft-deleted Files
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Will free up {stats.soft_deleted_files_mb.toFixed(1)} MB of storage
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ) : (
          <Alert severity="success" sx={{ mb: 2 }}>
            ✅ No soft-deleted files found. Your storage is clean!
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />
        
        <Typography variant="body2" color="text.secondary">
          <strong>Note:</strong> Soft-deleted files are created when users delete studies or media files. 
          They remain in the system for potential recovery but consume storage space. 
          Use hard delete to permanently remove them when recovery is no longer needed.
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