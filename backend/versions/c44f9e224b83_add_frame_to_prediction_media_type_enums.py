"""add_frame_to_prediction_media_type_enums

Revision ID: c44f9e224b83
Revises: ecaf9595dfe4
Create Date: 2025-09-27 22:51:20.331347

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c44f9e224b83'
down_revision = 'ecaf9595dfe4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'frame' value to both prediction media type enums
    connection = op.get_bind()
    connection.execute(sa.text("ALTER TYPE prediction_media_type ADD VALUE 'frame'"))
    connection.execute(sa.text("ALTER TYPE bb_prediction_media_type ADD VALUE 'frame'"))


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values directly
    # This downgrade would require recreating the enums and updating all references
    # For simplicity, we'll leave this as a no-op since adding enum values is generally safe
    pass