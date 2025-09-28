"""add_frame_to_annotation_media_type_enums

Revision ID: 7d5729952d6f
Revises: c44f9e224b83
Create Date: 2025-09-27 23:31:37.080272

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7d5729952d6f'
down_revision = 'c44f9e224b83'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'frame' value to both annotation media type enums
    connection = op.get_bind()
    connection.execute(sa.text("ALTER TYPE annotation_media_type ADD VALUE 'frame'"))
    connection.execute(sa.text("ALTER TYPE bb_annotation_media_type ADD VALUE 'frame'"))


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values directly
    # This downgrade would require recreating the enums and updating all references
    # For simplicity, we'll leave this as a no-op since adding enum values is generally safe
    pass