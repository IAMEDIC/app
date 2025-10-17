/**
 * TypeScript interfaces for file management functionality
 */

export interface FileManagementStats {
  total_storage_bytes: number;
  total_storage_mb: number;
  active_files_count: number;
  soft_deleted_files_count: number;
  active_files_bytes: number;
  soft_deleted_files_bytes: number;
  active_files_mb: number;
  soft_deleted_files_mb: number;
  active_files_percentage: number;
  soft_deleted_files_percentage: number;
  active_storage_percentage: number;
  soft_deleted_storage_percentage: number;
}

export interface HardDeleteRequest {
  confirmation_text: string;
}

export interface HardDeleteProgress {
  status: 'running' | 'completed' | 'failed';
  progress: number; // 0.0 to 1.0
  processed_items: number;
  total_items: number;
  current_operation: string;
  errors: string[];
}

export interface HardDeleteResponse {
  task_id: string;
  message: string;
}

export interface HardDeleteSummary {
  deleted_studies_count: number;
  deleted_media_count: number;
  deleted_files_count: number;
  freed_storage_bytes: number;
  freed_storage_mb: number;
  total_errors: number;
  operation_duration_seconds: number;
}

// Chart data interfaces
export interface ChartData {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

export interface StorageChartProps {
  activeFiles: ChartData;
  softDeletedFiles: ChartData;
  title: string;
  totalLabel: string;
  totalValue: string;
}