# Multi-stage Dockerfile for FastAPI Backend
ARG PYTHON_VERSION=3.11

# Base image with Python
FROM python:${PYTHON_VERSION}-slim AS base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
# libmagic is required for python-magic MIME type detection
# ffmpeg is required for video frame extraction
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    libmagic1 \
    libmagic-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Development stage
FROM base AS development

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start development server with hot reload and single worker
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production base stage
FROM base AS production-base

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser

# Copy source code
COPY . .

# Change ownership to appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Production stage
FROM production-base AS production

# Start production server with multiple workers
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

# Staging stage (single worker, production-like)
FROM production-base AS staging

# Start staging server with single worker (for easier debugging)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
