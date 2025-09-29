import { Frame } from './frame';

// Auto frame extraction types
export interface AutoExtractionParams {
  run_threshold: number;
  min_run_length: number;
  prediction_threshold: number;
  patience: number;
}

export interface AutoExtractionRequest {
  params?: AutoExtractionParams;
  force_reprocess?: boolean;
}

export interface AutoExtractionResponse {
  frames: Frame[];
  total_frames_analyzed: number;
  runs_found: number;
  compliant_frames: number;
  message: string;
}

// Default parameters
export const DEFAULT_AUTO_EXTRACTION_PARAMS: AutoExtractionParams = {
  run_threshold: 0.8,
  min_run_length: 5,
  prediction_threshold: 0.95,
  patience: 2,
};

// Parameter descriptions for tooltips
export const PARAMETER_DESCRIPTIONS = {
  run_threshold: "Minimum probability threshold for starting a run. Lower values will detect more potential regions but may include false positives.",
  min_run_length: "Minimum number of consecutive frames to consider a valid run. Higher values require longer consistent predictions.",
  prediction_threshold: "Minimum probability threshold for extracting a frame. Only frames with predictions above this value will be extracted.",
  patience: "Number of frames below threshold before ending a run. Higher patience allows for brief dips in prediction confidence."
};