import mlflow.artifacts
import numpy as np
import os
import onnxruntime as ort
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from PIL import Image as PILImage
import mlflow
from mlflow.tracking import MlflowClient

MLFLOW_URI = os.getenv("MLFLOW_URI", "http://host.docker.internal:8080")
MLFLOW_MODEL_NAME = os.getenv("MLFLOW_MODEL_NAME", "")
MLFLOW_MODEL_ALIAS = os.getenv("MLFLOW_MODEL_ALIAS", "champion")
TARGET_IMAGE_HEIGHT = int(os.getenv("TARGET_IMAGE_HEIGHT", -1))
TARGET_IMAGE_WIDTH = int(os.getenv("TARGET_IMAGE_WIDTH", -1))

MODELS_DIR = "/app/models"
os.makedirs(MODELS_DIR, exist_ok=True)

mlflow.set_tracking_uri(MLFLOW_URI)
mlflow.set_registry_uri(MLFLOW_URI)
mlflow_client = MlflowClient(tracking_uri=MLFLOW_URI,
                             registry_uri=MLFLOW_URI)

app = FastAPI(title="Frame Classification Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BWImage = list[list[int]]

class PredictionRequest(BaseModel):
    data: BWImage

class PredictionResponse(BaseModel):
    prediction: float

class ModelService:
    def __init__(self):
        self.model = None
        self.load_model()
    
    def load_model(self):
        try: 
            # Load ONNX model (assuming you saved it as ONNX in MLflow)
            model_version = mlflow_client.get_model_version_by_alias(name=MLFLOW_MODEL_NAME, alias=MLFLOW_MODEL_ALIAS)
            run_id = model_version.run_id
            model_file_name = model_version.source.split("/")[-1]
            mlflow.artifacts.download_artifacts(run_id=run_id, dst_path=MODELS_DIR)
            self.model = ort.InferenceSession(f"{MODELS_DIR}/{model_file_name}")
        except Exception as e:
            print(f"Error loading model: {e}")
            raise
    
    def predict(self, data: np.ndarray) -> np.ndarray:
        """Make predictions using the loaded model"""
        if self.model is None:
            raise RuntimeError("Model not loaded")
        
        result = self.model.run(None, {"input": data})
        return result

# Initialize model service
model_service = ModelService()

@app.get("/")
def read_root():
    return {"message": "Bounding Box Regression Service is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    try:
        print("Received prediction request")
        image = np.array(request.data, dtype=np.uint8)
        pil_image = PILImage.fromarray(image)
        pil_image = pil_image.resize((TARGET_IMAGE_WIDTH, TARGET_IMAGE_HEIGHT), PILImage.LANCZOS)
        image = np.array(pil_image)
        print("Image resized")
        image = (image.astype(np.float32) / 255.0 - 0.5) / 0.5  # Normalize to [-1, 1]
        image = np.expand_dims(image, axis=0)  # Add batch dimension
        image = np.expand_dims(image, axis=0)  # Add channel dimension
        # Make prediction
        outputs = model_service.predict(image)
        print(outputs)
        prob = outputs[0][0] # [[probability]] 
        return PredictionResponse(prediction=prob)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)