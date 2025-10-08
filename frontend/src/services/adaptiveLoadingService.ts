/**
 * Connection speed and adaptive loading utilities for optimal video streaming.
 * Provides intelligent decisions between streaming and cached loading based on 
 * network conditions and device capabilities.
 */

interface ConnectionInfo {
  speed: 'slow' | 'medium' | 'fast';
  estimatedBandwidth: number; // Mbps
  lastMeasuredAt: number;
  rtt: number; // Round trip time in ms
}

interface AdaptiveLoadingDecision {
  useStreaming: boolean;
  preferredQuality: 'low' | 'medium' | 'high';
  chunkSize: number; // KB
  preloadStrategy: 'none' | 'metadata' | 'auto';
  reason: string;
}

class AdaptiveLoadingService {
  private connectionInfo: ConnectionInfo | null = null;
  private measurementInProgress = false;
  private cacheHitRate = 0;

  /**
   * Measure connection speed by downloading a small test file
   */
  async measureConnectionSpeed(): Promise<ConnectionInfo> {
    if (this.measurementInProgress) {
      return this.connectionInfo || this.getDefaultConnectionInfo();
    }

    if (this.connectionInfo && Date.now() - this.connectionInfo.lastMeasuredAt < 30000) {
      return this.connectionInfo; // Use recent measurement
    }

    this.measurementInProgress = true;

    try {
      // Use a small image or API endpoint for speed test
      const testUrl = '/api/health'; // Small health check endpoint
      const startTime = performance.now();
      
      const response = await fetch(testUrl, {
        method: 'GET',
        cache: 'no-cache',
        credentials: 'include'
      });

      const endTime = performance.now();
      const rtt = endTime - startTime;

      if (!response.ok) {
        throw new Error('Network test failed');
      }

      // Get response size (approximate)
      const contentLength = response.headers.get('content-length');
      const dataSize = contentLength ? parseInt(contentLength) : 1024; // Default 1KB

      // Calculate bandwidth (bytes per second -> Mbps)
      const bytesPerSecond = (dataSize * 1000) / rtt;
      const mbps = (bytesPerSecond * 8) / (1024 * 1024);

      let speed: 'slow' | 'medium' | 'fast';
      if (mbps < 1) {
        speed = 'slow';
      } else if (mbps < 5) {
        speed = 'medium';
      } else {
        speed = 'fast';
      }

      this.connectionInfo = {
        speed,
        estimatedBandwidth: mbps,
        lastMeasuredAt: Date.now(),
        rtt
      };

      return this.connectionInfo;

    } catch (error) {
      console.warn('Connection speed measurement failed:', error);
      return this.getDefaultConnectionInfo();
    } finally {
      this.measurementInProgress = false;
    }
  }

  /**
   * Get cache hit rate from media cache store
   */
  updateCacheHitRate(hitRate: number): void {
    this.cacheHitRate = Math.max(0, Math.min(1, hitRate));
  }

  /**
   * Make adaptive loading decision based on connection speed, cache hit rate, and file size
   */
  async makeLoadingDecision(
    fileSizeBytes: number,
    mediaType: 'image' | 'video',
    isViewport: boolean = true
  ): Promise<AdaptiveLoadingDecision> {
    const connection = await this.measureConnectionSpeed();
    const fileSizeMB = fileSizeBytes / (1024 * 1024);

    // Default decision
    let decision: AdaptiveLoadingDecision = {
      useStreaming: true,
      preferredQuality: 'medium',
      chunkSize: 256, // KB
      preloadStrategy: 'metadata',
      reason: 'Default streaming'
    };

    // Video-specific logic
    if (mediaType === 'video') {
      if (connection.speed === 'slow' || connection.rtt > 1000) {
        // Slow connection: use streaming with small chunks
        decision = {
          useStreaming: true,
          preferredQuality: 'low',
          chunkSize: 128,
          preloadStrategy: 'none',
          reason: `Slow connection (${connection.estimatedBandwidth.toFixed(1)} Mbps, ${connection.rtt}ms RTT)`
        };
      } else if (connection.speed === 'fast' && fileSizeMB < 50 && this.cacheHitRate > 0.7) {
        // Fast connection + small file + good cache hit rate: prefer caching
        decision = {
          useStreaming: false,
          preferredQuality: 'high',
          chunkSize: 1024,
          preloadStrategy: 'auto',
          reason: `Fast connection + good cache hit rate (${(this.cacheHitRate * 100).toFixed(0)}%)`
        };
      } else if (fileSizeMB > 100) {
        // Large files: always stream
        decision = {
          useStreaming: true,
          preferredQuality: connection.speed === 'fast' ? 'high' : 'medium',
          chunkSize: connection.speed === 'fast' ? 512 : 256,
          preloadStrategy: 'metadata',
          reason: `Large file (${fileSizeMB.toFixed(1)}MB)`
        };
      } else {
        // Medium files: stream with adaptive quality
        decision = {
          useStreaming: true,
          preferredQuality: connection.speed === 'fast' ? 'high' : 'medium',
          chunkSize: connection.speed === 'fast' ? 512 : 256,
          preloadStrategy: isViewport ? 'metadata' : 'none',
          reason: `Medium file, ${connection.speed} connection`
        };
      }
    } else {
      // Image-specific logic
      if (fileSizeMB < 2 && this.cacheHitRate > 0.5) {
        // Small images with decent cache: prefer caching
        decision = {
          useStreaming: false,
          preferredQuality: 'high',
          chunkSize: 256,
          preloadStrategy: 'auto',
          reason: 'Small image with good cache performance'
        };
      } else if (connection.speed === 'slow') {
        // Slow connection: use progressive loading
        decision = {
          useStreaming: true,
          preferredQuality: 'low',
          chunkSize: 64,
          preloadStrategy: 'none',
          reason: 'Slow connection for image'
        };
      }
    }

    // Override for non-viewport content
    if (!isViewport && decision.preloadStrategy === 'auto') {
      decision.preloadStrategy = 'none';
      decision.reason += ' (out of viewport)';
    }

    return decision;
  }

  /**
   * Get current connection info or measure if needed
   */
  async getConnectionInfo(): Promise<ConnectionInfo> {
    if (!this.connectionInfo) {
      return await this.measureConnectionSpeed();
    }
    return this.connectionInfo;
  }

  /**
   * Default connection info for fallback
   */
  private getDefaultConnectionInfo(): ConnectionInfo {
    return {
      speed: 'medium',
      estimatedBandwidth: 2.0,
      lastMeasuredAt: Date.now(),
      rtt: 500
    };
  }

  /**
   * Check if browser supports advanced features
   */
  getBrowserCapabilities() {
    return {
      supportsStreaming: 'ReadableStream' in window,
      supportsServiceWorker: 'serviceWorker' in navigator,
      supportsIntersectionObserver: 'IntersectionObserver' in window,
      supportsWebp: this.supportsWebp(),
      memoryLimit: this.estimateMemoryLimit()
    };
  }

  private supportsWebp(): boolean {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('webp') > 0;
  }

  private estimateMemoryLimit(): number {
    // Estimate available memory in MB
    const nav = navigator as any;
    if (nav.deviceMemory) {
      return nav.deviceMemory * 1024; // Convert GB to MB
    }
    // Conservative estimate based on user agent
    if (nav.userAgent.includes('Mobile')) {
      return 1024; // 1GB for mobile
    }
    return 4096; // 4GB for desktop
  }
}

// Global instance
export const adaptiveLoadingService = new AdaptiveLoadingService();

export type { ConnectionInfo, AdaptiveLoadingDecision };