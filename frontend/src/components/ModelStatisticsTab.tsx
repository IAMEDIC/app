import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
} from '@mui/material';
import { ClassificationStatistics } from '@/components/ClassificationStatistics';
import { BoundingBoxStatistics } from '@/components/BoundingBoxStatistics';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`statistics-tabpanel-${index}`}
      aria-labelledby={`statistics-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export const ModelStatisticsTab: React.FC = () => {
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Sub-tabs for different model types */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={currentTab} 
          onChange={handleTabChange}
          aria-label="Model statistics tabs"
        >
          <Tab 
            label="Classification Model" 
            id="statistics-tab-0"
            aria-controls="statistics-tabpanel-0"
          />
          <Tab 
            label="Bounding Box Model"
            id="statistics-tab-1"
            aria-controls="statistics-tabpanel-1" 
          />
        </Tabs>
      </Box>

      {/* Tab panels */}
      <TabPanel value={currentTab} index={0}>
        <ClassificationStatistics />
      </TabPanel>

      <TabPanel value={currentTab} index={1}>
        <BoundingBoxStatistics />
      </TabPanel>
    </Box>
  );
};