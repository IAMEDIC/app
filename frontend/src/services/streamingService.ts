import api from './api';

export interface StreamingSessionResponse {
  session_id: string;
  message: string;
}

export interface StreamingSessionInfo {
  id: string;
  study_id: string;
  video_media_id: string;
  duration_seconds: number;
  total_size: number;
  frame_count: number;
  is_active: boolean;
  created_at: string;
  last_frame_time?: string;
}

export interface FrameProcessingResponse {
  is_useful_frame: boolean;
  confidence: number;
  frame_extracted: boolean;
  frame_id?: string;
  frame_media_id?: string;
  processing_time_ms: number;
}

export interface StreamingSessionFinalizeResponse {
  video_media_id: string;
  message: string;
}

class StreamingService {
  async createSession(studyId: string): Promise<StreamingSessionResponse> {
    const response = await api.post(`/studies/${studyId}/streaming/sessions`);
    return response.data;
  }

  async uploadVideoChunk(sessionId: string, chunk: Blob): Promise<{ message: string; size: number }> {
    const formData = new FormData();
    formData.append('chunk', chunk);

    const response = await api.post(`/streaming/sessions/${sessionId}/chunks`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async processFrame(
    sessionId: string, 
    frameBlob: Blob, 
    timestampSeconds: number
  ): Promise<FrameProcessingResponse> {

    const formData = new FormData();
    formData.append('frame', frameBlob);
    formData.append('timestamp_seconds', timestampSeconds.toString());

    try {
      const response = await api.post(`/streaming/sessions/${sessionId}/frames`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('❌ API request failed:', error);
      throw error;
    }
  }

  async getSessionInfo(sessionId: string): Promise<StreamingSessionInfo> {
    const response = await api.get(`/streaming/sessions/${sessionId}`);
    return response.data;
  }

  async finalizeSession(sessionId: string): Promise<StreamingSessionFinalizeResponse> {
    const response = await api.post(`/streaming/sessions/${sessionId}/finalize`);
    return response.data;
  }

  async cancelSession(sessionId: string): Promise<{ message: string }> {
    const response = await api.delete(`/streaming/sessions/${sessionId}`);
    return response.data;
  }
}

export const streamingService = new StreamingService();