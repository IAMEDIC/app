import React from 'react';
import TopBar from '@/components/TopBar';
import { StudyView } from '@/components/StudyView';

const StudyPage: React.FC = () => {
  return (
    <>
      <TopBar />
      <StudyView />
    </>
  );
};

export default StudyPage;