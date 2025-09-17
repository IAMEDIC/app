import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ApiResponse, GoogleAuthUrl, LoginResponse, User } from '@/types';

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

// Response interceptor to handle errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login
      localStorage.removeItem('access_token');
      window.location.href = '/login';
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
    const response = await api.post('/auth/refresh');
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

export default api;