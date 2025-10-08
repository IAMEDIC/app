import React, { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { useTranslation } from '@/contexts/LanguageContext';

export type SavingStatusType = 'idle' | 'saving' | 'saved';

interface SavingStatusProps {
  status: SavingStatusType;
  /** Delay in ms before showing "Changes Saved" after saving completes (default: 500ms) */
  saveCompleteDelay?: number;
  /** Duration in ms to show "Changes Saved" before clearing (default: 700ms) */
  savedDisplayDuration?: number;
  /** Optional render prop to wrap the status text with a container */
  renderContainer?: (children: React.ReactNode) => React.ReactElement;
}

export const SavingStatus: React.FC<SavingStatusProps> = ({
  status,
  saveCompleteDelay = 500,
  savedDisplayDuration = 700,
  renderContainer,
}) => {
  const { t } = useTranslation();
  const [displayStatus, setDisplayStatus] = useState<SavingStatusType>('idle');

  useEffect(() => {
    let timeoutId: number;

    if (status === 'saving') {
      // Immediately show saving status
      setDisplayStatus('saving');
    } else if (status === 'saved') {
      // Delay showing "saved" status
      timeoutId = setTimeout(() => {
        setDisplayStatus('saved');
        
        // After showing "saved", clear it after the display duration
        const clearTimeoutId = setTimeout(() => {
          setDisplayStatus('idle');
        }, savedDisplayDuration);
        
        return () => clearTimeout(clearTimeoutId);
      }, saveCompleteDelay);
    } else {
      // status === 'idle'
      setDisplayStatus('idle');
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [status, saveCompleteDelay, savedDisplayDuration]);

  if (displayStatus === 'idle') {
    return null;
  }

  const statusText = (
    <Typography
      variant="body2"
      sx={{
        fontSize: '0.75rem',
        fontWeight: 500,
        color: 'white',
        opacity: 0.95,
        transition: 'opacity 0.2s ease-in-out',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
      }}
    >
      {displayStatus === 'saving'
        ? t('components.annotations.savingChanges')
        : t('components.annotations.changesSaved')
      }
    </Typography>
  );

  return renderContainer ? renderContainer(statusText) : statusText;
};