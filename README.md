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

## 🚀 Quick Start

### Prerequisites

- Docker Desktop
- Docker Compose
- Git

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd app
   ```

2. **Setup development environment** (Windows)
   ```bash
   setup.bat dev
   ```
   
   Or (Linux/macOS):
   ```bash
   ./setup.sh dev
   ```

3. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/api/docs
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

### Staging Setup

For production-like testing:

```bash
# Windows
setup.bat staging

# Linux/macOS
./setup.sh staging
```

Access at: http://localhost

### Production Deployment

For production deployment, use only the base compose file:

```bash
docker-compose up -d
```

This uses optimized production builds without development overrides.

## 🔧 Configuration

### Environment Setup

**IMPORTANT**: All sensitive credentials must be stored in local `.env` files and **never committed to version control**.

1. **Copy example environment files**:
   ```bash
   # Frontend environment
   cp frontend/.env.example frontend/.env
   
   # Backend environment  
   cp backend/.env.example backend/.env
   ```

2. **Configure your environment values**:
   - Update Google OAuth credentials (see Google OAuth Setup below)
   - Set secure secret keys for production
   - Configure database passwords

### Environment Variables

#### Frontend (`frontend/.env`)
Copy from `frontend/.env.example` and configure:
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=IAMEDIC
VITE_APP_VERSION=1.0.0
VITE_OAUTH_CLIENT_ID=your_google_client_id_here
```

#### Backend (`backend/.env`)
Copy from `backend/.env.example` and configure:
```env
# === Application Settings ===
APP_NAME=IAMEDIC
DEBUG=true
ENVIRONMENT=development

# === Security ===
SECRET_KEY=your_secret_key_here_minimum_32_characters
JWT_SECRET_KEY=your_jwt_secret_key_here_minimum_32_characters

# === Database Configuration ===
DATABASE_URL=postgresql://iamedic_user:secure_password@postgres:5432/iamedic_db

# === Google OAuth Configuration ===
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback

# === CORS Configuration ===
FRONTEND_URL=http://localhost:3000
```

**See `backend/.env.example` for complete configuration options.**

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - Development: `http://localhost:8000/api/auth/google/callback`
   - Staging: `http://localhost/api/auth/google/callback`
6. Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in backend/.env

## 🏛️ Project Structure

```
app/
├── frontend/                 # React TypeScript frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API service layer
│   │   ├── store/           # Zustand state management
│   │   ├── types/           # TypeScript type definitions
│   │   └── utils/           # Utility functions
│   ├── public/              # Static assets
│   ├── Dockerfile           # Multi-stage Docker build
│   ├── nginx.conf           # Production nginx config
│   └── package.json
├── backend/                 # FastAPI Python backend
│   ├── app/
│   │   ├── api/             # API routes and endpoints
│   │   ├── core/            # Core configuration and dependencies
│   │   ├── models/          # SQLAlchemy database models
│   │   ├── schemas/         # Pydantic schemas
│   │   └── services/        # Business logic services
│   ├── alembic/             # Database migrations
│   ├── Dockerfile           # Multi-stage Docker build
│   ├── requirements.txt     # Python dependencies
│   └── main.py              # Application entry point
├── bb-reg-service/          # Bounding box regression service
├── frame-classifier-service/ # Frame classification service
├── docker-compose.yml       # Development services
├── docker-compose.override.yml # Development overrides
├── docker-compose.staging.yml  # Staging configuration
├── setup.sh                 # Linux/macOS setup script
├── setup.bat                # Windows setup script
└── README.md
```

## 🔐 Authentication Flow

1. User clicks "Login with Google" on frontend
2. Frontend requests OAuth URL from backend
3. Backend generates Google OAuth URL with state parameter
4. User is redirected to Google for authentication
5. Google redirects back to backend callback endpoint
6. Backend exchanges code for tokens and user info
7. Backend creates/updates user in database
8. Backend returns JWT token to frontend
9. Frontend stores token and user data in localStorage
10. Protected routes use JWT token for API requests

## 🗄️ Database

The application uses PostgreSQL with the following main entities:

### Users Table
- `id`: UUID primary key
- `email`: User email (unique)
- `name`: User display name
- `google_id`: Google OAuth user ID
- `access_token`: Google access token
- `refresh_token`: Google refresh token
- `token_expires_at`: Token expiration timestamp
- `is_active`: User status flag
- `created_at`: Account creation timestamp
- `updated_at`: Last update timestamp

### Database Migrations

```bash
# Create new migration
docker-compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker-compose exec backend alembic upgrade head

# Rollback migration
docker-compose exec backend alembic downgrade -1
```

## 🛠️ Development

### Hot Reload

Both frontend and backend support hot reload in development mode:

- **Frontend**: Vite dev server with instant HMR
- **Backend**: Uvicorn with `--reload` flag

### Adding New Dependencies

#### Frontend
```bash
# Add to package.json and rebuild
docker-compose exec frontend npm install <package>
docker-compose restart frontend
```

#### Backend
```bash
# Add to requirements.txt and rebuild
echo "package==version" >> backend/requirements.txt
docker-compose up --build backend
```

### API Development

The backend provides:
- OpenAPI documentation at `/api/docs`
- ReDoc documentation at `/api/redoc`
- Health check endpoint at `/api/health`

### Frontend Development

The frontend uses:
- **React Router** for navigation
- **Material-UI** for components
- **Zustand** for state management
- **React Query** for API state
- **Axios** for HTTP requests

## 🚢 Deployment Modes

### Production Mode
- **Command**: `docker-compose up`
- **Configuration**: Uses only `docker-compose.yml`
- **Features**: Production builds, multi-worker processes, no debug mode, no exposed ports except necessary ones
- **Target**: Production deployment with optimal performance and security

### Development Mode
- **Command**: `docker-compose up` (automatically uses override)
- **Configuration**: `docker-compose.yml` + `docker-compose.override.yml`
- **Features**: Hot reload, debug mode, all ports exposed, volume mounts for live code updates
- **Target**: Local development with maximum developer experience

### Staging Mode
- **Command**: `docker-compose -f docker-compose.yml -f docker-compose.staging.yml up`
- **Configuration**: `docker-compose.yml` + `docker-compose.staging.yml`
- **Features**: Production builds, single worker processes, some ports exposed for debugging
- **Target**: Production-like testing environment

## 📊 Monitoring and Logs

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend

# Using setup script
setup.bat logs    # Windows
./setup.sh logs   # Linux/macOS
```

### Health Checks
All services include health checks:
- Frontend: `/health`
- Backend: `/api/health`
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`

## 🧹 Maintenance

### Cleanup
```bash
# Stop all services
setup.bat stop    # Windows
./setup.sh stop   # Linux/macOS

# Full cleanup (removes volumes and images)
setup.bat cleanup    # Windows
./setup.sh cleanup   # Linux/macOS
```

### Updates
```bash
# Pull latest images and rebuild
docker-compose pull
docker-compose up --build
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Test in development mode
4. Test in staging mode
5. Submit a pull request

## 📄 License

[Add your license here]

## 🆘 Support

For issues and questions:
1. Check the logs: `docker-compose logs -f`
2. Verify environment variables
3. Ensure Google OAuth is properly configured
4. Check service health endpoints

---

**IAMEDIC** - Advancing medical imaging through artificial intelligence
