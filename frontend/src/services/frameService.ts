import api from './api';
import { 
  Frame, 
  FrameCreateRequest, 
  FrameCreateResponse, 
  FrameListResponse, 
  VideoMetadata 
} from '@/types/frame';

export const frameService = {
  // Get video metadata
  async getVideoMetadata(studyId: string, videoId: string): Promise<VideoMetadata> {
    const response = await api.get(`/studies/${studyId}/media/${videoId}/metadata`);
    return response.data;
  },

  // Extract frame at timestamp
  async extractFrame(
    studyId: string, 
    videoId: string, 
    request: FrameCreateRequest
  ): Promise<FrameCreateResponse> {
    const response = await api.post(`/studies/${studyId}/media/${videoId}/frames`, request);
    return response.data;
  },

  // List frames for video
  async listVideoFrames(studyId: string, videoId: string): Promise<FrameListResponse> {
    const response = await api.get(`/studies/${studyId}/media/${videoId}/frames`);
    return response.data;
  },

  // Get frame image file
  async getFrameFile(frameId: string): Promise<Blob> {
    const response = await api.get(`/frames/${frameId}/file`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Delete frame
  async deleteFrame(frameId: string): Promise<void> {
    await api.delete(`/frames/${frameId}`);
  },

  // Get frame details
  async getFrameDetails(frameId: string): Promise<Frame> {
    const response = await api.get(`/frames/${frameId}`);
    return response.data;
  }
};