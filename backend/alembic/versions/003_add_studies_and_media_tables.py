"""Add studies and media tables

Revision ID: 003
Revises: 002
Create Date: 2025-09-18 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create studies table
    op.create_table('studies',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('doctor_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('alias', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('doctor_id', 'alias', name='unique_doctor_study_alias')
    )
    op.create_index(op.f('ix_studies_id'), 'studies', ['id'], unique=False)
    op.create_index(op.f('ix_studies_doctor_id'), 'studies', ['doctor_id'], unique=False)
    op.create_index(op.f('ix_studies_is_active'), 'studies', ['is_active'], unique=False)
    op.create_index(op.f('ix_studies_created_at'), 'studies', ['created_at'], unique=False)

    # Create media table
    op.create_table('media',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('study_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('filename', sa.String(length=500), nullable=False),
        sa.Column('file_path', sa.String(length=1000), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('mime_type', sa.String(length=255), nullable=False),
        sa.Column('media_type', sa.String(length=50), nullable=False),
        sa.Column('upload_status', sa.String(length=50), nullable=False, server_default='uploaded'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['study_id'], ['studies.id'], ondelete='CASCADE'),
        sa.CheckConstraint("media_type IN ('image', 'video')", name='valid_media_type'),
        sa.CheckConstraint("upload_status IN ('uploaded', 'processing', 'failed')", name='valid_upload_status')
    )
    op.create_index(op.f('ix_media_id'), 'media', ['id'], unique=False)
    op.create_index(op.f('ix_media_study_id'), 'media', ['study_id'], unique=False)
    op.create_index(op.f('ix_media_mime_type'), 'media', ['mime_type'], unique=False)
    op.create_index(op.f('ix_media_media_type'), 'media', ['media_type'], unique=False)
    op.create_index(op.f('ix_media_upload_status'), 'media', ['upload_status'], unique=False)
    op.create_index(op.f('ix_media_created_at'), 'media', ['created_at'], unique=False)


def downgrade() -> None:
    # Drop media table
    op.drop_index(op.f('ix_media_created_at'), table_name='media')
    op.drop_index(op.f('ix_media_upload_status'), table_name='media')
    op.drop_index(op.f('ix_media_media_type'), table_name='media')
    op.drop_index(op.f('ix_media_mime_type'), table_name='media')
    op.drop_index(op.f('ix_media_study_id'), table_name='media')
    op.drop_index(op.f('ix_media_id'), table_name='media')
    op.drop_table('media')
    
    # Drop studies table
    op.drop_index(op.f('ix_studies_created_at'), table_name='studies')
    op.drop_index(op.f('ix_studies_is_active'), table_name='studies')
    op.drop_index(op.f('ix_studies_doctor_id'), table_name='studies')
    op.drop_index(op.f('ix_studies_id'), table_name='studies')
    op.drop_table('studies')