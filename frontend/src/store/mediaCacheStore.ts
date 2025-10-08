import { create } from 'zustand';
import { mediaService } from '@/services/api';

interface MediaCacheItem {
  blobUrl: string;
  createdAt: number;
  mediaId: string;
  studyId: string;
  size: number; // Size in bytes
  lastAccessed: number; // For LRU eviction
  filename: string; // For debugging/display
}

interface CacheStats {
  totalSize: number;
  totalItems: number;
  maxSize: number;
  usagePercentage: number;
  oldestItem?: number;
  largestItem?: number;
}

interface MediaCacheStore {
  cache: Map<string, MediaCacheItem>;
  loadingStates: Map<string, boolean>;
  totalCacheSize: number;
  maxCacheSize: number; // 200MB default
  
  // Actions
  getCachedMedia: (studyId: string, mediaId: string, onProgress?: (progress: number) => void) => Promise<string>;
  clearMediaFromCache: (mediaId: string) => void;
  clearStudyFromCache: (studyId: string) => void;
  clearExpiredCache: () => void;
  clearAllCache: () => void;
  
  // New cache management actions
  evictLargestItems: (targetSize?: number) => void;
  evictOldestItems: (targetSize?: number) => void;
  evictLeastRecentlyUsed: (targetSize?: number) => void;
  getCacheStats: () => CacheStats;
  optimizeCache: () => void;
}

// Cache expiration time: 30 minutes
const CACHE_EXPIRATION_MS = 30 * 60 * 1000;

// Cache size limits
const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200MB
const CACHE_CLEANUP_THRESHOLD = 0.8; // Start cleanup at 80% capacity
const CACHE_TARGET_SIZE = 0.6; // Clean down to 60% capacity

// Helper function to generate cache key
const getCacheKey = (studyId: string, mediaId: string): string => `${studyId}:${mediaId}`;

export const useMediaCacheStore = create<MediaCacheStore>((set, get) => ({
  cache: new Map(),
  loadingStates: new Map(),
  totalCacheSize: 0,
  maxCacheSize: MAX_CACHE_SIZE,

  getCachedMedia: async (studyId: string, mediaId: string, onProgress?: (progress: number) => void): Promise<string> => {
    const cacheKey = getCacheKey(studyId, mediaId);
    const state = get();
    
    // Check if already in cache and not expired
    const cachedItem = state.cache.get(cacheKey);
    if (cachedItem) {
      const isExpired = Date.now() - cachedItem.createdAt > CACHE_EXPIRATION_MS;
      if (!isExpired) {
        // Update last accessed time for LRU tracking
        cachedItem.lastAccessed = Date.now();
        return cachedItem.blobUrl;
      } else {
        // Clean up expired item
        URL.revokeObjectURL(cachedItem.blobUrl);
        set((state) => ({
          cache: new Map(state.cache),
          totalCacheSize: state.totalCacheSize - cachedItem.size
        }));
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
    
    // Optimize cache before adding new item
    get().optimizeCache();
    
    // Mark as loading
    set((state) => ({
      loadingStates: new Map(state.loadingStates).set(cacheKey, true)
    }));
    
    try {
      // Fetch the media
      const blob = await mediaService.downloadMedia(studyId, mediaId, onProgress);
      const blobUrl = URL.createObjectURL(blob);
      
      // Store in cache
      const now = Date.now();
      const cacheItem: MediaCacheItem = {
        blobUrl,
        createdAt: now,
        lastAccessed: now,
        mediaId,
        studyId,
        size: blob.size,
        filename: `media_${mediaId}`, // We'll enhance this later
      };
      
      set((state) => ({
        cache: new Map(state.cache).set(cacheKey, cacheItem),
        loadingStates: new Map(state.loadingStates).set(cacheKey, false),
        totalCacheSize: state.totalCacheSize + cacheItem.size
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
      let sizeReduction = 0;
      
      // Find and remove all cache entries for this media ID
      for (const [key, item] of newCache.entries()) {
        if (item.mediaId === mediaId) {
          URL.revokeObjectURL(item.blobUrl);
          newCache.delete(key);
          newLoadingStates.delete(key);
          sizeReduction += item.size;
        }
      }
      
      return {
        cache: newCache,
        loadingStates: newLoadingStates,
        totalCacheSize: state.totalCacheSize - sizeReduction,
      };
    });
  },

  clearStudyFromCache: (studyId: string) => {
    set((state) => {
      const newCache = new Map(state.cache);
      const newLoadingStates = new Map(state.loadingStates);
      let sizeReduction = 0;
      
      // Find and remove all cache entries for this study ID
      for (const [key, item] of newCache.entries()) {
        if (item.studyId === studyId) {
          URL.revokeObjectURL(item.blobUrl);
          newCache.delete(key);
          newLoadingStates.delete(key);
          sizeReduction += item.size;
        }
      }
      
      return {
        cache: newCache,
        loadingStates: newLoadingStates,
        totalCacheSize: state.totalCacheSize - sizeReduction,
      };
    });
  },

  clearExpiredCache: () => {
    set((state) => {
      const newCache = new Map(state.cache);
      const now = Date.now();
      let sizeReduction = 0;
      
      for (const [key, item] of newCache.entries()) {
        if (now - item.createdAt > CACHE_EXPIRATION_MS) {
          URL.revokeObjectURL(item.blobUrl);
          newCache.delete(key);
          sizeReduction += item.size;
        }
      }
      
      return { 
        cache: newCache,
        totalCacheSize: state.totalCacheSize - sizeReduction
      };
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
        totalCacheSize: 0,
      };
    });
  },

  evictLargestItems: (targetSize?: number) => {
    const state = get();
    const target = targetSize || state.maxCacheSize * CACHE_TARGET_SIZE;
    
    if (state.totalCacheSize <= target) return;
    
    // Sort items by size (largest first)
    const entries = Array.from(state.cache.entries()).sort(
      ([, a], [, b]) => b.size - a.size
    );
    
    set((currentState) => {
      const newCache = new Map(currentState.cache);
      let newSize = currentState.totalCacheSize;
      
      for (const [key, item] of entries) {
        if (newSize <= target) break;
        
        URL.revokeObjectURL(item.blobUrl);
        newCache.delete(key);
        newSize -= item.size;
      }
      
      return {
        cache: newCache,
        totalCacheSize: newSize,
      };
    });
  },

  evictOldestItems: (targetSize?: number) => {
    const state = get();
    const target = targetSize || state.maxCacheSize * CACHE_TARGET_SIZE;
    
    if (state.totalCacheSize <= target) return;
    
    // Sort items by creation time (oldest first)
    const entries = Array.from(state.cache.entries()).sort(
      ([, a], [, b]) => a.createdAt - b.createdAt
    );
    
    set((currentState) => {
      const newCache = new Map(currentState.cache);
      let newSize = currentState.totalCacheSize;
      
      for (const [key, item] of entries) {
        if (newSize <= target) break;
        
        URL.revokeObjectURL(item.blobUrl);
        newCache.delete(key);
        newSize -= item.size;
      }
      
      return {
        cache: newCache,
        totalCacheSize: newSize,
      };
    });
  },

  evictLeastRecentlyUsed: (targetSize?: number) => {
    const state = get();
    const target = targetSize || state.maxCacheSize * CACHE_TARGET_SIZE;
    
    if (state.totalCacheSize <= target) return;
    
    // Sort items by last accessed time (least recently used first)
    const entries = Array.from(state.cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessed - b.lastAccessed
    );
    
    set((currentState) => {
      const newCache = new Map(currentState.cache);
      let newSize = currentState.totalCacheSize;
      
      for (const [key, item] of entries) {
        if (newSize <= target) break;
        
        URL.revokeObjectURL(item.blobUrl);
        newCache.delete(key);
        newSize -= item.size;
      }
      
      return {
        cache: newCache,
        totalCacheSize: newSize,
      };
    });
  },

  getCacheStats: (): CacheStats => {
    const state = get();
    const items = Array.from(state.cache.values());
    
    return {
      totalSize: state.totalCacheSize,
      totalItems: items.length,
      maxSize: state.maxCacheSize,
      usagePercentage: (state.totalCacheSize / state.maxCacheSize) * 100,
      oldestItem: items.length > 0 ? Math.min(...items.map(item => item.createdAt)) : undefined,
      largestItem: items.length > 0 ? Math.max(...items.map(item => item.size)) : undefined,
    };
  },

  optimizeCache: () => {
    const state = get();
    
    // If we're over the cleanup threshold, evict using LRU strategy
    if (state.totalCacheSize > state.maxCacheSize * CACHE_CLEANUP_THRESHOLD) {
      console.log(`🧹 Cache optimization: ${(state.totalCacheSize / (1024 * 1024)).toFixed(1)}MB used, cleaning up...`);
      get().evictLeastRecentlyUsed();
    }
    
    // Also clean expired items
    get().clearExpiredCache();
  },
}));

// Cleanup expired cache every 5 minutes
setInterval(() => {
  useMediaCacheStore.getState().clearExpiredCache();
}, 5 * 60 * 1000);