"""
Frame Classification Performance Test Script

This script generates random noise images and sends them to the frame classification service
to measure prediction performance. It reports mean, standard deviation, and 99% confidence 
interval for classification prediction times.

Requirements:
- Frame classifier service running at http://frame-classifier-service:8000
- Or update CLASSIFIER_URL to point to the correct service endpoint

Usage:
    python classification_performance_test.py
"""


import asyncio
import time
import statistics
import base64

import numpy as np
import httpx
from PIL import Image as PILImage


CLASSIFIER_URL = "http://frame-classifier-service:8000"
NUM_TESTS = 100
IMAGE_WIDTH = 240
IMAGE_HEIGHT = 240


def generate_random_noise_image(width: int, height: int) -> PILImage.Image:
    """Generate a random noise grayscale image using numpy."""
    noise_array = np.random.randint(0, 256, size=(height, width), dtype=np.uint8)
    image = PILImage.fromarray(noise_array, mode='L')
    return image


def convert_image_to_base64_bytes(image: PILImage.Image) -> str:
    """Convert PIL Image to base64 encoded bytes (same format as backend)."""
    if image.mode != 'L':
        image = image.convert('L')
    image_array = np.array(image, dtype=np.uint8)
    image_bytes = image_array.tobytes()
    return base64.b64encode(image_bytes).decode('ascii')


async def test_classification_performance() -> list[float]:
    """
    Test frame classification performance by sending random noise images.
    
    Returns:
        list of prediction times in seconds
    """
    print("Starting classification performance test...")
    print(f"Number of tests: {NUM_TESTS}")
    print(f"Image dimensions: {IMAGE_WIDTH}x{IMAGE_HEIGHT}")
    print(f"Classifier URL: {CLASSIFIER_URL}")
    print("-" * 60)
    
    prediction_times = []
    successful_requests = 0
    failed_requests = 0
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            print("Checking classifier service availability...")
            response = await client.get(f"{CLASSIFIER_URL}/model-info")
            if response.status_code == 200:
                model_info = response.json()
                print(f"Classifier service available. Model info: {model_info}")
            else:
                print(f"Classifier service responded with status: {response.status_code}")
        except Exception as e:
            print(f"Error checking classifier service: {e}")
            print("Proceeding with tests anyway...")
        
        print("\nStarting prediction tests...")
        
        for i in range(NUM_TESTS):
            try:
                image = generate_random_noise_image(IMAGE_WIDTH, IMAGE_HEIGHT)
                image_data_b64 = convert_image_to_base64_bytes(image)
                request_data = {
                    "data": image_data_b64,
                    "width": IMAGE_WIDTH,
                    "height": IMAGE_HEIGHT
                }
                start_time = time.time()
                response = await client.post(
                    f"{CLASSIFIER_URL}/predict",
                    json=request_data
                )
                end_time = time.time()
                prediction_time = (end_time - start_time) * 1000
                if response.status_code == 200:
                    result = response.json()
                    prediction_score = result.get("prediction", 0.0)
                    prediction_times.append(prediction_time)
                    successful_requests += 1
                    if (i + 1) % 10 == 0:
                        print(f"Completed {i + 1}/{NUM_TESTS} tests. "
                              f"Latest: {prediction_time:.4f}ms, Score: {prediction_score:.4f}")
                else:
                    failed_requests += 1
                    print(f"Request {i + 1} failed with status: {response.status_code}")
            except Exception as e:
                failed_requests += 1
                print(f"Request {i + 1} failed with error: {e}")

        print("\nTest Results Summary:")
        print(f"Successful requests: {successful_requests}")
        print(f"Failed requests: {failed_requests}")

    return prediction_times


def calculate_statistics(times: list[float]) -> dict:
    """Calculate statistical measures for prediction times."""
    if not times:
        return {}

    mean_time = statistics.mean(times)
    std_dev = statistics.stdev(times) if len(times) > 1 else 0.0
    min_time = min(times)
    max_time = max(times)
    median_time = statistics.median(times)
    
    if len(times) > 1:
        confidence_margin = 2.576 * (std_dev / np.sqrt(len(times)))
        confidence_lower = mean_time - confidence_margin
        confidence_upper = mean_time + confidence_margin
    else:
        confidence_lower = confidence_upper = mean_time
    
    return {
        "count": len(times),
        "mean": mean_time,
        "std_dev": std_dev,
        "min": min_time,
        "max": max_time,
        "median": median_time,
        "confidence_99_lower": confidence_lower,
        "confidence_99_upper": confidence_upper,
        "confidence_margin": confidence_margin if len(times) > 1 else 0.0
    }


def print_results(stats: dict):
    """Print formatted results."""
    if not stats:
        print("No successful predictions to analyze.")
        return
    
    print("\n" + "=" * 60)
    print("CLASSIFICATION PERFORMANCE STATISTICS")
    print("=" * 60)
    print(f"Sample size:           {stats['count']:>10} predictions")
    print(f"Mean time:             {stats['mean']:>10.4f} miliseconds")
    print(f"Standard deviation:    {stats['std_dev']:>10.4f} miliseconds")
    print(f"Median time:           {stats['median']:>10.4f} miliseconds")
    print(f"Min time:              {stats['min']:>10.4f} miliseconds")
    print(f"Max time:              {stats['max']:>10.4f} miliseconds")
    print("-" * 60)
    print("99% Confidence Interval for Mean:")
    print(f"Lower bound:           {stats['confidence_99_lower']:>10.4f} miliseconds")
    print(f"Upper bound:           {stats['confidence_99_upper']:>10.4f} miliseconds")
    print(f"Margin of error:       {stats['confidence_margin']:>10.4f} miliseconds")
    print("-" * 60)


async def main():
    """Main test execution."""
    prediction_times = await test_classification_performance()
    stats = calculate_statistics(prediction_times)
    print_results(stats)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nTest interrupted by user")
    except Exception as e:
        print(f"\nTest failed with error: {e}")
