import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Chip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Image as ImageIcon,
  VideoFile as VideoIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { MediaSummary, MediaType, StorageInfo } from '@/types';
import { useTranslation } from '@/contexts/LanguageContext';

interface MediaUploadProps {
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  error?: string | null;
  recentUploads?: MediaSummary[];
  onRemoveRecent?: (mediaId: string) => void;
  storageInfo?: StorageInfo | null;
}

interface FileWithPreview extends File {
  preview?: string;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
  onUpload,
  uploading = false,
  error = null,
  recentUploads = [],
  onRemoveRecent,
  storageInfo = null,
}) => {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const acceptedTypes = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/bmp': ['.bmp'],
    'image/tiff': ['.tiff', '.tif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    'image/x-icon': ['.ico'],
    'video/mp4': ['.mp4'],
    'video/x-msvideo': ['.avi'],
    'video/quicktime': ['.mov'],
    'video/x-ms-wmv': ['.wmv'],
    'video/webm': ['.webm'],
    'video/3gpp': ['.3gp'],
    'video/x-flv': ['.flv'],
    'video/x-matroska': ['.mkv'],
    'video/ogg': ['.ogg'],
    'video/mpeg': ['.mpeg', '.mpg'],
    // DICOM (accept by extension; MIME can be vendor-specific)
    'application/dicom': ['.dcm'],
    'application/octet-stream': ['.dcm'],
  } as const;

  const validateFile = (file: File): string | null => {
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (file.size > maxSize) {
      return t('components.mediaUpload.fileSizeExceeded');
    }

    // Check storage availability
    if (storageInfo && storageInfo.available_bytes < file.size) {
      return t('errors.notEnoughStorage', { 
        fileSize: (file.size / (1024 * 1024)).toFixed(1), 
        available: storageInfo.available_mb.toFixed(1) 
      });
    }
    
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const hasDcmExtension = file.name.toLowerCase().endsWith('.dcm');
    
    if (!isImage && !isVideo && !hasDcmExtension) {
      return t('components.mediaUpload.unsupportedFileType');
    }

    // Check specific MIME types
    const supportedImageTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 
      'image/tiff', 'image/webp', 'image/svg+xml', 'image/x-icon'
    ];
    const supportedVideoTypes = [
      'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-ms-wmv',
      'video/webm', 'video/3gpp', 'video/x-flv', 'video/x-matroska', 
      'video/ogg', 'video/mpeg'
    ];

    if (isImage && !supportedImageTypes.includes(file.type)) {
      return t('components.mediaUpload.unsupportedImageFormat');
    }

    if (isVideo && !supportedVideoTypes.includes(file.type)) {
      return t('components.mediaUpload.unsupportedVideoFormat');
    }

    // Allow DICOM by extension regardless of MIME variations
    if (hasDcmExtension) {
      return null;
    }
    
    return null;
  };

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const validFiles: FileWithPreview[] = [];
    const errors: string[] = [];
    
    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        const fileWithPreview = file as FileWithPreview;
        if (file.type.startsWith('image/')) {
          fileWithPreview.preview = URL.createObjectURL(file);
        }
        validFiles.push(fileWithPreview);
      }
    });
    
    if (errors.length > 0) {
      console.error('File validation errors:', errors);
      setValidationErrors(prev => [...prev, ...errors]);
    }
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => {
      const file = prev[index];
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadSelectedFiles = async () => {
    for (const file of selectedFiles) {
      try {
        await onUpload(file);
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
    // Clear selected files after upload
    selectedFiles.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setSelectedFiles([]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return `0 ${t('storage.bytes')}`;
    const k = 1024;
    const sizes = [t('storage.bytes'), t('storage.kb'), t('storage.mb'), t('storage.gb')];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMediaIcon = (mediaType: MediaType) => {
    return mediaType === 'image' ? <ImageIcon /> : <VideoIcon />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <LinearProgress />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    return t(`media.${status}`, { defaultValue: status });
  };

  return (
    <Box>
      {/* Storage Warning */}
      {storageInfo && storageInfo.used_percentage >= 80 && (
        <Alert 
          severity={storageInfo.used_percentage >= 95 ? 'error' : 'warning'} 
          sx={{ mb: 2 }}
        >
          {storageInfo.used_percentage >= 95 ? (
            t('components.mediaUpload.storageAlmostFullUpload', { percent: storageInfo.used_percentage.toFixed(1) })
          ) : (
            t('components.mediaUpload.storageLowUpload', { percent: storageInfo.used_percentage.toFixed(1) })
          )}
        </Alert>
      )}

      {/* File Upload Area */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          border: dragActive ? 2 : 1,
          borderStyle: 'dashed',
          borderColor: dragActive ? 'primary.main' : 'grey.300',
          bgcolor: dragActive ? 'action.hover' : 'background.paper',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Box textAlign="center">
          <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {t('media.uploadMedia')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('components.mediaUpload.dragAndDropFiles')} {t('components.mediaUpload.clickToSelect')}
          </Typography>
          <input
            type="file"
            multiple
            accept={[...Object.keys(acceptedTypes), ...Array.from(new Set(Object.values(acceptedTypes).flat()))].join(',')}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="media-upload-input"
            disabled={uploading}
          />
          <label htmlFor="media-upload-input">
            <Button variant="outlined" component="span" disabled={uploading}>
              {t('components.mediaUpload.selectFiles')}
            </Button>
          </label>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            {t('components.mediaUpload.supportedFormats')}
            <br />
            {t('components.mediaUpload.maxFileSize')}
          </Typography>
        </Box>
      </Paper>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('components.mediaUpload.selectedFiles')} ({selectedFiles.length})
          </Typography>
          <List dense>
            {selectedFiles.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton edge="end" onClick={() => removeSelectedFile(index)}>
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemIcon>
                  {file.type.startsWith('image/') ? <ImageIcon /> : <VideoIcon />}
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={formatFileSize(file.size)}
                />
              </ListItem>
            ))}
          </List>
          <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              onClick={uploadSelectedFiles}
              disabled={uploading || selectedFiles.length === 0}
              startIcon={<UploadIcon />}
            >
              {uploading ? t('components.mediaUpload.uploading') : t('components.mediaUpload.uploadFiles')}
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                selectedFiles.forEach(file => {
                  if (file.preview) {
                    URL.revokeObjectURL(file.preview);
                  }
                });
                setSelectedFiles([]);
              }}
              disabled={uploading}
            >
              {t('common.remove')}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="body2" gutterBottom>
            {t('components.mediaUpload.pleaseWait')}
          </Typography>
          <LinearProgress />
        </Paper>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {validationErrors.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('components.mediaUpload.validationErrors')}
          </Typography>
          <List dense>
            {validationErrors.map((err, idx) => (
              <ListItem key={idx}>
                <ListItemIcon><ErrorIcon color="error" /></ListItemIcon>
                <ListItemText primary={err} />
              </ListItem>
            ))}
          </List>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={() => setValidationErrors([])}>
              {t('common.clear')}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Recent Uploads */}
      {recentUploads.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            {t('components.mediaUpload.recentUploads')}
          </Typography>
          <List dense>
            {recentUploads.map((media) => (
              <ListItem
                key={media.id}
                secondaryAction={
                  onRemoveRecent && (
                    <IconButton edge="end" onClick={() => onRemoveRecent(media.id)}>
                      <DeleteIcon />
                    </IconButton>
                  )
                }
              >
                <ListItemIcon>
                  {getMediaIcon(media.media_type)}
                </ListItemIcon>
                <ListItemText
                  primary={media.filename}
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{formatFileSize(media.file_size)}</span>
                      <Chip 
                        size="small" 
                        label={getStatusText(media.upload_status)}
                        color={media.upload_status === 'uploaded' ? 'success' : 'default'}
                      />
                    </Box>
                  }
                />
                {getStatusIcon(media.upload_status)}
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};