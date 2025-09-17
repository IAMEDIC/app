#!/usr/bin/env bash

# IAMEDIC Application Setup Script

set -e

echo "🏥 IAMEDIC - AI Medical Ultrasound Analysis"
echo "=========================================="

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Function to setup development environment
setup_dev() {
    echo "🔧 Setting up development environment..."
    
    # Create .env files if they don't exist
    if [ ! -f "frontend/.env" ]; then
        echo "📄 Creating frontend/.env from example..."
        cp frontend/.env.example frontend/.env
    fi
    
    if [ ! -f "backend/.env" ]; then
        echo "📄 Creating backend/.env from example..."
        cp backend/.env.example backend/.env
        echo "⚠️  Please update the Google OAuth credentials in backend/.env"
    fi
    
    echo "🏗️  Building and starting development services..."
    docker-compose up --build -d
    
    echo "⏳ Waiting for services to be ready..."
    sleep 30
    
    echo "🗄️  Running database migrations..."
    docker-compose exec backend alembic upgrade head
    
    echo "✅ Development environment is ready!"
    echo "🌐 Frontend: http://localhost:3000"
    echo "🔧 Backend API: http://localhost:8000"
    echo "📊 Backend Docs: http://localhost:8000/api/docs"
    echo "🗄️  PostgreSQL: localhost:5432"
    echo "🔴 Redis: localhost:6379"
}

# Function to setup staging environment
setup_staging() {
    echo "🚀 Setting up staging environment..."
    
    echo "🏗️  Building and starting staging services..."
    docker-compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d
    
    echo "⏳ Waiting for services to be ready..."
    sleep 30
    
    echo "🗄️  Running database migrations..."
    docker-compose -f docker-compose.yml -f docker-compose.staging.yml exec backend alembic upgrade head
    
    echo "✅ Staging environment is ready!"
    echo "🌐 Application: http://localhost"
    echo "🔧 Backend API: http://localhost:8000"
}

# Function to stop services
stop_services() {
    echo "🛑 Stopping all services..."
    docker-compose down
    docker-compose -f docker-compose.yml -f docker-compose.staging.yml down 2>/dev/null || true
    echo "✅ All services stopped."
}

# Function to clean up
cleanup() {
    echo "🧹 Cleaning up..."
    docker-compose down -v --remove-orphans
    docker-compose -f docker-compose.yml -f docker-compose.staging.yml down -v --remove-orphans 2>/dev/null || true
    docker system prune -f
    echo "✅ Cleanup completed."
}

# Function to show logs
show_logs() {
    echo "📋 Showing logs..."
    docker-compose logs -f
}

# Main menu
case "${1:-}" in
    "dev")
        setup_dev
        ;;
    "staging")
        setup_staging
        ;;
    "stop")
        stop_services
        ;;
    "cleanup")
        cleanup
        ;;
    "logs")
        show_logs
        ;;
    *)
        echo "Usage: $0 {dev|staging|stop|cleanup|logs}"
        echo ""
        echo "Commands:"
        echo "  dev      - Setup development environment (uses docker-compose.override.yml)"
        echo "  staging  - Setup staging environment (uses docker-compose.staging.yml)"
        echo "  stop     - Stop all services"
        echo "  cleanup  - Clean up containers and volumes"
        echo "  logs     - Show service logs"
        echo ""
        echo "Production deployment uses only: docker-compose up"
        exit 1
        ;;
esac