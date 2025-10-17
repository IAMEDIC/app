import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Button,
  TextField,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  ButtonGroup,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Archive as ArchiveIcon,
  TableChart as CSVIcon,
} from '@mui/icons-material';
import { CSVExportRequest } from '@/types';
import { adminService } from '@/services/api';
import { useTranslation } from '@/contexts/LanguageContext';

export const ClassificationExport: React.FC = () => {
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

  // Form state
  const [startDate, setStartDate] = useState<string>(formatDateForInput(subtractDays(new Date(), 30)));
  const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));
  const [includeSoftDeleted, setIncludeSoftDeleted] = useState(false);
  
  // UI state
  const [csvLoading, setCsvLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const createExportRequest = (): CSVExportRequest => ({
    start_date: startDate,
    end_date: endDate,
    include_soft_deleted: includeSoftDeleted,
  });

  const handleCSVExport = async () => {
    try {
      setCsvLoading(true);
      setError(null);
      setSuccess(null);

      const request = createExportRequest();
      const blob = await adminService.exportClassificationCSV(request);
      
      // Generate filename
      const now = new Date();
      const timestamp = now.getFullYear() + 
                       (now.getMonth() + 1).toString().padStart(2, '0') +
                       now.getDate().toString().padStart(2, '0') + '_' +
                       now.getHours().toString().padStart(2, '0') +
                       now.getMinutes().toString().padStart(2, '0') +
                       now.getSeconds().toString().padStart(2, '0');
      const filename = `classification_annotations_${request.start_date}_${request.end_date}_${timestamp}.csv`;
      
      // Download the file
      adminService.downloadBlob(blob, filename);
      
      setSuccess(t('admin.dataExport.csvExportCompleted', { filename }));
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.dataExport.failedToExportCsv'));
    } finally {
      setCsvLoading(false);
    }
  };

  const handleZIPExport = async () => {
    try {
      setZipLoading(true);
      setError(null);
      setSuccess(null);

      const request = createExportRequest();
      const blob = await adminService.exportClassificationZIP(request);
      
      // Generate filename
      const now = new Date();
      const timestamp = now.getFullYear() + 
                       (now.getMonth() + 1).toString().padStart(2, '0') +
                       now.getDate().toString().padStart(2, '0') + '_' +
                       now.getHours().toString().padStart(2, '0') +
                       now.getMinutes().toString().padStart(2, '0') +
                       now.getSeconds().toString().padStart(2, '0');
      const filename = `classification_annotations_with_media_${request.start_date}_${request.end_date}_${timestamp}.zip`;
      
      // Download the file
      adminService.downloadBlob(blob, filename);
      
      setSuccess(t('admin.dataExport.zipExportCompleted', { filename }));
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.dataExport.failedToExportZip'));
    } finally {
      setZipLoading(false);
    }
  };

  const isLoading = csvLoading || zipLoading;

  return (
    <Box sx={{ p: 2 }}>
        {/* Export Form */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('admin.dataExport.exportClassificationAnnotations')}
          </Typography>
          
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label={t('admin.dataExport.startDate')}
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
            
            <Grid size={{ xs: 12, md: 4}}>
              <TextField
                label={t('admin.dataExport.endDate')}
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
            
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={includeSoftDeleted}
                    onChange={(e) => setIncludeSoftDeleted(e.target.checked)}
                  />
                }
                label={t('admin.dataExport.includeSoftDeletedRecords')}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Status Messages */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        {/* Export Options */}
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <CSVIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {t('admin.dataExport.csvExportTitle')}
                </Typography>
                <Typography variant="body2" color="textSecondary" component="p">
                  {t('admin.dataExport.csvExportDescription')}
                </Typography>
                <Typography variant="body2" color="textSecondary" component="p">
                  <strong>{t('admin.dataExport.csvContentsTitle')}</strong>
                  <br />• {t('admin.dataExport.csvContents.annotationId')}
                  <br />• {t('admin.dataExport.csvContents.classificationLabels')}
                  <br />• {t('admin.dataExport.csvContents.mediaReferences')}
                  <br />• {t('admin.dataExport.csvContents.userStudyInfo')}
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleCSVExport}
                  disabled={isLoading}
                  startIcon={csvLoading ? <CircularProgress size={20} /> : <DownloadIcon />}
                  fullWidth
                >
                  {csvLoading ? t('admin.dataExport.exportingCsv') : t('admin.dataExport.downloadCsv')}
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <ArchiveIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {t('admin.dataExport.zipExportTitle')}
                </Typography>
                <Typography variant="body2" color="textSecondary" component="p">
                  {t('admin.dataExport.zipExportDescription')}
                </Typography>
                <Typography variant="body2" color="textSecondary" component="p">
                  <strong>{t('admin.dataExport.csvContentsTitle')}</strong>
                  <br />• {t('admin.dataExport.zipContents.csvFile')}
                  <br />• {t('admin.dataExport.zipContents.mediaFolder')}
                  <br />• {t('admin.dataExport.zipContents.filenameMapping')}
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleZIPExport}
                  disabled={isLoading}
                  startIcon={zipLoading ? <CircularProgress size={20} /> : <ArchiveIcon />}
                  fullWidth
                >
                  {zipLoading ? t('admin.dataExport.creatingZip') : t('admin.dataExport.downloadZip')}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Quick Actions */}
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('admin.dataExport.quickExportOptions')}
          </Typography>
          <ButtonGroup variant="outlined" size="small">
            <Button
              onClick={() => {
                const today = new Date();
                setStartDate(formatDateForInput(subtractDays(today, 7)));
                setEndDate(formatDateForInput(today));
              }}
              disabled={isLoading}
            >
              {t('admin.dataExport.last7Days')}
            </Button>
            <Button
              onClick={() => {
                const today = new Date();
                setStartDate(formatDateForInput(subtractDays(today, 30)));
                setEndDate(formatDateForInput(today));
              }}
              disabled={isLoading}
            >
              {t('admin.dataExport.last30Days')}
            </Button>
            <Button
              onClick={() => {
                const today = new Date();
                setStartDate(formatDateForInput(subtractDays(today, 90)));
                setEndDate(formatDateForInput(today));
              }}
              disabled={isLoading}
            >
              {t('admin.dataExport.last90Days')}
            </Button>
          </ButtonGroup>
        </Paper>
      </Box>
  );
};