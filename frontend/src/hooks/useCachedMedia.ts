import { useState, useEffect } from 'react';
import { useMediaCacheStore } from '@/store/mediaCacheStore';

interface UseCachedMediaReturn {
  src: string | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to load and cache media files (images, videos) with automatic caching
 * @param studyId - The study ID containing the media
 * @param mediaId - The media ID to load
 * @returns Object containing src URL, loading state, and error state
 */
export const useCachedMedia = (
  studyId: string, 
  mediaId: string
): UseCachedMediaReturn => {
  const [src, setSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const getCachedMedia = useMediaCacheStore((state) => state.getCachedMedia);

  useEffect(() => {
    let isMounted = true;

    const loadMedia = async () => {
      if (!studyId || !mediaId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        
        const cachedUrl = await getCachedMedia(studyId, mediaId);
        
        if (isMounted) {
          setSrc(cachedUrl);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load media');
        console.error('Failed to load cached media:', error);
        
        if (isMounted) {
          setError(error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMedia();
    
    return () => {
      isMounted = false;
    };
  }, [studyId, mediaId, getCachedMedia]);

  return { src, isLoading, error };
};