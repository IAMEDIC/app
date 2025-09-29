import React, { createContext, useContext, useState, useEffect } from 'react';
import { StorageInfo } from '@/types';
import { studyService } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

interface StorageContextType {
  storageInfo: StorageInfo | null;
  refreshStorageInfo: () => Promise<void>;
  loading: boolean;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export const useStorageInfo = () => {
  const context = useContext(StorageContext);
  if (context === undefined) {
    throw new Error('useStorageInfo must be used within a StorageProvider');
  }
  return context;
};

interface StorageProviderProps {
  children: React.ReactNode;
}

export const StorageProvider: React.FC<StorageProviderProps> = ({ children }) => {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const refreshStorageInfo = async () => {
    // Only fetch storage info for doctors
    if (!user?.roles?.includes('doctor')) {
      return;
    }

    try {
      setLoading(true);
      const storage = await studyService.getStorageInfo();
      setStorageInfo(storage);
    } catch (err) {
      console.error('Failed to load storage info:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load storage info when user changes or component mounts
  useEffect(() => {
    if (user?.roles?.includes('doctor')) {
      refreshStorageInfo();
    } else {
      setStorageInfo(null);
    }
  }, [user]);

  const value: StorageContextType = {
    storageInfo,
    refreshStorageInfo,
    loading,
  };

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
};