#!/usr/bin/env python3
"""
IAMEDIC Application Health Check Script
"""

import requests
import time
import sys
from typing import Dict, List, Tuple

def check_service(name: str, url: str, timeout: int = 5) -> Tuple[bool, str]:
    """Check if a service is healthy"""
    try:
        response = requests.get(url, timeout=timeout)
        if response.status_code == 200:
            return True, f"✅ {name}: OK"
        else:
            return False, f"❌ {name}: HTTP {response.status_code}"
    except requests.exceptions.ConnectionError:
        return False, f"❌ {name}: Connection refused"
    except requests.exceptions.Timeout:
        return False, f"❌ {name}: Timeout"
    except Exception as e:
        return False, f"❌ {name}: {str(e)}"

def main():
    """Main health check function"""
    print("🏥 IAMEDIC Health Check")
    print("======================")
    
    # Services to check
    services = [
        ("Backend API", "http://localhost:8000/api/health"),
        ("Frontend", "http://localhost:3000"),
        ("Frame Classifier", "http://localhost:8002/health"),
        ("BB Regression", "http://localhost:8001/health"),
    ]
    
    all_healthy = True
    results = []
    
    for name, url in services:
        print(f"Checking {name}...")
        healthy, message = check_service(name, url)
        results.append(message)
        if not healthy:
            all_healthy = False
        time.sleep(0.5)
    
    print("\n📊 Health Check Results:")
    print("========================")
    for result in results:
        print(result)
    
    if all_healthy:
        print("\n🎉 All services are healthy!")
        print("\n🌐 Access the application:")
        print("   Frontend: http://localhost:3000")
        print("   Backend API: http://localhost:8000/api/docs")
        return 0
    else:
        print("\n⚠️  Some services are not healthy. Check the logs:")
        print("   docker-compose logs -f")
        return 1

if __name__ == "__main__":
    sys.exit(main())