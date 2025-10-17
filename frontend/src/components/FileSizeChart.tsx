import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { StorageChartProps } from '@/types/fileManagement';

/**
 * Simple pie chart component using MUI and CSS for file size display
 */
export const FileSizeChart: React.FC<StorageChartProps> = ({
  activeFiles,
  softDeletedFiles,
  title,
  totalLabel,
  totalValue
}) => {
  const total = activeFiles.value + softDeletedFiles.value;
  
  // Calculate angles for pie chart (360 degrees total)
  const activeAngle = total > 0 ? (activeFiles.value / total) * 360 : 0;
  const softDeletedAngle = total > 0 ? (softDeletedFiles.value / total) * 360 : 0;

  // Create conic-gradient for pie chart
  const pieChartStyle = {
    background: total > 0 
      ? `conic-gradient(
          ${activeFiles.color} 0deg ${activeAngle}deg,
          ${softDeletedFiles.color} ${activeAngle}deg ${activeAngle + softDeletedAngle}deg,
          transparent ${activeAngle + softDeletedAngle}deg 360deg
        )`
      : '#e0e0e0',
    borderRadius: '50%',
    width: 120,
    height: 120,
    margin: '0 auto',
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="h6" component="h3" gutterBottom align="center">
          {title}
        </Typography>
        
        {/* Pie Chart */}
        <Box 
          sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            mb: 2 
          }}
        >
          <Box sx={pieChartStyle} />
          
          {/* Total size in center */}
          <Typography 
            variant="h5" 
            fontWeight="bold" 
            sx={{ mt: 1 }}
          >
            {totalValue}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {totalLabel}
          </Typography>
        </Box>

        {/* Legend */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box 
              sx={{ 
                width: 16, 
                height: 16, 
                backgroundColor: activeFiles.color,
                borderRadius: 1 
              }} 
            />
            <Typography variant="body2">
              {activeFiles.label}: {activeFiles.value.toFixed(1)} MB ({activeFiles.percentage.toFixed(1)}%)
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box 
              sx={{ 
                width: 16, 
                height: 16, 
                backgroundColor: softDeletedFiles.color,
                borderRadius: 1 
              }} 
            />
            <Typography variant="body2">
              {softDeletedFiles.label}: {softDeletedFiles.value.toFixed(1)} MB ({softDeletedFiles.percentage.toFixed(1)}%)
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};