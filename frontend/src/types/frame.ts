// Frame types for video frame extraction
export interface Frame {
  id: string;
  frame_media_id: string;
  timestamp_seconds: number;
  frame_number: number;
  width: number;
  height: number;
  is_active: boolean;
  created_at: string;
}

export interface FrameCreateRequest {
  timestamp_seconds: number;
}

export interface FrameCreateResponse {
  frame: Frame;
  message: string;
}

export interface FrameListResponse {
  frames: Frame[];
  total: number;
  video_media_id: string;
}

export interface VideoMetadata {
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  total_frames: number;
}