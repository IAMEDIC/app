/**
 * Utility functions for managing media cache across the application
 */

import { useMediaCacheStore } from '@/store/mediaCacheStore';

/**
 * Hook for managing media cache operations
 * Provides common cache management functions for components
 */
export const useMediaCacheManager = () => {
  const clearMediaFromCache = useMediaCacheStore((state) => state.clearMediaFromCache);
  const clearStudyFromCache = useMediaCacheStore((state) => state.clearStudyFromCache);
  const clearAllCache = useMediaCacheStore((state) => state.clearAllCache);
  const clearExpiredCache = useMediaCacheStore((state) => state.clearExpiredCache);

  /**
   * Clear cache for a specific media item
   * Useful when media is deleted or updated
   */
  const handleMediaDeleted = (mediaId: string) => {
    clearMediaFromCache(mediaId);
  };

  /**
   * Clear cache for all media in a study
   * Useful when study is deleted or when switching studies
   */
  const handleStudyDeleted = (studyId: string) => {
    clearStudyFromCache(studyId);
  };

  /**
   * Clear all cached media
   * Useful for logout or memory cleanup
   */
  const handleClearAll = () => {
    clearAllCache();
  };

  /**
   * Force cleanup of expired cache entries
   * Useful for manual memory management
   */
  const handleCleanupExpired = () => {
    clearExpiredCache();
  };

  return {
    handleMediaDeleted,
    handleStudyDeleted,
    handleClearAll,
    handleCleanupExpired,
  };
};

/**
 * Utility function to get cache statistics
 * Useful for debugging and monitoring
 */
export const getCacheStats = () => {
  const state = useMediaCacheStore.getState();
  const cacheSize = state.cache.size;
  const loadingCount = Array.from(state.loadingStates.values()).filter(Boolean).length;
  
  // Calculate total memory usage (approximate)
  // This is approximate since we can't easily get blob size from URL
  // In a real implementation, you might want to store the blob size in the cache item
  const totalMemoryBytes = cacheSize * 1024 * 1024; // Assume 1MB per item as rough estimate

  return {
    totalCachedItems: cacheSize,
    itemsCurrentlyLoading: loadingCount,
    approximateMemoryUsageMB: Math.round(totalMemoryBytes / (1024 * 1024)),
  };
};