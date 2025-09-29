# IAMEDIC - AI Medical Ultrasound Analysis

![IAMEDIC Logo](frontend/logo.jpg)

**Inteligencia Artificial Médica** - Advanced AI-powered ultrasound analysis for third trimester pregnancy scans with automatic bounding box generation for fetal structures.

## 🏗️ Architecture

This application consists of several microservices:

- **Frontend**: Modern React TypeScript application with Material-UI
- **Backend**: FastAPI Python application with OAuth authentication
- **PostgreSQL**: Database for user data and application state
- **Redis**: Session management and caching
- **Bounding Box Regression Service**: ML service for fetal structure detection
- **Frame Classifier Service**: ML service for ultrasound frame classification
- **MLFlow**: ML experiment tracking (external, running on host)
