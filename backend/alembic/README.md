# IAMEDIC Database Migrations

This directory contains Alembic migrations for the IAMEDIC backend database.

## Fresh Deployment

To initialize the database from scratch on a new environment:

```bash
# Run all migrations to create the complete schema
docker compose exec backend alembic upgrade head
```

## Development Workflow

### Creating New Migrations

When you modify models in `app/models/`, generate a new migration:

```bash
# Auto-generate migration from model changes
docker compose exec backend alembic revision --autogenerate -m "Description of changes"

# Review the generated migration file in alembic/versions/
# Then apply the migration
docker compose exec backend alembic upgrade head
```

### Checking Migration Status

```bash
# Check current database revision
docker compose exec backend alembic current

# Show migration history
docker compose exec backend alembic history
```

### Rolling Back

```bash
# Rollback to previous revision
docker compose exec backend alembic downgrade -1

# Rollback to specific revision
docker compose exec backend alembic downgrade <revision_id>

# Rollback to initial state (drops all tables)
docker compose exec backend alembic downgrade base
```

## Migration Structure

- **Initial Migration**: `92a0e66dec74_initial_migration_complete_schema.py`
  - Creates all core tables: users, doctor_profiles, studies, media, frames
  - Creates all AI prediction and annotation tables
  - Includes all necessary indexes and constraints
  - Properly handles PostgreSQL enums

## Notes

- All migrations use Docker Compose to ensure consistency
- PostgreSQL enums are properly handled in migrations
- UUID primary keys are used throughout the schema
- Proper foreign key relationships and cascade deletes are configured