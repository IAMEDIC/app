import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';

import { 
  StatisticsRequest
} from '@/types';
import { adminService } from '@/services/api';
import { useTranslation } from '@/contexts/LanguageContext';

// No transformation needed - use backend data directly
interface BackendClassificationStats {
  model_version: string;
  date_range: {
    start_date: string;
    end_date: string;
  };
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    confusion_matrix: {
      true_negative: number;
      false_positive: number;
      false_negative: number;
      true_positive: number;
    };
    total_samples: number;
  };
  sample_distribution: {
    [className: string]: number;
  };
  included_soft_deleted: boolean;
}

export const ClassificationStatistics: React.FC = () => {
  const { t } = useTranslation();
  
  // Helper function to format date for input
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to subtract days
  const subtractDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  };

  // State
  const [statistics, setStatistics] = useState<BackendClassificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [startDate, setStartDate] = useState<string>(formatDateForInput(subtractDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [includeSoftDeleted, setIncludeSoftDeleted] = useState(false);
  const [modelVersion, setModelVersion] = useState<string>(''); // Will be set when versions load

  // Model versions state
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Load available model versions and current model info on component mount
  useEffect(() => {
    const loadModelData = async () => {
      try {
        setLoadingVersions(true);
        
        // Load both available versions and current model info in parallel
        const [versionsResponse, currentModelInfo] = await Promise.all([
          adminService.getModelVersions('classifier'),
          adminService.getCurrentClassifierInfo()
        ]);
        
        setAvailableVersions(versionsResponse.versions);
        
        // Set default to the current model version (the one actually being used)
        const currentVersion = currentModelInfo.version;
        
        if (currentVersion && versionsResponse.versions.includes(currentVersion)) {
          setModelVersion(currentVersion);
        } else if (versionsResponse.versions.length > 0) {
          // Fallback to first available version if current version not in list
          setModelVersion(versionsResponse.versions[0]);
        }
        
      } catch (err) {
        console.error('Failed to load model data:', err);
        // Set to empty string if API fails
        setModelVersion('');
      } finally {
        setLoadingVersions(false);
      }
    };

    loadModelData();
  }, []);

  // Don't load data automatically on mount - let user click the button

  const handleLoadStatistics = async () => {
    try {
      setLoading(true);
      setError(null);

      const request: StatisticsRequest = {
        model_version: modelVersion,
        start_date: startDate,
        end_date: endDate,
        include_soft_deleted: includeSoftDeleted,
      };

      const data = await adminService.getClassificationStatistics(request);
      
      // Use backend data directly 
      setStatistics(data as unknown as BackendClassificationStats);
    } catch (err: any) {
      console.error('❌ Classification Statistics Error:', err);
      console.error('❌ Error Response:', err.response?.data);
      setError(err.response?.data?.detail || t('admin.modelStatistics.failedToLoadStatistics'));
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value: number | undefined | null): string => {
    if (value == null) return 'N/A';
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatNumber = (value: number | undefined | null): string => {
    if (value == null) return 'N/A';
    return value.toLocaleString();
  };

  const renderConfusionMatrix = () => {
    if (!statistics) return null;

    const { metrics, sample_distribution } = statistics;

    // Check if required data exists
    if (!metrics?.confusion_matrix || !sample_distribution) {
      return (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('admin.modelStatistics.confusionMatrix')}
            </Typography>
            <Typography color="textSecondary">{t('admin.modelStatistics.noConfusionMatrixAvailable')}</Typography>
          </CardContent>
        </Card>
      );
    }

    // Extract confusion matrix values
    const { true_negative, false_positive, false_negative, true_positive } = metrics.confusion_matrix;
    
    // Create confusion matrix in 2D array format for display
    const confusion_matrix = [
      [true_negative, false_positive],
      [false_negative, true_positive]
    ];
    
    // Get class names from sample distribution keys
    const class_names = Object.keys(sample_distribution).sort(); // Sort for consistent ordering

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('admin.modelStatistics.confusionMatrix')}
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.modelStatistics.actualPredicted')}</TableCell>
                  {class_names.map((className) => (
                    <TableCell key={className} align="center">
                      {className}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {confusion_matrix.map((row, i) => (
                  <TableRow key={class_names[i]}>
                    <TableCell component="th" scope="row">
                      <Chip label={class_names[i]} size="small" color="primary" />
                    </TableCell>
                    {row.map((value, j) => (
                      <TableCell 
                        key={j} 
                        align="center"
                        sx={{
                          backgroundColor: i === j ? 'success.light' : 
                                         value > 0 ? 'error.light' : 'inherit',
                          fontWeight: i === j ? 'bold' : 'normal'
                        }}
                      >
                        {value}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    );
  };



  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
        {/* Controls */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('admin.modelStatistics.classificationModel')}
          </Typography>
          
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 2 }}>
              <FormControl fullWidth disabled={loadingVersions}>
                <InputLabel id="model-version-label">{t('admin.modelStatistics.modelVersion')}</InputLabel>
                <Select
                  labelId="model-version-label"
                  label={t('admin.modelStatistics.modelVersion')}
                  value={modelVersion}
                  onChange={(e) => setModelVersion(e.target.value)}
                >
                  {loadingVersions ? (
                    <MenuItem disabled>
                      <CircularProgress size={16} sx={{ mr: 1 }} />
                      {t('admin.modelStatistics.loadingVersions')}
                    </MenuItem>
                  ) : (
                    availableVersions.map((version) => (
                      <MenuItem key={version} value={version}>
                        {version === 'champion' ? t('admin.modelStatistics.champion') : version}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                label={t('admin.modelStatistics.startDate')}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                slotProps={{
                inputLabel: {
                  shrink: true,
                },
              }}
                fullWidth
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                label={t('admin.modelStatistics.endDate')}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                slotProps={{
                inputLabel: {
                  shrink: true,
                },
              }}
                fullWidth
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={includeSoftDeleted}
                    onChange={(e) => setIncludeSoftDeleted(e.target.checked)}
                  />
                }
                label={t('admin.modelStatistics.includeSoftDeleted')}
              />
            </Grid>
            
            <Grid size={{ xs: 12, md: 4 }}>
              <Button
                variant="contained"
                onClick={handleLoadStatistics}
                disabled={loading}
                fullWidth
              >
                {t('admin.modelStatistics.loadStatistics')}
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Statistics Display */}
        {statistics && (
          <>
            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.modelVersion')}
                    </Typography>
                    <Typography variant="h6">
                      {statistics.model_version?.split(' - ')[0] || t('admin.modelStatistics.unknown')}
                    </Typography>
                    <Typography variant="body2">
                      {statistics.model_version || t('admin.modelStatistics.unknown')}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid size={{ xs: 12, md: 4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.overallAccuracy')}
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {formatPercentage(statistics.metrics.accuracy)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid size={{ xs: 12, md: 4 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.totalSamples')}
                    </Typography>
                    <Typography variant="h4">
                      {formatNumber(statistics.metrics.total_samples)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Additional Metrics */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.precision')}
                    </Typography>
                    <Typography variant="h5" color="secondary">
                      {formatPercentage(statistics.metrics.precision)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid size={{ xs: 12, md: 3 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.recall')}
                    </Typography>
                    <Typography variant="h5" color="secondary">
                      {formatPercentage(statistics.metrics.recall)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid size={{ xs: 12, md: 3 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.f1Score')}
                    </Typography>
                    <Typography variant="h5" color="secondary">
                      {formatPercentage(statistics.metrics.f1_score)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid size={{ xs: 12, md: 3 }}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.dateRange')}
                    </Typography>
                    <Typography variant="body2">
                      {statistics.date_range.start_date}
                    </Typography>
                    <Typography variant="body2">
                      {t('admin.modelStatistics.to')} {statistics.date_range.end_date}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Sample Distribution */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {t('admin.modelStatistics.sampleDistribution')}
                    </Typography>
                    <Grid container spacing={2}>
                      {Object.entries(statistics.sample_distribution).map(([className, count]) => (
                        <Grid size={{ xs: 12, md: 6 }} key={className}>
                          <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ textTransform: 'capitalize' }}>
                              {className.replace('_', ' ')}
                            </Typography>
                            <Typography variant="h4" color="primary">
                              {formatNumber(count)}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {formatPercentage(count / statistics.metrics.total_samples)} {t('admin.modelStatistics.ofTotal')}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Detailed Metrics */}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                {renderConfusionMatrix()}
              </Grid>
            </Grid>
          </>
        )}
      </Box>
  );
};