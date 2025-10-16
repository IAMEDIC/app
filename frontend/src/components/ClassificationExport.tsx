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

export const ClassificationExport: React.FC = () => {
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
      
      setSuccess(`CSV export completed: ${filename}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to export CSV');
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
      
      setSuccess(`ZIP export completed: ${filename}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to export ZIP');
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
            Export Classification Annotations
          </Typography>
          
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={includeSoftDeleted}
                    onChange={(e) => setIncludeSoftDeleted(e.target.checked)}
                  />
                }
                label="Include Soft Deleted Records"
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
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <CSVIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  CSV Export
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  Export annotation data as a CSV file containing classification 
                  labels, confidence scores, media references, and metadata.
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  <strong>Contents:</strong>
                  <br />• Annotation ID and timestamps
                  <br />• Classification labels and scores
                  <br />• Media file references
                  <br />• User and study information
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleCSVExport}
                  disabled={isLoading}
                  startIcon={csvLoading ? <CircularProgress size={20} /> : <DownloadIcon />}
                  fullWidth
                >
                  {csvLoading ? 'Exporting CSV...' : 'Download CSV'}
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <ArchiveIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                  ZIP Export (CSV + Media)
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  Export annotation data as CSV along with all associated media files 
                  packaged in a ZIP archive for complete analysis.
                </Typography>
                <Typography variant="body2" color="textSecondary" paragraph>
                  <strong>Contents:</strong>
                  <br />• annotations.csv file
                  <br />• media/ folder with all referenced files
                  <br />• Proper filename mapping for analysis
                </Typography>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleZIPExport}
                  disabled={isLoading}
                  startIcon={zipLoading ? <CircularProgress size={20} /> : <ArchiveIcon />}
                  fullWidth
                >
                  {zipLoading ? 'Creating ZIP...' : 'Download ZIP'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Quick Actions */}
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Quick Export Options:
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
              Last 7 Days
            </Button>
            <Button
              onClick={() => {
                const today = new Date();
                setStartDate(formatDateForInput(subtractDays(today, 30)));
                setEndDate(formatDateForInput(today));
              }}
              disabled={isLoading}
            >
              Last 30 Days
            </Button>
            <Button
              onClick={() => {
                const today = new Date();
                setStartDate(formatDateForInput(subtractDays(today, 90)));
                setEndDate(formatDateForInput(today));
              }}
              disabled={isLoading}
            >
              Last 90 Days
            </Button>
          </ButtonGroup>
        </Paper>
      </Box>
  );
};