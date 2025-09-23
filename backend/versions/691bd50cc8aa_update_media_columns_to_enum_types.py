"""update_media_columns_to_enum_types

Revision ID: 691bd50cc8aa
Revises: d3fb1a74d5fb
Create Date: 2025-09-18 23:52:50.849575

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '691bd50cc8aa'
down_revision = 'd3fb1a74d5fb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types in PostgreSQL
    media_type_enum = postgresql.ENUM('image', 'video', name='mediatype')
    upload_status_enum = postgresql.ENUM('uploaded', 'processing', 'failed', name='uploadstatus')
    
    # Create the enum types
    media_type_enum.create(op.get_bind())
    upload_status_enum.create(op.get_bind())
    
    # Drop the existing check constraints
    op.drop_constraint('valid_media_type', 'media', type_='check')
    op.drop_constraint('valid_upload_status', 'media', type_='check')
    
    # Alter columns to use enum types
    op.alter_column('media', 'media_type',
                    existing_type=sa.String(50),
                    type_=media_type_enum,
                    existing_nullable=False,
                    postgresql_using='media_type::mediatype')
    
    op.alter_column('media', 'upload_status',
                    existing_type=sa.String(50),
                    type_=upload_status_enum,
                    existing_nullable=False,
                    postgresql_using='upload_status::uploadstatus')


def downgrade() -> None:
    # Alter columns back to string types
    op.alter_column('media', 'media_type',
                    existing_type=postgresql.ENUM('image', 'video', name='mediatype'),
                    type_=sa.String(50),
                    existing_nullable=False)
    
    op.alter_column('media', 'upload_status',
                    existing_type=postgresql.ENUM('uploaded', 'processing', 'failed', name='uploadstatus'),
                    type_=sa.String(50),
                    existing_nullable=False)
    
    # Recreate check constraints
    op.create_check_constraint('valid_media_type', 'media', "media_type IN ('image', 'video')")
    op.create_check_constraint('valid_upload_status', 'media', "upload_status IN ('uploaded', 'processing', 'failed')")
    
    # Drop enum types
    postgresql.ENUM(name='mediatype').drop(op.get_bind())
    postgresql.ENUM(name='uploadstatus').drop(op.get_bind())