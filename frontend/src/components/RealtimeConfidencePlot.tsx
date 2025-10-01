import React from 'react';
import {
  Box,
  Paper,
  Typography,
  useTheme
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useTranslation } from '@/contexts/LanguageContext';

interface ConfidenceDataPoint {
  timestamp: number; // Relative time in seconds (-10 to 0)
  confidence: number; // 0 to 1
  absoluteTime: number; // Absolute timestamp for internal use
}

interface RealtimeConfidencePlotProps {
  data: ConfidenceDataPoint[];
  isRecording: boolean;
}

const RealtimeConfidencePlot: React.FC<RealtimeConfidencePlotProps> = ({
  data,
  isRecording
}) => {
  const theme = useTheme();
  const { t } = useTranslation();

  // Function to get line color based on confidence value
  const getLineColor = (confidence: number): string => {
    if (confidence >= 0.8) {
      // Green for high confidence (0.8 - 1.0)
      const intensity = Math.min(255, 150 + (confidence - 0.8) * 525); // 150-255 range
      return `rgb(0, ${intensity}, 0)`;
    } else if (confidence >= 0.4) {
      // Yellow for medium confidence (0.4 - 0.8)
      const redIntensity = 255;
      const greenIntensity = Math.min(255, 200 + (confidence - 0.4) * 137.5); // 200-255 range
      return `rgb(${redIntensity}, ${greenIntensity}, 0)`;
    } else {
      // Red for low confidence (0.0 - 0.4)
      const intensity = Math.max(150, 255 - (0.4 - confidence) * 262.5); // 150-255 range
      return `rgb(${intensity}, 0, 0)`;
    }
  };

  // Get the current line color based on latest valid data point
  const latestValidConfidence = React.useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (!isNaN(data[i].confidence)) {
        return data[i].confidence;
      }
    }
    return 0.5; // Default to middle value
  }, [data]);

  const currentLineColor = getLineColor(latestValidConfidence);

  // Filter data to only include valid confidence values for line rendering
  const validData = React.useMemo(() => {
    const filtered = data.filter(point => !isNaN(point.confidence) && point.confidence >= 0);
    
    // Ensure we have at least 2 points for line rendering
    if (filtered.length < 2) {
      return [];
    }
    
    return filtered;
  }, [data]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const confidence = payload[0].value;
      return (
        <Paper
          sx={{
            p: 1,
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 1
          }}
        >
          <Typography variant="body2">
            <strong>{t('streaming.confidencePlot.time')}:</strong> {label}s {t('streaming.confidencePlot.ago')}
          </Typography>
          <Typography variant="body2">
            <strong>{t('streaming.confidencePlot.confidence')}:</strong> {(confidence * 100).toFixed(1)}%
          </Typography>
        </Paper>
      );
    }
    return null;
  };

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        mt: 2,
        backgroundColor: theme.palette.background.paper,
        border: isRecording ? `2px solid ${theme.palette.success.main}` : `1px solid ${theme.palette.divider}`,
        borderRadius: 2
      }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          {t('streaming.confidencePlot.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isRecording 
            ? t('streaming.confidencePlot.description.recording')
            : t('streaming.confidencePlot.description.notRecording')
          }
        </Typography>
      </Box>

      <Box sx={{ height: 200, width: '100%', position: 'relative' }}>
        {validData.length < 2 && isRecording && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
              textAlign: 'center'
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {t('streaming.confidencePlot.waitingForData')}
            </Typography>
          </Box>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={validData.length >= 2 ? validData : data}
            style={{ 
              shapeRendering: 'geometricPrecision',
              textRendering: 'geometricPrecision'
            }}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke={theme.palette.divider}
              opacity={0.3}
            />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="linear"
              domain={[-10, 0]}
              ticks={[-10, -8, -6, -4, -2, 0]}
              tickFormatter={(value) => `${value}s`}
              stroke={theme.palette.text.secondary}
              fontSize={12}
            />
            <YAxis
              domain={[0, 1]}
              tickCount={6}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              stroke={theme.palette.text.secondary}
              fontSize={12}
            />
            <Tooltip 
              content={<CustomTooltip />}
              cursor={{
                stroke: theme.palette.primary.main,
                strokeWidth: 1,
                strokeDasharray: '5 5'
              }}
            />
            {validData.length >= 2 && (
              <Line
                type="monotone"
                dataKey="confidence"
                stroke={currentLineColor}
                strokeWidth={3}
                strokeOpacity={1}
                dot={false}
                strokeLinecap="round"
                strokeLinejoin="round"
                activeDot={{
                  r: 6,
                  stroke: currentLineColor,
                  strokeWidth: 3,
                  fill: theme.palette.background.paper
                }}
                connectNulls={true}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>

      {/* Legend */}
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 3,
              backgroundColor: 'rgb(0, 200, 0)',
              borderRadius: 1
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {t('streaming.confidencePlot.legend.high')} (80-100%)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 3,
              backgroundColor: 'rgb(255, 200, 0)',
              borderRadius: 1
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {t('streaming.confidencePlot.legend.medium')} (40-80%)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 16,
              height: 3,
              backgroundColor: 'rgb(200, 0, 0)',
              borderRadius: 1
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {t('streaming.confidencePlot.legend.low')} (0-40%)
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default RealtimeConfidencePlot;