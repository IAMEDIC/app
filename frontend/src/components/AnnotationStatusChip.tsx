import React from 'react';
import {
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as AnnotatedIcon,
  RadioButtonUnchecked as NotAnnotatedIcon,
} from '@mui/icons-material';

interface AnnotationStatusChipProps {
  hasAnnotations: boolean | null; // null = loading
  size?: 'small' | 'medium';
}

/**
 * Chip component that displays annotation status:
 * - Loading: Gray chip with spinner
 * - Green: Has annotations
 * - Yellow: No annotations
 */
export const AnnotationStatusChip: React.FC<AnnotationStatusChipProps> = ({
  hasAnnotations,
  size = 'small',
}) => {
  if (hasAnnotations === null) {
    // Loading state
    return (
      <Chip
        icon={<CircularProgress size={14} sx={{ color: 'inherit' }} />}
        label="..."
        size={size}
        sx={{
          backgroundColor: 'grey.200',
          color: 'grey.600',
          '& .MuiChip-icon': {
            marginLeft: '4px',
          }
        }}
      />
    );
  }

  if (hasAnnotations) {
    // Has annotations - Green
    return (
      <Chip
        icon={<AnnotatedIcon sx={{ fontSize: 16 }} />}
        label="Anotado"
        size={size}
        sx={{
          backgroundColor: 'success.light',
          color: 'success.dark',
          fontWeight: 500,
          '& .MuiChip-icon': {
            color: 'success.dark',
          }
        }}
      />
    );
  }

  // No annotations - Yellow
  return (
    <Chip
      icon={<NotAnnotatedIcon sx={{ fontSize: 16 }} />}
      label="Sin anotar"
      size={size}
      sx={{
        backgroundColor: 'warning.light',
        color: 'warning.dark',
        fontWeight: 500,
        '& .MuiChip-icon': {
          color: 'warning.dark',
        }
      }}
    />
  );
};
