"""add_frame_to_mediatype_enum

Revision ID: ecaf9595dfe4
Revises: 2bd190305f2c
Create Date: 2025-09-27 22:13:52.057341

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ecaf9595dfe4'
down_revision = '2bd190305f2c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'frame' value to the existing mediatype enum
    connection = op.get_bind()
    connection.execute(sa.text("ALTER TYPE mediatype ADD VALUE 'frame'"))


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values directly
    # This downgrade would require recreating the enum and updating all references
    # For simplicity, we'll leave this as a no-op since adding enum values is generally safe
    pass