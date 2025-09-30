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
  StorageInfo
} from '@/types';

// Create axios instance with base configuration
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
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
          // Attempt to refresh the token
          console.log('🔄 Attempting to refresh token...');
          const currentToken = localStorage.getItem('access_token');
          
          if (!currentToken) {
            throw new Error('No token to refresh');
          }

          const refreshResponse = await axios.post('/api/auth/refresh', {}, {
            headers: {
              Authorization: `Bearer ${currentToken}`
            }
          });

          const { access_token } = refreshResponse.data;
          
          // Update token in localStorage
          localStorage.setItem('access_token', access_token);
          
          // Update auth store
          const { useAuthStore } = await import('@/store/authStore');
          useAuthStore.getState().updateToken(access_token);
          
          console.log('✅ Token refreshed successfully');
          
          // Process queued requests
          processQueue(null, access_token);
          
          // Retry the original request
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
          
        } catch (refreshError) {
          console.log('❌ Token refresh failed:', refreshError);
          
          // Clear tokens and redirect to login
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

  // Download media file
  downloadMedia: async (studyId: string, mediaId: string): Promise<Blob> => {
    const response = await api.get(`/studies/${studyId}/media/${mediaId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // Delete media
  deleteMedia: async (studyId: string, mediaId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/studies/${studyId}/media/${mediaId}`);
    return response.data;
  },
};

export default api;