import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Typography,
  Card,
  CardContent,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Videocam as VideocamIcon,
  Refresh as RefreshIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useTranslation } from '@/contexts/LanguageContext';

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface CameraSelectorProps {
  onCameraSelected: (deviceId: string, stream: MediaStream) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export const CameraSelector: React.FC<CameraSelectorProps> = ({
  onCameraSelected,
  onError,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Check camera permission on mount
  useEffect(() => {
    checkCameraPermission();
  }, []);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const checkCameraPermission = async () => {
    try {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setPermissionState(permission.state);
      
      if (permission.state === 'granted') {
        await enumerateDevices();
      }
      
      // Listen for permission changes
      permission.onchange = () => {
        setPermissionState(permission.state);
        if (permission.state === 'granted') {
          enumerateDevices();
        }
      };
    } catch (err) {
      console.warn('Permission API not supported, will request on camera access');
    }
  };

  const enumerateDevices = async () => {
    try {
      setLoading(true);
      setError(null);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}...`,
        }));

      setDevices(videoDevices);

      if (videoDevices.length === 0) {
        setError(t('streaming.noCamerasFound'));
      } else if (videoDevices.length === 1) {
        // Auto-select if only one camera
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err: any) {
      console.error('Failed to enumerate devices:', err);
      setError(t('streaming.failedToEnumerateDevices'));
    } finally {
      setLoading(false);
    }
  };

  const requestCameraAccess = async () => {
    try {
      setLoading(true);
      setError(null);

      // Request camera access to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: false 
      });
      
      // Stop the temporary stream immediately
      tempStream.getTracks().forEach(track => track.stop());
      
      // Now enumerate devices with proper labels
      await enumerateDevices();
      setPermissionState('granted');
    } catch (err: any) {
      console.error('Camera access denied:', err);
      if (err.name === 'NotAllowedError') {
        setError(t('streaming.cameraAccessDenied'));
        setPermissionState('denied');
      } else if (err.name === 'NotFoundError') {
        setError(t('streaming.noCamerasFound'));
      } else {
        setError(t('streaming.cameraAccessError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const connectToCamera = async () => {
    if (!selectedDeviceId) {
      setError(t('streaming.selectCameraFirst'));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      // Create constraints with device ID
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false, // No audio as requested
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setIsConnected(true);
      
      // Notify parent component
      onCameraSelected(selectedDeviceId, newStream);
    } catch (err: any) {
      console.error('Failed to connect to camera:', err);
      if (err.name === 'NotAllowedError') {
        setError(t('streaming.cameraAccessDenied'));
      } else if (err.name === 'NotFoundError') {
        setError(t('streaming.cameraNotFound'));
      } else if (err.name === 'OverconstrainedError') {
        setError(t('streaming.cameraConstraintsError'));
      } else {
        setError(t('streaming.cameraConnectionError'));
        onError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const disconnectCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsConnected(false);
  };

  if (permissionState === 'denied') {
    return (
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <ErrorIcon color="error" />
            <Typography variant="h6" color="error">
              {t('streaming.cameraAccessDenied')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t('streaming.cameraAccessDeniedHelp')}
          </Typography>
          <Button
            variant="outlined"
            onClick={checkCameraPermission}
            startIcon={<RefreshIcon />}
          >
            {t('streaming.retryPermission')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <VideocamIcon />
          <Typography variant="h6">
            {t('streaming.cameraSetup')}
          </Typography>
          {isConnected && (
            <CheckIcon color="success" fontSize="small" />
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {permissionState === 'prompt' && devices.length === 0 && (
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary" mb={2}>
              {t('streaming.requestCameraAccess')}
            </Typography>
            <Button
              variant="contained"
              onClick={requestCameraAccess}
              disabled={loading || disabled}
              startIcon={loading ? <CircularProgress size={20} /> : <VideocamIcon />}
            >
              {loading ? t('streaming.requestingAccess') : t('streaming.allowCameraAccess')}
            </Button>
          </Box>
        )}

        {devices.length > 0 && (
          <Box>
            <Box display="flex" gap={1} alignItems="center" mb={2}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('streaming.selectCamera')}</InputLabel>
                <Select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  disabled={disabled || isConnected}
                  label={t('streaming.selectCamera')}
                >
                  {devices.map((device) => (
                    <MenuItem key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title={t('streaming.refreshCameras')}>
                <IconButton
                  onClick={enumerateDevices}
                  disabled={loading || disabled || isConnected}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            </Box>

            <Box display="flex" gap={1}>
              {isConnected ? (
                <Button
                  variant="outlined"
                  onClick={disconnectCamera}
                  disabled={disabled}
                  color="error"
                >
                  {t('streaming.disconnect')}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={connectToCamera}
                  disabled={loading || disabled || !selectedDeviceId}
                  startIcon={loading ? <CircularProgress size={20} /> : <VideocamIcon />}
                >
                  {loading ? t('streaming.connecting') : t('streaming.connect')}
                </Button>
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};