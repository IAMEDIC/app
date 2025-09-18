// TypeScript type definitions for the IAMEDIC application

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  roles?: string[];
  doctorProfile?: DoctorProfile;
}

export interface UserRole {
  id: string;
  userId: string;
  role: 'admin' | 'doctor';
  createdAt: string;
  updatedAt: string;
}

export interface DoctorProfile {
  id: string;
  userId: string;
  matriculationId: string;
  legalName: string;
  specialization: string;
  status: 'pending' | 'approved' | 'denied';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorProfileCreate {
  matriculationId: string;
  legalName: string;
  specialization: string;
}

export interface DoctorProfileApproval {
  status: 'approved' | 'denied';
  notes?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginResponse {
  user: User;
  access_token: string;
  token_type: string;
}

export interface ApiError {
  detail: string;
  status_code: number;
}

export interface GoogleAuthUrl {
  auth_url: string;
}

// Theme types for Material-UI customization
export interface ThemeConfig {
  mode: 'light' | 'dark';
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}