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
    model_version: str

class ModelInfo(BaseModel):
    name: str
    version: str
    expected_width: int
    expected_height: int

class ModelService:
    def __init__(self):
        self.model = None
        self.model_version = None
        self.load_model()
    
    def load_model(self):
        try: 
            # Load ONNX model (assuming you saved it as ONNX in MLflow)
            model_version_info = mlflow_client.get_model_version_by_alias(name=MLFLOW_MODEL_NAME, alias=MLFLOW_MODEL_ALIAS)
            run_id = model_version_info.run_id
            self.model_version = model_version_info.version
            model_file_name = model_version_info.source.split("/")[-1]
            mlflow.artifacts.download_artifacts(run_id=run_id, dst_path=MODELS_DIR)
            self.model = ort.InferenceSession(f"{MODELS_DIR}/{model_file_name}")
            print(f"Model loaded successfully. Version: {self.model_version}")
        except Exception as e:
            print(f"Error loading model: {e}")
            raise
    
    def get_model_info(self) -> ModelInfo:
        """Get model information"""
        return ModelInfo(
            name=MLFLOW_MODEL_NAME,
            version=self.model_version or "unknown",
            expected_width=TARGET_IMAGE_WIDTH,
            expected_height=TARGET_IMAGE_HEIGHT
        )
    
    def check_for_model_update(self) -> bool:
        """Check if there's a newer model version available in MLflow"""
        try:
            model_version_info = mlflow_client.get_model_version_by_alias(name=MLFLOW_MODEL_NAME, alias=MLFLOW_MODEL_ALIAS)
            latest_version = model_version_info.version
            return self.model_version != latest_version
        except Exception as e:
            print(f"Error checking for model updates: {e}")
            return False
    
    def reload_model_if_needed(self) -> tuple[bool, str, str]:
        """Check for updates and reload model only if necessary"""
        if self.check_for_model_update():
            old_version = self.model_version or "unknown"
            self.load_model()
            current_version = self.model_version or "unknown"
            message = f"Model updated from version {old_version} to {current_version}"
            return True, current_version, message
        else:
            current_version = self.model_version or "unknown"
            message = f"Model is already up to date (version {current_version})"
            return False, current_version, message
    
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
    return {"message": "Frame Classification Service is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/model-info", response_model=ModelInfo)
async def get_model_info():
    """Get information about the currently loaded model"""
    try:
        return model_service.get_model_info()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reload-model")
async def reload_model():
    """Reload the model from MLflow if a new version is available"""
    try:
        was_updated, current_version, message = model_service.reload_model_if_needed()
        return {
            "updated": was_updated,
            "current_version": current_version,
            "message": message
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check/reload model: {str(e)}")

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
        return PredictionResponse(prediction=prob, model_version=model_service.model_version or "unknown")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)