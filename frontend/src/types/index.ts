// TypeScript type definitions for the IAMEDIC application

// Re-export frame types
export * from './frame';

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
  has_annotations?: boolean; // Optional: indicates if media has any annotations
}

export interface MediaUpdate {
  filename?: string;
  upload_status?: UploadStatus;
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

// AI/ML related types
export interface ModelInfo {
  name: string;
  version: string;
  expected_width: number;
  expected_height: number;
  classes?: string[];
}

export interface PictureClassificationPrediction {
  id: string;
  media_id: string;
  media_type: MediaType;
  prediction: number;  // Changed from 'confidence' to 'prediction' to match backend
  model_version: string;
  created_at: string;
}

export interface PictureClassificationAnnotation {
  id: string;
  media_id: string;
  media_type: MediaType;
  usefulness: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface PictureBBPrediction {
  id: string;
  media_id: string;
  media_type: MediaType;
  bb_class: string;
  confidence: number;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  model_version: string;
  created_at: string;
}

export interface PictureBBAnnotation {
  id: string;
  media_id: string;
  media_type: MediaType;
  bb_class: string;
  usefulness: number; // 0 or 1
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  is_hidden: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassificationPredictionResponse {
  prediction?: PictureClassificationPrediction;
  annotation?: PictureClassificationAnnotation;
}

export interface BBPredictionResponse {
  predictions: PictureBBPrediction[];
  annotations: PictureBBAnnotation[];
}

export interface MediaPredictionsResponse {
  media_id: string;
  classification: ClassificationPredictionResponse;
  bounding_boxes: BBPredictionResponse;
}

export interface PredictionRequest {
  media_id: string;
  force_refresh?: boolean;
}

export interface SaveAnnotationsRequest {
  media_id: string;
  classification_annotation?: {
    usefulness: number;
  };
  bb_annotations?: {
    bb_class: string;
    usefulness: number;
    x_min: number;
    y_min: number;
    width: number;
    height: number;
    is_hidden: boolean;
  }[];
}

export interface SaveAnnotationsResponse {
  success: boolean;
  message: string;
  saved_count: number;
}

// Admin Statistics Types
export interface StatisticsRequest {
  model_version: string;
  start_date: string;
  end_date: string;
  iou_threshold?: number;
  confidence_threshold?: number;
  include_soft_deleted?: boolean;
  include_hidden_annotations?: boolean;
}

export interface ModelVersionInfo {
  model_name: string;
  model_version: string;
  model_alias: string;
}

export interface ModelInfo {
  name: string;
  version: string;
  expected_width: number;
  expected_height: number;
  classes?: string[];
  class_titles?: string[];
}

export interface AvailableModelVersions {
  model_type: string;
  versions: string[];
}

export interface ClassificationStatisticsResponse {
  model_version: ModelVersionInfo;
  total_predictions: number;
  total_annotations: number;
  date_range: {
    start_date: string;
    end_date: string;
  };
  confusion_matrix: number[][];
  class_names: string[];
  accuracy: number;
  precision_per_class: number[];
  recall_per_class: number[];
  f1_per_class: number[];
  macro_avg: {
    precision: number;
    recall: number;
    f1_score: number;
  };
  weighted_avg: {
    precision: number;
    recall: number;
    f1_score: number;
  };
  support_per_class: number[];
  included_soft_deleted: boolean;
}

export interface BoundingBoxStatisticsResponse {
  model_version: ModelVersionInfo;
  total_predictions: number;
  total_annotations: number;
  date_range: {
    start_date: string;
    end_date: string;
  };
  map_scores: {
    mAP_50: number;
    mAP_75: number;
    mAP_50_95: number;
  };
  class_names: string[];
  precision_per_class: number[];
  recall_per_class: number[];
  f1_per_class: number[];
  support_per_class: number[];
  iou_thresholds: number[];
  precision_recall_curves: {
    class_name: string;
    precision_values: number[];
    recall_values: number[];
    thresholds: number[];
  }[];
  included_soft_deleted: boolean;
  included_hidden_annotations: boolean;
}

// Admin Export Types
export interface CSVExportRequest {
  start_date: string;
  end_date: string;
  include_soft_deleted?: boolean;
  include_hidden_annotations?: boolean;
}

export interface CSVExportInfo {
  export_type: string;
  date_range: {
    start_date: string;
    end_date: string;
  };
  total_records: number;
  included_soft_deleted: boolean;
  included_hidden_annotations?: boolean;
  filename: string;
}