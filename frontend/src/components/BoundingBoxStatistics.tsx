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

// Backend data structure for bounding box statistics
interface BackendBoundingBoxStats {
  model_version: string;
  date_range: {
    start_date: string;
    end_date: string;
  };
  metrics: {
    map_score: number;
    iou_threshold: number;
    confidence_threshold: number;
    per_class_ap: {
      [className: string]: number;
    };
    total_annotations: number;
    total_predictions?: number;
  };
  class_distribution: {
    [className: string]: number;
  };
  included_soft_deleted: boolean;
  included_hidden_annotations: boolean;
}

export const BoundingBoxStatistics: React.FC = () => {
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
  const [statistics, setStatistics] = useState<BackendBoundingBoxStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [startDate, setStartDate] = useState<string>(formatDateForInput(subtractDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [includeSoftDeleted, setIncludeSoftDeleted] = useState(false);
  const [modelVersion, setModelVersion] = useState<string>(''); // Will be set when versions load
  const [iouThreshold, setIouThreshold] = useState<number>(0.5);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.5);

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
          adminService.getModelVersions('bounding_box'),
          adminService.getCurrentBoundingBoxInfo()
        ]);
        
        console.log('🔍 Bounding Box - Available Versions Response:', versionsResponse);
        console.log('🔍 Bounding Box - Current Model Info:', currentModelInfo);
        
        setAvailableVersions(versionsResponse.versions);
        
        // Set default to the current model version (the one actually being used)
        const currentVersion = currentModelInfo.version;
        console.log('🔍 Bounding Box - Current Version:', currentVersion);
        console.log('🔍 Bounding Box - Available Versions:', versionsResponse.versions);
        
        if (currentVersion && versionsResponse.versions.includes(currentVersion)) {
          console.log('✅ Bounding Box - Setting version to current:', currentVersion);
          setModelVersion(currentVersion);
        } else if (versionsResponse.versions.length > 0) {
          console.log('⚠️ Bounding Box - Current version not in list, using first:', versionsResponse.versions[0]);
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
        iou_threshold: iouThreshold,
        confidence_threshold: confidenceThreshold,
        include_soft_deleted: includeSoftDeleted,
      };

      console.log('🔍 Bounding Box Statistics Request:', request);
      
      const data = await adminService.getBoundingBoxStatistics(request);
      
      console.log('📊 Bounding Box Statistics Response - Full Object:', data);
      // Use backend data directly
      setStatistics(data as unknown as BackendBoundingBoxStats);
    } catch (err: any) {
      console.error('❌ Bounding Box Statistics Error:', err);
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

  const formatDecimal = (value: number | undefined | null): string => {
    if (value == null) return 'N/A';
    return value.toFixed(3);
  };

  const formatNumber = (value: number | undefined | null): string => {
    if (value == null) return 'N/A';
    return value.toLocaleString();
  };

  const renderMAPScores = () => {
    if (!statistics) return null;

    const { metrics } = statistics;

    // Check if metrics exists
    if (!metrics) {
      return (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('admin.modelStatistics.mAPScores')}
            </Typography>
            <Typography color="textSecondary">{t('admin.modelStatistics.noMAPScoresAvailable')}</Typography>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('admin.modelStatistics.mAPScore')}
          </Typography>
          <Box textAlign="center" sx={{ py: 2 }}>
            <Typography variant="h3" color="primary" sx={{ fontWeight: 'bold' }}>
              {formatDecimal(metrics.map_score)}
            </Typography>
            <Typography variant="body1" color="textSecondary">
              {t('admin.modelStatistics.overallMAPScore')}
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              {t('admin.modelStatistics.iouThreshold')}: {metrics.iou_threshold} | {t('admin.modelStatistics.confidence')}: {metrics.confidence_threshold}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderClassMetrics = () => {
    if (!statistics) return null;

    const { metrics, class_distribution } = statistics;

    // Extract class names and AP values from backend data
    const class_names = Object.keys(metrics.per_class_ap || {});
    const ap_values = Object.values(metrics.per_class_ap || {});
    const support_values = Object.values(class_distribution || {});

    // Check if required data exists
    if (!class_names || class_names.length === 0 || !ap_values || ap_values.length === 0) {
      return (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('admin.modelStatistics.perClassAP')}
            </Typography>
            <Typography color="textSecondary">{t('admin.modelStatistics.noClassMetricsAvailable')}</Typography>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('admin.modelStatistics.perClassAP')}
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('admin.modelStatistics.class')}</TableCell>
                  <TableCell align="right">{t('admin.modelStatistics.averagePrecision')}</TableCell>
                  <TableCell align="right">{t('admin.modelStatistics.annotationsCount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {class_names.map((className: string, i: number) => (
                  <TableRow key={className}>
                    <TableCell component="th" scope="row">
                      <Chip label={className} size="small" color="primary" />
                    </TableCell>
                    <TableCell align="right">
                      {formatPercentage(ap_values[i])}
                    </TableCell>
                    <TableCell align="right">
                      {formatNumber(support_values[i] || 0)}
                    </TableCell>
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
            {t('admin.modelStatistics.boundingBoxModel')}
          </Typography>
          
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={2}>
              <FormControl fullWidth disabled={loadingVersions}>
                <InputLabel id="bb-model-version-label">{t('admin.modelStatistics.modelVersion')}</InputLabel>
                <Select
                  labelId="bb-model-version-label"
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
            
            <Grid item xs={12} md={2}>
              <TextField
                label={t('admin.modelStatistics.startDate')}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={2}>
              <TextField
                label={t('admin.modelStatistics.endDate')}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={1}>
              <TextField
                label={t('admin.modelStatistics.iouThreshold')}
                type="number"
                value={iouThreshold}
                onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={1}>
              <TextField
                label={t('admin.modelStatistics.confidence')}
                type="number"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={2}>
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
            
            <Grid item xs={12} md={2}>
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
              <Grid item xs={12} md={4}>
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
              
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.totalAnnotations')}
                    </Typography>
                    <Typography variant="h4">
                      {formatNumber(statistics.metrics.total_annotations)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.classesDetected')}
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {Object.keys(statistics.metrics.per_class_ap || {}).length}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Evaluation Settings */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.iouThreshold')}
                    </Typography>
                    <Typography variant="h5" color="secondary">
                      {formatDecimal(statistics.metrics.iou_threshold)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography color="textSecondary" gutterBottom>
                      {t('admin.modelStatistics.confidenceThreshold')}
                    </Typography>
                    <Typography variant="h5" color="secondary">
                      {formatDecimal(statistics.metrics.confidence_threshold)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={4}>
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

            {/* Main Metrics */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                {renderMAPScores()}
              </Grid>
            </Grid>

            {/* Class Distribution and Metrics */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} lg={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {t('admin.modelStatistics.classDistribution')}
                    </Typography>
                    <Grid container spacing={2}>
                      {Object.entries(statistics.class_distribution).map(([className, count]) => (
                        <Grid item xs={12} md={6} key={className}>
                          <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                            <Typography variant="subtitle1" fontWeight="bold" sx={{ textTransform: 'capitalize' }}>
                              {className}
                            </Typography>
                            <Typography variant="h4" color="primary">
                              {formatNumber(count)}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {formatPercentage(count / statistics.metrics.total_annotations)} {t('admin.modelStatistics.ofTotal')}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} lg={6}>
                {renderClassMetrics()}
              </Grid>
            </Grid>
          </>
        )}
      </Box>
  );
};