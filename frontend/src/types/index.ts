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

// Study related types
export interface Study {
  id: string;
  doctor_id: string;
  alias: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudyCreate {
  alias: string;
}

export interface StudyUpdate {
  alias?: string;
}

export interface StudyWithMedia extends Study {
  media: MediaSummary[];
}

export interface StudyListResponse {
  studies: Study[];
  total: number;
  page: number;
  page_size: number;
}

// Media related types
export type MediaType = 'image' | 'video';
export type UploadStatus = 'uploaded' | 'processing' | 'failed';

export interface Media {
  id: string;
  study_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  media_type: MediaType;
  upload_status: UploadStatus;
  created_at: string;
  updated_at: string;
}

export interface MediaSummary {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  media_type: MediaType;
  upload_status: UploadStatus;
  created_at: string;
}

export interface MediaUploadResponse {
  media: Media;
  message: string;
}

export interface MediaListResponse {
  media: MediaSummary[];
  total: number;
  studyId: string;
}

export interface StorageInfo {
  used_bytes: number;
  total_bytes: number;
  available_bytes: number;
  used_percentage: number;
  used_mb: number;
  total_mb: number;
  available_mb: number;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}