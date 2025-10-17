import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { Storage as StorageIcon } from '@mui/icons-material';

interface StorageUsageCardProps {
  totalStorageMb: number;
  totalFiles: number;
}

/**
 * Simple card displaying total storage usage information
 */
export const StorageUsageCard: React.FC<StorageUsageCardProps> = ({
  totalStorageMb,
  totalFiles
}) => {
  // Format storage size
  const formatStorageSize = (mb: number): string => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="h3">
            Total Storage Usage
          </Typography>
        </Box>
        
        <Box sx={{ textAlign: 'center' }}>
          <Typography 
            variant="h3" 
            component="div" 
            color="primary" 
            fontWeight="bold"
            sx={{ mb: 1 }}
          >
            {formatStorageSize(totalStorageMb)}
          </Typography>
          
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            across {totalFiles.toLocaleString()} files
          </Typography>
          
          <Typography variant="body2" color="text.secondary">
            System-wide storage utilization
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};