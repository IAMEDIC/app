"""Add user roles and doctor profiles

Revision ID: 002
Revises: 001
Create Date: 2025-09-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_roles table
    op.create_table('user_roles',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'role', name='unique_user_role')
    )
    op.create_index(op.f('ix_user_roles_id'), 'user_roles', ['id'], unique=False)
    op.create_index(op.f('ix_user_roles_user_id'), 'user_roles', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_roles_role'), 'user_roles', ['role'], unique=False)

    # Create doctor_profiles table
    op.create_table('doctor_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('matriculation_id', sa.String(), nullable=False),
        sa.Column('legal_name', sa.String(), nullable=False),
        sa.Column('specialization', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),  # pending, approved, denied
        sa.Column('notes', sa.Text(), nullable=True),  # Admin notes for approval/denial
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', name='unique_doctor_profile'),
        sa.UniqueConstraint('matriculation_id', name='unique_matriculation_id')
    )
    op.create_index(op.f('ix_doctor_profiles_id'), 'doctor_profiles', ['id'], unique=False)
    op.create_index(op.f('ix_doctor_profiles_user_id'), 'doctor_profiles', ['user_id'], unique=False)
    op.create_index(op.f('ix_doctor_profiles_matriculation_id'), 'doctor_profiles', ['matriculation_id'], unique=True)
    op.create_index(op.f('ix_doctor_profiles_status'), 'doctor_profiles', ['status'], unique=False)


def downgrade() -> None:
    # Drop doctor_profiles table
    op.drop_index(op.f('ix_doctor_profiles_status'), table_name='doctor_profiles')
    op.drop_index(op.f('ix_doctor_profiles_matriculation_id'), table_name='doctor_profiles')
    op.drop_index(op.f('ix_doctor_profiles_user_id'), table_name='doctor_profiles')
    op.drop_index(op.f('ix_doctor_profiles_id'), table_name='doctor_profiles')
    op.drop_table('doctor_profiles')
    
    # Drop user_roles table
    op.drop_index(op.f('ix_user_roles_role'), table_name='user_roles')
    op.drop_index(op.f('ix_user_roles_user_id'), table_name='user_roles')
    op.drop_index(op.f('ix_user_roles_id'), table_name='user_roles')
    op.drop_table('user_roles')