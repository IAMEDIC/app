/*
Clean AI service methods that use the new separated endpoints.
Provides clear separation between predictions and annotations.
*/

import api from './api';
import {
  ClassificationPredictionResponse,
  BoundingBoxPredictionsResponse,
  ClassificationAnnotationResponse,
  BoundingBoxAnnotationsResponse,
  SaveClassificationAnnotationRequest,
  SaveBoundingBoxAnnotationsRequest,
  SaveAnnotationResponse,
  GeneratePredictionRequest,
  ModelInfo
} from '@/types/ai_v2';

export const aiServiceV2 = {
  // PREDICTION GENERATION (raw predictions only)
  
  generateClassificationPrediction: async (
    mediaId: string, 
    forceRefresh: boolean = false
  ): Promise<ClassificationPredictionResponse> => {
    const response = await api.post(`/media/${mediaId}/predictions/classification`, {
      force_refresh: forceRefresh
    } as GeneratePredictionRequest);
    return response.data;
  },

  generateBoundingBoxPredictions: async (
    mediaId: string, 
    forceRefresh: boolean = false
  ): Promise<BoundingBoxPredictionsResponse> => {
    const response = await api.post(`/media/${mediaId}/predictions/bounding-boxes`, {
      force_refresh: forceRefresh
    } as GeneratePredictionRequest);
    return response.data;
  },

  // ANNOTATION RETRIEVAL

  getClassificationAnnotation: async (mediaId: string): Promise<ClassificationAnnotationResponse | null> => {
    try {
      const response = await api.get(`/media/${mediaId}/annotations/classification`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No annotation found
      }
      throw error;
    }
  },

  getBoundingBoxAnnotations: async (mediaId: string): Promise<BoundingBoxAnnotationsResponse> => {
    const response = await api.get(`/media/${mediaId}/annotations/bounding-boxes`);
    return response.data;
  },

  // ANNOTATION SAVING

  saveClassificationAnnotation: async (
    mediaId: string, 
    request: SaveClassificationAnnotationRequest
  ): Promise<SaveAnnotationResponse> => {
    const response = await api.post(`/media/${mediaId}/annotations/classification`, request);
    return response.data;
  },

  saveBoundingBoxAnnotations: async (
    mediaId: string, 
    request: SaveBoundingBoxAnnotationsRequest
  ): Promise<SaveAnnotationResponse> => {
    console.log('DEBUG: Calling saveBoundingBoxAnnotations', { mediaId, request });
    const response = await api.post(`/media/${mediaId}/annotations/bounding-boxes`, request);
    console.log('DEBUG: saveBoundingBoxAnnotations response', response.data);
    return response.data;
  },

  // EXISTING PREDICTION RETRIEVAL (cached only, no generation)

  getExistingClassificationPrediction: async (mediaId: string): Promise<ClassificationPredictionResponse | null> => {
    try {
      const response = await api.get(`/media/${mediaId}/predictions/classification/existing`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No existing prediction found
      }
      throw error;
    }
  },

  getExistingBoundingBoxPredictions: async (mediaId: string): Promise<BoundingBoxPredictionsResponse | null> => {
    try {
      const response = await api.get(`/media/${mediaId}/predictions/bounding-boxes/existing`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No existing predictions found
      }
      throw error;
    }
  },

  // MODEL INFO ENDPOINTS

  getClassifierModelInfo: async (): Promise<ModelInfo> => {
    const response = await api.get('/ai/models/classifier/info');
    return response.data;
  },

  getBBModelInfo: async (): Promise<ModelInfo> => {
    const response = await api.get('/ai/models/bb-regressor/info');
    return response.data;
  },

  // CONVENIENCE METHODS

  // Load only annotations (for AnnotationsTab - no predictions)
  loadAnnotationsOnly: async (mediaId: string): Promise<{
    classificationAnnotation: ClassificationAnnotationResponse | null;
    boundingBoxAnnotations: BoundingBoxAnnotationsResponse;
  }> => {
    const [classificationAnnotation, boundingBoxAnnotations] = await Promise.allSettled([
      aiServiceV2.getClassificationAnnotation(mediaId),
      aiServiceV2.getBoundingBoxAnnotations(mediaId)
    ]);

    return {
      classificationAnnotation: classificationAnnotation.status === 'fulfilled' ? classificationAnnotation.value : null,
      boundingBoxAnnotations: boundingBoxAnnotations.status === 'fulfilled' ? boundingBoxAnnotations.value : { annotations: [] }
    };
  },

  // Load all existing data when opening image view (annotations + existing predictions if cached)
  loadAllData: async (mediaId: string): Promise<{
    classificationAnnotation: ClassificationAnnotationResponse | null;
    boundingBoxAnnotations: BoundingBoxAnnotationsResponse;
    existingClassificationPrediction: ClassificationPredictionResponse | null;
    existingBoundingBoxPredictions: BoundingBoxPredictionsResponse | null;
  }> => {
    const [classificationAnnotation, boundingBoxAnnotations, existingClassificationPrediction, existingBoundingBoxPredictions] = await Promise.allSettled([
      aiServiceV2.getClassificationAnnotation(mediaId),
      aiServiceV2.getBoundingBoxAnnotations(mediaId),
      aiServiceV2.getExistingClassificationPrediction(mediaId),
      aiServiceV2.getExistingBoundingBoxPredictions(mediaId)
    ]);

    return {
      classificationAnnotation: classificationAnnotation.status === 'fulfilled' ? classificationAnnotation.value : null,
      boundingBoxAnnotations: boundingBoxAnnotations.status === 'fulfilled' ? boundingBoxAnnotations.value : { annotations: [] },
      existingClassificationPrediction: existingClassificationPrediction.status === 'fulfilled' ? existingClassificationPrediction.value : null,
      existingBoundingBoxPredictions: existingBoundingBoxPredictions.status === 'fulfilled' ? existingBoundingBoxPredictions.value : null
    };
  }
};