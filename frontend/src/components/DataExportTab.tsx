import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
} from '@mui/material';
import { ClassificationExport } from '@/components/ClassificationExport';
import { BoundingBoxExport } from '@/components/BoundingBoxExport';
import { useTranslation } from '@/contexts/LanguageContext';

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
      id={`export-tabpanel-${index}`}
      aria-labelledby={`export-tab-${index}`}
      {...other}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export const DataExportTab: React.FC = () => {
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Sub-tabs for different export types */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={currentTab} 
          onChange={handleTabChange}
          aria-label="Data export tabs"
        >
          <Tab 
            label={t('admin.dataExport.classificationAnnotations')} 
            id="export-tab-0"
            aria-controls="export-tabpanel-0"
          />
          <Tab 
            label={t('admin.dataExport.boundingBoxAnnotations')}
            id="export-tab-1"
            aria-controls="export-tabpanel-1" 
          />
        </Tabs>
      </Box>

      {/* Tab panels */}
      <TabPanel value={currentTab} index={0}>
        <ClassificationExport />
      </TabPanel>

      <TabPanel value={currentTab} index={1}>
        <BoundingBoxExport />
      </TabPanel>
    </Box>
  );
};