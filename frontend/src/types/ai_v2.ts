/*
Frontend type definitions for the new clean AI prediction and annotation APIs.
These match the backend response schemas with minimal data.
*/

// Model information
export interface ModelInfo {
  name: string;
  version: string;
  expected_width: number;
  expected_height: number;
  classes?: string[];
  class_titles?: string[];
}

// Clean prediction response types (no IDs, timestamps, etc.)
export interface ClassificationPredictionResponse {
  prediction: number;  // Raw prediction value 0.0 to 1.0
  model_version: string;
}

export interface BoundingBoxPrediction {
  bb_class: string;
  confidence: number;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
}

export interface BoundingBoxPredictionsResponse {
  predictions: BoundingBoxPrediction[];
  model_version: string;
}

// Clean annotation response types
export interface ClassificationAnnotationResponse {
  usefulness: number;  // 0 or 1
}

export interface BoundingBoxAnnotation {
  bb_class: string;
  usefulness: number;  // 0 or 1
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  is_hidden: boolean;
}

export interface BoundingBoxAnnotationsResponse {
  annotations: BoundingBoxAnnotation[];
}

// Request types for saving annotations
export interface SaveClassificationAnnotationRequest {
  usefulness: number;  // 0 or 1
}

export interface SaveBoundingBoxAnnotationItem {
  bb_class: string;
  usefulness: number;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  is_hidden: boolean;
}

export interface SaveBoundingBoxAnnotationsRequest {
  annotations: SaveBoundingBoxAnnotationItem[];
}

// Common save response
export interface SaveAnnotationResponse {
  success: boolean;
  message: string;
}

// Request for generating predictions
export interface GeneratePredictionRequest {
  force_refresh?: boolean;
}

// Extended types for frontend state management
export interface BoundingBoxDisplay extends BoundingBoxPrediction {
  id: string;  // Frontend-generated ID for UI management
  isPrediction: boolean;  // To distinguish predictions from annotations
  isVisible: boolean;  // Frontend visibility state
}

export interface BoundingBoxAnnotationDisplay extends BoundingBoxAnnotation {
  id: string;  // Frontend-generated ID for UI management
  isPrediction: boolean;  // Always false for annotations
  isVisible: boolean;  // Frontend visibility state
}

// Legacy BoundingBox interface for compatibility with AIAnnotationViewer
export interface BoundingBox {
  id: string;
  bb_class: string;
  usefulness: number;
  x_min: number;
  y_min: number;
  width: number;
  height: number;
  is_hidden: boolean;
  isPrediction?: boolean; // To distinguish predictions from annotations
}