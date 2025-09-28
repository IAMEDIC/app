"""Add frames table and update media type enum to include frame

Revision ID: 004_add_frames_table
Revises: 1b8628d63922
Create Date: 2025-09-27 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '004_add_frames_table'
down_revision = '1b8628d63922'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update the mediatype enum to include 'frame'
    op.execute("ALTER TYPE mediatype ADD VALUE 'frame'")
    
    # Update the media table constraint to include FRAME
    op.drop_constraint('valid_media_type', 'media', type_='check')
    op.create_check_constraint(
        'valid_media_type', 
        'media', 
        "media_type IN ('image', 'video', 'frame')"
    )
    
    # Create frames table
    op.create_table('frames',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('video_media_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('frame_media_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('timestamp_seconds', sa.Float(), nullable=False),
        sa.Column('frame_number', sa.Integer(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['video_media_id'], ['media.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['frame_media_id'], ['media.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('frame_media_id', name='unique_frame_media_id')
    )
    
    # Create indexes
    op.create_index(op.f('ix_frames_id'), 'frames', ['id'], unique=False)
    op.create_index(op.f('ix_frames_video_media_id'), 'frames', ['video_media_id'], unique=False)
    op.create_index(op.f('ix_frames_frame_media_id'), 'frames', ['frame_media_id'], unique=True)
    op.create_index(op.f('ix_frames_timestamp_seconds'), 'frames', ['timestamp_seconds'], unique=False)
    op.create_index(op.f('ix_frames_frame_number'), 'frames', ['frame_number'], unique=False)
    op.create_index(op.f('ix_frames_is_active'), 'frames', ['is_active'], unique=False)
    op.create_index(op.f('ix_frames_created_at'), 'frames', ['created_at'], unique=False)
    
    # Create composite indexes for efficient querying
    op.create_index('ix_frames_video_timestamp', 'frames', ['video_media_id', 'timestamp_seconds'], unique=False)
    op.create_index('ix_frames_video_frame_num', 'frames', ['video_media_id', 'frame_number'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_frames_video_frame_num', table_name='frames')
    op.drop_index('ix_frames_video_timestamp', table_name='frames')
    op.drop_index(op.f('ix_frames_created_at'), table_name='frames')
    op.drop_index(op.f('ix_frames_is_active'), table_name='frames')
    op.drop_index(op.f('ix_frames_frame_number'), table_name='frames')
    op.drop_index(op.f('ix_frames_timestamp_seconds'), table_name='frames')
    op.drop_index(op.f('ix_frames_frame_media_id'), table_name='frames')
    op.drop_index(op.f('ix_frames_video_media_id'), table_name='frames')
    op.drop_index(op.f('ix_frames_id'), table_name='frames')
    
    # Drop frames table
    op.drop_table('frames')
    
    # Revert media type constraint
    op.drop_constraint('valid_media_type', 'media', type_='check')
    op.create_check_constraint(
        'valid_media_type', 
        'media', 
        "media_type IN ('image', 'video')"
    )
    
    # Note: We cannot remove the 'frame' value from the enum in PostgreSQL
    # as it would require dropping and recreating the enum type, which could
    # affect existing data. The enum value will remain but won't be used.