import React, { Component, ReactNode } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { useTranslation } from '@/contexts/LanguageContext';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryContent error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

// Functional component to use hooks
const ErrorBoundaryContent: React.FC<{ error?: Error; onReset: () => void }> = ({ error, onReset }) => {
  // Try to get translation, but fallback to English if not available
  let t: (key: string) => string;
  try {
    const translation = useTranslation();
    t = translation.t;
  } catch {
    // Fallback translations when LanguageProvider is not available
    t = (key: string) => {
      const fallbacks: Record<string, string> = {
        'errors.somethingWentWrong': 'Something went wrong',
        'errors.tryRefreshing': 'Try refreshing the page or contact support if the problem persists.',
        'common.refresh': 'Refresh Page'
      };
      return fallbacks[key] || key;
    };
  }
  
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding={2}
    >
      <Alert severity="error" sx={{ mb: 2, maxWidth: 500 }}>
        <Typography variant="h6" gutterBottom>
          {t('components.errorBoundary.somethingWentWrong')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {error?.message || t('components.errorBoundary.unexpectedError')}
        </Typography>
      </Alert>
      <Button variant="contained" onClick={onReset}>
        {t('components.errorBoundary.tryAgain')}
      </Button>
    </Box>
  );
};

export default ErrorBoundary;