import { create } from 'zustand';
import { mediaService } from '@/services/api';

interface MediaCacheItem {
  blobUrl: string;
  createdAt: number;
  mediaId: string;
  studyId: string;
}

interface MediaCacheStore {
  cache: Map<string, MediaCacheItem>;
  loadingStates: Map<string, boolean>;
  
  // Actions
  getCachedMedia: (studyId: string, mediaId: string) => Promise<string>;
  clearMediaFromCache: (mediaId: string) => void;
  clearStudyFromCache: (studyId: string) => void;
  clearExpiredCache: () => void;
  clearAllCache: () => void;
}

// Cache expiration time: 30 minutes
const CACHE_EXPIRATION_MS = 30 * 60 * 1000;

// Helper function to generate cache key
const getCacheKey = (studyId: string, mediaId: string): string => `${studyId}:${mediaId}`;

export const useMediaCacheStore = create<MediaCacheStore>((set, get) => ({
  cache: new Map(),
  loadingStates: new Map(),

  getCachedMedia: async (studyId: string, mediaId: string): Promise<string> => {
    const cacheKey = getCacheKey(studyId, mediaId);
    const state = get();
    
    // Check if already in cache and not expired
    const cachedItem = state.cache.get(cacheKey);
    if (cachedItem) {
      const isExpired = Date.now() - cachedItem.createdAt > CACHE_EXPIRATION_MS;
      if (!isExpired) {
        return cachedItem.blobUrl;
      } else {
        // Clean up expired item
        URL.revokeObjectURL(cachedItem.blobUrl);
        state.cache.delete(cacheKey);
      }
    }
    
    // Check if already loading to prevent duplicate requests
    if (state.loadingStates.get(cacheKey)) {
      // Wait for the existing request to complete
      return new Promise((resolve, reject) => {
        const checkCache = () => {
          const currentState = get();
          const item = currentState.cache.get(cacheKey);
          const isLoading = currentState.loadingStates.get(cacheKey);
          
          if (item) {
            resolve(item.blobUrl);
          } else if (!isLoading) {
            // Loading completed but no item means it failed
            reject(new Error('Failed to load media'));
          } else {
            // Still loading, check again
            setTimeout(checkCache, 100);
          }
        };
        checkCache();
      });
    }
    
    // Mark as loading
    set((state) => ({
      loadingStates: new Map(state.loadingStates).set(cacheKey, true)
    }));
    
    try {
      // Fetch the media
      const blob = await mediaService.downloadMedia(studyId, mediaId);
      const blobUrl = URL.createObjectURL(blob);
      
      // Store in cache
      const cacheItem: MediaCacheItem = {
        blobUrl,
        createdAt: Date.now(),
        mediaId,
        studyId,
      };
      
      set((state) => ({
        cache: new Map(state.cache).set(cacheKey, cacheItem),
        loadingStates: new Map(state.loadingStates).set(cacheKey, false)
      }));
      
      return blobUrl;
    } catch (error) {
      // Mark as not loading and propagate error
      set((state) => ({
        loadingStates: new Map(state.loadingStates).set(cacheKey, false)
      }));
      throw error;
    }
  },

  clearMediaFromCache: (mediaId: string) => {
    set((state) => {
      const newCache = new Map(state.cache);
      const newLoadingStates = new Map(state.loadingStates);
      
      // Find and remove all cache entries for this media ID
      for (const [key, item] of newCache.entries()) {
        if (item.mediaId === mediaId) {
          URL.revokeObjectURL(item.blobUrl);
          newCache.delete(key);
          newLoadingStates.delete(key);
        }
      }
      
      return {
        cache: newCache,
        loadingStates: newLoadingStates,
      };
    });
  },

  clearStudyFromCache: (studyId: string) => {
    set((state) => {
      const newCache = new Map(state.cache);
      const newLoadingStates = new Map(state.loadingStates);
      
      // Find and remove all cache entries for this study ID
      for (const [key, item] of newCache.entries()) {
        if (item.studyId === studyId) {
          URL.revokeObjectURL(item.blobUrl);
          newCache.delete(key);
          newLoadingStates.delete(key);
        }
      }
      
      return {
        cache: newCache,
        loadingStates: newLoadingStates,
      };
    });
  },

  clearExpiredCache: () => {
    set((state) => {
      const newCache = new Map(state.cache);
      const now = Date.now();
      
      for (const [key, item] of newCache.entries()) {
        if (now - item.createdAt > CACHE_EXPIRATION_MS) {
          URL.revokeObjectURL(item.blobUrl);
          newCache.delete(key);
        }
      }
      
      return { cache: newCache };
    });
  },

  clearAllCache: () => {
    set((state) => {
      // Revoke all blob URLs
      for (const item of state.cache.values()) {
        URL.revokeObjectURL(item.blobUrl);
      }
      
      return {
        cache: new Map(),
        loadingStates: new Map(),
      };
    });
  },
}));

// Cleanup expired cache every 5 minutes
setInterval(() => {
  useMediaCacheStore.getState().clearExpiredCache();
}, 5 * 60 * 1000);