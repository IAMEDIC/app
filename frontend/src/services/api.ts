import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { 
  ApiResponse, 
  GoogleAuthUrl, 
  LoginResponse, 
  User,
  Study,
  StudyCreate,
  StudyUpdate,
  StudyWithMedia,
  StudyListResponse,
  MediaUploadResponse,
  MediaListResponse,
  StorageInfo,
  StatisticsRequest,
  ClassificationStatisticsResponse,
  BoundingBoxStatisticsResponse,
  CSVExportRequest,
  AvailableModelVersions,
  ModelInfo
} from '@/types';
import {
  FileManagementStats,
  HardDeleteResponse,
  HardDeleteProgress
} from '@/types/fileManagement';

// Create axios instance with base configuration
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 minutes for large file downloads
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to ensure credentials are included (for httpOnly cookies)
api.interceptors.request.use(
  (config) => {
    // Ensure credentials (cookies) are included with every request
    config.withCredentials = true;
    
    // Fallback: still support Authorization header for backward compatibility
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Flag to prevent infinite refresh loops
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// Response interceptor to handle errors and token refresh
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 || error.response?.status === 403) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          // Retry the original request with the new token
          const token = localStorage.getItem('access_token');
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      if (!originalRequest._retry) {
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          await axios.post('/api/auth/refresh', {}, {
            withCredentials: true // Include httpOnly cookie
          });
          
          // Process queued requests - no token needed since it's in httpOnly cookie
          processQueue(null, 'cookie-token');
          
          // Retry the original request - no need to set Authorization header
          originalRequest.withCredentials = true;
          return api(originalRequest);
          
        } catch (refreshError) {
          
          // Clear any localStorage tokens (backward compatibility)
          localStorage.removeItem('access_token');
          
          // Update auth store
          const { useAuthStore } = await import('@/store/authStore');
          useAuthStore.getState().logout();
          
          // Process queued requests with error
          processQueue(refreshError, null);
          
          // Redirect to login
          window.location.href = '/login';
          
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    return Promise.reject(error);
  }
);
// Auth service functions
export const authService = {
  // Get Google OAuth URL
  getGoogleAuthUrl: async (): Promise<GoogleAuthUrl> => {
    const response = await api.get('/auth/google');
    return response.data;
  },

  // Handle OAuth callback
  handleGoogleCallback: async (code: string, state: string): Promise<LoginResponse> => {
    const response = await api.post('/auth/google/callback', {
      code,
      state,
    });
    return response.data;
  },

  // Get current user info
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Logout user
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  // Refresh token
  refreshToken: async (): Promise<LoginResponse> => {
    const response = await axios.post('/api/auth/refresh', {}, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('access_token')}`
      }
    });
    return response.data;
  },
};

// Health check
export const healthService = {
  check: async (): Promise<ApiResponse<{ status: string }>> => {
    const response = await api.get('/health');
    return response.data;
  },
};

// Study service functions
export const studyService = {
  // Create a new study
  createStudy: async (studyData: StudyCreate): Promise<Study> => {
    const response = await api.post('/studies/', studyData);
    return response.data;
  },

  // Get list of studies
  getStudies: async (page: number = 1, pageSize: number = 20): Promise<StudyListResponse> => {
    const response = await api.get('/studies/', {
      params: { page, page_size: pageSize }
    });
    return response.data;
  },

  // Get a specific study with media
  getStudy: async (studyId: string): Promise<StudyWithMedia> => {
    const response = await api.get(`/studies/${studyId}`);
    return response.data;
  },

  // Update a study
  updateStudy: async (studyId: string, studyData: StudyUpdate): Promise<Study> => {
    const response = await api.put(`/studies/${studyId}`, studyData);
    return response.data;
  },

  // Delete a study
  deleteStudy: async (studyId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/studies/${studyId}`);
    return response.data;
  },

  // Get storage info
  getStorageInfo: async (): Promise<StorageInfo> => {
    const response = await api.get('/studies/storage/info');
    return response.data;
  },
};

// Media service functions
export const mediaService = {
  // Upload media to a study
  uploadMedia: async (studyId: string, file: File): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post(`/studies/${studyId}/media`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get media list for a study
  getMediaList: async (studyId: string, page: number = 1, pageSize: number = 50): Promise<MediaListResponse> => {
    const response = await api.get(`/studies/${studyId}/media`, {
      params: { page, page_size: pageSize }
    });
    return response.data;
  },

  // Download media file (with streaming support)
  downloadMedia: async (studyId: string, mediaId: string, onProgress?: (progress: number) => void): Promise<Blob> => {
    try {
      // Try streaming endpoint first (supports range requests and better memory usage)
      const response = await api.get(`/studies/${studyId}/media/${mediaId}/stream`, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(Math.round(progress));
          }
        },
      });
      return response.data;
    } catch (error) {
      // Fallback to regular download endpoint if streaming fails
      console.warn('Streaming endpoint failed, falling back to regular download:', error);
      const response = await api.get(`/studies/${studyId}/media/${mediaId}/download`, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(Math.round(progress));
          }
        },
      });
      return response.data;
    }
  },

  // Delete media
  deleteMedia: async (studyId: string, mediaId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/studies/${studyId}/media/${mediaId}`);
    return response.data;
  },
};

// Admin service for statistics and export functionality
export const adminService = {
  // Get classification model statistics
  getClassificationStatistics: async (request: StatisticsRequest): Promise<ClassificationStatisticsResponse> => {
    const response = await api.post('/admin/statistics/classifier', request);
    return response.data;
  },

  // Get bounding box model statistics
  getBoundingBoxStatistics: async (request: StatisticsRequest): Promise<BoundingBoxStatisticsResponse> => {
    const response = await api.post('/admin/statistics/bounding-box', request);
    return response.data;
  },

  // Export classification annotations as CSV
  exportClassificationCSV: async (request: CSVExportRequest): Promise<Blob> => {
    const response = await api.post('/admin/export/annotations/classification', request, {
      responseType: 'blob',
      headers: {
        'Accept': 'text/csv'
      }
    });
    return response.data;
  },

  // Export bounding box annotations as CSV
  exportBoundingBoxCSV: async (request: CSVExportRequest): Promise<Blob> => {
    const response = await api.post('/admin/export/annotations/bounding-boxes', request, {
      responseType: 'blob',
      headers: {
        'Accept': 'text/csv'
      }
    });
    return response.data;
  },

  // Export classification annotations with media as ZIP
  exportClassificationZIP: async (request: CSVExportRequest): Promise<Blob> => {
    const response = await api.post('/admin/export/zip/classification', request, {
      responseType: 'blob',
      headers: {
        'Accept': 'application/zip'
      }
    });
    return response.data;
  },

  // Export bounding box annotations with media as ZIP
  exportBoundingBoxZIP: async (request: CSVExportRequest): Promise<Blob> => {
    const response = await api.post('/admin/export/zip/bounding-boxes', request, {
      responseType: 'blob',
      headers: {
        'Accept': 'application/zip'
      }
    });
    return response.data;
  },

  // Get available model versions for a specific model type
  getModelVersions: async (modelType: 'classifier' | 'bounding_box'): Promise<AvailableModelVersions> => {
    const response = await api.get(`/admin/model-versions/${modelType}`);
    return response.data;
  },

  // Get current model info (including current version)
  getCurrentClassifierInfo: async (): Promise<ModelInfo> => {
    const response = await api.get('/ai/models/classifier/info');
    return response.data;
  },

  // Get current bounding box model info (including current version)
  getCurrentBoundingBoxInfo: async (): Promise<ModelInfo> => {
    const response = await api.get('/ai/models/bb-regressor/info');
    return response.data;
  },

  // Helper function to download blob as file
  downloadBlob: (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

// File management service for storage statistics and hard delete operations
export const fileManagementService = {
  // Get system-wide file storage statistics
  getStatistics: async (): Promise<FileManagementStats> => {
    const response = await api.get('/admin/files/statistics');
    return response.data;
  },

  // Start hard delete operation for all soft-deleted files
  startHardDelete: async (confirmationText: string): Promise<HardDeleteResponse> => {
    const response = await api.post('/admin/files/hard-delete', {
      confirmation_text: confirmationText
    });
    return response.data;
  },

  // Get progress of hard delete operation
  getDeleteProgress: async (taskId: string): Promise<HardDeleteProgress> => {
    const response = await api.get(`/admin/files/hard-delete/${taskId}`);
    return response.data;
  },
};

export default api;