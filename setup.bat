@echo off
REM IAMEDIC Application Setup Script for Windows

echo 🏥 IAMEDIC - AI Medical Ultrasound Analysis
echo ==========================================

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

if "%1"=="dev" goto setup_dev
if "%1"=="staging" goto setup_staging
if "%1"=="stop" goto stop_services
if "%1"=="cleanup" goto cleanup
if "%1"=="logs" goto show_logs
goto usage

:setup_dev
echo 🔧 Setting up development environment...

REM Create .env files if they don't exist
if not exist "frontend\.env" (
    echo 📄 Creating frontend\.env from example...
    copy "frontend\.env.example" "frontend\.env"
)

if not exist "backend\.env" (
    echo 📄 Creating backend\.env from example...
    copy "backend\.env.example" "backend\.env"
    echo ⚠️  Please update the Google OAuth credentials in backend\.env
)

echo 🏗️  Building and starting development services...
docker-compose up --build -d

echo ⏳ Waiting for services to be ready...
timeout /t 30 /nobreak

echo 🗄️  Running database migrations...
docker-compose exec backend alembic upgrade head

echo ✅ Development environment is ready!
echo 🌐 Frontend: http://localhost:3000
echo 🔧 Backend API: http://localhost:8000
echo 📊 Backend Docs: http://localhost:8000/api/docs
echo 🗄️  PostgreSQL: localhost:5432
echo 🔴 Redis: localhost:6379
goto end

:setup_staging
echo 🚀 Setting up staging environment...

echo 🏗️  Building and starting staging services...
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d

echo ⏳ Waiting for services to be ready...
timeout /t 30 /nobreak

echo 🗄️  Running database migrations...
docker-compose -f docker-compose.yml -f docker-compose.staging.yml exec backend alembic upgrade head

echo ✅ Staging environment is ready!
echo 🌐 Application: http://localhost
echo 🔧 Backend API: http://localhost:8000
goto end

:stop_services
echo 🛑 Stopping all services...
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.staging.yml down 2>nul
echo ✅ All services stopped.
goto end

:cleanup
echo 🧹 Cleaning up...
docker-compose down -v --remove-orphans
docker-compose -f docker-compose.yml -f docker-compose.staging.yml down -v --remove-orphans 2>nul
docker system prune -f
echo ✅ Cleanup completed.
goto end

:show_logs
echo 📋 Showing logs...
docker-compose logs -f
goto end

:usage
echo Usage: %0 {dev^|staging^|stop^|cleanup^|logs}
echo.
echo Commands:
echo   dev      - Setup development environment (uses docker-compose.override.yml)
echo   staging  - Setup staging environment (uses docker-compose.staging.yml)
echo   stop     - Stop all services
echo   cleanup  - Clean up containers and volumes
echo   logs     - Show service logs
echo.
echo Production deployment uses only: docker-compose up
exit /b 1

:end