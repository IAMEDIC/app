"""
Bounding Box Regression Service
- Loads model from MLflow Model Registry
- Serves prediction requests
- Shall not be exposed publicly
"""


import os
import base64

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from PIL import Image as PILImage
import mlflow
import mlflow.artifacts
from mlflow.tracking import MlflowClient
import onnxruntime as ort
import numpy as np


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

CLASS_NAMES = {
    0: "CM",
    1: "IT",
    2: "NT",
    3: "midbrain",
    4: "nasal bone",
    5: "nasal skin",
    6: "nasal tip",
    7: "palate",
    8: "thalami"
}


class PredictionRequest(BaseModel):
    """Request schema for prediction"""
    data: str  # base64 encoded image bytes
    width: int  # image width
    height: int  # image height


class Prediction(BaseModel):
    """Single prediction result"""
    class_name: str
    confidence: float
    x_min: float
    y_min: float
    width: float
    height: float


class PredictionResponse(BaseModel):
    """Response schema for predictions"""
    predictions: list[Prediction]
    model_version: str


class ModelInfo(BaseModel):
    """Information about the loaded model"""
    name: str
    version: str
    expected_width: int
    expected_height: int
    classes: list[str]


class ModelService:
    """Service to manage model loading and predictions"""
    def __init__(self):
        self.model = None
        self.model_version = None
        self.load_model()

    def load_model(self):
        """Load model from MLflow Model Registry"""
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
            expected_height=TARGET_IMAGE_HEIGHT,
            classes=list(CLASS_NAMES.values())
        )

    def check_for_model_update(self) -> tuple[bool, str]:
        """Check if there's a new model version available"""
        try:
            model_version_info = mlflow_client.get_model_version_by_alias(name=MLFLOW_MODEL_NAME, alias=MLFLOW_MODEL_ALIAS)
            latest_version = model_version_info.version
            needs_update = latest_version != self.model_version
            return needs_update, latest_version
        except Exception as e:
            print(f"Error checking for model update: {e}")
            return False, self.model_version or "unknown"

    def reload_model_if_needed(self) -> tuple[bool, str, str]:
        """Reload model only if there's a new version available"""
        needs_update, latest_version = self.check_for_model_update()
        if not needs_update:
            return False, self.model_version or "unknown", f"Model is already up to date (version {latest_version})"
        old_version = self.model_version
        try:
            print(f"New model version detected: {latest_version} (current: {old_version})")
            self.load_model()
            return True, self.model_version or "unknown", f"Model updated from version {old_version} to {self.model_version}"
        except Exception as e:
            print(f"Error reloading model: {e}")
            raise

    def predict(self, data: np.ndarray) -> np.ndarray:
        """Make predictions using the loaded model"""
        if self.model is None:
            raise RuntimeError("Model not loaded")
        result = self.model.run(None, {"input": data})
        return result


app = FastAPI(title="Bounding Box Regression Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize model service
model_service = ModelService()


@app.get("/")
def read_root():
    """Root endpoint to verify service is running"""
    return {"message": "Bounding Box Regression Service is running"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
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
    """Make predictions on the provided image data"""
    try:
        image_bytes = base64.b64decode(request.data)
        image = np.frombuffer(image_bytes, dtype=np.uint8).reshape((request.height, request.width))
        original_height, original_width = request.height, request.width
        pil_image = PILImage.fromarray(image)
        pil_image = pil_image.resize((TARGET_IMAGE_WIDTH, TARGET_IMAGE_HEIGHT), PILImage.LANCZOS)
        image = np.array(pil_image)
        image = (image.astype(np.float32) / 255.0 - 0.5) / 0.5  # Normalize to [-1, 1]
        image = np.expand_dims(image, axis=0)  # Add batch dimension
        image = np.expand_dims(image, axis=0)  # Add channel dimension
        outputs = model_service.predict(image)
        class_probs = outputs[0][0] # [K] 
        boxes = outputs[1][0]       # [K, 4]
        predictions = []
        for i, (class_prob, box) in enumerate(zip(class_probs, boxes)):
            class_name = CLASS_NAMES[i]
            x_center_rel, y_center_rel, width_rel, height_rel = box
            x_min = (x_center_rel - width_rel / 2) * original_width
            y_min = (y_center_rel - height_rel / 2) * original_height
            width = width_rel * original_width
            height = height_rel * original_height
            prediction = Prediction(
                class_name=class_name,
                confidence=float(class_prob),
                x_min=float(x_min),
                y_min=float(y_min),
                width=float(width),
                height=float(height)
            )
            predictions.append(prediction)
        return PredictionResponse(predictions=predictions, model_version=model_service.model_version or "unknown")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
